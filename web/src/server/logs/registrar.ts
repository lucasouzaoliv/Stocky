import 'server-only';
import { ErroApp } from '../erros';
import type { Db, Transaction } from '../firebase';
import { refLogs } from '../dominio/refs';
import type { LogBau, LogCaixa, TipoBau } from '../dominio/tipos';

function exigirUsuario(u: { id: string; nome: string }): void {
  if (typeof u.id !== 'string' || !u.id || typeof u.nome !== 'string' || !u.nome) throw new ErroApp('INTERNO');
}

/**
 * Grava o log dentro da transação da alteração (nunca fora dela) e devolve o id.
 * O usuário vem sempre da sessão; só `id` e `nome` são guardados.
 */
export function registrarLogTx(tx: Transaction, db: Db, escopo: TipoBau, entrada: Omit<LogBau, 'data'>): string;
export function registrarLogTx(tx: Transaction, db: Db, escopo: 'caixa', entrada: Omit<LogCaixa, 'data'>): string;
export function registrarLogTx(
  tx: Transaction,
  db: Db,
  escopo: TipoBau | 'caixa',
  entrada: Omit<LogBau, 'data'> | Omit<LogCaixa, 'data'>,
): string {
  exigirUsuario(entrada.usuario);
  const ref = refLogs(db, escopo).doc();
  tx.create(ref, {
    ...entrada,
    usuario: { id: entrada.usuario.id, nome: entrada.usuario.nome },
    data: new Date().toISOString(),
  });
  return ref.id;
}
