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
  filtro?: { campo: string; valor: string },
): Promise<Pagina<T>> {
  if (filtro) return await lerPaginaFiltrada(colecao, p, mapear, filtro);
  const base = colecao;
  let consulta = base.orderBy('data', 'desc');
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

/** Teto de documentos lidos no filtro por campo (sem índice composto): a auditoria é pequena. */
const TETO_FILTRO = 1000;

/**
 * Filtro por igualdade sem exigir índice composto no Firestore: lê só pelo campo filtrado,
 * ordena por `data` decrescente em memória (id como desempate) e pagina pelo id do cursor.
 */
async function lerPaginaFiltrada<T>(
  colecao: CollectionReference,
  p: Paginacao,
  mapear: (id: string, dados: Record<string, unknown>) => T,
  filtro: { campo: string; valor: string },
): Promise<Pagina<T>> {
  const res = await colecao.where(filtro.campo, '==', filtro.valor).limit(TETO_FILTRO).get();
  const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
  const todos = res.docs
    .map((d) => ({ id: d.id, dados: d.data() as Record<string, unknown> }))
    .sort((x, y) => texto(y.dados.data).localeCompare(texto(x.dados.data)) || y.id.localeCompare(x.id));
  let inicio = 0;
  if (p.cursor !== null) {
    const pos = todos.findIndex((d) => d.id === p.cursor);
    if (pos < 0) throw new ErroApp('VALIDACAO', 'Cursor inválido.');
    inicio = pos + 1;
  }
  const fatia = todos.slice(inicio, inicio + p.limite);
  const ultimo = fatia[fatia.length - 1];
  return {
    itens: fatia.map((d) => mapear(d.id, d.dados)),
    proximoCursor: inicio + p.limite < todos.length && ultimo ? ultimo.id : null,
  };
}
