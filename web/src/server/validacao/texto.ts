import 'server-only';
import { LIMITES } from '@/compartilhado/limites';
import { ErroApp } from '../erros';

export function normalizarAnotacao(v: unknown): string {
  if (typeof v !== 'string') throw new ErroApp('VALIDACAO', 'Informe a anotação.');
  const limpa = v.replace(/\s+/g, ' ').replace(/\p{Cc}/gu, '').trim();
  if (!limpa) throw new ErroApp('VALIDACAO', 'Informe a anotação.');
  if (Array.from(limpa).length > LIMITES.ANOTACAO_MAX) {
    throw new ErroApp('VALIDACAO', `A anotação pode ter no máximo ${LIMITES.ANOTACAO_MAX} caracteres.`);
  }
  return limpa;
}
