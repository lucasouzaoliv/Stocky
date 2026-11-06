import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { tokenCsrf } from '../seguranca/csrf';
import type { NivelAcesso, UsuarioSessao } from '../dominio/tipos';
import { estadoSessao, lerSessao, nomeCookieSessao } from './sessao';

export type EstadoPagina =
  | { estado: 'ok'; usuario: UsuarioSessao; csrf: string }
  | { estado: 'sem_sessao' }
  | { estado: 'revalidar' };

export async function obterUsuarioPagina(): Promise<EstadoPagina> {
  const jar = await cookies();
  const sessao = await lerSessao(jar.get(nomeCookieSessao())?.value);
  if (!sessao) return { estado: 'sem_sessao' };
  if (estadoSessao(sessao, Date.now()) === 'revalidar') return { estado: 'revalidar' };
  return {
    estado: 'ok',
    usuario: { id: sessao.sub, nome: sessao.nome, nivel: sessao.nivel },
    csrf: tokenCsrf(sessao.sid),
  };
}

export async function exigirPagina(
  nivel: NivelAcesso,
  caminho: string,
): Promise<{ usuario: UsuarioSessao; csrf: string } | { semPermissao: true; usuario: UsuarioSessao; csrf: string }> {
  const e = await obterUsuarioPagina();
  if (e.estado === 'sem_sessao') redirect('/login');
  if (e.estado === 'revalidar') redirect(`/api/auth/login?volta=${encodeURIComponent(caminho)}`);
  if (e.estado !== 'ok') throw new Error('estado de página inesperado');
  const base = { usuario: e.usuario, csrf: e.csrf };
  return e.usuario.nivel >= nivel ? base : { semPermissao: true, ...base };
}
