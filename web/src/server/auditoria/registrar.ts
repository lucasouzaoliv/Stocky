import 'server-only';
import { ErroApp } from '../erros';
import type { Db, Transaction } from '../firebase';
import { refAuditoria } from '../dominio/refs';
import type { DocAuditoria } from '../dominio/tipos';

const RESUMO_MAX = 200;

/**
 * Grava a auditoria dentro da transação da alteração (nunca fora dela) e devolve o id gerado.
 * O usuário vem sempre da sessão; só `id` e `nome` são guardados.
 */
export function registrarAuditoriaTx(tx: Transaction, db: Db, entrada: Omit<DocAuditoria, 'data'>): string {
  const { usuario } = entrada;
  if (typeof usuario?.id !== 'string' || !usuario.id || typeof usuario.nome !== 'string' || !usuario.nome) {
    throw new ErroApp('INTERNO');
  }
  const ref = refAuditoria(db).doc();
  tx.create(ref, {
    ...entrada,
    usuario: { id: usuario.id, nome: usuario.nome },
    resumo: Array.from(entrada.resumo).slice(0, RESUMO_MAX).join(''),
    data: new Date().toISOString(),
  });
  return ref.id;
}
