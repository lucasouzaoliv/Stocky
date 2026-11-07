import { comAutorizacao } from '@/server/auth/autorizacao';
import { atualizarCatalogoParaPadrao } from '@/server/catalogo/operacoes';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Exclusiva do dono (nível 3): troca o catálogo pelo padrão atual e apaga dos baús os itens que saíram. */
export const POST = comAutorizacao({ nivel: 3 }, async ({ usuario }) => {
  if (!usuario) throw new ErroApp('SEM_SESSAO');
  return responderOk(await atualizarCatalogoParaPadrao(usuario));
});
