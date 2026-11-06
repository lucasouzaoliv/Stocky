import { comAutorizacao, nivelDoBau } from '@/server/auth/autorizacao';
import { removerDoBau } from '@/server/bau/operacoes';
import { exigirTipoBau } from '@/server/dominio/refs';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';
import { esquemaMovimentoBau, validarCorpo } from '@/server/validacao/corpo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = comAutorizacao<{ tipo: string }>({ nivel: nivelDoBau }, async ({ params, corpo, usuario }) => {
  if (!usuario) throw new ErroApp('SEM_SESSAO');
  const dados = validarCorpo(esquemaMovimentoBau, corpo);
  return responderOk(await removerDoBau({ tipo: exigirTipoBau(params.tipo), ...dados }, usuario));
});
