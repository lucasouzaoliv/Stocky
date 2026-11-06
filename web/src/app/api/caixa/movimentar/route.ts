import { comAutorizacao } from '@/server/auth/autorizacao';
import { movimentarCaixa } from '@/server/caixa/operacoes';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';
import { esquemaMovimentoCaixa, validarCorpo } from '@/server/validacao/corpo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = comAutorizacao({ nivel: 2 }, async ({ corpo, usuario }) => {
  if (!usuario) throw new ErroApp('SEM_SESSAO');
  return responderOk(await movimentarCaixa(validarCorpo(esquemaMovimentoCaixa, corpo), usuario));
});
