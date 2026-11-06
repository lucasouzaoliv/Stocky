import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adicionarAoBau } from '@/server/bau/operacoes';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto, setFetch } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { atualizarInventario } from '@/server/webhooks/inventario';
import { LIMITES_DISCORD, tamanhoTotal } from '@/server/webhooks/formatacao';
import { aplicarEnvTeste, ENV_TESTE, limparEnvTeste } from '../helpers/env-teste';
import { criarDiscordFake } from '../helpers/discord-fake';
import { respostaJson } from '../helpers/fake-fetch';
import { comoDb, criarFakeFirestore, type Dados, type FakeFirestore } from '../helpers/fake-firestore';
import { USUARIO, seedBase, type ItensBau } from '../helpers/estado';

let fake: FakeFirestore;
let saidas: string[];
const abrir = (seed: Record<string, Dados>) => {
  fake = criarFakeFirestore({ seed });
  setDb(comoDb(fake));
};
const tokenDe = (nomeEnv: string) => ENV_TESTE[nomeEnv]!.split('/').pop()!;
const doc = (chave: string) => fake.dump()[`webhook_mensagens/${chave}`] as { mensagemId: string | null; reservadoAte: string | null } | undefined;
const BANDAGEM: ItensBau = { medicamentos: { bandagem: 5 } };

beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  saidas = [];
  for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a) => void saidas.push(a.map(String).join(' ')));
  abrir(seedBase({ membros: BANDAGEM, gerencia: { armas: { colt: 2 } } }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetDb();
  resetSemente();
  resetContexto();
  limparEnvTeste();
});

const discord = (...args: Parameters<typeof criarDiscordFake>) => {
  const d = criarDiscordFake(...args);
  setFetch(d.fetch);
  return d;
};

describe('WEB-049 AC1: envia na primeira vez e edita depois', () => {
  it('sem id salvo: POST ?wait=true e grava o id; nas próximas, só PATCH', async () => {
    const d = discord();
    const r1 = await atualizarInventario('membros');
    expect(r1.ok).toBe(true);
    expect(d.posts()).toHaveLength(1);
    expect(d.posts()[0]!.url).toBe(`${ENV_TESTE.WEBHOOK_INVENTARIO_MEMBROS}?wait=true`);
    const id = [...d.mensagens.keys()][0]!;
    expect(doc('inventario_membros')?.mensagemId).toBe(id);

    expect((await atualizarInventario('membros')).ok).toBe(true);
    expect((await atualizarInventario('membros')).ok).toBe(true);
    expect(d.posts()).toHaveLength(1);
    expect(d.patches()).toHaveLength(2);
    expect(d.patches()[0]!.url).toBe(`${ENV_TESTE.WEBHOOK_INVENTARIO_MEMBROS}/messages/${id}`);
    expect(d.mensagens.size).toBe(1);
  });

  it('lê o estado ATUAL do baú no momento do envio (a edição mostra a quantidade nova)', async () => {
    const d = discord();
    await atualizarInventario('membros');
    await adicionarAoBau({ tipo: 'membros', categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 7 }, USUARIO);
    await atualizarInventario('membros');
    const msg = [...d.mensagens.values()][0]!;
    expect(JSON.stringify(msg.payload.embeds)).toContain('Bandagem: **12**');
  });

  it('cada baú tem o próprio canal e a própria mensagem', async () => {
    const d = discord();
    await atualizarInventario('membros');
    await atualizarInventario('gerencia');
    expect(d.posts().map((c) => c.url)).toEqual([
      `${ENV_TESTE.WEBHOOK_INVENTARIO_MEMBROS}?wait=true`,
      `${ENV_TESTE.WEBHOOK_INVENTARIO_GERENCIA}?wait=true`,
    ]);
    const ids = new Set([doc('inventario_membros')?.mensagemId, doc('inventario_gerencia')?.mensagemId]);
    expect(ids.size).toBe(2);
    const colt = [...d.mensagens.values()].find((m) => m.canalToken === tokenDe('WEBHOOK_INVENTARIO_GERENCIA'))!;
    expect(JSON.stringify(colt.payload.embeds)).toContain('Colt: **2**');
  });
});

describe('WEB-049 AC2: edição com 404 recria uma única vez', () => {
  it('mensagem apagada: em 3 chamadas seguidas sai UMA mensagem nova e o novo id é guardado', async () => {
    const d = discord();
    await atualizarInventario('membros');
    const idAntigo = [...d.mensagens.keys()][0]!;
    d.apagar(idAntigo);

    for (let i = 0; i < 3; i += 1) expect((await atualizarInventario('membros')).ok).toBe(true);
    expect(d.posts()).toHaveLength(2);
    expect(d.mensagens.size).toBe(1);
    const idNovo = [...d.mensagens.keys()][0]!;
    expect(idNovo).not.toBe(idAntigo);
    expect(doc('inventario_membros')?.mensagemId).toBe(idNovo);
    expect(d.patches().map((c) => c.url.split('/').pop())).toEqual([idAntigo, idNovo, idNovo]);
  });
});

describe('WEB-049 AC3: outros erros não duplicam nem lançam', () => {
  it('500 na edição: ok:false, nenhuma mensagem nova, id preservado', async () => {
    const d = discord((c) => (c.metodo === 'PATCH' ? respostaJson({ message: 'erro' }, 500) : undefined));
    await atualizarInventario('membros');
    const id = doc('inventario_membros')?.mensagemId;
    const r = await atualizarInventario('membros');
    expect(r).toEqual({ ok: false, motivo: 'http' });
    expect(d.posts()).toHaveLength(1);
    expect(doc('inventario_membros')?.mensagemId).toBe(id);
  });

  it('timeout na edição: ok:false timeout, sem mensagem nova', async () => {
    vi.useFakeTimers();
    const d = discord((c) => (c.metodo === 'PATCH' ? new Promise<Response>(() => undefined) : undefined));
    const primeira = atualizarInventario('membros');
    await vi.advanceTimersByTimeAsync(10);
    await primeira;
    const p = atualizarInventario('membros');
    await vi.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toEqual({ ok: false, motivo: 'timeout' });
    expect(d.posts()).toHaveLength(1);
  });

  it('429 longo na edição: limite, sem mensagem nova', async () => {
    const d = discord((c) => (c.metodo === 'PATCH' ? respostaJson({ retry_after: 30 }, 429) : undefined));
    await atualizarInventario('membros');
    await expect(atualizarInventario('membros')).resolves.toEqual({ ok: false, motivo: 'limite' });
    expect(d.posts()).toHaveLength(1);
  });

  it('falha ao criar (500): não grava id, solta a reserva e a próxima tentativa cria normalmente', async () => {
    let falhar = true;
    const d = discord((c) => (c.metodo === 'POST' && falhar ? respostaJson({}, 500) : undefined));
    await expect(atualizarInventario('membros')).resolves.toEqual({ ok: false, motivo: 'http' });
    expect(doc('inventario_membros')).toMatchObject({ mensagemId: null, reservadoAte: null });
    falhar = false;
    await expect(atualizarInventario('membros')).resolves.toMatchObject({ ok: true });
    expect(d.mensagens.size).toBe(1);
  });

  it('rede caída: nunca lança e nenhum segredo vai ao log', async () => {
    setFetch((() => Promise.reject(new TypeError(`falhou ${ENV_TESTE.WEBHOOK_INVENTARIO_MEMBROS}`))) as typeof fetch);
    await expect(atualizarInventario('membros')).resolves.toEqual({ ok: false, motivo: 'rede' });
    const tudo = saidas.join('\n');
    expect(tudo).not.toContain(tokenDe('WEBHOOK_INVENTARIO_MEMBROS'));
    expect(tudo).not.toContain('/api/webhooks/');
  });

  it('Firestore indisponível na leitura do baú: ok:false interno, sem chamar o Discord e sem lançar', async () => {
    const d = discord();
    fake.falharEm('get', /^baus\/membros$/, new Error('indisponível'));
    await expect(atualizarInventario('membros')).resolves.toEqual({ ok: false, motivo: 'interno' });
    expect(d.chamadas).toHaveLength(0);
  });

  it('tipo de baú inválido não lança', async () => {
    const d = discord();
    await expect(atualizarInventario('cofre' as never)).resolves.toEqual({ ok: false, motivo: 'interno' });
    expect(d.chamadas).toHaveLength(0);
  });
});

describe('WEB-049 AC4: inventário grande vai numa mensagem só, até 10 embeds, truncando com aviso', () => {
  it('6 × 25 itens com nomes de 50 caracteres: um POST dentro dos limites com link do site; a edição troca a lista inteira', async () => {
    const categorias = Array.from({ length: 6 }, (_, c) => ({
      id: `cat${c}`,
      nome: `Categoria ${c}`,
      emoji: '📦',
      itens: Array.from({ length: 25 }, (_, i) => ({ id: `item${i}`, nome: `${c}-${i}`.padEnd(50, 'n') })),
    }));
    const itens: ItensBau = Object.fromEntries(categorias.map((c) => [c.id, Object.fromEntries(c.itens.map((i) => [i.id, 100000]))]));
    abrir(seedBase({ membros: itens, extra: { 'config/catalogo': { categorias, atualizadoEm: '2026-11-05T12:00:00.000Z' } } }));
    const d = discord();

    await atualizarInventario('membros');
    expect(d.posts()).toHaveLength(1);
    const embeds = [...d.mensagens.values()][0]!.payload.embeds as Array<{ description?: string }>;
    expect(embeds.length).toBeLessThanOrEqual(LIMITES_DISCORD.EMBEDS);
    expect(tamanhoTotal(embeds as never)).toBeLessThanOrEqual(LIMITES_DISCORD.TOTAL);
    expect(embeds[embeds.length - 1]!.description).toContain('https://stocky-teste.vercel.app/bau/membros');
    expect(embeds[embeds.length - 1]!.description).toMatch(/… e mais \d+ itens/);

    await adicionarAoBau({ tipo: 'membros', categoriaId: 'cat0', itemId: 'item0', quantidade: 1 }, USUARIO).catch(() => undefined);
    await atualizarInventario('membros');
    expect(d.posts()).toHaveLength(1);
    expect(d.patches()).toHaveLength(1);
  });
});

describe('WEB-049 AC5: dois atualizadores simultâneos não criam mensagens diferentes', () => {
  it('2 chamadas ao mesmo tempo sem id: um único POST, um único id gravado', async () => {
    const d = discord();
    const [a, b] = await Promise.all([atualizarInventario('membros'), atualizarInventario('membros')]);
    expect(d.posts()).toHaveLength(1);
    // quem chega depois ou desiste ('limite', reserva alheia válida) ou edita a mensagem que acabou de nascer
    for (const r of [a, b]) expect(r.ok || (!r.ok && r.motivo === 'limite')).toBe(true);
    expect([a, b].some((r) => r.ok)).toBe(true);
    expect(d.mensagens.size).toBe(1);
    expect(doc('inventario_membros')?.mensagemId).toBe([...d.mensagens.keys()][0]);
  });

  it('8 simultâneas: continua um POST só; as demais editam ou desistem sem erro', async () => {
    const d = discord();
    const rs = await Promise.all(Array.from({ length: 8 }, () => atualizarInventario('membros')));
    expect(d.posts()).toHaveLength(1);
    expect(rs.some((r) => r.ok)).toBe(true);
    for (const r of rs) expect(r.ok || (!r.ok && r.motivo === 'limite')).toBe(true);
    expect(d.mensagens.size).toBe(1);
    expect(doc('inventario_membros')?.mensagemId).toBe([...d.mensagens.keys()][0]);
  });

  it('reserva ainda válida (outro atualizador criando) → desiste sem postar; reserva vencida → cria', async () => {
    const d = discord();
    abrir(
      seedBase({
        membros: BANDAGEM,
        extra: { 'webhook_mensagens/inventario_membros': { mensagemId: null, reservadoAte: new Date(Date.now() + 20_000).toISOString(), atualizadoEm: 'x' } },
      }),
    );
    await expect(atualizarInventario('membros')).resolves.toEqual({ ok: false, motivo: 'limite' });
    expect(d.posts()).toHaveLength(0);

    abrir(
      seedBase({
        membros: BANDAGEM,
        extra: { 'webhook_mensagens/inventario_membros': { mensagemId: null, reservadoAte: new Date(Date.now() - 1000).toISOString(), atualizadoEm: 'x' } },
      }),
    );
    await expect(atualizarInventario('membros')).resolves.toMatchObject({ ok: true });
    expect(d.posts()).toHaveLength(1);
  });

  it('a gravação do id é sempre transacional (nenhuma escrita avulsa em webhook_mensagens)', async () => {
    discord();
    await atualizarInventario('membros');
    await atualizarInventario('membros');
    const escritas = fake.chamadas.filter((c) => c.caminho.startsWith('webhook_mensagens/') && c.op !== 'get');
    expect(escritas.length).toBeGreaterThan(0);
    expect(escritas.every((c) => c.emTransacao)).toBe(true);
  });
});

describe('WEB-049 AC6: menções desligadas', () => {
  it('POST e PATCH levam allowed_mentions vazio e o nome do item com @everyone não vira menção', async () => {
    abrir(
      seedBase({
        membros: BANDAGEM,
        extra: {
          'config/catalogo': {
            categorias: [{ id: 'medicamentos', nome: 'Medicamentos', emoji: '💊', itens: [{ id: 'bandagem', nome: '@everyone' }] }],
            atualizadoEm: 'x',
          },
        },
      }),
    );
    const d = discord();
    await atualizarInventario('membros');
    await atualizarInventario('membros');
    expect(d.chamadas).toHaveLength(2);
    for (const c of d.chamadas) {
      const corpo = JSON.parse(c.corpo);
      expect(corpo.allowed_mentions).toEqual({ parse: [] });
      expect(c.corpo).not.toContain('@everyone');
    }
  });
});
