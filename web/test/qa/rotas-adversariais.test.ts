/**
 * WEB-026 (parte do QA) e revisão adversarial: sessão forjada, CSRF, open redirect, corpo hostil,
 * unicode, entradas enormes, __proto__, concorrência e vazamento de segredo em log/resposta.
 * Território: qa-engineer. Chama os handlers reais com o Firestore falso.
 */
import { createHmac } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as LOGIN } from '@/app/api/auth/login/route';
import { GET as CALLBACK } from '@/app/api/auth/callback/route';
import { GET as BAU } from '@/app/api/bau/[tipo]/route';
import { POST as ADICIONAR } from '@/app/api/bau/[tipo]/adicionar/route';
import { POST as REMOVER } from '@/app/api/bau/[tipo]/remover/route';
import { POST as PREVIA } from '@/app/api/bau/[tipo]/ajuste/previa/route';
import { POST as CONFIRMAR } from '@/app/api/bau/[tipo]/ajuste/confirmar/route';
import { POST as ZERAR } from '@/app/api/bau/zerar/route';
import { POST as MOVIMENTAR } from '@/app/api/caixa/movimentar/route';
import { GET as HISTORICO } from '@/app/api/caixa/historico/route';
import { POST as CATALOGO_ADICIONAR } from '@/app/api/catalogo/itens/route';
import { DELETE as CATALOGO_REMOVER } from '@/app/api/catalogo/itens/[categoriaId]/[itemId]/route';
import { GET as AUDITORIA_ID } from '@/app/api/auditoria/[id]/route';
import { LIMITES } from '@/compartilhado/limites';
import { nomeCookieSessao } from '@/server/auth/sessao';
import { garantirCatalogo, resetSemente } from '@/server/catalogo/semente';
import { resetContexto, setAgendador, setFetch } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores, setLimitador } from '@/server/seguranca/limite';
import { tokenCsrf } from '@/server/seguranca/csrf';
import { aplicarEnvTeste, ENV_TESTE, limparEnvTeste } from '../helpers/env-teste';
import { criarDiscordFake } from '../helpers/discord-fake';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { seedBase } from '../helpers/estado';
import { criarRequisicao, valorDoCookie } from '../helpers/requisicao';
import { cookieSessaoTeste } from '../helpers/sessao-teste';
import { lerSessao } from '@/server/auth/sessao';

const APP = ENV_TESTE.APP_URL!;
const SEGREDO = ENV_TESTE.SESSION_SECRET!;
/** Corpo JSON lido da resposta: o mesmo tipo que JSON.parse devolve. */
type JsonLivre = ReturnType<typeof JSON.parse>;
type Rota = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;

let fake: FakeFirestore;
let saidas: string[];
let tarefas: Array<() => Promise<void>>;

function abrir(seed = seedBase({ membros: { armas: { desert: 10 } }, gerencia: { armas: { usp: 5 } }, saldo: { sujo: 100, limpo: 100 } })) {
  fake = criarFakeFirestore({ seed });
  setDb(comoDb(fake));
}

beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  saidas = [];
  tarefas = [];
  setAgendador((t) => void tarefas.push(t));
  const livre = { consumir: () => ({ ok: true as const }) };
  setLimitador('usuario', livre);
  setLimitador('ip', livre);
  for (const m of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void saidas.push(a.map(String).join(' ')));
  }
  abrir();
});
afterEach(() => {
  vi.restoreAllMocks();
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

const escritas = () => fake.chamadas.filter((c) => !['get', 'query'].includes(String(c.op)));

async function sessao(nivel: 1 | 2 | 3, userId = '444444444444444441') {
  const cookies = await cookieSessaoTeste({ nivel, userId });
  const token = Object.values(cookies)[0]!;
  const s = (await lerSessao(token))!;
  return { cookies, csrf: tokenCsrf(s.sid), token };
}

async function chamar(
  rota: unknown,
  o: {
    metodo?: string;
    caminho?: string;
    params?: Record<string, string>;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    corpoBruto?: string;
    corpo?: unknown;
  },
) {
  const metodo = o.metodo ?? 'POST';
  const headers = new Headers(o.headers);
  if (o.cookies) headers.set('cookie', Object.entries(o.cookies).map(([k, v]) => `${k}=${v}`).join('; '));
  let body: string | undefined;
  if (o.corpoBruto !== undefined) body = o.corpoBruto;
  else if (o.corpo !== undefined) body = JSON.stringify(o.corpo);
  if (body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const req = new Request(`${APP}${o.caminho ?? '/api/x'}`, { method: metodo, headers, body });
  const res = await (rota as Rota)(req, { params: Promise.resolve(o.params ?? {}) });
  const texto = await res.text();
  return { status: res.status, texto, corpo: JSON.parse(texto) as { ok: boolean; codigo?: string; dados?: JsonLivre; erro?: string; detalhes?: JsonLivre }, res };
}

const mutacao = async (rota: unknown, nivel: 1 | 2 | 3, corpo: unknown, params: Record<string, string> = {}, extra: Record<string, string> = {}) => {
  const s = await sessao(nivel);
  const metodo = corpo === undefined ? 'DELETE' : 'POST';
  return await chamar(rota, { metodo, cookies: s.cookies, headers: { origin: APP, 'x-csrf-token': s.csrf, ...extra }, corpo, params });
};

/* ------------------------------------------------------------------ sessão forjada */
describe('QA sessão adulterada ou forjada', () => {
  const assinar = (payload: Record<string, unknown>, segredo = SEGREDO, alg = 'HS256') =>
    new SignJWT(payload).setProtectedHeader({ alg }).setExpirationTime(Math.floor(Date.now() / 1000) + 3600).sign(new TextEncoder().encode(segredo));
  const base = () => ({ sub: '444444444444444441', nome: 'x', nivel: 3, sid: 'abc', ini: Date.now(), cv: Date.now() });

  const casos: Array<[string, () => Promise<string>]> = [
    ['alg none', async () => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...base(), exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
    }],
    ['outro segredo', () => assinar(base(), 'outro-segredo-qualquer-com-mais-de-32-caracteres')],
    ['HS512 com o mesmo segredo', () => assinar(base(), SEGREDO, 'HS512')],
    ['nivel 4', () => assinar({ ...base(), nivel: 4 })],
    ['nivel "3" em texto', () => assinar({ ...base(), nivel: '3' })],
    ['sem sid', () => assinar({ ...base(), sid: '' })],
    ['payload trocado (nivel 1 → 3) com assinatura original', async () => {
      const real = (await sessao(1)).token;
      const [h, p, s] = real.split('.');
      const corpo = JSON.parse(Buffer.from(p!, 'base64url').toString()) as Record<string, unknown>;
      return `${h}.${Buffer.from(JSON.stringify({ ...corpo, nivel: 3 })).toString('base64url')}.${s}`;
    }],
    ['cookie de state no lugar da sessão', async () => {
      const res = await LOGIN(criarRequisicao(`${APP}/api/auth/login`));
      return valorDoCookie(res, 'stocky_oauth')!;
    }],
    ['expirado', async () =>
      new SignJWT(base()).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(Math.floor(Date.now() / 1000) - 10).sign(new TextEncoder().encode(SEGREDO))],
  ];

  for (const [nome, gerar] of casos) {
    it(`${nome} → 401 e nenhum acesso ao banco`, async () => {
      const token = await gerar();
      const r = await chamar(ZERAR, {
        cookies: { [nomeCookieSessao()]: token },
        headers: { origin: APP, 'x-csrf-token': tokenCsrf('abc') },
        corpo: { alvo: 'ambos', confirmacao: 'ZERAR' },
      });
      expect(r.status).toBe(401);
      expect(fake.chamadas).toHaveLength(0);
    });
  }

  it('sessão válida de nível 2 com cv no futuro não vira nível 3 nem pula o 403 do zerar', async () => {
    const t = await assinar({ ...base(), nivel: 2, cv: Date.now() + 10 ** 9 });
    const r = await chamar(ZERAR, {
      cookies: { [nomeCookieSessao()]: t },
      headers: { origin: APP, 'x-csrf-token': tokenCsrf('abc') },
      corpo: { alvo: 'ambos', confirmacao: 'ZERAR' },
    });
    expect(r.status).toBe(403);
    expect(fake.chamadas).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ CSRF / Origin */
describe('QA CSRF: variações de Origin e token', () => {
  const variacoes: Array<[string, (csrf: string, outro: string) => Record<string, string>, number]> = [
    ['sem Origin', (c) => ({ 'x-csrf-token': c }), 403],
    ['Origin "null"', (c) => ({ origin: 'null', 'x-csrf-token': c }), 403],
    ['Origin com barra final', (c) => ({ origin: `${APP}/`, 'x-csrf-token': c }), 403],
    ['Origin http', (c) => ({ origin: APP.replace('https', 'http'), 'x-csrf-token': c }), 403],
    ['Origin subdomínio', (c) => ({ origin: APP.replace('https://', 'https://evil.'), 'x-csrf-token': c }), 403],
    ['Origin com sufixo', (c) => ({ origin: `${APP}.evil.com`, 'x-csrf-token': c }), 403],
    ['Sec-Fetch-Site cross-site', (c) => ({ origin: APP, 'sec-fetch-site': 'cross-site', 'x-csrf-token': c }), 403],
    ['Sec-Fetch-Site same-site', (c) => ({ origin: APP, 'sec-fetch-site': 'same-site', 'x-csrf-token': c }), 403],
    ['token de outra sessão', (_c, o) => ({ origin: APP, 'x-csrf-token': o }), 403],
    ['token em maiúsculas', (c) => ({ origin: APP, 'x-csrf-token': c.toUpperCase() }), 403],
    ['token vazio', () => ({ origin: APP, 'x-csrf-token': '' }), 403],
    ['token derivado do sid com outro segredo', () => ({ origin: APP, 'x-csrf-token': createHmac('sha256', 'x').update('csrf:abc').digest('base64url') }), 403],
    ['content-type text/plain', (c) => ({ origin: APP, 'x-csrf-token': c, 'content-type': 'text/plain' }), 415],
    ['content-type form', (c) => ({ origin: APP, 'x-csrf-token': c, 'content-type': 'application/x-www-form-urlencoded' }), 415],
  ];

  for (const [nome, headers, status] of variacoes) {
    it(`${nome} → ${status}, nada gravado (zerar com dono e caixa com gerência)`, async () => {
      const dono = await sessao(3);
      const outro = await sessao(3, '444444444444444442');
      const r1 = await chamar(ZERAR, { cookies: dono.cookies, headers: headers(dono.csrf, outro.csrf), corpo: { alvo: 'ambos', confirmacao: 'ZERAR' } });
      const ger = await sessao(2);
      const r2 = await chamar(MOVIMENTAR, {
        cookies: ger.cookies,
        headers: headers(ger.csrf, outro.csrf),
        corpo: { tipo: 'sujo', acao: 'saida', valor: 100, anotacao: 'x' },
      });
      expect([r1.status, r2.status]).toEqual([status, status]);
      expect(escritas()).toHaveLength(0);
    });
  }

  it('DELETE do catálogo sem token (dono) → 403 e item continua', async () => {
    const dono = await sessao(3);
    const r = await chamar(CATALOGO_REMOVER, {
      metodo: 'DELETE',
      cookies: dono.cookies,
      headers: { origin: APP },
      params: { categoriaId: 'armas', itemId: 'desert' },
    });
    expect(r.status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ open redirect / state */
describe('QA open redirect no parâmetro volta e no callback', () => {
  const voltas = [
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    '/%2F%2Fevil.com',
    'javascript:alert(1)',
    '/bau/membros/../../evil',
    '/bau/membros?x=1',
    ' /caixa',
    '/caixa\r\nSet-Cookie: x=1',
    '/CAIXA',
  ];
  for (const v of voltas) {
    it(`volta=${JSON.stringify(v)} vira "/" e o callback só redireciona para APP_URL`, async () => {
      const ini = await LOGIN(criarRequisicao(`${APP}/api/auth/login?volta=${encodeURIComponent(v)}`));
      const cookieState = valorDoCookie(ini, 'stocky_oauth')!;
      const payload = JSON.parse(Buffer.from(cookieState.split('.')[1]!, 'base64url').toString()) as { volta: string };
      expect(payload.volta).toBe('/');
      const auth = new URL(ini.headers.get('location')!);
      expect(auth.origin).toBe('https://discord.com');
      expect(auth.searchParams.get('redirect_uri')).toBe(`${APP}/api/auth/callback`);

      const d = criarDiscordFake((c) => {
        if (c.url.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
        return new Response(JSON.stringify({ user: { id: '444444444444444441', username: 'u' }, roles: ['333333333333333331'] }), { status: 200 });
      });
      setFetch(d.fetch);
      const state = auth.searchParams.get('state')!;
      const cb = await CALLBACK(
        criarRequisicao(`${APP}/api/auth/callback?code=c&state=${state}&volta=${encodeURIComponent(v)}&next=https://evil.com`, {
          cookies: { stocky_oauth: cookieState },
        }),
      );
      expect(cb.headers.get('location')).toBe(`${APP}/`);
    });
  }

  it('Host e X-Forwarded-Host hostis não mudam redirect_uri nem o destino', async () => {
    const ini = await LOGIN(
      criarRequisicao(`${APP}/api/auth/login?volta=/caixa`, { headers: { host: 'evil.com', 'x-forwarded-host': 'evil.com' } }),
    );
    expect(new URL(ini.headers.get('location')!).searchParams.get('redirect_uri')).toBe(`${APP}/api/auth/callback`);
  });
});

/* ------------------------------------------------------------------ corpo hostil */
describe('QA corpo hostil: __proto__, campos extras, tipos errados, JSON quebrado', () => {
  const corpos: Array<[string, string]> = [
    ['__proto__ no topo', '{"categoriaId":"armas","itemId":"desert","quantidade":1,"__proto__":{"poluido":true}}'],
    ['constructor.prototype', '{"categoriaId":"armas","itemId":"desert","quantidade":1,"constructor":{"prototype":{"poluido":true}}}'],
    ['itemId __proto__', '{"categoriaId":"armas","itemId":"__proto__","quantidade":1}'],
    ['itemId com barra', '{"categoriaId":"armas","itemId":"../gerencia","quantidade":1}'],
    ['itemId com ponto', '{"categoriaId":"armas","itemId":"itens.desert","quantidade":1}'],
    ['quantidade objeto', '{"categoriaId":"armas","itemId":"desert","quantidade":{"$gt":0}}'],
    ['quantidade lista', '{"categoriaId":"armas","itemId":"desert","quantidade":[1]}'],
    ['quantidade negativa', '{"categoriaId":"armas","itemId":"desert","quantidade":-5}'],
    ['quantidade -0 em texto', '{"categoriaId":"armas","itemId":"desert","quantidade":"-0"}'],
    ['quantidade 1e3 em texto', '{"categoriaId":"armas","itemId":"desert","quantidade":"1e3"}'],
    ['quantidade enorme', '{"categoriaId":"armas","itemId":"desert","quantidade":"999999999999999999999"}'],
    ['quantidade 2^53', '{"categoriaId":"armas","itemId":"desert","quantidade":9007199254740993}'],
    ['quantidade fullwidth', '{"categoriaId":"armas","itemId":"desert","quantidade":"１２"}'],
    ['JSON quebrado', '{"categoriaId":'],
    ['JSON lista', '[1,2,3]'],
    ['JSON nulo', 'null'],
    ['vazio', ''],
    ['UTF-8 inválido', '�'],
  ];
  for (const [nome, bruto] of corpos) {
    it(`${nome} → 400, nada gravado, sem poluição de protótipo`, async () => {
      const s = await sessao(1);
      const r = await chamar(REMOVER, {
        cookies: s.cookies,
        headers: { origin: APP, 'x-csrf-token': s.csrf },
        corpoBruto: bruto,
        params: { tipo: 'membros' },
      });
      expect(r.status, r.texto).toBe(400);
      expect(r.corpo.codigo).toBe('VALIDACAO');
      expect(r.texto).not.toMatch(/stack|zod|ZodError|at \w+ \(/i);
      expect(escritas()).toHaveLength(0);
      expect(({} as Record<string, unknown>).poluido).toBeUndefined();
    });
  }

  it('tipo de baú hostil no caminho → 400 sem tocar o banco', async () => {
    for (const tipo of ['__proto__', 'constructor', 'Membros', 'membros/../gerencia', 'gerencia%00', '']) {
      const s = await sessao(3);
      const r = await chamar(BAU, { metodo: 'GET', cookies: s.cookies, params: { tipo } });
      expect(r.status, tipo).toBe(400);
    }
    expect(fake.chamadas).toHaveLength(0);
  });

  it('ids hostis no DELETE do catálogo e na auditoria → 400 sem tocar o banco', async () => {
    const dono = await sessao(3);
    for (const [categoriaId, itemId] of [['armas', '__proto__'], ['..', 'desert'], ['armas', 'colt%2F..'], ['ARMAS', 'desert'], ['armas', 'a'.repeat(51)]] as const) {
      const r = await chamar(CATALOGO_REMOVER, {
        metodo: 'DELETE',
        cookies: dono.cookies,
        headers: { origin: APP, 'x-csrf-token': dono.csrf },
        params: { categoriaId, itemId },
      });
      expect(r.status, `${categoriaId}/${itemId}`).toBe(400);
    }
    for (const id of ['__proto__', '../x', 'a'.repeat(41), 'abc-def', '']) {
      const r = await chamar(AUDITORIA_ID, { metodo: 'GET', cookies: dono.cookies, params: { id } });
      expect(r.status, id).toBe(400);
    }
    expect(fake.chamadas).toHaveLength(0);
  });

  it('paginação hostil → 400', async () => {
    const g = await sessao(2);
    for (const q of ['limite=0', 'limite=101', 'limite=1e2', 'limite=-1', 'limite=10.5', 'limite=%EF%BC%91', 'cursor=a/b', 'cursor=__proto__', `cursor=${'a'.repeat(41)}`]) {
      const r = await chamar(HISTORICO, { metodo: 'GET', caminho: `/api/caixa/historico?${q}`, cookies: g.cookies });
      expect(r.status, q).toBe(400);
    }
  });
});

/* ------------------------------------------------------------------ tamanho */
describe('QA entradas enormes', () => {
  it('corpo de 10 KB + 1 → 413 mesmo sem Content-Length; Content-Length mentiroso também', async () => {
    const s = await sessao(2);
    const grande = JSON.stringify({ tipo: 'sujo', acao: 'entrada', valor: 1, anotacao: 'x'.repeat(LIMITES.CORPO_MAX_BYTES) });
    const r1 = await chamar(MOVIMENTAR, { cookies: s.cookies, headers: { origin: APP, 'x-csrf-token': s.csrf }, corpoBruto: grande });
    expect(r1.status).toBe(413);
    const r2 = await chamar(MOVIMENTAR, {
      cookies: s.cookies,
      headers: { origin: APP, 'x-csrf-token': s.csrf, 'content-length': '20' },
      corpoBruto: grande,
    });
    expect(r2.status).toBe(413);
    expect(escritas()).toHaveLength(0);
  });

  it('ajuste com 201 linhas → 400; ajuste acima de 100 KB → 413', async () => {
    const linhas = Array.from({ length: 201 }, (_, i) => ({ categoriaId: 'armas', itemId: `item_${i}`, quantidade: 1 }));
    const r = await mutacao(PREVIA, 2, { linhas }, { tipo: 'membros' });
    expect(r.status).toBe(400);
    const enorme = { linhas: [{ categoriaId: 'armas', itemId: 'desert', quantidade: 'x'.repeat(LIMITES.CORPO_AJUSTE_MAX_BYTES) }] };
    expect((await mutacao(CONFIRMAR, 2, { versao: 0, ...enorme }, { tipo: 'membros' })).status).toBe(413);
    expect(escritas()).toHaveLength(0);
  });

  it('anotação de 101 caracteres visíveis → 400; 100 emojis (200 unidades UTF-16) → aceita', async () => {
    expect((await mutacao(MOVIMENTAR, 2, { tipo: 'sujo', acao: 'entrada', valor: 1, anotacao: 'a'.repeat(101) })).status).toBe(400);
    const r = await mutacao(MOVIMENTAR, 2, { tipo: 'sujo', acao: 'entrada', valor: 1, anotacao: '💰'.repeat(100) });
    expect(r.status).toBe(200);
  });

  it('estoque perto de MAX_SAFE_INTEGER: soma que estoura é recusada e nada muda', async () => {
    abrir(seedBase({ membros: { armas: { desert: Number.MAX_SAFE_INTEGER - 1 } } }));
    const r = await mutacao(ADICIONAR, 1, { categoriaId: 'armas', itemId: 'desert', quantidade: 5 }, { tipo: 'membros' });
    expect(r.status).toBe(400);
    expect(fake.dump()['baus/membros']!.itens).toEqual({ armas: { desert: Number.MAX_SAFE_INTEGER - 1 } });
  });
});

/* ------------------------------------------------------------------ unicode e XSS */
describe('QA unicode e XSS em nomes e anotações', () => {
  it('nome só com emoji/símbolos/zero-width → 400; equivalentes NFC/NFD e com acento são duplicados', async () => {
    for (const nome of ['🔫🔫', '!!!', '​​', '‮', '   ', '#']) {
      expect((await mutacao(CATALOGO_ADICIONAR, 2, { categoriaId: 'materiais', nome })).status, JSON.stringify(nome)).toBe(400);
    }
    expect((await mutacao(CATALOGO_ADICIONAR, 2, { categoriaId: 'materiais', nome: 'Pólvora Negra' })).status).toBe(201);
    const nfd = 'Pólvora Negra';
    expect((await mutacao(CATALOGO_ADICIONAR, 2, { categoriaId: 'materiais', nome: nfd })).corpo.codigo).toBe('DUPLICADO');
    expect((await mutacao(CATALOGO_ADICIONAR, 2, { categoriaId: 'materiais', nome: 'POLVORA-NEGRA' })).corpo.codigo).toBe('DUPLICADO');
  });

  it('nome com HTML e menções é guardado como texto e o webhook neutraliza @everyone e <@id>', async () => {
    const d = criarDiscordFake();
    setFetch(d.fetch);
    const nome = '<img src=x onerror=alert(1)> @everyone <@1>';
    const novo = await mutacao(CATALOGO_ADICIONAR, 2, { categoriaId: 'extras', nome });
    expect(novo.status).toBe(201);
    const id = novo.corpo.dados.item.id as string;
    expect(id).toMatch(/^[a-z0-9_]+$/);
    await mutacao(ADICIONAR, 1, { categoriaId: 'extras', itemId: id, quantidade: 1 }, { tipo: 'membros' });
    await mutacao(MOVIMENTAR, 2, { tipo: 'sujo', acao: 'entrada', valor: 1, anotacao: '@here <script>x</script> **negrito**' });
    while (tarefas.length > 0) await Promise.all(tarefas.splice(0).map((t) => t()));
    expect(d.chamadas.length).toBeGreaterThan(0);
    for (const c of d.chamadas) {
      const p = JSON.parse(c.corpo) as { allowed_mentions: { parse: unknown[] } };
      expect(p.allowed_mentions).toEqual({ parse: [] });
      expect(c.corpo).not.toMatch(/(?<!\\u200b)@everyone|@here(?!​)/);
      expect(c.corpo).not.toMatch(/<@1>/);
    }
  });
});

/* ------------------------------------------------------------------ concorrência */
describe('QA concorrência nas rotas', () => {
  it('duas confirmações do mesmo ajuste em paralelo: uma aplica, outra 409; auditoria única', async () => {
    const linhas = [{ categoriaId: 'armas', itemId: 'desert', quantidade: 3 }];
    const [a, b] = await Promise.all([
      mutacao(CONFIRMAR, 2, { versao: 0, linhas }, { tipo: 'membros' }),
      mutacao(CONFIRMAR, 2, { versao: 0, linhas: [{ categoriaId: 'armas', itemId: 'desert', quantidade: 7 }] }, { tipo: 'membros' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(Object.keys(fake.dump()).filter((k) => k.startsWith('auditoria/'))).toHaveLength(1);
  });

  it('zerar em paralelo com adicionar: resultado sempre consistente com alguma ordem serial', async () => {
    const [z, add] = await Promise.all([
      mutacao(ZERAR, 3, { alvo: 'membros', confirmacao: 'ZERAR' }),
      mutacao(ADICIONAR, 1, { categoriaId: 'armas', itemId: 'desert', quantidade: 5 }, { tipo: 'membros' }),
    ]);
    expect([z.status, add.status]).toEqual([200, 200]);
    const colt = (fake.dump()['baus/membros']!.itens as Record<string, Record<string, number>>).armas?.desert ?? 0;
    expect([0, 5]).toContain(colt);
    const versao = fake.dump()['baus/membros']!.versao;
    expect(versao).toBe(2);
  });

  it('20 saídas de caixa paralelas de 10 com saldo 100: exatamente 10 passam e saldo final 0', async () => {
    const r = await Promise.all(
      Array.from({ length: 20 }, () => mutacao(MOVIMENTAR, 2, { tipo: 'sujo', acao: 'saida', valor: 10, anotacao: 'x' })),
    );
    expect(r.filter((x) => x.status === 200)).toHaveLength(10);
    expect(r.filter((x) => x.status === 409)).toHaveLength(10);
    expect(fake.dump()['caixa/saldo']).toMatchObject({ sujo: 0, limpo: 100 });
  });

  it('remover do catálogo em paralelo com ajuste da mesma versão: o ajuste perde (409) ou o item some, nunca reaparece', async () => {
    const [rem, aj] = await Promise.all([
      mutacao(CATALOGO_REMOVER, 3, undefined, { categoriaId: 'armas', itemId: 'desert' }),
      mutacao(CONFIRMAR, 2, { versao: 0, linhas: [{ categoriaId: 'armas', itemId: 'desert', quantidade: 50 }] }, { tipo: 'membros' }),
    ]);
    expect(rem.status).toBe(200);
    const itens = fake.dump()['baus/membros']!.itens as Record<string, Record<string, number>>;
    if (aj.status === 200) {
      // ajuste veio antes: a remoção depois limpou o item
      expect(itens.armas?.desert).toBeUndefined();
    } else {
      expect([400, 409]).toContain(aj.status);
      expect(itens.armas?.desert).toBeUndefined();
    }
  });
});

/* ------------------------------------------------------------------ segredos em log e resposta */
describe('QA nenhum segredo em resposta ou log', () => {
  it('webhook que falha com a URL na mensagem de erro não vaza a URL no log; respostas não citam o Discord', async () => {
    const urlMembros = ENV_TESTE.WEBHOOK_LOG_MEMBROS!;
    setFetch(((u: RequestInfo | URL) => Promise.reject(new Error(`falhou ${String(u)} com ${ENV_TESTE.DISCORD_CLIENT_SECRET}`))) as typeof fetch);
    const r = await mutacao(ADICIONAR, 1, { categoriaId: 'armas', itemId: 'desert', quantidade: 1 }, { tipo: 'membros' });
    expect(r.status).toBe(200);
    while (tarefas.length > 0) await Promise.all(tarefas.splice(0).map((t) => t()));
    const tudo = saidas.join('\n') + r.texto;
    expect(tudo).not.toContain(urlMembros.split('/').pop()!);
    expect(tudo).not.toContain('api/webhooks/111111111111111111/');
    expect(tudo).not.toContain(ENV_TESTE.DISCORD_CLIENT_SECRET!);
    expect(r.texto).not.toMatch(/discord|webhook/i);
  });

  it('erro interno com segredo na mensagem vira 500 genérico e o log sai mascarado', async () => {
    await garantirCatalogo(); // a semente roda a própria transação; sem isto ela consumiria a falha
    fake.falharProximoCommit(new Error(`boom ${ENV_TESTE.SESSION_SECRET} ${ENV_TESTE.WEBHOOK_SALDO_CAIXA} Bearer abc.def`));
    const r = await mutacao(ADICIONAR, 1, { categoriaId: 'armas', itemId: 'desert', quantidade: 1 }, { tipo: 'membros' });
    expect(r.status).toBe(500);
    expect(r.texto).not.toMatch(/boom|stack/);
    const tudo = saidas.join('\n');
    expect(tudo).toContain('boom');
    expect(tudo).not.toContain(ENV_TESTE.SESSION_SECRET!);
    expect(tudo).not.toContain(ENV_TESTE.WEBHOOK_SALDO_CAIXA!.split('/').pop()!);
    expect(tudo).not.toContain('abc.def');
    expect(tarefas).toHaveLength(0); // commit falhou: nenhum webhook agendado
  });

  it('cookie de sessão: HttpOnly, SameSite=Lax, Path=/; em produção Secure e prefixo __Host-', async () => {
    aplicarEnvTeste({ NODE_ENV: 'production' });
    const d = criarDiscordFake((c) =>
      c.url.endsWith('/oauth2/token')
        ? new Response(JSON.stringify({ access_token: 't' }), { status: 200 })
        : new Response(JSON.stringify({ user: { id: '444444444444444441', username: 'u' }, roles: ['333333333333333331'] }), { status: 200 }),
    );
    setFetch(d.fetch);
    const ini = await LOGIN(criarRequisicao(`${APP}/api/auth/login`));
    const st = ini.headers.getSetCookie()[0]!;
    expect(st).toMatch(/HttpOnly/);
    expect(st).toMatch(/Secure/);
    expect(st).toMatch(/SameSite=Lax/);
    expect(st).toMatch(/Max-Age=600/);
    const state = new URL(ini.headers.get('location')!).searchParams.get('state')!;
    const cb = await CALLBACK(criarRequisicao(`${APP}/api/auth/callback?code=c&state=${state}`, { cookies: { stocky_oauth: valorDoCookie(ini, 'stocky_oauth')! } }));
    const sess = cb.headers.getSetCookie().find((c) => c.startsWith('__Host-stocky_sessao='))!;
    expect(sess).toBeDefined();
    expect(sess).toMatch(/; Path=\/;/);
    expect(sess).toMatch(/HttpOnly/);
    expect(sess).toMatch(/Secure/);
    expect(sess).toMatch(/SameSite=Lax/);
    expect(sess).not.toMatch(/Domain=/i);
    const maxAge = Number(/Max-Age=(\d+)/.exec(sess)![1]);
    expect(maxAge).toBeGreaterThan(7 * 24 * 3600 - 10);
    expect(maxAge).toBeLessThanOrEqual(7 * 24 * 3600);
    const payload = JSON.parse(Buffer.from(valorDoCookie(cb, '__Host-stocky_sessao')!.split('.')[1]!, 'base64url').toString()) as object;
    expect(Object.keys(payload).sort()).toEqual(['cv', 'exp', 'ini', 'nivel', 'nome', 'sid', 'sub']);
  });
});
