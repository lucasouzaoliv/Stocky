import { CATALOGO_PADRAO } from '@/server/catalogo/padrao';
import type { Dados } from './fake-firestore';

export const USUARIO = Object.freeze({ id: '444444444444444441', nome: 'Teste' });
export const DONO = Object.freeze({ ...USUARIO, nivel: 3 as const });
export const GERENTE = Object.freeze({ ...USUARIO, nivel: 2 as const });
export const OUTRO_USUARIO = Object.freeze({ id: '444444444444444442', nome: 'Outra Pessoa' });

export type ItensBau = Record<string, Record<string, number>>;

const AGORA = '2026-11-05T12:00:00.000Z';

/** Estado inicial já semeado (catálogo padrão, dois baús e saldo), para os testes não passarem pela semente. */
export function seedBase(
  o: { membros?: ItensBau; gerencia?: ItensBau; versao?: number; saldo?: { sujo?: number; limpo?: number }; extra?: Record<string, Dados> } = {},
): Record<string, Dados> {
  return {
    'config/catalogo': { categorias: structuredClone(CATALOGO_PADRAO), atualizadoEm: AGORA },
    'baus/membros': { versao: o.versao ?? 0, itens: o.membros ?? {}, atualizadoEm: AGORA },
    'baus/gerencia': { versao: o.versao ?? 0, itens: o.gerencia ?? {}, atualizadoEm: AGORA },
    'caixa/saldo': { sujo: o.saldo?.sujo ?? 0, limpo: o.saldo?.limpo ?? 0, versao: 0, atualizadoEm: AGORA },
    ...(o.extra ?? {}),
  };
}

export const logsDe = (dump: Record<string, Dados>, escopo: string): Dados[] =>
  Object.entries(dump)
    .filter(([c]) => c.startsWith(`logs/${escopo}/entradas/`))
    .map(([, d]) => d);

export const VALORES_INVALIDOS: ReadonlyArray<[string, unknown]> = [
  ['zero', 0],
  ['negativo', -1],
  ['decimal', 1.5],
  ['texto decimal', '1.5'],
  ['vírgula', '1.000,50'],
  ['texto misturado', '10abc'],
  ['sinal', '+5'],
  ['notação científica', '1e3'],
  ['vazio', ''],
  ['espaços', '   '],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['nulo', null],
  ['indefinido', undefined],
  ['booleano', true],
  ['objeto', {}],
  ['lista', [5]],
  ['dígitos não ASCII', '٣'],
];

export const auditorias = (dump: Record<string, Dados>): Dados[] =>
  Object.entries(dump)
    .filter(([c]) => c.startsWith('auditoria/'))
    .map(([, d]) => d);
