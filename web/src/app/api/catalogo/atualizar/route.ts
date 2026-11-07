import { comAutorizacao } from '@/server/auth/autorizacao';
import { atualizarCatalogoParaPadrao } from '@/server/catalogo/operacoes';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Gerência e dono (nível 2 ou mais): troca o catálogo pelo padrão atual e apaga dos baús os itens que saíram. */
export const POST = comAutorizacao({ nivel: 2 }, async ({ usuario }) => {
  if (!usuario) throw new ErroApp('SEM_SESSAO');
  return responderOk(await atualizarCatalogoParaPadrao(usuario));
});
