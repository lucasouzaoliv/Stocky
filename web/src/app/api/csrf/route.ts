import { comAutorizacao } from '@/server/auth/autorizacao';
import { lerCookie } from '@/server/auth/cookies';
import { lerSessao, nomeCookieSessao } from '@/server/auth/sessao';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';
import { tokenCsrf } from '@/server/seguranca/csrf';
import type { CsrfDTO } from '@/compartilhado/api-tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = comAutorizacao({ nivel: 1 }, async ({ req }) => {
  const sessao = await lerSessao(lerCookie(req, nomeCookieSessao()));
  if (!sessao) throw new ErroApp('SEM_SESSAO');
  const dados: CsrfDTO = { csrf: tokenCsrf(sessao.sid) };
  return responderOk(dados);
});
