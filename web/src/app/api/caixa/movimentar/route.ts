import { comAutorizacao } from '@/server/auth/autorizacao';
import { movimentarCaixaComEvento } from '@/server/caixa/operacoes';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';
import { esquemaMovimentoCaixa, validarCorpo } from '@/server/validacao/corpo';
import { publicarEventos } from '@/server/webhooks/eventos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = comAutorizacao({ nivel: 2 }, async ({ corpo, usuario }) => {
  if (!usuario) throw new ErroApp('SEM_SESSAO');
  const r = await movimentarCaixaComEvento(validarCorpo(esquemaMovimentoCaixa, corpo), usuario);
  publicarEventos(r.eventos);
  return responderOk(r.dto);
});
