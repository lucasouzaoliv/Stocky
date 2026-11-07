import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REVALIDACAO_MS } from '@/compartilhado/limites';
import { precisaRevalidar } from '@/server/auth/revalidacao';
import { criarTokenSessao, estadoSessao, lerSessao } from '@/server/auth/sessao';
import { concluirLogin, iniciarLogin } from '@/server/auth/oauth';
import { resetContexto, setFetch } from '@/server/contexto';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { criarFakeFetch, respostaJson } from '../helpers/fake-fetch';
import { SESSAO_DURACAO_MS } from '@/compartilhado/limites';

beforeEach(() => {
  aplicarEnvTeste();
  vi.useFakeTimers({ now: new Date('2026-11-05T12:00:00Z'), toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  resetContexto();
  limparEnvTeste();
});

describe('WEB-020 revalidação', () => {
  it('AC4: o intervalo é a constante de 12 horas', () => {
    expect(REVALIDACAO_MS).toBe(12 * 60 * 60 * 1000);
  });

  it('AC1: 11:59 aceita, 12:01 pede revalidação, sem chamar o Discord', async () => {
    const f = criarFakeFetch(() => respostaJson({}));
    setFetch(f.fetch);
    const s = (await lerSessao(await criarTokenSessao({ userId: '1', nome: 'a', nivel: 1 })))!;
    expect(estadoSessao(s, s.cv + 11 * 60 * 60_000 + 59 * 60_000)).toBe('ok');
    expect(estadoSessao(s, s.cv + REVALIDACAO_MS)).toBe('ok');
    expect(estadoSessao(s, s.cv + 12 * 60 * 60_000 + 1000)).toBe('revalidar');
    expect(precisaRevalidar(s, s.cv + REVALIDACAO_MS + 1)).toBe(true);
    expect(f.chamadas).toHaveLength(0);
  });

  async function revalidar(roles: string[], sessaoAntiga: Awaited<ReturnType<typeof lerSessao>>) {
    const f = criarFakeFetch((c) =>
      c.url.endsWith('/oauth2/token')
        ? respostaJson({ access_token: 'token-falso' })
        : respostaJson({ user: { id: '1', username: 'u' }, roles }),
    );
    setFetch(f.fetch);
    const { url, cookieState } = await iniciarLogin('/caixa');
    const state = new URL(url).searchParams.get('state')!;
    return await concluirLogin(
      new URL(`https://x/api/auth/callback?code=c&state=${state}`),
      cookieState.value,
      sessaoAntiga,
    );
  }

  it('AC3: nível rebaixado vale na sessão nova; ini (7 dias absolutos) é preservado', async () => {
    const ini = Date.now() - 2 * 24 * 3600 * 1000;
    const antiga = (await lerSessao(await criarTokenSessao({ userId: '1', nome: 'a', nivel: 3, ini })))!;
    vi.setSystemTime(Date.now() + 20 * 60_000);
    const r = await revalidar(['333333333333333331'], antiga);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nova = (await lerSessao(r.token))!;
    expect(nova.nivel).toBe(1);
    expect(nova.ini).toBe(ini);
    expect(nova.exp).toBe(antiga.exp);
    expect(nova.cv).toBeGreaterThan(antiga.cv);
    expect(estadoSessao(nova, Date.now())).toBe('ok');
    expect(nova.exp - nova.ini).toBe(Math.floor(SESSAO_DURACAO_MS / 1000) * 1000);
  });

  it('AC3: caiu para nível 0 encerra a sessão (sem_acesso + encerrarSessao)', async () => {
    const antiga = (await lerSessao(await criarTokenSessao({ userId: '1', nome: 'a', nivel: 2 })))!;
    const r = await revalidar(['999999999999999999'], antiga);
    expect(r).toMatchObject({ ok: false, erro: 'sem_acesso', encerrarSessao: true });
  });

  it('sessão de outro usuário não empresta o ini', async () => {
    const ini = Date.now() - 3 * 24 * 3600 * 1000;
    const antiga = (await lerSessao(await criarTokenSessao({ userId: '999', nome: 'z', nivel: 3, ini })))!;
    const r = await revalidar(['333333333333333331'], antiga);
    expect(r.ok && (await lerSessao(r.token))!.ini).not.toBe(ini);
  });
});
