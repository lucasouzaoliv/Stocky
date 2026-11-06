import { lerSessao } from '@/server/auth/sessao';
import { tokenCsrf } from '@/server/seguranca/csrf';
import { criarRequisicao } from './requisicao';
import { cookieSessaoTeste } from './sessao-teste';
import type { NivelAcesso } from '@/server/dominio/tipos';

export const APP = 'https://stocky-teste.vercel.app';

export type PerfilTeste = 'anonimo' | 'adulterado' | NivelAcesso;

export interface PedidoTeste {
  metodo?: string;
  caminho?: string;
  perfil: PerfilTeste;
  csrf?: 'certo' | 'ausente' | 'errado';
  origin?: string | null;
  corpo?: unknown;
  headers?: Record<string, string>;
  userId?: string;
}

/** Monta uma requisição com o perfil pedido; mutações recebem Origin e token CSRF certos por padrão. */
export async function montarPedido(p: PedidoTeste): Promise<Request> {
  const metodo = p.metodo ?? 'GET';
  const mutacao = metodo !== 'GET';
  let cookies: Record<string, string> = {};
  let sid: string | null = null;
  if (typeof p.perfil === 'number') {
    cookies = await cookieSessaoTeste({ nivel: p.perfil, userId: p.userId });
    sid = (await lerSessao(Object.values(cookies)[0]))!.sid;
  } else if (p.perfil === 'adulterado') {
    const real = Object.values(await cookieSessaoTeste({ nivel: 3 }))[0]!;
    const nome = Object.keys(await cookieSessaoTeste())[0]!;
    cookies = { [nome]: real.slice(0, -3) + (real.endsWith('AAA') ? 'BBB' : 'AAA') };
  }
  const headers: Record<string, string> = { ...p.headers };
  if (mutacao) {
    if (p.origin !== null) headers.origin = p.origin ?? APP;
    const modo = p.csrf ?? 'certo';
    if (modo === 'certo' && sid) headers['x-csrf-token'] = tokenCsrf(sid);
    if (modo === 'errado') headers['x-csrf-token'] = 'token-errado';
  }
  return criarRequisicao(`${APP}${p.caminho ?? '/api/teste'}`, {
    metodo,
    cookies,
    headers,
    corpo: mutacao ? (p.corpo ?? {}) : undefined,
  });
}
