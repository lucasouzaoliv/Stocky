import { rotaPublica } from '@/server/auth/autorizacao';
import { anexarCookie, lerCookie } from '@/server/auth/cookies';
import { NOME_COOKIE_STATE, concluirLogin, cookieApagarState, type ResultadoLogin } from '@/server/auth/oauth';
import { cookieApagarSessao, cookieSessao, lerSessao, nomeCookieSessao } from '@/server/auth/sessao';
import { getEnv } from '@/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirecionar(caminho: string): Response {
  return new Response(null, {
    status: 307,
    headers: { Location: `${getEnv().appUrl}${caminho}`, 'Cache-Control': 'no-store' },
  });
}

function destino(r: ResultadoLogin): string {
  if (r.ok) return r.volta;
  if (r.erro === 'consentimento') return `/api/auth/login?consentimento=1&volta=${encodeURIComponent(r.volta ?? '/')}`;
  return `/login?erro=${r.erro}`;
}

export const GET = rotaPublica(async (req) => {
  let resultado: ResultadoLogin;
  try {
    const sessaoAtual = await lerSessao(lerCookie(req, nomeCookieSessao()));
    resultado = await concluirLogin(new URL(req.url), lerCookie(req, NOME_COOKIE_STATE), sessaoAtual);
  } catch {
    resultado = { ok: false, erro: 'discord' };
  }
  const res = redirecionar(destino(resultado));
  anexarCookie(res, cookieApagarState());
  if (resultado.ok) anexarCookie(res, cookieSessao(resultado.token));
  else if (resultado.encerrarSessao) anexarCookie(res, cookieApagarSessao());
  return res;
});
