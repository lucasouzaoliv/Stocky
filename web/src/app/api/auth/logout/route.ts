import { anexarCookie, lerCookie } from '@/server/auth/cookies';
import { cookieApagarSessao, lerSessao, nomeCookieSessao } from '@/server/auth/sessao';
import { responderErro, responderOk } from '@/server/http';
import { verificarMutacao } from '@/server/seguranca/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  try {
    const sessao = await lerSessao(lerCookie(req, nomeCookieSessao()));
    verificarMutacao(req, sessao);
    return anexarCookie(responderOk({}), cookieApagarSessao());
  } catch (e) {
    return responderErro(e);
  }
}
