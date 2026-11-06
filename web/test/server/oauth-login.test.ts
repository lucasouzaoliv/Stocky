import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/auth/login/route';
import { caminhoVoltaSeguro, iniciarLogin, NOME_COOKIE_STATE } from '@/server/auth/oauth';
import { serializarCookie } from '@/server/auth/cookies';
import { aplicarEnvTeste, ENV_TESTE, limparEnvTeste } from '../helpers/env-teste';
import { criarRequisicao, cookiesDaResposta } from '../helpers/requisicao';

beforeEach(() => aplicarEnvTeste());
afterEach(() => limparEnvTeste());

describe('WEB-016 início do OAuth', () => {
  it('AC1/AC2: 307 para o authorize com os 5 parâmetros mais prompt=none e redirect_uri do APP_URL', async () => {
    const res = await GET(
      criarRequisicao('http://host-malicioso.example/api/auth/login', { headers: { host: 'host-malicioso.example' } }),
    );
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(`${loc.origin}${loc.pathname}`).toBe('https://discord.com/oauth2/authorize');
    expect([...loc.searchParams.keys()].sort()).toEqual(
      ['client_id', 'prompt', 'redirect_uri', 'response_type', 'scope', 'state'],
    );
    expect(loc.searchParams.get('client_id')).toBe(ENV_TESTE.DISCORD_CLIENT_ID);
    expect(loc.searchParams.get('redirect_uri')).toBe('https://stocky-teste.vercel.app/api/auth/callback');
    expect(loc.searchParams.get('response_type')).toBe('code');
    expect(loc.searchParams.get('scope')).toBe('identify guilds.members.read');
    expect(loc.searchParams.get('prompt')).toBe('none');
  });

  it('AC3: state com 256 bits, diferente a cada chamada; cookie httpOnly, Lax, ≤ 10 min, Secure em produção', async () => {
    const a = await iniciarLogin('/');
    const b = await iniciarLogin('/');
    const sa = new URL(a.url).searchParams.get('state')!;
    const sb = new URL(b.url).searchParams.get('state')!;
    expect(Buffer.from(sa, 'base64url').length).toBeGreaterThanOrEqual(16);
    expect(Buffer.from(sa, 'base64url')).toHaveLength(32);
    expect(sa).not.toBe(sb);
    const linha = serializarCookie(a.cookieState);
    expect(a.cookieState.name).toBe(NOME_COOKIE_STATE);
    expect(linha).toMatch(/HttpOnly/);
    expect(linha).toMatch(/SameSite=Lax/);
    expect(linha).toMatch(/Path=\/api\/auth/);
    expect(a.cookieState.maxAge).toBeLessThanOrEqual(600);
    expect(linha).not.toMatch(/Secure/);

    aplicarEnvTeste({ NODE_ENV: 'production' });
    expect(serializarCookie((await iniciarLogin('/')).cookieState)).toMatch(/Secure/);
  });

  it('o cookie de state sai na resposta da rota e não contém o state em texto puro nem segredo', async () => {
    const res = await GET(criarRequisicao('https://stocky-teste.vercel.app/api/auth/login?volta=/caixa'));
    const [linha] = cookiesDaResposta(res);
    expect(linha).toMatch(/^stocky_oauth=/);
    const state = new URL(res.headers.get('location')!).searchParams.get('state')!;
    const payload = Buffer.from(linha!.split('=')[1]!.split('.')[1]!, 'base64url').toString();
    expect(JSON.parse(payload)).toMatchObject({ tp: 'state', state, volta: '/caixa' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('AC4: client_secret não aparece na URL nem no cookie', async () => {
    const { url, cookieState } = await iniciarLogin('/');
    expect(url).not.toContain(ENV_TESTE.DISCORD_CLIENT_SECRET!);
    expect(url).not.toMatch(/secret/i);
    expect(cookieState.value).not.toContain(ENV_TESTE.DISCORD_CLIENT_SECRET!);
  });

  it('consentimento=1 troca prompt=none por prompt=consent', async () => {
    const res = await GET(criarRequisicao('https://stocky-teste.vercel.app/api/auth/login?consentimento=1'));
    expect(new URL(res.headers.get('location')!).searchParams.get('prompt')).toBe('consent');
  });

  it('volta só aceita caminhos internos conhecidos', () => {
    expect(caminhoVoltaSeguro('/caixa')).toBe('/caixa');
    for (const ruim of ['https://evil.example', '//evil.example', '/\\evil', '/caixa?x=1', '/outra', '', null, undefined, 5]) {
      expect(caminhoVoltaSeguro(ruim), String(ruim)).toBe('/');
    }
  });

  it('sem configuração válida a rota responde erro sem redirecionar', async () => {
    aplicarEnvTeste({ SESSION_SECRET: undefined });
    const res = await GET(criarRequisicao('https://stocky-teste.vercel.app/api/auth/login'));
    expect(res.status).toBe(500);
    expect(res.headers.get('location')).toBeNull();
  });
});
