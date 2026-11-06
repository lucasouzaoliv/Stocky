import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as ADICIONAR_BAU } from '@/app/api/bau/[tipo]/adicionar/route';
import { POST as REMOVER_BAU } from '@/app/api/bau/[tipo]/remover/route';
import { POST as AJUSTE_CONFIRMAR } from '@/app/api/bau/[tipo]/ajuste/confirmar/route';
import { POST as AJUSTE_PREVIA } from '@/app/api/bau/[tipo]/ajuste/previa/route';
import { POST as ZERAR } from '@/app/api/bau/zerar/route';
import { POST as MOVIMENTAR } from '@/app/api/caixa/movimentar/route';
import { POST as CATALOGO_ADICIONAR } from '@/app/api/catalogo/itens/route';
import { DELETE as CATALOGO_REMOVER } from '@/app/api/catalogo/itens/[categoriaId]/[itemId]/route';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto, setAgendador, setFetch } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores } from '@/server/seguranca/limite';
import { publicarEvento, publicarEventos, type EventoDominio } from '@/server/webhooks/eventos';
import { aplicarEnvTeste, ENV_TESTE, limparEnvTeste } from '../helpers/env-teste';
import { criarDiscordFake } from '../helpers/discord-fake';
import { respostaJson, type RespostaFake } from '../helpers/fake-fetch';
import { comoDb, criarFakeFirestore, type Dados, type FakeFirestore } from '../helpers/fake-firestore';
import { USUARIO, seedBase } from '../helpers/estado';
import { chamarRota, type RespostaRota } from '../helpers/rotas';
import { falharCommitDaOperacao } from './commit-falho';

type Tarefa = () => Promise<void>;
let fake: FakeFirestore;
let tarefas: Tarefa[];
let saidas: string[];

const SEED = () =>
  seedBase({
    membros: { medicamentos: { bandagem: 10 }, armas: { colt: 2 } },
    gerencia: { medicamentos: { bandagem: 5 } },
    saldo: { sujo: 1000, limpo: 500 },
  });

function abrir(seed: Record<string, Dados> = SEED()) {
  fake = criarFakeFirestore({ seed });
  setDb(comoDb(fake));
}

beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  tarefas = [];
  saidas = [];
  setAgendador((t) => void tarefas.push(t));
  for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a) => void saidas.push(a.map(String).join(' ')));
  abrir();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

const discord = (...args: Parameters<typeof criarDiscordFake>) => {
  const d = criarDiscordFake(...args);
  setFetch(d.fetch);
  return d;
};
const executar = async () => {
  const pendentes = tarefas.splice(0);
  await Promise.all(pendentes.map((t) => t()));
};
const token = (nome: string) => ENV_TESTE[nome]!.split('/').pop()!;
const canaisChamados = (d: ReturnType<typeof criarDiscordFake>) =>
  [...new Set(d.chamadas.map((c) => /\/webhooks\/\d+\/([\w-]+)/.exec(c.url)![1]))].sort();
const esperados = (...nomes: string[]) => nomes.map(token).sort();

interface Cenario {
  nome: string;
  chamar: (perfil?: 1 | 2 | 3) => Promise<RespostaRota>;
  canais: string[];
}

const cenarios: Cenario[] = [
  {
    nome: 'adicionar no baú dos membros',
    chamar: (perfil = 1) =>
      chamarRota(ADICIONAR_BAU, { metodo: 'POST', caminho: '/api/bau/membros/adicionar', params: { tipo: 'membros' }, perfil, corpo: { categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 3 } }),
    canais: ['WEBHOOK_LOG_MEMBROS', 'WEBHOOK_INVENTARIO_MEMBROS'],
  },
  {
    nome: 'remover do baú da gerência',
    chamar: (perfil = 2) =>
      chamarRota(REMOVER_BAU, { metodo: 'POST', caminho: '/api/bau/gerencia/remover', params: { tipo: 'gerencia' }, perfil, corpo: { categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 2 } }),
    canais: ['WEBHOOK_LOG_GERENCIA', 'WEBHOOK_INVENTARIO_GERENCIA'],
  },
  {
    nome: 'movimentar o caixa',
    chamar: (perfil = 2) =>
      chamarRota(MOVIMENTAR, { metodo: 'POST', caminho: '/api/caixa/movimentar', perfil, corpo: { tipo: 'sujo', acao: 'entrada', valor: 100, anotacao: 'venda' } }),
    canais: ['WEBHOOK_LOG_CAIXA', 'WEBHOOK_SALDO_CAIXA'],
  },
  {
    nome: 'remover item do catálogo (com estoque nos dois baús)',
    chamar: (perfil = 3) =>
      chamarRota(CATALOGO_REMOVER, { metodo: 'DELETE', caminho: '/api/catalogo/itens/medicamentos/bandagem', params: { categoriaId: 'medicamentos', itemId: 'bandagem' }, perfil }),
    canais: ['WEBHOOK_LOG_MEMBROS', 'WEBHOOK_LOG_GERENCIA', 'WEBHOOK_INVENTARIO_MEMBROS', 'WEBHOOK_INVENTARIO_GERENCIA'],
  },
  {
    nome: 'zerar os dois baús',
    chamar: (perfil = 3) =>
      chamarRota(ZERAR, { metodo: 'POST', caminho: '/api/bau/zerar', perfil, corpo: { alvo: 'ambos', confirmacao: 'ZERAR' } }),
    canais: ['WEBHOOK_LOG_MEMBROS', 'WEBHOOK_LOG_GERENCIA', 'WEBHOOK_INVENTARIO_MEMBROS', 'WEBHOOK_INVENTARIO_GERENCIA'],
  },
  {
    nome: 'confirmar ajuste em massa',
    chamar: (perfil = 2) =>
      chamarRota(AJUSTE_CONFIRMAR, { metodo: 'POST', caminho: '/api/bau/membros/ajuste/confirmar', params: { tipo: 'membros' }, perfil, corpo: { versao: 0, linhas: [{ categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 4 }] } }),
    canais: ['WEBHOOK_LOG_MEMBROS', 'WEBHOOK_INVENTARIO_MEMBROS'],
  },
];

const ESCRITAS_DOMINIO = /^(baus|caixa|config|logs|auditoria)\//;
const dominio = (dump: Record<string, Dados>) =>
  Object.fromEntries(Object.entries(dump).filter(([c]) => ESCRITAS_DOMINIO.test(c)));
const escritasDominio = () => fake.chamadas.filter((c) => c.op !== 'get' && ESCRITAS_DOMINIO.test(c.caminho));

describe('WEB-051 AC1: mapa de eventos pelas rotas', () => {
  for (const c of cenarios) {
    it(`${c.nome}: agenda um aviso por baú/caixa afetado e só envia aos canais certos`, async () => {
      const d = discord();
      const r = await c.chamar();
      expect(r.status).toBe(200);
      expect(tarefas.length).toBeGreaterThan(0);
      expect(d.chamadas).toHaveLength(0);
      await executar();
      expect(canaisChamados(d)).toEqual(esperados(...c.canais));
      for (const chamada of d.chamadas) expect(JSON.parse(chamada.corpo).allowed_mentions).toEqual({ parse: [] });
    });
  }

  it('zerar só os membros: aviso e inventário só dos membros', async () => {
    const d = discord();
    const r = await chamarRota(ZERAR, { metodo: 'POST', caminho: '/api/bau/zerar', perfil: 3, corpo: { alvo: 'membros', confirmacao: 'ZERAR' } });
    expect(r.status).toBe(200);
    await executar();
    expect(canaisChamados(d)).toEqual(esperados('WEBHOOK_LOG_MEMBROS', 'WEBHOOK_INVENTARIO_MEMBROS'));
  });

  it('zerar baú que já estava vazio ainda avisa (ADR-16)', async () => {
    abrir(seedBase());
    const d = discord();
    expect((await chamarRota(ZERAR, { metodo: 'POST', caminho: '/api/bau/zerar', perfil: 3, corpo: { alvo: 'gerencia', confirmacao: 'ZERAR' } })).status).toBe(200);
    await executar();
    expect(canaisChamados(d)).toEqual(esperados('WEBHOOK_LOG_GERENCIA', 'WEBHOOK_INVENTARIO_GERENCIA'));
  });

  it('remover do catálogo um item que só existe no baú dos membros avisa só os membros; sem estoque, ninguém', async () => {
    abrir(seedBase({ membros: { armas: { colt: 2 } } }));
    let d = discord();
    expect((await chamarRota(CATALOGO_REMOVER, { metodo: 'DELETE', caminho: '/api/catalogo/itens/armas/colt', params: { categoriaId: 'armas', itemId: 'colt' }, perfil: 3 })).status).toBe(200);
    await executar();
    expect(canaisChamados(d)).toEqual(esperados('WEBHOOK_LOG_MEMBROS', 'WEBHOOK_INVENTARIO_MEMBROS'));

    abrir(seedBase());
    d = discord();
    expect((await chamarRota(CATALOGO_REMOVER, { metodo: 'DELETE', caminho: '/api/catalogo/itens/armas/usp', params: { categoriaId: 'armas', itemId: 'usp' }, perfil: 3 })).status).toBe(200);
    expect(tarefas).toHaveLength(0);
    expect(d.chamadas).toHaveLength(0);
  });

  it('ajuste sem diferença (0 alterados), adicionar item ao catálogo e prévia não agendam nada', async () => {
    const d = discord();
    const r1 = await chamarRota(AJUSTE_CONFIRMAR, { metodo: 'POST', caminho: '/api/bau/membros/ajuste/confirmar', params: { tipo: 'membros' }, perfil: 2, corpo: { versao: 0, linhas: [{ categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 10 }] } });
    expect(r1.status).toBe(200);
    expect(r1.corpo.dados).toMatchObject({ alterados: 0 });
    const r2 = await chamarRota(CATALOGO_ADICIONAR, { metodo: 'POST', caminho: '/api/catalogo/itens', perfil: 2, corpo: { categoriaId: 'armas', nome: 'Faca' } });
    expect(r2.status).toBe(201);
    const r3 = await chamarRota(AJUSTE_PREVIA, { metodo: 'POST', caminho: '/api/bau/membros/ajuste/previa', params: { tipo: 'membros' }, perfil: 2, corpo: { linhas: [{ categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 1 }] } });
    expect(r3.status).toBe(200);
    expect(tarefas).toHaveLength(0);
    expect(d.chamadas).toHaveLength(0);
  });

  it('o conteúdo do aviso: movimentação mostra quem, item e quantidade; aviso de zerar mostra o resumo', async () => {
    const d = discord();
    await cenarios[0]!.chamar();
    await executar();
    const logMembros = d.chamadas.find((c) => c.url.includes(token('WEBHOOK_LOG_MEMBROS')))!;
    const embed = JSON.parse(logMembros.corpo).embeds[0];
    expect(embed.description).toContain(USUARIO.nome);
    expect(embed.description).toContain('3x Bandagem');
    const inv = [...d.mensagens.values()].find((m) => m.canalToken === token('WEBHOOK_INVENTARIO_MEMBROS'))!;
    expect(JSON.stringify(inv.payload.embeds)).toContain('Bandagem: **13**');
  });
});

describe('WEB-051 AC2: webhook rejeitando, lançando ou lento não muda a resposta nem o banco', () => {
  const FALHAS: Array<[string, (c: { url: string }) => RespostaFake]> = [
    ['HTTP 500', () => respostaJson({ message: 'Internal' }, 500)],
    ['HTTP 404 (webhook apagado)', () => respostaJson({ message: 'Unknown Webhook', code: 10015 }, 404)],
    ['HTTP 401', () => respostaJson({ message: '401: Unauthorized' }, 401)],
    ['429 com espera longa', () => respostaJson({ message: 'You are being rate limited.', retry_after: 60 }, 429)],
    ['rede caída (erro com a URL dentro)', (c) => new TypeError(`fetch failed ${c.url}`)],
    ['resposta que não é JSON', () => new Response('<html>oops</html>', { status: 200 })],
  ];

  for (const c of cenarios) {
    it(`${c.nome}: resposta 200 igual à do Discord saudável, banco igual, nenhuma menção ao Discord`, async () => {
      discord();
      const base = await c.chamar();
      await executar();
      const dominioBase = dominio(fake.dump());
      const contagemBase = Object.keys(dominioBase).length;

      for (const [rotulo, resposta] of FALHAS) {
        abrir();
        resetSemente();
        saidas.length = 0;
        const d = criarDiscordFake((chamada) => resposta(chamada));
        setFetch(d.fetch);
        const r = await c.chamar();
        expect(r.status, rotulo).toBe(base.status);
        expect(r.corpo, rotulo).toEqual(base.corpo);
        await expect(executar()).resolves.toBeUndefined();

        const depois = dominio(fake.dump());
        expect(Object.keys(depois).length, rotulo).toBe(contagemBase);
        expect(Object.keys(depois).sort(), rotulo).toEqual(Object.keys(dominioBase).sort());
        expect(r.texto.toLowerCase(), rotulo).not.toMatch(/discord|webhook|rate limit|unknown/);
        const log = saidas.join('\n');
        expect(log, rotulo).not.toContain('/api/webhooks/');
        for (const n of Object.keys(ENV_TESTE).filter((k) => k.startsWith('WEBHOOK_'))) expect(log, `${rotulo} ${n}`).not.toContain(token(n));
      }
    });
  }

  it('webhook lento (nunca responde, timeout de 5 s) também não afeta o resultado', async () => {
    discord(() => new Promise<Response>(() => undefined));
    const r = await cenarios[0]!.chamar();
    expect(r.status).toBe(200);
    expect(r.corpo.dados).toMatchObject({ quantidade: 13 });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const p = executar();
    let pronto = false;
    void p.then(() => (pronto = true));
    for (let i = 0; i < 40 && !pronto; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(pronto).toBe(true);
    expect((fake.dump()['baus/membros'] as { itens: { medicamentos: { bandagem: number } } }).itens.medicamentos.bandagem).toBe(13);
  });

  it('um erro na montagem/envio de um aviso não impede os outros (tarefas isoladas)', async () => {
    const d = discord((c) => (c.url.includes(token('WEBHOOK_LOG_MEMBROS')) ? new TypeError('boom') : undefined));
    await cenarios[0]!.chamar();
    await executar();
    expect(canaisChamados(d)).toEqual(esperados('WEBHOOK_LOG_MEMBROS', 'WEBHOOK_INVENTARIO_MEMBROS'));
    expect(d.mensagens.size).toBe(1);
  });

  it('o inventário falhando por Firestore indisponível não derruba o aviso de movimentação', async () => {
    const d = discord();
    await cenarios[0]!.chamar();
    fake.falharEm('get', /^baus\/membros$/, new Error('indisponível'));
    await expect(executar()).resolves.toBeUndefined();
    expect(canaisChamados(d)).toEqual(esperados('WEBHOOK_LOG_MEMBROS'));
  });
});

describe('WEB-051 AC3: a transação nunca é repetida nem revertida por falha de webhook', () => {
  for (const c of cenarios) {
    it(`${c.nome}: nenhuma escrita de domínio acontece depois da resposta, mesmo com tudo falhando`, async () => {
      discord(() => respostaJson({}, 500));
      const r = await c.chamar();
      expect(r.status).toBe(200);
      const antes = escritasDominio().length;
      const dumpAntes = dominio(fake.dump());
      expect(antes).toBeGreaterThan(0);
      await executar();
      expect(escritasDominio()).toHaveLength(antes);
      expect(dominio(fake.dump())).toEqual(dumpAntes);
    });
  }

  it('as tarefas só tocam webhook_mensagens (e leem o estado) no Firestore', async () => {
    discord();
    await cenarios[2]!.chamar();
    const marca = fake.chamadas.length;
    await executar();
    const novas = fake.chamadas.slice(marca).filter((c) => c.op !== 'get');
    expect(novas.length).toBeGreaterThan(0);
    expect(novas.every((c) => c.caminho.startsWith('webhook_mensagens/'))).toBe(true);
  });
});

describe('WEB-051 AC4: webhook só depois do commit', () => {
  it('quando o Discord é chamado, a alteração já está gravada', async () => {
    let vistoNoEnvio: Record<string, Dados> | null = null;
    const d = discord(() => {
      vistoNoEnvio ??= fake.dump();
      return undefined;
    });
    await cenarios[0]!.chamar();
    expect(d.chamadas).toHaveLength(0);
    await executar();
    expect(vistoNoEnvio).not.toBeNull();
    expect((vistoNoEnvio!['baus/membros'] as { itens: { medicamentos: { bandagem: number } } }).itens.medicamentos.bandagem).toBe(13);
    expect(Object.keys(vistoNoEnvio!).some((c) => c.startsWith('logs/membros/entradas/'))).toBe(true);
  });

  for (const c of cenarios) {
    it(`${c.nome}: commit que falha → 500, nada agendado e nada enviado`, async () => {
      const d = discord();
      const provar = await falharCommitDaOperacao(fake, new Error('commit falhou'));
      const r = await c.chamar();
      expect(r.status).toBe(500);
      provar();
      expect(tarefas).toHaveLength(0);
      await executar();
      expect(d.chamadas).toHaveLength(0);
    });
  }

  it('recusas de regra (estoque insuficiente, saldo insuficiente, versão antiga, validação) não agendam nada', async () => {
    const d = discord();
    const rs = await Promise.all([
      chamarRota(REMOVER_BAU, { metodo: 'POST', caminho: '/api/bau/membros/remover', params: { tipo: 'membros' }, perfil: 1, corpo: { categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 999 } }),
      chamarRota(MOVIMENTAR, { metodo: 'POST', caminho: '/api/caixa/movimentar', perfil: 2, corpo: { tipo: 'sujo', acao: 'saida', valor: 999999, anotacao: 'x' } }),
      chamarRota(AJUSTE_CONFIRMAR, { metodo: 'POST', caminho: '/api/bau/membros/ajuste/confirmar', params: { tipo: 'membros' }, perfil: 2, corpo: { versao: 99, linhas: [{ categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 1 }] } }),
      chamarRota(ADICIONAR_BAU, { metodo: 'POST', caminho: '/api/bau/membros/adicionar', params: { tipo: 'membros' }, perfil: 1, corpo: { categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 0 } }),
    ]);
    expect(rs.map((r) => r.status)).toEqual([409, 409, 409, 400]);
    expect(tarefas).toHaveLength(0);
    expect(d.chamadas).toHaveLength(0);
  });

  it('sem permissão ou sem sessão nada é agendado', async () => {
    const d = discord();
    const rs = await Promise.all([
      chamarRota(ZERAR, { metodo: 'POST', caminho: '/api/bau/zerar', perfil: 2, corpo: { alvo: 'ambos', confirmacao: 'ZERAR' } }),
      chamarRota(ZERAR, { metodo: 'POST', caminho: '/api/bau/zerar', perfil: 'anonimo', corpo: { alvo: 'ambos', confirmacao: 'ZERAR' } }),
      chamarRota(CATALOGO_REMOVER, { metodo: 'DELETE', caminho: '/api/catalogo/itens/armas/colt', params: { categoriaId: 'armas', itemId: 'colt' }, perfil: 2 }),
    ]);
    expect(rs.map((r) => r.status)).toEqual([403, 401, 403]);
    expect(tarefas).toHaveLength(0);
    expect(d.chamadas).toHaveLength(0);
  });
});

describe('WEB-051 AC5: a resposta não espera o Discord', () => {
  it('com o Discord pendente para sempre, a rota responde em bem menos de 1 s', async () => {
    discord(() => new Promise<Response>(() => undefined));
    let gasto = 0;
    const status: number[] = [];
    for (const c of cenarios) {
      abrir();
      resetSemente();
      const inicio = performance.now();
      status.push((await c.chamar()).status);
      gasto += performance.now() - inicio;
    }
    expect(status.every((s) => s === 200)).toBe(true);
    expect(gasto).toBeLessThan(1000);
    expect(tarefas.length).toBeGreaterThanOrEqual(cenarios.length);
  });

  it('relógio simulado: Discord que levaria 10 s não adianta o relógio da rota e é cortado aos 5 s na tarefa', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const d = discord(() => new Promise<Response>((resolve) => setTimeout(() => resolve(respostaJson({ id: '1' })), 10_000)));
    const r = await cenarios[0]!.chamar();
    expect(r.status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
    expect(d.chamadas).toHaveLength(0);

    let pronto = false;
    const p = executar().then(() => (pronto = true));
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(4999);
    expect(pronto).toBe(false);
    for (let i = 0; i < 20 && !pronto; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(100);
    }
    await p;
    expect(pronto).toBe(true);
    expect(d.mensagens.size).toBe(0);
  });

  it('publicarEvento só agenda: nada de rede nem de Firestore até a tarefa rodar', async () => {
    const d = discord();
    const log = {
      acao: 'adicionar' as const,
      usuario: USUARIO,
      data: '2026-11-05T12:00:00.000Z',
      versao: 1,
      categoriaId: 'medicamentos',
      itemId: 'bandagem',
      nomeItem: 'Bandagem',
      nomeCategoria: 'Medicamentos',
      quantidade: 1,
      saldoResultante: 1,
      resumo: null,
      auditoriaId: null,
    };
    const marca = fake.chamadas.length;
    const eventos: EventoDominio[] = [
      { tipo: 'bau.movimento', bau: 'membros', log },
      { tipo: 'bau.aviso', baus: ['membros', 'gerencia'], log: { ...log, acao: 'ajuste', resumo: 'Ajuste.' } },
    ];
    publicarEvento(eventos[0]!);
    publicarEventos([eventos[1]!]);
    expect(tarefas).toHaveLength(2);
    expect(d.chamadas).toHaveLength(0);
    expect(fake.chamadas).toHaveLength(marca);
    await executar();
    expect(canaisChamados(d)).toEqual(esperados('WEBHOOK_LOG_MEMBROS', 'WEBHOOK_LOG_GERENCIA', 'WEBHOOK_INVENTARIO_MEMBROS', 'WEBHOOK_INVENTARIO_GERENCIA'));
  });

  it('publicarEvento nunca lança, nem com agendador que quebra', () => {
    setAgendador(() => {
      throw new Error('after() fora de requisição');
    });
    const log = { acao: 'adicionar' as const, usuario: USUARIO, data: 'x', versao: 1, categoriaId: null, itemId: null, nomeItem: null, nomeCategoria: null, quantidade: null, saldoResultante: null, resumo: null, auditoriaId: null };
    expect(() => publicarEvento({ tipo: 'bau.movimento', bau: 'membros', log })).not.toThrow();
  });
});
