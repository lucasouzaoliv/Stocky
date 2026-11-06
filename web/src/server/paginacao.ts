import 'server-only';
import { LIMITES } from '@/compartilhado/limites';
import { parseInteiro } from '@/compartilhado/numero';
import type { Pagina } from '@/compartilhado/api-tipos';
import { ErroApp } from './erros';
import type { CollectionReference } from './firebase';
import { ehIdDocumento } from './validacao/item';

export type { Pagina };

export interface Paginacao {
  limite: number;
  cursor: string | null;
}

export const LIMITE_PADRAO = 20;

/** `limite` de 1 a 100 (padrão 20) e `cursor` com cara de id do Firestore; fora disso é 400, nunca ajuste silencioso. */
export function lerPaginacao(sp: URLSearchParams): Paginacao {
  const bruto = sp.get('limite');
  let limite = LIMITE_PADRAO;
  if (bruto !== null) {
    const r = parseInteiro(bruto, { min: 1, max: LIMITES.PAGINA_MAX });
    if (!r.ok) throw new ErroApp('VALIDACAO', `Limite inválido. Use um número de 1 a ${LIMITES.PAGINA_MAX}.`);
    limite = r.valor;
  }
  const cursor = sp.get('cursor');
  if (cursor !== null && !ehIdDocumento(cursor)) throw new ErroApp('VALIDACAO', 'Cursor inválido.');
  return { limite, cursor };
}

/** Página por `data` decrescente; o cursor é o id do último documento devolvido. Cursor inexistente é 400. */
export async function lerPaginaPorData<T>(
  colecao: CollectionReference,
  p: Paginacao,
  mapear: (id: string, dados: Record<string, unknown>) => T,
): Promise<Pagina<T>> {
  let consulta = colecao.orderBy('data', 'desc');
  if (p.cursor !== null) {
    const ancora = await colecao.doc(p.cursor).get();
    if (!ancora.exists) throw new ErroApp('VALIDACAO', 'Cursor inválido.');
    consulta = consulta.startAfter(ancora);
  }
  const res = await consulta.limit(p.limite + 1).get();
  const docs = res.docs.slice(0, p.limite);
  const itens = docs.map((d) => mapear(d.id, d.data() as Record<string, unknown>));
  const ultimo = docs[docs.length - 1];
  return { itens, proximoCursor: res.docs.length > p.limite && ultimo ? ultimo.id : null };
}
