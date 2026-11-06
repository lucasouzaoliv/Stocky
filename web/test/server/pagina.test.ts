import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REVALIDACAO_MS } from '@/compartilhado/limites';
import { tokenCsrf } from '@/server/seguranca/csrf';
import { lerSessao, nomeCookieSessao } from '@/server/auth/sessao';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { tokenSessaoTeste } from '../helpers/sessao-teste';

let cookieAtual: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === nomeCookieSessao() && cookieAtual ? { value: cookieAtual } : undefined) }),
}));
vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));

const carregar = async () => await import('@/server/auth/pagina');

beforeEach(() => {
  aplicarEnvTeste();
  cookieAtual = undefined;
});
afterEach(() => {
  vi.useRealTimers();
  limparEnvTeste();
});

describe('WEB-020 guarda de página', () => {
  it('sem cookie: sem_sessao e exigirPagina vai para /login', async () => {
    const { obterUsuarioPagina, exigirPagina } = await carregar();
    expect(await obterUsuarioPagina()).toEqual({ estado: 'sem_sessao' });
    await expect(exigirPagina(1, '/caixa')).rejects.toThrow('REDIRECT:/login');
  });

  it('sessão válida: devolve usuário e token csrf derivado do sid', async () => {
    const { obterUsuarioPagina } = await carregar();
    cookieAtual = await tokenSessaoTeste({ nivel: 2, nome: 'Ana' });
    const e = await obterUsuarioPagina();
    const sessao = (await lerSessao(cookieAtual))!;
    expect(e).toEqual({
      estado: 'ok',
      usuario: { id: '444444444444444441', nome: 'Ana', nivel: 2 },
      csrf: tokenCsrf(sessao.sid),
    });
  });

  it('passou de 15 min: revalidar, e exigirPagina redireciona ao login silencioso com a volta codificada', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-05T12:00:00Z'), toFake: ['Date'] });
    const { obterUsuarioPagina, exigirPagina } = await carregar();
    cookieAtual = await tokenSessaoTeste({ nivel: 3 });
    vi.setSystemTime(Date.now() + REVALIDACAO_MS + 1000);
    expect(await obterUsuarioPagina()).toEqual({ estado: 'revalidar' });
    await expect(exigirPagina(1, '/bau/membros')).rejects.toThrow('REDIRECT:/api/auth/login?volta=%2Fbau%2Fmembros');
  });

  it('nível insuficiente devolve semPermissao, suficiente devolve o usuário', async () => {
    const { exigirPagina } = await carregar();
    cookieAtual = await tokenSessaoTeste({ nivel: 1 });
    expect(await exigirPagina(2, '/caixa')).toMatchObject({ semPermissao: true, usuario: { nivel: 1 } });
    const ok = await exigirPagina(1, '/bau/membros');
    expect(ok).not.toHaveProperty('semPermissao');
  });
});
