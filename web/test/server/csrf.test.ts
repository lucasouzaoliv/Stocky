import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lerSessao } from '@/server/auth/sessao';
import { tokenCsrf, verificarMutacao } from '@/server/seguranca/csrf';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { criarRequisicao } from '../helpers/requisicao';
import { tokenSessaoTeste } from '../helpers/sessao-teste';

const APP = 'https://stocky-teste.vercel.app';
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
