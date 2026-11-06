import { comAutorizacao } from '@/server/auth/autorizacao';
import { removerItemDoCatalogoComEvento } from '@/server/catalogo/operacoes';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';
import { ehIdDeFormatoValido } from '@/server/validacao/item';
import { publicarEventos } from '@/server/webhooks/eventos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Exclusiva do dono (nível 3): a gerência recebe 403 antes de qualquer leitura ou escrita. */
export const DELETE = comAutorizacao<{ categoriaId: string; itemId: string }>(
  { nivel: 3 },
  async ({ params, usuario }) => {
    if (!usuario) throw new ErroApp('SEM_SESSAO');
    if (!ehIdDeFormatoValido(params.categoriaId) || !ehIdDeFormatoValido(params.itemId)) throw new ErroApp('VALIDACAO', 'Item inválido.');
    const r = await removerItemDoCatalogoComEvento(params.categoriaId, params.itemId, usuario);
    publicarEventos(r.eventos);
    return responderOk(r.dto);
  },
);
