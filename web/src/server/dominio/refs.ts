import 'server-only';
import { ErroApp } from '../erros';
import type { CollectionReference, Db, DocumentReference } from '../firebase';
import { ehIdSeguro } from '../validacao/item';
import type { AlvoZerar, ChaveMensagem, DocBau, DocSaldo, EscopoLog, TipoBau } from './tipos';

const TIPOS_BAU: readonly string[] = ['membros', 'gerencia'];
const CHAVES_MENSAGEM: readonly string[] = ['inventario_membros', 'inventario_gerencia', 'saldo_caixa'];

export function exigirTipoBau(v: unknown): TipoBau {
  if (typeof v === 'string' && TIPOS_BAU.includes(v)) return v as TipoBau;
  throw new ErroApp('VALIDACAO', 'Tipo de baú inválido.');
}

export function exigirAlvoZerar(v: unknown): AlvoZerar {
  if (v === 'ambos') return 'ambos';
  if (typeof v === 'string' && TIPOS_BAU.includes(v)) return v as TipoBau;
  throw new ErroApp('VALIDACAO', 'Alvo inválido.');
}

export function exigirEscopoLog(v: unknown): EscopoLog {
  if (v === 'caixa') return 'caixa';
  if (typeof v === 'string' && TIPOS_BAU.includes(v)) return v as TipoBau;
  throw new ErroApp('VALIDACAO', 'Escopo de log inválido.');
}

export const refCatalogo = (db: Db): DocumentReference => db.collection('config').doc('catalogo');
export const refBau = (db: Db, tipo: TipoBau): DocumentReference => db.collection('baus').doc(exigirTipoBau(tipo));
export const refSaldo = (db: Db): DocumentReference => db.collection('caixa').doc('saldo');
export const refAuditoria = (db: Db): CollectionReference => db.collection('auditoria');

export function refLogs(db: Db, escopo: EscopoLog): CollectionReference {
  return db.collection('logs').doc(exigirEscopoLog(escopo)).collection('entradas');
}

export function refMensagemFixa(db: Db, chave: ChaveMensagem): DocumentReference {
  if (!CHAVES_MENSAGEM.includes(chave)) throw new ErroApp('VALIDACAO', 'Mensagem fixa inválida.');
  return db.collection('webhook_mensagens').doc(chave);
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function inteiroNaoNegativo(v: unknown): number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0;
}

export function lerDocBau(dados: unknown): DocBau {
  const base = ehObjeto(dados) ? dados : {};
  const itens: Record<string, Record<string, number>> = {};
  if (ehObjeto(base.itens)) {
    for (const [categoriaId, mapa] of Object.entries(base.itens)) {
      if (!ehIdSeguro(categoriaId) || !ehObjeto(mapa)) continue;
      const limpo: Record<string, number> = {};
      for (const [itemId, qtd] of Object.entries(mapa)) {
        if (ehIdSeguro(itemId) && typeof qtd === 'number' && Number.isSafeInteger(qtd) && qtd > 0) limpo[itemId] = qtd;
      }
      if (Object.keys(limpo).length > 0) itens[categoriaId] = limpo;
    }
  }
  return {
    versao: inteiroNaoNegativo(base.versao),
    itens,
    atualizadoEm: typeof base.atualizadoEm === 'string' ? base.atualizadoEm : '',
  };
}

export function lerDocSaldo(dados: unknown): DocSaldo {
  const base = ehObjeto(dados) ? dados : {};
  return {
    sujo: inteiroNaoNegativo(base.sujo),
    limpo: inteiroNaoNegativo(base.limpo),
    versao: inteiroNaoNegativo(base.versao),
    atualizadoEm: typeof base.atualizadoEm === 'string' ? base.atualizadoEm : '',
  };
}
