import { comAutorizacao, nivelDoBau } from '@/server/auth/autorizacao';
import { removerDoBauComEvento } from '@/server/bau/operacoes';
import { exigirTipoBau } from '@/server/dominio/refs';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';
import { esquemaMovimentoBau, validarCorpo } from '@/server/validacao/corpo';
import { publicarEventos } from '@/server/webhooks/eventos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = comAutorizacao<{ tipo: string }>({ nivel: nivelDoBau }, async ({ params, corpo, usuario }) => {
  if (!usuario) throw new ErroApp('SEM_SESSAO');
  const dados = validarCorpo(esquemaMovimentoBau, corpo);
  const r = await removerDoBauComEvento({ tipo: exigirTipoBau(params.tipo), ...dados }, usuario);
  publicarEventos(r.eventos);
  return responderOk(r.dto);
});
