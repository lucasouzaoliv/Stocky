import { comAutorizacao, nivelDoBau } from '@/server/auth/autorizacao';
import { lerEstadoDroga } from '@/server/drogas/operacoes';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = comAutorizacao<{ tipo: string }>({ nivel: nivelDoBau }, async ({ params, usuario }) => {
  if (!usuario) throw new ErroApp('SEM_SESSAO');
  return responderOk(await lerEstadoDroga(params.tipo, usuario.id));
});
