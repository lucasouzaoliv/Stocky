import { comAutorizacao, nivelDoBau } from '@/server/auth/autorizacao';
import { movimentarDroga } from '@/server/drogas/operacoes';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';
import { esquemaDroga, validarCorpo } from '@/server/validacao/corpo';
import { publicarEventos } from '@/server/webhooks/eventos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = comAutorizacao<{ tipo: string }>({ nivel: nivelDoBau }, async ({ params, corpo, usuario }) => {
  if (!usuario) throw new ErroApp('SEM_SESSAO');
  const r = await movimentarDroga({ tipo: params.tipo, ...validarCorpo(esquemaDroga, corpo) }, usuario);
  publicarEventos(r.eventos);
  return responderOk(r.dto);
});
