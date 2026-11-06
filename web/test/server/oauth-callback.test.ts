import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as callback } from '@/app/api/auth/callback/route';
import { GET as login } from '@/app/api/auth/login/route';
import { resetContexto, setFetch } from '@/server/contexto';
import { lerSessao } from '@/server/auth/sessao';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { criarFakeFetch, respostaJson } from '../helpers/fake-fetch';
import { criarRequisicao, valorDoCookie } from '../helpers/requisicao';
import { cookieSessaoTeste } from '../helpers/sessao-teste';

const APP = 'https://stocky-teste.vercel.app';
const MEMBRO = '333333333333333331';
const DONO = '333333333333333334';

function discordFake(roles: string[], opcoes: { membro?: Response } = {}) {
  const f = criarFakeFetch((c) =>
    c.url.endsWith('/oauth2/token')
      ? respostaJson({ access_token: 'token-falso' })
      : (opcoes.membro ?? respostaJson({ user: { id: '444444444444444441', username: 'fulano' }, roles })),
  );
  setFetch(f.fetch);
  return f;
}

async function iniciar(volta = '/caixa') {
  const res = await login(criarRequisicao(`${APP}/api/auth/login?volta=${volta}`));
  return {
    state: new URL(res.headers.get('location')!).searchParams.get('state')!,
    cookie: valorDoCookie(res, 'stocky_oauth')!,
  };
}

const chamar = (query: string, cookies: Record<string, string> = {}) =>
  callback(criarRequisicao(`${APP}/api/auth/callback?${query}`, { cookies }));

beforeEach(() => aplicarEnvTeste());
afterEach(() => {
  resetContexto();
  limparEnvTeste();
});

describe('WEB-019 callback do OAuth', () => {
  it('AC1: state ausente, diferente, cookie ausente/adulterado nunca chamam o Discord', async () => {
    const f = discordFake([MEMBRO]);
    const { state, cookie } = await iniciar();
    const adulterado = cookie.slice(0, -2) + (cookie.endsWith('AA') ? 'BB' : 'AA');
    const casos: Array<[string, Record<string, string>]> = [
      ['code=c', { stocky_oauth: cookie }],
      [`code=c&state=${state}x`, { stocky_oauth: cookie }],
      [`code=c&state=${state}`, {}],
      [`code=c&state=${state}`, { stocky_oauth: adulterado }],
      [`code=c&state=${state}`, { stocky_oauth: 'lixo' }],
      ['code=c&state=', { stocky_oauth: cookie }],
    ];
    for (const [q, c] of casos) {
      const res = await chamar(q, c);
      expect(res.status, q).toBe(307);
      expect(res.headers.get('location'), q).toBe(`${APP}/login?erro=state`);
      expect(valorDoCookie(res, 'stocky_session') ?? valorDoCookie(res, 'stocky_sessao'), q).toBeUndefined();
    }
    expect(f.chamadas).toHaveLength(0);
  });

  it('AC1: cookie de state expirado é recusado', async () => {
    discordFake([MEMBRO]);
    const { state, cookie } = await iniciar();
    const { vi } = await import('vitest');
    vi.useFakeTimers({ now: Date.now() + 11 * 60_000, toFake: ['Date'] });
    try {
      const res = await chamar(`code=c&state=${state}`, { stocky_oauth: cookie });
      expect(res.headers.get('location')).toBe(`${APP}/login?erro=state`);
    } finally {
      vi.useRealTimers();
    }
  });

  it('um cookie de sessão não serve como cookie de state', async () => {
    const f = discordFake([MEMBRO]);
    const [token] = Object.values(await cookieSessaoTeste());
    const res = await chamar('code=c&state=x', { stocky_oauth: token! });
    expect(res.headers.get('location')).toBe(`${APP}/login?erro=state`);
    expect(f.chamadas).toHaveLength(0);
  });

  it('AC2: error=access_denied ou code ausente voltam ao login com mensagem curta', async () => {
    const f = discordFake([MEMBRO]);
    const { state, cookie } = await iniciar();
    const negado = await chamar(`error=access_denied&state=${state}`, { stocky_oauth: cookie });
    expect(negado.headers.get('location')).toBe(`${APP}/login?erro=negado`);
    const semCode = await chamar(`state=${state}`, { stocky_oauth: cookie });
    expect(semCode.headers.get('location')).toBe(`${APP}/login?erro=negado`);
    expect(f.chamadas).toHaveLength(0);
  });

  it('prompt=none sem consentimento anterior (consent_required) reinicia o login com prompt=consent, uma vez', async () => {
    discordFake([MEMBRO]);
    const { state, cookie } = await iniciar('/painel');
    const res = await chamar(`error=consent_required&state=${state}`, { stocky_oauth: cookie });
    expect(res.headers.get('location')).toBe(`${APP}/api/auth/login?consentimento=1&volta=%2Fpainel`);
    const seguinte = await login(criarRequisicao(res.headers.get('location')!));
    expect(new URL(seguinte.headers.get('location')!).searchParams.get('prompt')).toBe('consent');
  });

  it('AC3: usuário fora do servidor ou sem cargo conhecido não ganha sessão (e a sessão antiga é apagada)', async () => {
    for (const membro of [respostaJson({ code: 10007 }, 404), undefined]) {
      discordFake(['999999999999999999'], { membro });
      const { state, cookie } = await iniciar();
      const velha = await cookieSessaoTeste({ nivel: 2 });
      const res = await chamar(`code=c&state=${state}`, { stocky_oauth: cookie, ...velha });
      expect(res.headers.get('location')).toBe(`${APP}/login?erro=sem_acesso`);
      expect(valorDoCookie(res, 'stocky_sessao')).toBe('');
      const linhas = res.headers.getSetCookie().join('\n');
      expect(linhas).toMatch(/stocky_sessao=; Path=\/; Max-Age=0/);
    }
  });

  it('AC4: sucesso cria sessão com userId e nível, vai para a volta e apaga o cookie de state', async () => {
    const f = discordFake([MEMBRO, DONO]);
    const { state, cookie } = await iniciar('/caixa');
    const res = await chamar(`code=codigo-1&state=${state}`, { stocky_oauth: cookie });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`${APP}/caixa`);
    const sessao = await lerSessao(valorDoCookie(res, 'stocky_sessao'));
    expect(sessao).toMatchObject({ sub: '444444444444444441', nivel: 3, nome: 'fulano' });
    const linhas = res.headers.getSetCookie();
    expect(linhas.find((l) => l.startsWith('stocky_oauth='))).toMatch(/^stocky_oauth=; Path=\/api\/auth; Max-Age=0/);
    expect(linhas.find((l) => l.startsWith('stocky_sessao='))).toMatch(/HttpOnly/);
    expect(f.chamadas.map((c) => c.metodo)).toEqual(['POST', 'GET']);
    expect(new URLSearchParams(f.chamadas[0]!.corpo).get('code')).toBe('codigo-1');
  });

  it('AC4: segunda chamada sem o cookie de state (já apagado) falha e não chama o Discord', async () => {
    const f = discordFake([MEMBRO]);
    const { state, cookie } = await iniciar();
    const primeira = await chamar(`code=c&state=${state}`, { stocky_oauth: cookie });
    expect(primeira.headers.get('location')).toBe(`${APP}/caixa`);
    const antes = f.chamadas.length;
    const segunda = await chamar(`code=c&state=${state}`, {});
    expect(segunda.headers.get('location')).toBe(`${APP}/login?erro=state`);
    expect(f.chamadas.length).toBe(antes);
  });

  it('AC5: volta externa nunca vira redirecionamento externo', async () => {
    discordFake([MEMBRO]);
    for (const volta of ['https://evil.example/x', '//evil.example', '/%2F%2Fevil.example']) {
      const { state, cookie } = await iniciar(encodeURIComponent(volta));
      const res = await chamar(`code=c&state=${state}`, { stocky_oauth: cookie });
      expect(res.headers.get('location'), volta).toBe(`${APP}/`);
    }
    const res = await chamar('state=x&next=https://evil.example', {});
    expect(res.headers.get('location')).toMatch(new RegExp(`^${APP}/`));
  });

  it('AC6: falha do Discord em qualquer etapa dá erro genérico e nenhuma sessão', async () => {
    for (const falha of ['token', 'membro'] as const) {
      const f = criarFakeFetch((c) => {
        const ehToken = c.url.endsWith('/oauth2/token');
        if (falha === 'token' && ehToken) return respostaJson({ error: 'x' }, 500);
        return ehToken ? respostaJson({ access_token: 't' }) : new Error('rede caiu');
      });
      setFetch(f.fetch);
      const { state, cookie } = await iniciar();
      const res = await chamar(`code=c&state=${state}`, { stocky_oauth: cookie });
      expect(res.headers.get('location'), falha).toBe(`${APP}/login?erro=discord`);
      expect(valorDoCookie(res, 'stocky_sessao')).toBeUndefined();
    }
  });

  it('sessão existente do mesmo usuário preserva ini no login', async () => {
    discordFake([MEMBRO]);
    const ini = Date.now() - 3 * 24 * 3600 * 1000;
    const velha = await cookieSessaoTeste({ userId: '444444444444444441', ini });
    const { state, cookie } = await iniciar();
    const res = await chamar(`code=c&state=${state}`, { stocky_oauth: cookie, ...velha });
    expect((await lerSessao(valorDoCookie(res, 'stocky_sessao')))!.ini).toBe(ini);
  });
});
