import { formatarNumero } from './formatacao';

export type ResultadoInteiro =
  | { ok: true; valor: number }
  | { ok: false; motivo: 'formato' | 'minimo' | 'maximo'; erro: string };

const MAX_DIGITOS = 15;
const SOMENTE_DIGITOS = /^[0-9]+$/;

const MSG_FORMATO = 'Digite apenas números inteiros, sem pontos, vírgulas ou sinais.';

export function parseInteiro(v: unknown, op: { min: number; max: number }): ResultadoInteiro {
  let valor: number;
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) return { ok: false, motivo: 'formato', erro: MSG_FORMATO };
    valor = v;
  } else if (typeof v === 'string') {
    const texto = v.trim();
    if (!SOMENTE_DIGITOS.test(texto) || texto.length > MAX_DIGITOS) {
      return { ok: false, motivo: 'formato', erro: MSG_FORMATO };
    }
    valor = Number(texto);
  } else {
    return { ok: false, motivo: 'formato', erro: MSG_FORMATO };
  }
  if (valor < op.min) {
    return { ok: false, motivo: 'minimo', erro: `O valor mínimo é ${formatarNumero(op.min)}.` };
  }
  if (valor > op.max) {
    return { ok: false, motivo: 'maximo', erro: `Valor acima do limite (máx. ${formatarNumero(op.max)}).` };
  }
  return { ok: true, valor };
}
