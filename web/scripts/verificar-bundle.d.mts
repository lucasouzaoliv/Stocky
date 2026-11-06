export const MARCADOR: string;
export const VARIAVEIS_SECRETAS: string[];
export function envFalso(): Record<string, string>;
export function varrer(pasta: string, valores?: string[]): Array<{ arquivo: string; achado: string }>;
