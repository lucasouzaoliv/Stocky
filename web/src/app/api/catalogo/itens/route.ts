import { comAutorizacao } from '@/server/auth/autorizacao';
import { adicionarItemAoCatalogo } from '@/server/catalogo/operacoes';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';
import { esquemaNovoItem, validarCorpo } from '@/server/validacao/corpo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = comAutorizacao({ nivel: 2 }, async ({ corpo, usuario }) => {
  if (!usuario) throw new ErroApp('SEM_SESSAO');
  const { categoriaId, nome } = validarCorpo(esquemaNovoItem, corpo);
  return responderOk(await adicionarItemAoCatalogo(categoriaId, nome, usuario), { status: 201 });
});
