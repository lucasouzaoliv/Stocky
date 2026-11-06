import { obterUsuarioPagina } from '@/server/auth/pagina';

/** Único ponto da tela de login que consulta a sessão no servidor (nunca toca o Firestore). */
export async function haSessaoValida(): Promise<boolean> {
  const estado = await obterUsuarioPagina();
  return estado.estado === 'ok';
}
