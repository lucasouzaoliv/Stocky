import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as rota from '@/app/api/auth/logout/route';
import { lerSessao } from '@/server/auth/sessao';
import { tokenCsrf } from '@/server/seguranca/csrf';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { criarRequisicao, valorDoCookie } from '../helpers/requisicao';
import { cookieSessaoTeste } from '../helpers/sessao-teste';

const APP = 'https://stocky-teste.vercel.app';

beforeEach(() => aplicarEnvTeste());
afterEach(() => limparEnvTeste());

async function logout(opcoes: { sessao: boolean; origin?: string | null; csrf?: 'certo' | 'errado' | null; tipo?: string }) {
  const cookies = opcoes.sessao ? await cookieSessaoTeste({ nivel: 2 }) : {};
  const token = Object.values(cookies)[0];
  const sessao = await lerSessao(token);
  const headers: Record<string, string> = {};
  if (opcoes.origin !== null) headers.origin = opcoes.origin ?? APP;
  if (opcoes.csrf === 'certo' && sessao) headers['x-csrf-token'] = tokenCsrf(sessao.sid);
  if (opcoes.csrf === 'errado') headers['x-csrf-token'] = 'outro';
  if (opcoes.tipo) headers['content-type'] = opcoes.tipo;
  const req = criarRequisicao(`${APP}/api/auth/logout`, { metodo: 'POST', cookies, headers, corpo: {} });
  if (opcoes.tipo) req.headers.set('content-type', opcoes.tipo);
  return { res: await rota.POST(req), token };
}

describe('WEB-021 logout', () => {
  it('AC1/AC2: apaga o cookie com os mesmos atributos de Path e a leitura depois dá "sem sessão"', async () => {
    const { res, token } = await logout({ sessao: true, csrf: 'certo' });
    expect(res.status).toBe(200);
    const linha = res.headers.getSetCookie().find((l) => l.startsWith('stocky_sessao='))!;
    expect(linha).toMatch(/^stocky_sessao=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax/);
    expect(await lerSessao(token)).not.toBeNull();
    expect(await lerSessao(valorDoCookie(res, 'stocky_sessao'))).toBeNull();
    expect(await res.json()).toEqual({ ok: true, dados: {} });
  });

  it('AC3: só POST existe; GET não está exportado (o Next responde 405)', () => {
    expect(Object.keys(rota).filter((k) => /^(GET|PUT|PATCH|DELETE|HEAD)$/.test(k))).toEqual([]);
    expect(typeof rota.POST).toBe('function');
    expect(rota.runtime).toBe('nodejs');
    expect(rota.dynamic).toBe('force-dynamic');
  });

  it('AC4: sem sessão responde 200 idempotente, exigindo só Origin', async () => {
    const { res } = await logout({ sessao: false });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join()).toContain('Max-Age=0');
    const { res: semOrigin } = await logout({ sessao: false, origin: null });
    expect(semOrigin.status).toBe(403);
    const { res: outraOrigin } = await logout({ sessao: false, origin: 'https://evil.example' });
    expect(outraOrigin.status).toBe(403);
  });

  it('com sessão: sem token CSRF, token errado ou Origin diferente é recusado e o cookie não é apagado', async () => {
    for (const o of [{ csrf: null }, { csrf: 'errado' as const }, { csrf: 'certo' as const, origin: 'https://evil.example' }]) {
      const { res } = await logout({ sessao: true, ...o });
      expect(res.status).toBe(403);
      expect((await res.json()).codigo).toBe('CSRF');
      expect(res.headers.getSetCookie()).toHaveLength(0);
    }
  });

  it('com sessão: Content-Type fora de application/json dá 415', async () => {
    const { res } = await logout({ sessao: true, csrf: 'certo', tipo: 'text/plain' });
    expect(res.status).toBe(415);
  });

  it('cookie de sessão adulterado conta como sem sessão (200, só Origin)', async () => {
    const req = criarRequisicao(`${APP}/api/auth/logout`, {
      metodo: 'POST',
      cookies: { stocky_sessao: 'lixo' },
      headers: { origin: APP },
      corpo: {},
    });
    expect((await rota.POST(req)).status).toBe(200);
  });

  it('Sec-Fetch-Site diferente de same-origin é recusado', async () => {
    const req = criarRequisicao(`${APP}/api/auth/logout`, {
      metodo: 'POST',
      headers: { origin: APP, 'sec-fetch-site': 'cross-site' },
      corpo: {},
    });
    expect((await rota.POST(req)).status).toBe(403);
  });
});
