import { SignJWT, decodeJwt } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSAO_DURACAO_MS } from '@/compartilhado/limites';
import { serializarCookie } from '@/server/auth/cookies';
import {
  cookieApagarSessao,
  cookieSessao,
  criarTokenSessao,
  estadoSessao,
  lerSessao,
  nomeCookieSessao,
} from '@/server/auth/sessao';
import { aplicarEnvTeste, ENV_TESTE, limparEnvTeste } from '../helpers/env-teste';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ_WEB } from '../helpers/arquivos';

const dados = { userId: '444444444444444441', nome: 'Fulano', nivel: 2 as const };

beforeEach(() => aplicarEnvTeste());
afterEach(() => {
  vi.useRealTimers();
  limparEnvTeste();
});

describe('WEB-015 sessão', () => {
  it('AC1: cookie em produção tem HttpOnly, Secure, SameSite=Lax, Path=/ e Max-Age de 7 dias', async () => {
    aplicarEnvTeste({ NODE_ENV: 'production' });
    const c = cookieSessao(await criarTokenSessao(dados));
    const linha = serializarCookie(c);
    expect(c.name).toBe('__Host-stocky_sessao');
    expect(linha).toMatch(/; HttpOnly/);
    expect(linha).toMatch(/; Secure/);
    expect(linha).toMatch(/; SameSite=Lax/);
    expect(linha).toMatch(/; Path=\//);
    expect(linha).not.toMatch(/Domain=/);
    expect(c.maxAge).toBe(SESSAO_DURACAO_MS / 1000);
  });

  it('AC1: fora de produção o nome não tem prefixo e Secure é omitido', async () => {
    const c = cookieSessao(await criarTokenSessao(dados));
    expect(c.name).toBe('stocky_sessao');
    expect(nomeCookieSessao()).toBe('stocky_sessao');
    expect(serializarCookie(c)).not.toMatch(/Secure/);
  });

  it('cookieApagarSessao usa o mesmo nome e Path com Max-Age=0', () => {
    const c = cookieApagarSessao();
    expect(c).toMatchObject({ name: nomeCookieSessao(), path: '/', maxAge: 0, value: '' });
    expect(serializarCookie(c)).toContain('Max-Age=0');
  });

  it('ida e volta: lerSessao devolve os dados, sid de 128 bits e exp absoluto de 7 dias', async () => {
    const t0 = Date.now();
    const s = await lerSessao(await criarTokenSessao(dados));
    expect(s).toMatchObject({ sub: dados.userId, nome: 'Fulano', nivel: 2 });
    expect(Buffer.from(s!.sid, 'base64url')).toHaveLength(16);
    expect(s!.cv).toBeGreaterThanOrEqual(t0);
    expect(s!.exp).toBe(Math.floor((s!.ini + SESSAO_DURACAO_MS) / 1000) * 1000);
    const outro = await lerSessao(await criarTokenSessao(dados));
    expect(outro!.sid).not.toBe(s!.sid);
  });

  it('AC2: ausente, vazio e lixo viram null sem lançar', async () => {
    for (const t of [undefined, '', 'abc', 'a.b.c', '....']) expect(await lerSessao(t)).toBeNull();
  });

  it('AC2: um byte alterado na assinatura ou no payload é rejeitado', async () => {
    const token = await criarTokenSessao(dados);
    const [h, p, s] = token.split('.') as [string, string, string];
    // troca um caractere do MEIO: o último base64url tem bits de preenchimento e 'A'/'B' podem decodificar igual
    const troca = (x: string) => {
      const i = Math.floor(x.length / 2);
      return x.slice(0, i) + (x[i] === 'A' ? 'B' : 'A') + x.slice(i + 1);
    };
    expect(await lerSessao([h, p, troca(s)].join('.'))).toBeNull();
    expect(await lerSessao([h, troca(p), s].join('.'))).toBeNull();
  });

  it('AC2: assinado com outro segredo é rejeitado', async () => {
    const token = await criarTokenSessao(dados);
    aplicarEnvTeste({ SESSION_SECRET: 'outro-segredo-falso-com-mais-de-32-caracteres!' });
    expect(await lerSessao(token)).toBeNull();
  });

  it('AC2: expirado é rejeitado (relógio simulado, 7 dias absolutos)', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-05T12:00:00Z') });
    const token = await criarTokenSessao(dados);
    vi.setSystemTime(Date.now() + SESSAO_DURACAO_MS - 60_000);
    expect(await lerSessao(token)).not.toBeNull();
    vi.setSystemTime(Date.now() + 120_000);
    expect(await lerSessao(token)).toBeNull();
  });

  it('AC2: alg none e HS384 são rejeitados', async () => {
    const corpo = { sub: 'x', nome: 'n', nivel: 3, sid: 's', ini: Date.now(), cv: Date.now() };
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 600;
    expect(await lerSessao(`${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...corpo, exp })}.`)).toBeNull();
    const hs384 = await new SignJWT(corpo)
      .setProtectedHeader({ alg: 'HS384' })
      .setExpirationTime(exp)
      .sign(new TextEncoder().encode(ENV_TESTE.SESSION_SECRET));
    expect(await lerSessao(hs384)).toBeNull();
  });

  it('rejeita token assinado com o segredo certo mas de forma inválida (nível 0 ou 9, sem sid)', async () => {
    const chave = new TextEncoder().encode(ENV_TESTE.SESSION_SECRET);
    const assinar = (p: Record<string, unknown>) =>
      new SignJWT(p).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(chave);
    const base = { sub: 'x', nome: 'n', nivel: 1, sid: 's', ini: 1, cv: 1 };
    expect(await lerSessao(await assinar(base))).not.toBeNull();
    for (const ruim of [{ nivel: 0 }, { nivel: 9 }, { nivel: '2' }, { sid: undefined }, { sub: '' }, { cv: 'x' }]) {
      expect(await lerSessao(await assinar({ ...base, ...ruim })), JSON.stringify(ruim)).toBeNull();
    }
  });

  it('AC4: o payload não contém access_token, client_secret nem cargos brutos', async () => {
    const token = await criarTokenSessao(dados);
    const decodificado = JSON.stringify(decodeJwt(token));
    expect(Object.keys(decodeJwt(token)).sort()).toEqual(['cv', 'exp', 'ini', 'nivel', 'nome', 'sid', 'sub']);
    for (const proibido of ['access_token', 'refresh_token', 'client_secret', 'roles', ENV_TESTE.DISCORD_CLIENT_SECRET!]) {
      expect(decodificado).not.toContain(proibido);
    }
  });

  it('AC5: sem SESSION_SECRET válido criar sessão lança e ler devolve null', async () => {
    const token = await criarTokenSessao(dados);
    aplicarEnvTeste({ SESSION_SECRET: undefined });
    await expect(criarTokenSessao(dados)).rejects.toThrow(/SESSION_SECRET/);
    aplicarEnvTeste({ SESSION_SECRET: 'curto' });
    await expect(criarTokenSessao(dados)).rejects.toThrow(/SESSION_SECRET/);
    expect(await lerSessao(token)).toBeNull();
  });

  it('não cria sessão com ini já vencido (7 dias absolutos) nem com nível inválido', async () => {
    await expect(criarTokenSessao({ ...dados, ini: Date.now() - SESSAO_DURACAO_MS - 1000 })).rejects.toBeTruthy();
    await expect(criarTokenSessao({ ...dados, nivel: 0 as never })).rejects.toBeTruthy();
  });

  it('ini informado é preservado e o Max-Age diminui (revalidar não estende)', async () => {
    const ini = Date.now() - 24 * 3600 * 1000;
    const token = await criarTokenSessao({ ...dados, ini });
    expect((await lerSessao(token))!.ini).toBe(ini);
    expect(cookieSessao(token).maxAge).toBeLessThanOrEqual(6 * 24 * 3600);
  });

  it('estadoSessao: ok dentro de 12 h, revalidar depois', async () => {
    const s = (await lerSessao(await criarTokenSessao(dados)))!;
    expect(estadoSessao(s, s.cv + 1000)).toBe('ok');
    expect(estadoSessao(s, s.cv + 13 * 60 * 60_000)).toBe('revalidar');
  });

  it('AC3: o código de sessão não compara assinatura com === (usa a biblioteca)', () => {
    const fonte = readFileSync(join(RAIZ_WEB, 'src/server/auth/sessao.ts'), 'utf8');
    expect(fonte).toContain('jwtVerify');
    expect(fonte).not.toMatch(/signature\s*===|assinatura\s*===/);
  });
});
