/**
 * WEB-066 (dono: qa-engineer). Fluxos completos chamando os handlers de rota reais, com o Firestore
 * falso e um Discord falso (OAuth + webhooks). Nenhuma rede nem segredo real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as LOGIN } from '@/app/api/auth/login/route';
import { GET as CALLBACK } from '@/app/api/auth/callback/route';
import { POST as LOGOUT } from '@/app/api/auth/logout/route';
import { GET as CSRF } from '@/app/api/csrf/route';
import { GET as BAU } from '@/app/api/bau/[tipo]/route';
import { POST as ADICIONAR } from '@/app/api/bau/[tipo]/adicionar/route';
import { POST as REMOVER } from '@/app/api/bau/[tipo]/remover/route';
import { POST as PREVIA } from '@/app/api/bau/[tipo]/ajuste/previa/route';
import { POST as CONFIRMAR } from '@/app/api/bau/[tipo]/ajuste/confirmar/route';
import { POST as ZERAR } from '@/app/api/bau/zerar/route';
import { GET as SALDO } from '@/app/api/caixa/route';
import { GET as HISTORICO } from '@/app/api/caixa/historico/route';
import { POST as MOVIMENTAR } from '@/app/api/caixa/movimentar/route';
import { GET as CATALOGO } from '@/app/api/catalogo/route';
import { POST as CATALOGO_ADICIONAR } from '@/app/api/catalogo/itens/route';
import { DELETE as CATALOGO_REMOVER } from '@/app/api/catalogo/itens/[categoriaId]/[itemId]/route';
import { GET as LOGS_BAU } from '@/app/api/logs/bau/[tipo]/route';
import { GET as AUDITORIA } from '@/app/api/auditoria/route';
import { GET as AUDITORIA_ID } from '@/app/api/auditoria/[id]/route';
import { REVALIDACAO_MS } from '@/compartilhado/limites';
import { nomeCookieSessao, lerSessao } from '@/server/auth/sessao';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto, setAgendador, setFetch } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores, setLimitador } from '@/server/seguranca/limite';
import { aplicarEnvTeste, ENV_TESTE, limparEnvTeste } from '../helpers/env-teste';
import { criarDiscordFake } from '../helpers/discord-fake';
import { respostaJson } from '../helpers/fake-fetch';
import { comoDb, criarFakeFirestore, type Dados, type FakeFirestore } from '../helpers/fake-firestore';
import { criarRequisicao, valorDoCookie } from '../helpers/requisicao';

const APP = ENV_TESTE.APP_URL!;
const CARGO = { membro: '333333333333333331', gerente: '333333333333333333', dono: '333333333333333334' };

/** Corpo JSON lido da resposta: o mesmo tipo que JSON.parse devolve. */
type JsonLivre = ReturnType<typeof JSON.parse>;
type Rota = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;
interface Sessao {
  cookie: string;
  csrf: string;
  userId: string;
}
interface Resp {
  status: number;
  corpo: { ok: boolean; dados?: JsonLivre; erro?: string; codigo?: string; detalhes?: JsonLivre };
  texto: string;
}

/** Quem está no "servidor do Discord": userId → cargos. Ausente = fora do servidor (404). */
let membrosDiscord: Map<string, string[]>;
let webhookForaDoAr: boolean;
let fake: FakeFirestore;
let tarefas: Array<() => Promise<void>>;
let discord: ReturnType<typeof criarDiscordFake>;
let saidas: string[];

function montarDiscord() {
  discord = criarDiscordFake((c) => {
    if (c.url.endsWith('/oauth2/token')) {
      const code = new URLSearchParams(c.corpo).get('code') ?? '';
      return respostaJson({ access_token: `tok-${code}`, token_type: 'Bearer' });
    }
    if (c.url.includes('/users/@me/guilds/')) {
      const userId = (c.headers.get('authorization') ?? '').replace('Bearer tok-', '');
      const roles = membrosDiscord.get(userId);
      if (!roles) return respostaJson({ message: 'Unknown Guild' }, 404);
      return respostaJson({ user: { id: userId, username: `u${userId.slice(-2)}` }, roles });
    }
    if (webhookForaDoAr && c.url.includes('/api/webhooks/')) return new Error('ECONNREFUSED discord fora do ar');
    return undefined;
  });
  setFetch(discord.fetch);
}

const webhooks = () => discord.chamadas.filter((c) => c.url.includes('/api/webhooks/'));
const tokenDoCanal = (nome: string) => ENV_TESTE[nome]!.split('/').pop()!;
const canaisChamados = () => [...new Set(webhooks().map((c) => /\/webhooks\/\d+\/([\w-]+)/.exec(c.url)![1]))].sort();
const esperados = (...nomes: string[]) => nomes.map(tokenDoCanal).sort();
const executarPosCommit = async () => {
  while (tarefas.length > 0) await Promise.all(tarefas.splice(0).map((t) => t()));
};

beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  membrosDiscord = new Map();
  webhookForaDoAr = false;
  tarefas = [];
  saidas = [];
  setAgendador((t) => void tarefas.push(t));
  const livre = { consumir: () => ({ ok: true as const }) };
  setLimitador('usuario', livre);
  setLimitador('ip', livre);
  for (const m of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void saidas.push(a.map(String).join(' ')));
  }
  montarDiscord();
  fake = criarFakeFirestore({ seed: {} }); // banco vazio: a semente roda de verdade
  setDb(comoDb(fake));
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

async function ler(res: Response): Promise<Resp> {
  const texto = await res.text();
  return { status: res.status, corpo: texto ? (JSON.parse(texto) as Resp['corpo']) : { ok: false }, texto };
}

/** Login completo: /api/auth/login → Discord → /api/auth/callback → cookie de sessão → /api/csrf. */
async function entrar(userId: string, volta = '/bau/membros'): Promise<Sessao | { erro: string }> {
  const ini = await LOGIN(criarRequisicao(`${APP}/api/auth/login?volta=${encodeURIComponent(volta)}`));
  expect(ini.status).toBe(307);
  const state = new URL(ini.headers.get('location')!).searchParams.get('state')!;
  const cookieState = valorDoCookie(ini, 'stocky_oauth')!;
  const cb = await CALLBACK(
    criarRequisicao(`${APP}/api/auth/callback?code=${userId}&state=${state}`, { cookies: { stocky_oauth: cookieState } }),
  );
  expect(cb.status).toBe(307);
  const destino = cb.headers.get('location')!;
  const cookie = valorDoCookie(cb, nomeCookieSessao());
  if (!cookie) return { erro: new URL(destino).searchParams.get('erro') ?? 'sem cookie' };
  expect(destino).toBe(`${APP}${volta}`);
  const r = await ler(await CSRF(criarRequisicao(`${APP}/api/csrf`, { cookies: { [nomeCookieSessao()]: cookie } })));
  expect(r.status).toBe(200);
  return { cookie, csrf: r.corpo.dados.csrf as string, userId };
}

async function entrarOk(userId: string, cargos: string[]): Promise<Sessao> {
  membrosDiscord.set(userId, cargos);
  const s = await entrar(userId);
  if ('erro' in s) throw new Error(`login falhou: ${s.erro}`);
  return s;
}

async function chamar(
  rota: unknown,
  s: Sessao | null,
  metodo: string,
  caminho: string,
  o: { params?: Record<string, string>; corpo?: unknown } = {},
): Promise<Resp> {
  const headers: Record<string, string> = {};
  const mutacao = metodo !== 'GET';
  if (mutacao) {
    headers.origin = APP;
    if (s) headers['x-csrf-token'] = s.csrf;
  }
  const req = criarRequisicao(`${APP}${caminho}`, {
    metodo,
    headers,
    cookies: s ? { [nomeCookieSessao()]: s.cookie } : undefined,
    corpo: mutacao ? (o.corpo ?? {}) : undefined,
  });
  return await ler(await (rota as Rota)(req, { params: Promise.resolve(o.params ?? {}) }));
}

const bau = (s: Sessao, tipo: 'membros' | 'gerencia') => chamar(BAU, s, 'GET', `/api/bau/${tipo}`, { params: { tipo } });
const mover = (rota: unknown, s: Sessao, tipo: string, categoriaId: string, itemId: string, quantidade: unknown) =>
  chamar(rota, s, 'POST', `/api/bau/${tipo}/x`, { params: { tipo }, corpo: { categoriaId, itemId, quantidade } });
const qtd = async (s: Sessao, tipo: 'membros' | 'gerencia', cat: string, item: string): Promise<number> => {
  const r = await bau(s, tipo);
  const c = (r.corpo.dados.categorias as Array<{ id: string; itens: Array<{ id: string; quantidade: number }> }>).find((x) => x.id === cat);
  return c?.itens.find((i) => i.id === item)?.quantidade ?? 0;
};
const auditorias = (d: Record<string, Dados>) => Object.entries(d).filter(([k]) => k.startsWith('auditoria/')).map(([, v]) => v);
const logs = (d: Record<string, Dados>, escopo: string) =>
  Object.entries(d).filter(([k]) => k.startsWith(`logs/${escopo}/entradas/`)).map(([, v]) => v);

describe('WEB-066 AC1 login e acesso por nível', () => {
  it('membro, gerente e dono entram com o nível certo; quem está fora do servidor ou sem cargo não entra', async () => {
    const m = await entrarOk('500000000000000001', [CARGO.membro]);
    const g = await entrarOk('500000000000000002', [CARGO.gerente]);
    const d = await entrarOk('500000000000000003', [CARGO.membro, CARGO.dono]);
    expect((await lerSessao(m.cookie))!.nivel).toBe(1);
    expect((await lerSessao(g.cookie))!.nivel).toBe(2);
    expect((await lerSessao(d.cookie))!.nivel).toBe(3);

    expect((await bau(m, 'membros')).status).toBe(200);
    expect((await bau(m, 'gerencia')).status).toBe(403);
    expect((await chamar(SALDO, m, 'GET', '/api/caixa')).status).toBe(403);
    expect((await bau(g, 'gerencia')).status).toBe(200);
    expect((await chamar(SALDO, g, 'GET', '/api/caixa')).status).toBe(200);

    expect(await entrar('500000000000000009')).toEqual({ erro: 'sem_acesso' }); // fora do servidor (404)
    membrosDiscord.set('500000000000000008', ['999999999999999999']);
    expect(await entrar('500000000000000008')).toEqual({ erro: 'sem_acesso' }); // sem cargo configurado
    expect((await chamar(BAU, null, 'GET', '/api/bau/membros', { params: { tipo: 'membros' } })).status).toBe(401);
  });

  it('logout encerra a sessão (cookie apagado) e GET de logout não existe', async () => {
    const m = await entrarOk('500000000000000001', [CARGO.membro]);
    const req = criarRequisicao(`${APP}/api/auth/logout`, {
      metodo: 'POST',
      headers: { origin: APP, 'x-csrf-token': m.csrf },
      cookies: { [nomeCookieSessao()]: m.cookie },
      corpo: {},
    });
    const res = await LOGOUT(req);
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join(';')).toMatch(new RegExp(`${nomeCookieSessao()}=;.*Max-Age=0`));
  });
});

describe('WEB-066 AC2 baú', () => {
  it('adicionar, remover até zerar, log e webhooks de movimentação + inventário', async () => {
    const m = await entrarOk('500000000000000001', [CARGO.membro]);
    expect((await mover(ADICIONAR, m, 'membros', 'armas', 'colt', 10)).status).toBe(200);
    expect(await qtd(m, 'membros', 'armas', 'colt')).toBe(10);
    expect((await mover(REMOVER, m, 'membros', 'armas', 'colt', '4')).corpo.dados).toMatchObject({ quantidade: 6 });
    expect((await mover(REMOVER, m, 'membros', 'armas', 'colt', 6)).corpo.dados).toMatchObject({ quantidade: 0 });
    const dump = fake.dump();
    expect(dump['baus/membros']!.itens).toEqual({}); // chave apagada, sem 0
    const l = logs(dump, 'membros');
    expect(l.map((x) => x.acao).sort()).toEqual(['adicionar', 'remover', 'remover']);
    expect(l.every((x) => (x.usuario as { id: string }).id === m.userId)).toBe(true);
    expect((await mover(REMOVER, m, 'membros', 'armas', 'colt', 1)).status).toBe(404);

    await executarPosCommit();
    expect(canaisChamados()).toEqual(esperados('WEBHOOK_LOG_MEMBROS', 'WEBHOOK_INVENTARIO_MEMBROS'));
    expect(webhooks().every((c) => JSON.parse(c.corpo).allowed_mentions?.parse?.length === 0)).toBe(true);
  });

  it('concorrência 6 + 6 com estoque 10: um sucesso, um 409, estoque final 4', async () => {
    const m = await entrarOk('500000000000000001', [CARGO.membro]);
    const outro = await entrarOk('500000000000000004', [CARGO.membro]);
    await mover(ADICIONAR, m, 'membros', 'medicamentos', 'analgesico', 10);
    const r = await Promise.all([
      mover(REMOVER, m, 'membros', 'medicamentos', 'analgesico', 6),
      mover(REMOVER, outro, 'membros', 'medicamentos', 'analgesico', 6),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(r.find((x) => x.status === 409)!.corpo.codigo).toBe('ESTOQUE_INSUFICIENTE');
    expect(await qtd(m, 'membros', 'medicamentos', 'analgesico')).toBe(4);
    expect(logs(fake.dump(), 'membros').filter((x) => x.acao === 'remover')).toHaveLength(1);
  });
});

describe('WEB-066 AC3 caixa', () => {
  it('entrada, saída, saída recusada, histórico e webhook de saldo', async () => {
    const g = await entrarOk('500000000000000002', [CARGO.gerente]);
    const mov = (corpo: object) => chamar(MOVIMENTAR, g, 'POST', '/api/caixa/movimentar', { corpo });
    expect((await mov({ tipo: 'sujo', acao: 'entrada', valor: 1000, anotacao: 'venda' })).corpo.dados).toEqual({ sujo: 1000, limpo: 0 });
    expect((await mov({ tipo: 'sujo', acao: 'saida', valor: '400', anotacao: 'compra' })).corpo.dados).toEqual({ sujo: 600, limpo: 0 });
    const recusada = await mov({ tipo: 'sujo', acao: 'saida', valor: 601, anotacao: 'demais' });
    expect(recusada.status).toBe(409);
    expect(recusada.corpo.codigo).toBe('SALDO_INSUFICIENTE');
    expect((await mov({ tipo: 'limpo', acao: 'saida', valor: 1, anotacao: 'x' })).status).toBe(409);
    expect((await chamar(SALDO, g, 'GET', '/api/caixa')).corpo.dados).toEqual({ sujo: 600, limpo: 0 });
    const h = await chamar(HISTORICO, g, 'GET', '/api/caixa/historico?limite=10');
    expect(h.corpo.dados.itens.map((x: { acao: string; valor: number }) => `${x.acao}:${x.valor}`)).toEqual(['saida:400', 'entrada:1000']);
    await executarPosCommit();
    expect(canaisChamados()).toEqual(esperados('WEBHOOK_LOG_CAIXA', 'WEBHOOK_SALDO_CAIXA'));
    const saldoMsg = [...discord.mensagens.values()].find((x) => x.canalToken === tokenDoCanal('WEBHOOK_SALDO_CAIXA'))!;
    expect(JSON.stringify(saldoMsg.payload)).toContain('$600');
  });
});

describe('WEB-066 AC4 catálogo', () => {
  it('adicionar, duplicado recusado, 26º recusado, remover (dono) com auditoria e baús limpos', async () => {
    const g = await entrarOk('500000000000000002', [CARGO.gerente]);
    const d = await entrarOk('500000000000000003', [CARGO.dono]);
    const novo = (nome: string, categoriaId = 'drogas') =>
      chamar(CATALOGO_ADICIONAR, g, 'POST', '/api/catalogo/itens', { corpo: { categoriaId, nome } });
    const criado = await novo('Erva Fina');
    expect(criado.status).toBe(201);
    expect(criado.corpo.dados.item).toEqual({ id: 'erva_fina', nome: 'Erva Fina' });
    expect((await novo('erva-fina')).corpo.codigo).toBe('DUPLICADO');
    // drogas tem 5 padrão + 1 = 6; completa até 25
    for (let i = 7; i <= 25; i += 1) expect((await novo(`Item ${i}`)).status, `item ${i}`).toBe(201);
    const excedente = await novo('Item 26');
    expect(excedente.status).toBe(409);
    expect(excedente.corpo.codigo).toBe('LIMITE_CATEGORIA');

    await mover(ADICIONAR, g, 'membros', 'drogas', 'erva_fina', 3);
    await mover(ADICIONAR, g, 'gerencia', 'drogas', 'erva_fina', 7);
    const r = await chamar(CATALOGO_REMOVER, d, 'DELETE', '/api/catalogo/itens/drogas/erva_fina', {
      params: { categoriaId: 'drogas', itemId: 'erva_fina' },
    });
    expect(r.status).toBe(200);
    expect(r.corpo.dados.removidoDe).toEqual({ membros: 3, gerencia: 7 });
    const dump = fake.dump();
    expect(dump['baus/membros']!.itens).toEqual({});
    expect(dump['baus/gerencia']!.itens).toEqual({});
    const aud = auditorias(dump).find((a) => a.acao === 'catalogo.remover_item')!;
    expect(aud).toMatchObject({ usuario: { id: d.userId }, antes: { membros: 3, gerencia: 7 }, depois: null });
    const cat = await chamar(CATALOGO, g, 'GET', '/api/catalogo');
    expect(JSON.stringify(cat.corpo.dados)).not.toContain('erva_fina');
    const lista = await chamar(AUDITORIA, g, 'GET', '/api/auditoria?acao=catalogo.remover_item');
    expect(lista.corpo.dados.itens).toHaveLength(1);
    const det = await chamar(AUDITORIA_ID, g, 'GET', `/api/auditoria/${lista.corpo.dados.itens[0].id}`, {
      params: { id: lista.corpo.dados.itens[0].id },
    });
    expect(det.corpo.dados.antes).toEqual({ membros: 3, gerencia: 7 });
  });
});

describe('WEB-066 AC5 ajuste em massa (D1 e D3)', () => {
  it('prévia → confirmar aplica; prévia → depósito → confirmar recusado com 409 (D3); item com # funciona (D1)', async () => {
    const g = await entrarOk('500000000000000002', [CARGO.gerente]);
    const nomeD1 = '#1 Especial: .50';
    const novo = await chamar(CATALOGO_ADICIONAR, g, 'POST', '/api/catalogo/itens', { corpo: { categoriaId: 'armas', nome: nomeD1 } });
    expect(novo.status).toBe(201);
    const idD1 = novo.corpo.dados.item.id as string;
    expect(idD1).toBe('1_especial_50');
    await mover(ADICIONAR, g, 'gerencia', 'armas', 'colt', 3);

    const previa = (linhas: object[]) => chamar(PREVIA, g, 'POST', '/api/bau/gerencia/ajuste/previa', { params: { tipo: 'gerencia' }, corpo: { linhas } });
    const confirmar = (versao: number, linhas: object[]) =>
      chamar(CONFIRMAR, g, 'POST', '/api/bau/gerencia/ajuste/confirmar', { params: { tipo: 'gerencia' }, corpo: { versao, linhas } });

    const linhas = [
      { categoriaId: 'armas', itemId: 'colt', quantidade: 5 },
      { categoriaId: 'armas', itemId: idD1, quantidade: '2' },
    ];
    const p1 = await previa(linhas);
    expect(p1.status).toBe(200);
    expect(p1.corpo.dados.linhas.map((l: { nome: string; antes: number; depois: number }) => `${l.nome}:${l.antes}->${l.depois}`)).toEqual([
      'Colt:3->5',
      `${nomeD1}:0->2`,
    ]);
    const ok = await confirmar(p1.corpo.dados.versao, linhas);
    expect(ok.status).toBe(200);
    expect(ok.corpo.dados.alterados).toBe(2);
    expect(await qtd(g, 'gerencia', 'armas', idD1)).toBe(2);

    // D3: prévia mostra 5 → 8; entra +10 antes de confirmar; confirmação recusada, estoque 15, sem nova auditoria
    const p2 = await previa([{ categoriaId: 'armas', itemId: 'colt', quantidade: 8 }]);
    expect(p2.corpo.dados.linhas[0]).toMatchObject({ antes: 5, depois: 8 });
    await mover(ADICIONAR, g, 'gerencia', 'armas', 'colt', 10);
    const audAntes = auditorias(fake.dump()).length;
    const velho = await confirmar(p2.corpo.dados.versao, [{ categoriaId: 'armas', itemId: 'colt', quantidade: 8 }]);
    expect(velho.status).toBe(409);
    expect(velho.corpo.codigo).toBe('VERSAO_DESATUALIZADA');
    expect(await qtd(g, 'gerencia', 'armas', 'colt')).toBe(15);
    expect(auditorias(fake.dump())).toHaveLength(audAntes);
  });
});

describe('WEB-066 AC6 zerar e remover do catálogo: só o dono', () => {
  it('dono zera um e depois ambos com auditoria; gerência recebe 403 sem alterar nada', async () => {
    const g = await entrarOk('500000000000000002', [CARGO.gerente]);
    const d = await entrarOk('500000000000000003', [CARGO.dono]);
    await mover(ADICIONAR, g, 'membros', 'armas', 'usp', 4);
    await mover(ADICIONAR, g, 'gerencia', 'armas', 'usp', 9);

    const antes = fake.dump();
    const zerarG = await chamar(ZERAR, g, 'POST', '/api/bau/zerar', { corpo: { alvo: 'ambos', confirmacao: 'ZERAR' } });
    expect(zerarG.status).toBe(403);
    const removerG = await chamar(CATALOGO_REMOVER, g, 'DELETE', '/api/catalogo/itens/armas/usp', {
      params: { categoriaId: 'armas', itemId: 'usp' },
    });
    expect(removerG.status).toBe(403);
    expect(fake.dump()).toEqual(antes);

    const z1 = await chamar(ZERAR, d, 'POST', '/api/bau/zerar', { corpo: { alvo: 'membros', confirmacao: 'ZERAR' } });
    expect(z1.status).toBe(200);
    expect(z1.corpo.dados).toMatchObject({ alvos: ['membros'], itens: 1, unidades: 4 });
    expect(await qtd(g, 'gerencia', 'armas', 'usp')).toBe(9);
    const z2 = await chamar(ZERAR, d, 'POST', '/api/bau/zerar', { corpo: { alvo: 'ambos', confirmacao: 'ZERAR' } });
    expect(z2.corpo.dados).toMatchObject({ alvos: ['membros', 'gerencia'], itens: 1, unidades: 9 });
    const aud = auditorias(fake.dump()).filter((a) => a.acao === 'bau.zerar');
    expect(aud).toHaveLength(2);
    expect(aud.map((a) => a.antes)).toContainEqual({ membros: { armas: { usp: 4 } } });
    expect(aud.map((a) => a.antes)).toContainEqual({ membros: {}, gerencia: { armas: { usp: 9 } } });
    expect(logs(fake.dump(), 'gerencia').some((l) => l.acao === 'zerar')).toBe(true);
  });
});

describe('WEB-066 AC7 webhook fora do ar', () => {
  it('todas as operações seguem com sucesso e dados corretos; nenhuma URL de webhook no log', async () => {
    webhookForaDoAr = true;
    const g = await entrarOk('500000000000000002', [CARGO.gerente]);
    const d = await entrarOk('500000000000000003', [CARGO.dono]);
    expect((await mover(ADICIONAR, g, 'membros', 'armas', 'colt', 5)).status).toBe(200);
    expect((await mover(REMOVER, g, 'membros', 'armas', 'colt', 2)).status).toBe(200);
    expect(
      (await chamar(MOVIMENTAR, g, 'POST', '/api/caixa/movimentar', { corpo: { tipo: 'limpo', acao: 'entrada', valor: 50, anotacao: 'a' } })).status,
    ).toBe(200);
    const p = await chamar(PREVIA, g, 'POST', '/api/bau/membros/ajuste/previa', {
      params: { tipo: 'membros' },
      corpo: { linhas: [{ categoriaId: 'armas', itemId: 'colt', quantidade: 1 }] },
    });
    expect(
      (await chamar(CONFIRMAR, g, 'POST', '/api/bau/membros/ajuste/confirmar', {
        params: { tipo: 'membros' },
        corpo: { versao: p.corpo.dados.versao, linhas: [{ categoriaId: 'armas', itemId: 'colt', quantidade: 1 }] },
      })).status,
    ).toBe(200);
    expect(
      (await chamar(CATALOGO_REMOVER, d, 'DELETE', '/api/catalogo/itens/armas/colt', { params: { categoriaId: 'armas', itemId: 'colt' } })).status,
    ).toBe(200);
    expect((await chamar(ZERAR, d, 'POST', '/api/bau/zerar', { corpo: { alvo: 'ambos', confirmacao: 'ZERAR' } })).status).toBe(200);
    await executarPosCommit();
    expect(webhooks().length).toBeGreaterThan(0); // tentou avisar
    const dump = fake.dump();
    expect(dump['caixa/saldo']).toMatchObject({ limpo: 50 });
    expect(auditorias(dump).map((a) => a.acao).sort()).toEqual(['bau.ajuste_massa', 'bau.zerar', 'catalogo.remover_item']);
    const todoLog = saidas.join('\n');
    for (const nome of Object.keys(ENV_TESTE).filter((n) => n.startsWith('WEBHOOK_'))) {
      expect(todoLog).not.toContain(tokenDoCanal(nome));
    }
    expect(todoLog).not.toContain('api/webhooks/1');
  });
});

describe('WEB-066 AC8 rebaixamento de cargo', () => {
  it('passado o intervalo de revalidação, a gerência rebaixada perde o acesso', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-05T12:00:00Z'), toFake: ['Date'] });
    const g = await entrarOk('500000000000000002', [CARGO.gerente]);
    expect((await chamar(SALDO, g, 'GET', '/api/caixa')).status).toBe(200);
    membrosDiscord.set('500000000000000002', [CARGO.membro]); // rebaixado no Discord

    vi.setSystemTime(Date.now() + REVALIDACAO_MS - 1000);
    expect((await chamar(SALDO, g, 'GET', '/api/caixa')).status).toBe(200); // ainda dentro do intervalo

    vi.setSystemTime(Date.now() + 2000);
    const rev = await chamar(SALDO, g, 'GET', '/api/caixa');
    expect(rev.status).toBe(401);
    expect(rev.corpo.codigo).toBe('REVALIDAR');

    const novo = await entrarOk('500000000000000002', [CARGO.membro]);
    expect((await lerSessao(novo.cookie))!.nivel).toBe(1);
    expect((await chamar(SALDO, novo, 'GET', '/api/caixa')).status).toBe(403);
    expect((await bau(novo, 'membros')).status).toBe(200);

    // removido do servidor: próxima revalidação não cria sessão
    membrosDiscord.delete('500000000000000002');
    vi.setSystemTime(Date.now() + REVALIDACAO_MS + 1000);
    expect((await chamar(LOGS_BAU, novo, 'GET', '/api/logs/bau/membros', { params: { tipo: 'membros' } })).corpo.codigo).toBe('REVALIDAR');
    expect(await entrar('500000000000000002')).toEqual({ erro: 'sem_acesso' });
  });
});
