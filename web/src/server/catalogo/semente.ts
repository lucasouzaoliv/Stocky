import 'server-only';
import { getDb } from '../firebase';
import { refBau, refCatalogo, refSaldo } from '../dominio/refs';
import { CATALOGO_PADRAO } from './padrao';

let semeado = false;

export function resetSemente(): void {
  semeado = false;
}

export async function garantirCatalogo(): Promise<void> {
  if (semeado) return;
  const db = getDb();
  await db.runTransaction(async (tx) => {
    const refs = [refCatalogo(db), refBau(db, 'membros'), refBau(db, 'gerencia'), refSaldo(db)] as const;
    const [catalogo, membros, gerencia, saldo] = await Promise.all(refs.map((r) => tx.get(r)));
    const agora = new Date().toISOString();
    if (!catalogo?.exists) {
      tx.create(refs[0], { categorias: structuredClone(CATALOGO_PADRAO), atualizadoEm: agora });
    }
    if (!membros?.exists) tx.create(refs[1], { versao: 0, itens: {}, atualizadoEm: agora });
    if (!gerencia?.exists) tx.create(refs[2], { versao: 0, itens: {}, atualizadoEm: agora });
    if (!saldo?.exists) tx.create(refs[3], { sujo: 0, limpo: 0, versao: 0, atualizadoEm: agora });
  });
  semeado = true;
}
