/**
 * QA ciclo 3: rodada adversarial nova. Ordem de chaves JSON, números como texto/decimal/exponencial em todas as
 * rotas, corpo vazio/gigante/duplicado, métodos trocados, caminhos com .. e %2e, ids gigantes, Host/Origin forjados,
 * cookies duplicados, expiração da sessão no limite, revalidação de cargos no limite, zerar × ajuste simultâneos e
 * 50 operações paralelas de caixa. Território: qa-engineer. Handlers reais com o Firestore falso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as BAU } from '@/app/api/bau/[tipo]/route';
import { POST as ADICIONAR } from '@/app/api/bau/[tipo]/adicionar/route';
import { POST as REMOVER } from '@/app/api/bau/[tipo]/remover/route';
import { POST as PREVIA } from '@/app/api/bau/[tipo]/ajuste/previa/route';
import { POST as CONFIRMAR } from '@/app/api/bau/[tipo]/ajuste/confirmar/route';
import { POST as ZERAR } from '@/app/api/bau/zerar/route';
import { GET as SALDO } from '@/app/api/caixa/route';
import { POST as MOVIMENTAR } from '@/app/api/caixa/movimentar/route';
import { GET as HISTORICO } from '@/app/api/caixa/historico/route';
import { GET as LOGS_BAU } from '@/app/api/logs/bau/[tipo]/route';
import { GET as LOGS_CAIXA } from '@/app/api/logs/caixa/route';
import { GET as AUDITORIA } from '@/app/api/auditoria/route';
import { GET as AUDITORIA_ID } from '@/app/api/auditoria/[id]/route';
import { POST as CATALOGO_ADICIONAR } from '@/app/api/catalogo/itens/route';
import { DELETE as CATALOGO_REMOVER } from '@/app/api/catalogo/itens/[categoriaId]/[itemId]/route';
import { GET as LOGIN } from '@/app/api/auth/login/route';
import { REVALIDACAO_MS, SESSAO_DURACAO_MS } from '@/compartilhado/limites';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto, setAgendador } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { lerSessao, nomeCookieSessao } from '@/server/auth/sessao';
import { resetLimitadores, setLimitador } from '@/server/seguranca/limite';
import { tokenCsrf } from '@/server/seguranca/csrf';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { auditorias, logsDe, seedBase } from '../helpers/estado';
import { APP } from '../helpers/pedidos';
import { tokenSessaoTeste } from '../helpers/sessao-teste';

type Rota = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;
interface Resp {
  status: number;
  texto: string;
  corpo: { ok?: boolean; dados?: unknown; codigo?: string };
}

let fake: FakeFirestore;

function abrir(o: Parameters<typeof seedBase>[0] = { membros: { armas: { colt: 10 } }, gerencia: { armas: { usp: 2 } }, saldo: { sujo: 100, limpo: 0 } }) {
  fake = criarFakeFirestore({ seed: seedBase(o) });
  setDb(comoDb(fake));
}

beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  setAgendador(() => undefined);
  const livre = { consumir: () => ({ ok: true as const }) };
  setLimitador('usuario', livre);
  setLimitador('ip', livre);
  abrir();
});
afterEach(() => {
  vi.useRealTimers();
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

interface Sessao {
  token: string;
  csrf: string;
}
async function sessao(nivel: 1 | 2 | 3, o: { ini?: number; userId?: string } = {}): Promise<Sessao> {
  const token = await tokenSessaoTeste({ nivel, ini: o.ini, userId: o.userId });
  const s = await lerSessao(token);
  return { token, csrf: tokenCsrf(s!.sid) };
}

/** Requisição crua: corpo é texto exato (para chaves duplicadas, 1e3 literal, corpo vazio...). */
async function cru(
  rota: unknown,
  o: {
    metodo?: string;
    s?: Sessao | null;
    corpo?: string;
    params?: Record<string, string>;
    headers?: Record<string, string>;
    cookie?: string;
    url?: string;
  },
): Promise<Resp> {
  const metodo = o.metodo ?? 'POST';
  const headers = new Headers(o.headers);
  if (o.cookie !== undefined) headers.set('cookie', o.cookie);
  else if (o.s) headers.set('cookie', `${nomeCookieSessao()}=${o.s.token}`);
  if (metodo !== 'GET' && metodo !== 'HEAD') {
    if (!headers.has('origin')) headers.set('origin', APP);
    if (o.s && !headers.has('x-csrf-token')) headers.set('x-csrf-token', o.s.csrf);
    if (o.corpo !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  }
  const req = new Request(o.url ?? `${APP}/api/qa3`, {
    method: metodo,
    headers,
    ...(o.corpo !== undefined && metodo !== 'GET' && metodo !== 'HEAD' ? { body: o.corpo } : {}),
  });
  const res = await (rota as Rota)(req, { params: Promise.resolve(o.params ?? {}) });
  const texto = await res.text();
  let corpo: Resp['corpo'] = {};
  try {
    corpo = texto ? (JSON.parse(texto) as Resp['corpo']) : {};
  } catch {
    corpo = {};
  }
  return { status: res.status, texto, corpo };
}

const itensBau = (t: string) => (fake.dump()[`baus/${t}`] as { itens: Record<string, Record<string, number>>; versao: number });
const saldo = () => fake.dump()['caixa/saldo'] as { sujo: number; limpo: number };

describe('ordem de chaves JSON não muda o resultado', () => {
  it('adicionar com chaves em qualquer ordem → 200 e mesma quantidade', async () => {
    const s = await sessao(1);
    const ordens = [
      '{"categoriaId":"armas","itemId":"colt","quantidade":1}',
      '{"quantidade":1,"itemId":"colt","categoriaId":"armas"}',
      '{"itemId":"colt","quantidade":1,"categoriaId":"armas"}',
    ];
    for (const corpo of ordens) expect((await cru(ADICIONAR, { s, corpo, params: { tipo: 'membros' } })).status).toBe(200);
    expect(itensBau('membros').itens.armas!.colt).toBe(13);
  });

  it('confirmar ajuste com versao depois das linhas e linhas com chaves trocadas → 200', async () => {
    const s = await sessao(2);
    const corpo = '{"linhas":[{"quantidade":7,"itemId":"colt","categoriaId":"armas"}],"versao":0}';
    const r = await cru(CONFIRMAR, { s, corpo, params: { tipo: 'membros' } });
    expect(r.status, r.texto).toBe(200);
    expect(itensBau('membros').itens.armas!.colt).toBe(7);
  });

  it('movimentar caixa com chaves trocadas → 200', async () => {
    const s = await sessao(2);
    const r = await cru(MOVIMENTAR, { s, corpo: '{"anotacao":"ok","valor":5,"acao":"entrada","tipo":"limpo"}' });
    expect(r.status, r.texto).toBe(200);
    expect(saldo().limpo).toBe(5);
  });
});

describe('números como texto/decimal/exponencial em todas as rotas que recebem número', () => {
  /** Literais JSON crus. "aceito" = vira inteiro válido; o resto precisa dar 400 sem gravar. */
  const RUINS = [
    '"1e3"', '"1E3"', '1.5', '"1.5"', '"1,5"', '"0x10"', '"+5"', '"-5"', '-5', '-0', '0', '"0"', '1e21', '"1e21"',
    '9007199254740993', '1e308', '"Infinity"', '"NaN"', 'null', 'true', '[5]', '{"v":5}', '"\uFF15"', '"٥"', '"5 5"',
    '"0b101"', '"0o7"', '"5n"', '"1_000"', '"999999999999999999999"',
  ];
  /** Acima do máximo de cada rota: quantidade 100 000, valor do caixa 1 000 000 000. */
  const ACIMA: Readonly<Record<string, string[]>> = {
    adicionar: ['100001', '"100001"'],
    remover: ['100001', '"100001"'],
    movimentar: ['1000000001', '"1000000001"'],
  };
  const BONS: ReadonlyArray<[string, number]> = [['5', 5], ['"5"', 5], ['"5\\u00a0"', 5], ['" 5 "', 5], ['"00005"', 5], ['5.0', 5], ['5e0', 5], ['1e3', 1000]];

  const ROTAS_QTD: ReadonlyArray<[string, unknown, 1 | 2, (v: string) => string, Record<string, string>]> = [
    ['adicionar', ADICIONAR, 1, (v) => `{"categoriaId":"armas","itemId":"colt","quantidade":${v}}`, { tipo: 'membros' }],
    ['remover', REMOVER, 1, (v) => `{"categoriaId":"armas","itemId":"colt","quantidade":${v}}`, { tipo: 'membros' }],
    ['movimentar', MOVIMENTAR, 2, (v) => `{"tipo":"sujo","acao":"entrada","valor":${v},"anotacao":"x"}`, {}],
  ];

  for (const [nome, rota, nivel, corpo, params] of ROTAS_QTD) {
    it.each([...RUINS, ...ACIMA[nome]!])(`${nome}: %s → 400, nada gravado`, async (v) => {
      const s = await sessao(nivel);
      const antes = fake.dump();
      const r = await cru(rota, { s, corpo: corpo(v), params });
      expect(r.status, `${v}: ${r.texto}`).toBe(400);
      expect(fake.dump()).toEqual(antes);
    });
  }

  it.each(BONS)('adicionar: %s → +%i', async (v, n) => {
    const s = await sessao(1);
    const r = await cru(ADICIONAR, { s, corpo: `{"categoriaId":"armas","itemId":"colt","quantidade":${v}}`, params: { tipo: 'membros' } });
    expect(r.status, r.texto).toBe(200);
    expect(itensBau('membros').itens.armas!.colt).toBe(10 + n);
  });

  it.each(RUINS)('prévia/confirmar: quantidade %s → 400 com a linha listada, nada gravado', async (v) => {
    const s = await sessao(2);
    const antes = fake.dump();
    const linhas = `[{"categoriaId":"armas","itemId":"colt","quantidade":${v}}]`;
    const p = await cru(PREVIA, { s, corpo: `{"linhas":${linhas}}`, params: { tipo: 'membros' } });
    // quantidade 0 no ajuste é válida (zera o item); o resto é inválido
    if (v === '0' || v === '"0"' || v === '-0') {
      expect(p.status, p.texto).toBe(200);
      return expect(fake.dump()).toEqual(antes);
    }
    expect(p.status, `${v}: ${p.texto}`).toBe(400);
    const c = await cru(CONFIRMAR, { s, corpo: `{"versao":0,"linhas":${linhas}}`, params: { tipo: 'membros' } });
    expect(c.status, `${v}: ${c.texto}`).toBe(400);
    expect(fake.dump()).toEqual(antes);
  });

  it.each(['"0"', '0.5', '-1', '1e400', 'null', '[0]', '9007199254740993'])('confirmar: versao %s → 400 ou 409, nada gravado', async (v) => {
    const s = await sessao(2);
    const antes = fake.dump();
    const r = await cru(CONFIRMAR, { s, corpo: `{"versao":${v},"linhas":[{"categoriaId":"armas","itemId":"colt","quantidade":1}]}`, params: { tipo: 'membros' } });
    expect([400, 409], `${v}: ${r.texto}`).toContain(r.status);
    expect(fake.dump()).toEqual(antes);
  });

  it.each(['1e2', '1.5', '-1', '0', '101', '"10"', '%2B5', '0x10', '1%00', '\uFF15'])('paginação limite=%s nos 5 GETs paginados → 400', async (v) => {
    const s = await sessao(2);
    for (const [rota, params] of [
      [LOGS_BAU, { tipo: 'membros' }],
      [LOGS_CAIXA, {}],
      [HISTORICO, {}],
      [AUDITORIA, {}],
    ] as const) {
      const r = await cru(rota, { metodo: 'GET', s, params, url: `${APP}/api/x?limite=${v}` });
      expect(r.status, `${v}: ${r.texto}`).toBe(400);
    }
  });
});

describe('corpo vazio, gigante, duplicado, malformado', () => {
  const ROTAS: ReadonlyArray<[string, unknown, 1 | 2 | 3, Record<string, string>]> = [
    ['adicionar', ADICIONAR, 1, { tipo: 'membros' }],
    ['remover', REMOVER, 1, { tipo: 'membros' }],
    ['prévia', PREVIA, 2, { tipo: 'membros' }],
    ['confirmar', CONFIRMAR, 2, { tipo: 'membros' }],
    ['zerar', ZERAR, 3, {}],
    ['movimentar', MOVIMENTAR, 2, {}],
    ['catálogo', CATALOGO_ADICIONAR, 2, {}],
  ];
  const CORPOS: ReadonlyArray<[string, string]> = [
    ['vazio', ''], ['espaços', '   \n\t'], ['null', 'null'], ['lista', '[]'], ['texto', '"oi"'], ['número', '5'],
    ['quebrado', '{"a":'], ['vírgula sobrando', '{"alvo":"ambos",}'], ['aspas simples', "{'alvo':'ambos'}"],
    ['NaN literal', '{"quantidade":NaN}'], ['comentário', '/*x*/{}'], ['aninhado 4000', '['.repeat(4000) + ']'.repeat(4000)],
    ['__proto__', '{"__proto__":{"nivel":3}}'], ['UTF-8 inválido', '\uD800'],
  ];
  for (const [nome, rota, nivel, params] of ROTAS) {
    it.each(CORPOS)(`${nome}: corpo %s → 400, nada gravado`, async (_r, corpo) => {
      const s = await sessao(nivel);
      const antes = fake.dump();
      const r = await cru(rota, { s, corpo, params });
      expect(r.status, r.texto).toBe(400);
      expect(r.corpo.codigo).toBe('VALIDACAO');
      expect(fake.dump()).toEqual(antes);
      expect(({} as Record<string, unknown>).nivel).toBeUndefined();
    });

    it(`${nome}: corpo de 10 241 bytes (ajuste: 102 401) → 413, nada gravado`, async () => {
      const s = await sessao(nivel);
      const antes = fake.dump();
      const limite = rota === CONFIRMAR || rota === PREVIA ? 102_400 : 10_240;
      const corpo = `{"x":"${'a'.repeat(limite + 1 - 8)}"}`;
      expect(new TextEncoder().encode(corpo).byteLength).toBe(limite + 1);
      const r = await cru(rota, { s, corpo, params });
      expect(r.status, r.texto.slice(0, 200)).toBe(413);
      expect(fake.dump()).toEqual(antes);
    });

    it(`${nome}: Content-Length mentiroso (diz 10, manda 200 KB) → 413`, async () => {
      const s = await sessao(nivel);
      const corpo = `{"x":"${'a'.repeat(200_000)}"}`;
      const req = new Request(`${APP}/api/qa3`, {
        method: 'POST',
        headers: { cookie: `${nomeCookieSessao()}=${s.token}`, origin: APP, 'x-csrf-token': s.csrf, 'content-type': 'application/json', 'content-length': '10' },
        body: corpo,
      });
      const res = await (rota as Rota)(req, { params: Promise.resolve(params) });
      expect(res.status).toBe(413);
    });
  }

  it('chave duplicada: a última vale e é validada ("quantidade":1 e depois -5 → 400)', async () => {
    const s = await sessao(1);
    const antes = fake.dump();
    const r = await cru(ADICIONAR, { s, corpo: '{"categoriaId":"armas","itemId":"colt","quantidade":1,"quantidade":-5}', params: { tipo: 'membros' } });
    expect(r.status).toBe(400);
    expect(fake.dump()).toEqual(antes);
  });

  it('chave duplicada: itemId "colt" e depois "constructor" → 400', async () => {
    const s = await sessao(1);
    const r = await cru(ADICIONAR, { s, corpo: '{"categoriaId":"armas","itemId":"colt","itemId":"constructor","quantidade":1}', params: { tipo: 'membros' } });
    expect(r.status).toBe(400);
  });

  it('chave duplicada: confirmacao "ZERAR" e depois "zerar" → 400, nada zerado', async () => {
    const s = await sessao(3);
    const antes = fake.dump();
    const r = await cru(ZERAR, { s, corpo: '{"alvo":"ambos","confirmacao":"ZERAR","confirmacao":"zerar"}' });
    expect(r.status).toBe(400);
    expect(fake.dump()).toEqual(antes);
  });

  it('chave duplicada: versao certa e depois errada no confirmar → 409, nada gravado', async () => {
    const s = await sessao(2);
    const antes = fake.dump();
    const r = await cru(CONFIRMAR, { s, corpo: '{"versao":0,"versao":99,"linhas":[{"categoriaId":"armas","itemId":"colt","quantidade":1}]}', params: { tipo: 'membros' } });
    expect(r.status).toBe(409);
    expect(fake.dump()).toEqual(antes);
  });

  it('BOM no início do JSON é tolerado (é removido pelo decodificador) e o resto é validado', async () => {
    const s = await sessao(1);
    const r = await cru(ADICIONAR, { s, corpo: '\uFEFF{"categoriaId":"armas","itemId":"colt","quantidade":1}', params: { tipo: 'membros' } });
    expect([200, 400]).toContain(r.status);
  });
});

describe('métodos HTTP trocados', () => {
  it.each(['GET', 'HEAD'])('%s numa rota de mutação (com sessão, sem CSRF) não grava nada', async (metodo) => {
    for (const [rota, nivel, params] of [
      [ADICIONAR, 1, { tipo: 'membros' }],
      [REMOVER, 1, { tipo: 'membros' }],
      [CONFIRMAR, 2, { tipo: 'membros' }],
      [ZERAR, 3, {}],
      [MOVIMENTAR, 2, {}],
      [CATALOGO_ADICIONAR, 2, {}],
    ] as const) {
      const s = await sessao(nivel as 1 | 2 | 3);
      const antes = fake.dump();
      const r = await cru(rota, { metodo, s, params, url: `${APP}/api/x?alvo=ambos&confirmacao=ZERAR&quantidade=5` });
      expect(r.status, `${metodo}: ${r.texto}`).toBeGreaterThanOrEqual(400);
      expect(fake.dump()).toEqual(antes);
    }
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('%s sem CSRF numa rota de mutação → 403, nada gravado', async (metodo) => {
    const s = await sessao(3);
    const antes = fake.dump();
    const r = await cru(ZERAR, { metodo, s, corpo: '{"alvo":"ambos","confirmacao":"ZERAR"}', headers: { 'x-csrf-token': 'x' } });
    expect(r.status).toBe(403);
    expect(fake.dump()).toEqual(antes);
  });

  it('rota de DELETE do catálogo só exporta DELETE: o Next responde 405 a GET/HEAD/POST (o wrapper não confere o método; ver QA-W17)', async () => {
    const mod = await import('@/app/api/catalogo/itens/[categoriaId]/[itemId]/route');
    const metodos = Object.keys(mod).filter((k) => /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(k));
    expect(metodos).toEqual(['DELETE']);
    const zerar = await import('@/app/api/bau/zerar/route');
    expect(Object.keys(zerar).filter((k) => /^(GET|HEAD|PUT|PATCH|DELETE|OPTIONS)$/.test(k))).toEqual([]);
  });

  it('POST numa rota pública (login) → 405', async () => {
    const r = await cru(LOGIN, { metodo: 'POST', corpo: '{}' });
    expect(r.status).toBe(405);
  });
});

describe('caminhos com .. e %2e, ids gigantes', () => {
  const TIPOS = ['..', '.', '%2e%2e', '%2E%2E', 'membros/..', '../gerencia', 'gerencia%00', 'Gerencia', 'GERENCIA', 'membros ', ' membros', 'membros\u200B', 'gerencia/../membros', 'a'.repeat(5000), '__proto__', 'constructor', ''];
  it.each(TIPOS)('tipo "%s" em GET/adicionar/logs → 400 (nunca 200 nem 403 que vaze a gerência)', async (tipo) => {
    const s = await sessao(1);
    const antes = fake.dump();
    expect((await cru(BAU, { metodo: 'GET', s, params: { tipo } })).status).toBe(400);
    expect((await cru(LOGS_BAU, { metodo: 'GET', s, params: { tipo } })).status).toBe(400);
    expect((await cru(ADICIONAR, { s, corpo: '{"categoriaId":"armas","itemId":"usp","quantidade":1}', params: { tipo } })).status).toBe(400);
    expect(fake.dump()).toEqual(antes);
  });

  const IDS = ['..', '%2e%2e', '../colt', 'colt/..', 'col%74', 'a'.repeat(51), 'a'.repeat(100_000), 'COLT', 'colt ', '_colt', 'colt_', 'co__lt', '1'.repeat(51)];
  it.each(IDS.map((v) => [v.length > 60 ? `${v.slice(0, 8)}…(${v.length})` : v, v]))('DELETE do catálogo com itemId %s → 400, nada removido', async (_r, itemId) => {
    const s = await sessao(3);
    const antes = fake.dump();
    for (const params of [{ categoriaId: 'armas', itemId }, { categoriaId: itemId, itemId: 'colt' }]) {
      const r = await cru(CATALOGO_REMOVER, { metodo: 'DELETE', s, params });
      expect(r.status, r.texto).toBe(400);
    }
    expect(fake.dump()).toEqual(antes);
  });

  it.each(['..', '%2e%2e', '../../baus/membros', 'baus/membros', 'a'.repeat(41), 'a'.repeat(100_000), 'abc def', 'abc%2Fdef', ''])('auditoria/[id] "%s" → 400 ou 404, sem ler fora da coleção', async (id) => {
    const s = await sessao(2);
    const r = await cru(AUDITORIA_ID, { metodo: 'GET', s, params: { id: id.length > 60 ? id : id } });
    expect([400, 404], r.texto.slice(0, 200)).toContain(r.status);
    expect(r.texto).not.toContain('colt');
  });

  it.each(['..', '../x', 'a'.repeat(41), 'a'.repeat(10_000), '%2e%2e'])('cursor "%s" nas listas → 400', async (cursor) => {
    const s = await sessao(2);
    const r = await cru(LOGS_CAIXA, { metodo: 'GET', s, url: `${APP}/api/x?cursor=${encodeURIComponent(cursor)}` });
    expect(r.status).toBe(400);
  });

  it('itemId e categoriaId de 100 KB no corpo do adicionar → 413 (não processa)', async () => {
    const s = await sessao(1);
    const r = await cru(ADICIONAR, { s, corpo: JSON.stringify({ categoriaId: 'armas', itemId: 'a'.repeat(100_000), quantidade: 1 }), params: { tipo: 'membros' } });
    expect(r.status).toBe(413);
  });

  it('itemId de 51 caracteres (formato válido) → 400; de 50 inexistente → 404', async () => {
    const s = await sessao(1);
    expect((await cru(ADICIONAR, { s, corpo: JSON.stringify({ categoriaId: 'armas', itemId: 'a'.repeat(51), quantidade: 1 }), params: { tipo: 'membros' } })).status).toBe(400);
    expect((await cru(ADICIONAR, { s, corpo: JSON.stringify({ categoriaId: 'armas', itemId: 'a'.repeat(50), quantidade: 1 }), params: { tipo: 'membros' } })).status).toBe(404);
  });
});

describe('Host e Origin forjados', () => {
  const ORIGENS = [
    'https://stocky-teste.vercel.app.evil.com', 'https://evil.com', 'https://stocky-teste.vercel.app:443', 'https://stocky-teste.vercel.app/',
    'HTTPS://STOCKY-TESTE.VERCEL.APP', 'http://stocky-teste.vercel.app', 'null', '', 'https://stocky-teste.vercel.app, https://evil.com',
    'https://evil.com https://stocky-teste.vercel.app',
  ];
  it.each(ORIGENS)('Origin "%s" com token certo → 403, nada gravado', async (origin) => {
    const s = await sessao(3);
    const antes = fake.dump();
    const r = await cru(ZERAR, { s, corpo: '{"alvo":"ambos","confirmacao":"ZERAR"}', headers: { origin } });
    expect(r.status).toBe(403);
    expect(fake.dump()).toEqual(antes);
  });

  it('Host/X-Forwarded-Host forjados não mudam nada: Origin certa passa, Origin = host forjado é recusada', async () => {
    const s = await sessao(1);
    const forjado = { host: 'evil.com', 'x-forwarded-host': 'evil.com', 'x-forwarded-proto': 'http' };
    const ok = await cru(ADICIONAR, { s, corpo: '{"categoriaId":"armas","itemId":"colt","quantidade":1}', params: { tipo: 'membros' }, headers: forjado, url: 'https://evil.com/api/bau/membros/adicionar' });
    expect(ok.status, ok.texto).toBe(200);
    const ruim = await cru(ADICIONAR, { s, corpo: '{"categoriaId":"armas","itemId":"colt","quantidade":1}', params: { tipo: 'membros' }, headers: { ...forjado, origin: 'https://evil.com' }, url: 'https://evil.com/api/bau/membros/adicionar' });
    expect(ruim.status).toBe(403);
  });

  it('login com Host/X-Forwarded-Host forjados: redirect_uri continua sendo a APP_URL', async () => {
    const req = new Request('https://evil.com/api/auth/login?volta=/caixa', { headers: { host: 'evil.com', 'x-forwarded-host': 'evil.com' } });
    const res = await LOGIN(req);
    expect(res.status).toBe(307);
    const destino = new URL(res.headers.get('location')!);
    expect(destino.origin).toBe('https://discord.com');
    expect(destino.searchParams.get('redirect_uri')).toBe(`${APP}/api/auth/callback`);
    expect(res.headers.get('location')).not.toContain('evil.com');
  });
});

describe('cookies duplicados', () => {
  it('nível 1 primeiro e nível 3 depois: vale o primeiro (zerar → 403 mesmo com o CSRF do nível 3)', async () => {
    const n1 = await sessao(1);
    const n3 = await sessao(3);
    const nome = nomeCookieSessao();
    const antes = fake.dump();
    for (const csrf of [n1.csrf, n3.csrf]) {
      const r = await cru(ZERAR, { cookie: `${nome}=${n1.token}; ${nome}=${n3.token}`, corpo: '{"alvo":"ambos","confirmacao":"ZERAR"}', headers: { 'x-csrf-token': csrf } });
      expect(r.status).toBe(403);
    }
    expect(fake.dump()).toEqual(antes);
  });

  it('nível 3 primeiro com o CSRF do segundo cookie → 403 (token amarrado à sessão usada)', async () => {
    const n1 = await sessao(1);
    const n3 = await sessao(3);
    const nome = nomeCookieSessao();
    const r = await cru(ZERAR, { cookie: `${nome}=${n3.token}; ${nome}=${n1.token}`, corpo: '{"alvo":"ambos","confirmacao":"ZERAR"}', headers: { 'x-csrf-token': n1.csrf } });
    expect(r.status).toBe(403);
  });

  it('adulterado primeiro e válido depois → 401 (não cai no segundo)', async () => {
    const v = await sessao(1);
    const nome = nomeCookieSessao();
    const r = await cru(BAU, { metodo: 'GET', cookie: `${nome}=lixo.lixo.lixo; ${nome}=${v.token}`, params: { tipo: 'membros' } });
    expect(r.status).toBe(401);
  });

  it.each([
    ['nome com maiúscula', (n: string, t: string) => `${n.toUpperCase()}=${t}`],
    ['entre aspas', (n: string, t: string) => `${n}="${t}"`],
    ['prefixo', (n: string, t: string) => `x${n}=${t}`],
    ['sem valor', (n: string) => `${n}=`],
    ['só o nome', (n: string) => `${n}`],
  ])('cookie %s → 401', async (_r, montar) => {
    const v = await sessao(1);
    const r = await cru(BAU, { metodo: 'GET', cookie: montar(nomeCookieSessao(), v.token), params: { tipo: 'membros' } });
    expect(r.status).toBe(401);
  });
});

describe('sessão e revalidação no limite exato', () => {
  it('sessão expira no segundo exato do exp: 1 s antes vale, no exp → 401, nada gravado', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.UTC(2026, 10, 6, 12, 0, 0);
    vi.setSystemTime(t0);
    // ini tal que exp = t0 + 2 s
    const s = await sessao(1, { ini: t0 - SESSAO_DURACAO_MS + 2000 });
    const exp = (await lerSessao(s.token))!.exp;
    expect(exp).toBe(t0 + 2000);
    vi.setSystemTime(exp - 1000);
    expect((await cru(ADICIONAR, { s, corpo: '{"categoriaId":"armas","itemId":"colt","quantidade":1}', params: { tipo: 'membros' } })).status).toBe(200);
    const antes = fake.dump();
    vi.setSystemTime(exp);
    const r = await cru(ADICIONAR, { s, corpo: '{"categoriaId":"armas","itemId":"colt","quantidade":1}', params: { tipo: 'membros' } });
    expect(r.status).toBe(401);
    expect(r.corpo.codigo).toBe('SEM_SESSAO');
    expect(fake.dump()).toEqual(antes);
  });

  it('criar token com ini já vencido → recusado', async () => {
    await expect(tokenSessaoTeste({ nivel: 1, ini: Date.now() - SESSAO_DURACAO_MS })).rejects.toThrow();
  });

  it('revalidação de cargos: exatamente 15 min após cv ainda vale; 1 ms depois → 401 REVALIDAR antes de qualquer escrita', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.UTC(2026, 10, 6, 12, 0, 0);
    vi.setSystemTime(t0);
    const s = await sessao(3);
    vi.setSystemTime(t0 + REVALIDACAO_MS);
    const ok = await cru(MOVIMENTAR, { s, corpo: '{"tipo":"sujo","acao":"saida","valor":1,"anotacao":"x"}' });
    expect(ok.status, ok.texto).toBe(200);
    const antes = fake.dump();
    vi.setSystemTime(t0 + REVALIDACAO_MS + 1);
    for (const [rota, corpo, params] of [
      [MOVIMENTAR, '{"tipo":"sujo","acao":"saida","valor":1,"anotacao":"x"}', {}],
      [ZERAR, '{"alvo":"ambos","confirmacao":"ZERAR"}', {}],
      [ADICIONAR, '{"categoriaId":"armas","itemId":"colt","quantidade":1}', { tipo: 'membros' }],
    ] as const) {
      const r = await cru(rota, { s, corpo, params });
      expect(r.status).toBe(401);
      expect(r.corpo.codigo).toBe('REVALIDAR');
    }
    expect((await cru(SALDO, { metodo: 'GET', s })).corpo.codigo).toBe('REVALIDAR');
    expect(fake.dump()).toEqual(antes);
  });

  it('revalidação vencendo DURANTE a transação: a operação que começou válida termina inteira (uma vez só); a próxima é 401', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.UTC(2026, 10, 6, 12, 0, 0);
    vi.setSystemTime(t0);
    const s = await sessao(2);
    vi.setSystemTime(t0 + REVALIDACAO_MS);
    // o relógio passa do limite DENTRO da transação (depois da checagem da sessão)
    const real = comoDb(fake) as unknown as { runTransaction: (f: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
    const original = real.runTransaction.bind(real);
    let dentro = 0;
    setDb(
      new Proxy(real, {
        get(alvo, chave, rec) {
          if (chave === 'runTransaction') {
            return (f: (tx: unknown) => Promise<unknown>) =>
              original(async (tx) => {
                dentro += 1;
                vi.setSystemTime(t0 + REVALIDACAO_MS + 5);
                return await f(tx);
              });
          }
          return Reflect.get(alvo, chave, rec) as unknown;
        },
      }) as unknown as Parameters<typeof setDb>[0],
    );
    const r = await cru(MOVIMENTAR, { s, corpo: '{"tipo":"sujo","acao":"saida","valor":7,"anotacao":"x"}' });
    expect(dentro).toBeGreaterThanOrEqual(1);
    expect(r.status, r.texto).toBe(200);
    expect(saldo().sujo).toBe(93);
    expect(logsDe(fake.dump(), 'caixa')).toHaveLength(1);
    const depois = await cru(MOVIMENTAR, { s, corpo: '{"tipo":"sujo","acao":"saida","valor":7,"anotacao":"x"}' });
    expect(depois.status).toBe(401);
    expect(saldo().sujo).toBe(93);
  });
});

describe('concorrência nova', () => {
  it('zerar × ajuste simultâneos (10 rodadas): nunca sobra ajuste depois do zerar sem versão nova; auditoria = operações 200', async () => {
    for (let rodada = 0; rodada < 10; rodada += 1) {
      abrir({ membros: { armas: { colt: 10 } }, gerencia: { armas: { usp: 2 } }, versao: 3 });
      const dono = await sessao(3);
      const gerente = await sessao(2);
      const ops = [
        () => cru(ZERAR, { s: dono, corpo: '{"alvo":"membros","confirmacao":"ZERAR"}' }),
        () => cru(CONFIRMAR, { s: gerente, corpo: '{"versao":3,"linhas":[{"categoriaId":"armas","itemId":"colt","quantidade":50}]}', params: { tipo: 'membros' } }),
      ];
      const [z, a] = await Promise.all(rodada % 2 === 0 ? ops.map((f) => f()) : ops.reverse().map((f) => f()).reverse());
      expect(z!.status, z!.texto).toBe(200);
      expect([200, 409]).toContain(a!.status);
      const bau = itensBau('membros');
      if (a!.status === 409) {
        expect(bau.itens).toEqual({});
        expect(bau.versao).toBe(4);
      } else {
        // o ajuste só pode ter rodado ANTES do zerar (versão 3 → 4), e o zerar depois (4 → 5)
        expect(bau.itens).toEqual({});
        expect(bau.versao).toBe(5);
      }
      const auds = auditorias(fake.dump());
      expect(auds).toHaveLength(a!.status === 200 ? 2 : 1);
      expect(itensBau('gerencia').itens).toEqual({ armas: { usp: 2 } });
    }
  });

  it('50 saídas paralelas de 3 com saldo 100: exatamente 33 passam, saldo final 1, 33 logs com saldos únicos', async () => {
    const s = await sessao(2);
    const rs = await Promise.all(
      Array.from({ length: 50 }, () => cru(MOVIMENTAR, { s, corpo: '{"tipo":"sujo","acao":"saida","valor":3,"anotacao":"saque"}' })),
    );
    const ok = rs.filter((r) => r.status === 200);
    const recusadas = rs.filter((r) => r.status !== 200);
    expect(ok).toHaveLength(33);
    expect(recusadas.every((r) => r.status === 409 && r.corpo.codigo === 'SALDO_INSUFICIENTE')).toBe(true);
    expect(saldo()).toMatchObject({ sujo: 1, limpo: 0 });
    const logs = logsDe(fake.dump(), 'caixa') as Array<{ saldoResultante: number; valor: number }>;
    expect(logs).toHaveLength(33);
    const saldos = logs.map((l) => l.saldoResultante).sort((x, y) => y - x);
    expect(saldos).toEqual(Array.from({ length: 33 }, (_v, i) => 97 - 3 * i));
  });

  it('50 operações mistas paralelas (25 entradas de 2, 25 saídas de 5, dois tipos): saldo = soma dos 200, nunca negativo', async () => {
    abrir({ saldo: { sujo: 50, limpo: 50 } });
    const s = await sessao(2);
    const ops = Array.from({ length: 50 }, (_v, i) => {
      const tipo = i % 4 < 2 ? 'sujo' : 'limpo';
      const entrada = i % 2 === 0;
      return { tipo, entrada, valor: entrada ? 2 : 5 };
    });
    const rs = await Promise.all(
      ops.map((o) => cru(MOVIMENTAR, { s, corpo: JSON.stringify({ tipo: o.tipo, acao: o.entrada ? 'entrada' : 'saida', valor: o.valor, anotacao: 'mix' }) })),
    );
    const esperado = { sujo: 50, limpo: 50 };
    rs.forEach((r, i) => {
      expect([200, 409]).toContain(r.status);
      if (r.status === 200) esperado[ops[i]!.tipo as 'sujo' | 'limpo'] += ops[i]!.entrada ? ops[i]!.valor : -ops[i]!.valor;
    });
    expect(saldo()).toMatchObject(esperado);
    expect(saldo().sujo).toBeGreaterThanOrEqual(0);
    expect(saldo().limpo).toBeGreaterThanOrEqual(0);
    expect(logsDe(fake.dump(), 'caixa')).toHaveLength(rs.filter((r) => r.status === 200).length);
  });

  it('50 adicionar + 50 remover paralelos no mesmo item: estoque = soma dos 200, nunca negativo, um log por 200', async () => {
    const s = await sessao(1);
    const rs = await Promise.all(
      Array.from({ length: 100 }, (_v, i) =>
        cru(i % 2 ? REMOVER : ADICIONAR, { s, corpo: '{"categoriaId":"armas","itemId":"colt","quantidade":1}', params: { tipo: 'membros' } }),
      ),
    );
    let esperado = 10;
    rs.forEach((r, i) => {
      expect([200, 409]).toContain(r.status);
      if (r.status === 200) esperado += i % 2 ? -1 : 1;
    });
    expect(itensBau('membros').itens.armas?.colt ?? 0).toBe(esperado);
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(rs.filter((r) => r.status === 200).length);
  });
});
