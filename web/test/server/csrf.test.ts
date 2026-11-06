import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { comAutorizacao } from '@/server/auth/autorizacao';
import { lerSessao } from '@/server/auth/sessao';
import { responderOk } from '@/server/http';
import { deleteSemCorpo, ehMutacao, tokenCsrf, verificarMutacao } from '@/server/seguranca/csrf';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { APP as APP_TESTE, montarPedido } from '../helpers/pedidos';
import { criarRequisicao } from '../helpers/requisicao';
import { tokenSessaoTeste } from '../helpers/sessao-teste';

const APP = APP_TESTE;
beforeEach(() => aplicarEnvTeste());
afterEach(() => limparEnvTeste());

describe('csrf (base usada por logout e guarda de página)', () => {
  it('token é determinístico por sid, diferente entre sessões e muda com o segredo', async () => {
    expect(tokenCsrf('a')).toBe(tokenCsrf('a'));
    expect(tokenCsrf('a')).not.toBe(tokenCsrf('b'));
    const antes = tokenCsrf('a');
    aplicarEnvTeste({ SESSION_SECRET: 'outro-segredo-falso-com-mais-de-32-caracteres!' });
    expect(tokenCsrf('a')).not.toBe(antes);
  });

  it('aceita Origin certa, JSON e token da própria sessão; recusa token de outra sessão', async () => {
    const s = (await lerSessao(await tokenSessaoTeste()))!;
    const outra = (await lerSessao(await tokenSessaoTeste()))!;
    const req = (token: string) =>
      criarRequisicao(`${APP}/api/x`, { metodo: 'POST', headers: { origin: APP, 'x-csrf-token': token }, corpo: {} });
    expect(() => verificarMutacao(req(tokenCsrf(s.sid)), s)).not.toThrow();
    expect(() => verificarMutacao(req(tokenCsrf(outra.sid)), s)).toThrow(expect.objectContaining({ codigo: 'CSRF' }));
  });
});

describe('WEB-023 CSRF completo nas mutações (via comAutorizacao)', () => {
  const chamadas = vi.fn();
  const rota = comAutorizacao({ nivel: 1 }, async () => {
    chamadas();
    return responderOk({ feito: true });
  });
  beforeEach(() => chamadas.mockClear());
  const tentar = async (p: Partial<Parameters<typeof montarPedido>[0]>) => rota(await montarPedido({ perfil: 1, metodo: 'POST', ...p }));

  it('AC1: sem token → 403; token errado ou de outra sessão → 403; token e Origin certos → passa', async () => {
    expect((await tentar({ csrf: 'ausente' })).status).toBe(403);
    expect((await tentar({ csrf: 'errado' })).status).toBe(403);
    const outra = (await lerSessao(await tokenSessaoTeste()))!;
    const res = await tentar({ csrf: 'ausente', headers: { 'x-csrf-token': tokenCsrf(outra.sid) } });
    expect(res.status).toBe(403);
    expect((await res.json()).codigo).toBe('CSRF');
    expect(chamadas).not.toHaveBeenCalled();
    expect((await tentar({})).status).toBe(200);
    expect(chamadas).toHaveBeenCalledTimes(1);
  });

  it('AC2: Origin de outro site, ausente ou "null" → 403 mesmo com token correto; Sec-Fetch-Site cross-site também', async () => {
    for (const origin of ['https://evil.example', null, 'null', `${APP}/`, 'http://stocky-teste.vercel.app']) {
      expect((await tentar({ origin })).status, String(origin)).toBe(403);
    }
    expect((await tentar({ headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect((await tentar({ headers: { 'sec-fetch-site': 'same-site' } })).status).toBe(403);
    expect((await tentar({ headers: { 'sec-fetch-site': 'same-origin' } })).status).toBe(200);
    expect(chamadas).toHaveBeenCalledTimes(1);
  });

  it('AC3: Content-Type diferente de application/json → 415 (charset aceito); métodos PUT/PATCH/DELETE valem igual', async () => {
    for (const tipo of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'application/jsonx']) {
      expect((await tentar({ headers: { 'content-type': tipo } })).status, tipo).toBe(415);
    }
    expect((await tentar({ headers: { 'content-type': 'application/json; charset=utf-8' } })).status).toBe(200);
    for (const metodo of ['PUT', 'PATCH', 'DELETE']) {
      expect((await tentar({ metodo, csrf: 'ausente' })).status, metodo).toBe(403);
      expect((await tentar({ metodo, headers: { 'content-type': 'text/plain' } })).status, metodo).toBe(415);
      expect((await tentar({ metodo })).status, metodo).toBe(200);
    }
  });

  it('DELETE com corpo exige JSON; DELETE sem corpo declarado dispensa o Content-Type mas não o token', () => {
    const base = { origin: APP };
    const sem = new Request(`${APP}/x`, { method: 'DELETE', headers: base });
    expect(deleteSemCorpo(sem)).toBe(true);
    expect(deleteSemCorpo(new Request(`${APP}/x`, { method: 'DELETE', headers: { ...base, 'content-length': '5' } }))).toBe(false);
    expect(deleteSemCorpo(new Request(`${APP}/x`, { method: 'DELETE', headers: { ...base, 'content-type': 'text/plain' } }))).toBe(false);
    expect(deleteSemCorpo(new Request(`${APP}/x`, { method: 'POST', headers: base }))).toBe(false);
  });

  it('ehMutacao: só POST/PUT/PATCH/DELETE (qualquer caixa)', () => {
    for (const m of ['POST', 'put', 'Patch', 'DELETE']) expect(ehMutacao(m)).toBe(true);
    for (const m of ['GET', 'HEAD', 'OPTIONS']) expect(ehMutacao(m)).toBe(false);
  });

  it('token adulterado (um caractere) ou com tamanho diferente é recusado', async () => {
    const s = (await lerSessao(await tokenSessaoTeste()))!;
    const certo = tokenCsrf(s.sid);
    const req = (t: string) =>
      criarRequisicao(`${APP}/api/x`, { metodo: 'POST', headers: { origin: APP, 'x-csrf-token': t }, corpo: {} });
    expect(() => verificarMutacao(req(certo.slice(0, -1) + (certo.endsWith('A') ? 'B' : 'A')), s)).toThrow(expect.objectContaining({ codigo: 'CSRF' }));
    expect(() => verificarMutacao(req(certo + 'x'), s)).toThrow(expect.objectContaining({ codigo: 'CSRF' }));
    expect(() => verificarMutacao(req(''), s)).toThrow(expect.objectContaining({ codigo: 'CSRF' }));
  });

  it('AC5: GET /api/csrf só responde a sessão válida e devolve o token da própria sessão', async () => {
    const { GET } = await import('@/app/api/csrf/route');
    expect((await GET(await montarPedido({ perfil: 'anonimo', caminho: '/api/csrf' }))).status).toBe(401);
    expect((await GET(await montarPedido({ perfil: 'adulterado', caminho: '/api/csrf' }))).status).toBe(401);
    const req = await montarPedido({ perfil: 1, caminho: '/api/csrf' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const sid = (await lerSessao(req.headers.get('cookie')!.split('=')[1]))!.sid;
    expect(await res.json()).toEqual({ ok: true, dados: { csrf: tokenCsrf(sid) } });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('o token fornecido por /api/csrf autoriza uma mutação real da mesma sessão', async () => {
    const { GET } = await import('@/app/api/csrf/route');
    const get = await montarPedido({ perfil: 2, caminho: '/api/csrf' });
    const { dados } = await (await GET(get)).json();
    const post = criarRequisicao(`${APP}/api/x`, {
      metodo: 'POST',
      cookies: { stocky_sessao: get.headers.get('cookie')!.split('=')[1]! },
      headers: { origin: APP, 'x-csrf-token': dados.csrf },
      corpo: {},
    });
    expect((await rota(post)).status).toBe(200);
  });
});
