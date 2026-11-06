import 'server-only';
import type { CatalogoDTO } from '@/compartilhado/api-tipos';
import { ErroApp } from '../erros';
import { getDb, type Db, type Transaction } from '../firebase';
import { refCatalogo } from '../dominio/refs';
import type { CategoriaCatalogo, DocCatalogo } from '../dominio/tipos';
import { garantirCatalogo } from './semente';

export function lerCatalogoDoc(dados: unknown): DocCatalogo {
  const base = (typeof dados === 'object' && dados !== null ? dados : {}) as Record<string, unknown>;
  if (!Array.isArray(base.categorias)) throw new ErroApp('INTERNO');
  return { categorias: base.categorias as CategoriaCatalogo[], atualizadoEm: String(base.atualizadoEm ?? '') };
}

export async function lerCatalogoTx(tx: Transaction, db: Db): Promise<DocCatalogo> {
  const snap = await tx.get(refCatalogo(db));
  if (!snap.exists) throw new ErroApp('INTERNO');
  return lerCatalogoDoc(snap.data());
}

export async function lerCatalogo(): Promise<CatalogoDTO> {
  await garantirCatalogo();
  const snap = await refCatalogo(getDb()).get();
  if (!snap.exists) throw new ErroApp('INTERNO');
  const doc = lerCatalogoDoc(snap.data());
  return {
    categorias: doc.categorias.map((c) => ({
      id: c.id,
      nome: c.nome,
      emoji: c.emoji,
      itens: c.itens.map((i) => ({ id: i.id, nome: i.nome })),
      total: c.itens.length,
    })),
  };
}
