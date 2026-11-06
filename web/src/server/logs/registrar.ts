import 'server-only';
import { ErroApp } from '../erros';
import type { Db, Transaction } from '../firebase';
import { refLogs } from '../dominio/refs';
import type { LogBau, LogCaixa, TipoBau } from '../dominio/tipos';

function exigirUsuario(u: { id: string; nome: string }): void {
  if (typeof u.id !== 'string' || !u.id || typeof u.nome !== 'string' || !u.nome) throw new ErroApp('INTERNO');
}

/**
 * Grava o log dentro da transação da alteração (nunca fora dela) e devolve o id e o documento gravado
 * (com a `data`), para alimentar os avisos pós-commit. O usuário vem sempre da sessão; só `id` e `nome` são guardados.
 */
export function registrarLogTxCompleto(
  tx: Transaction,
  db: Db,
  escopo: TipoBau,
  entrada: Omit<LogBau, 'data'>,
): { id: string; log: LogBau };
export function registrarLogTxCompleto(
  tx: Transaction,
  db: Db,
  escopo: 'caixa',
  entrada: Omit<LogCaixa, 'data'>,
): { id: string; log: LogCaixa };
export function registrarLogTxCompleto(
  tx: Transaction,
  db: Db,
  escopo: TipoBau | 'caixa',
  entrada: Omit<LogBau, 'data'> | Omit<LogCaixa, 'data'>,
): { id: string; log: LogBau | LogCaixa } {
  exigirUsuario(entrada.usuario);
  const ref = refLogs(db, escopo).doc();
  const log = {
    ...entrada,
    usuario: { id: entrada.usuario.id, nome: entrada.usuario.nome },
    data: new Date().toISOString(),
  } as LogBau | LogCaixa;
  tx.create(ref, log as unknown as Record<string, unknown>);
  return { id: ref.id, log };
}

/** Grava o log dentro da transação da alteração e devolve só o id. */
export function registrarLogTx(tx: Transaction, db: Db, escopo: TipoBau, entrada: Omit<LogBau, 'data'>): string;
export function registrarLogTx(tx: Transaction, db: Db, escopo: 'caixa', entrada: Omit<LogCaixa, 'data'>): string;
export function registrarLogTx(
  tx: Transaction,
  db: Db,
  escopo: TipoBau | 'caixa',
  entrada: Omit<LogBau, 'data'> | Omit<LogCaixa, 'data'>,
): string {
  return escopo === 'caixa'
    ? registrarLogTxCompleto(tx, db, 'caixa', entrada as Omit<LogCaixa, 'data'>).id
    : registrarLogTxCompleto(tx, db, escopo, entrada as Omit<LogBau, 'data'>).id;
}
