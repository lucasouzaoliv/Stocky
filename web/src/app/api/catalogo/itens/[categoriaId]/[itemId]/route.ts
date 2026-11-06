import { comAutorizacao } from '@/server/auth/autorizacao';
import { removerItemDoCatalogo } from '@/server/catalogo/operacoes';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';
import { ehIdSeguro } from '@/server/validacao/item';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Exclusiva do dono (nível 3): a gerência recebe 403 antes de qualquer leitura ou escrita. */
export const DELETE = comAutorizacao<{ categoriaId: string; itemId: string }>(
  { nivel: 3 },
  async ({ params, usuario }) => {
    if (!usuario) throw new ErroApp('SEM_SESSAO');
    if (!ehIdSeguro(params.categoriaId) || !ehIdSeguro(params.itemId)) throw new ErroApp('VALIDACAO', 'Item inválido.');
    return responderOk(await removerItemDoCatalogo(params.categoriaId, params.itemId, usuario));
  },
);
