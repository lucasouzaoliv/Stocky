import { comAutorizacao } from '@/server/auth/autorizacao';
import { depositarVenda } from '@/server/drogas/operacoes';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';
import { esquemaDeposito, validarCorpo } from '@/server/validacao/corpo';
import { publicarEventos } from '@/server/webhooks/eventos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = comAutorizacao({ nivel: 1 }, async ({ corpo, usuario }) => {
  if (!usuario) throw new ErroApp('SEM_SESSAO');
  const r = await depositarVenda(validarCorpo(esquemaDeposito, corpo).valor, usuario);
  publicarEventos(r.eventos);
  return responderOk(r.dto);
});
