/** Regras de venda da droga (Saco de Meta). Um único lugar: o site, o cálculo e o servidor usam estes números. */
export const DROGA = { categoriaId: 'drogas', itemId: 'saco_de_meta', nome: 'Saco de Meta' } as const;

export const PRECO = {
  parceria: 200,
  pista: 230,
  /** Venda para pista acima de LIMITE_ATACADO unidades: todas saem por este preço. */
  pistaAtacado: 215,
  LIMITE_ATACADO: 300,
} as const;

export type MotivoRetirada = 'parceria' | 'pista' | 'pessoal' | 'outro';
export type MotivoGuardar = 'devolucao' | 'producao' | 'outro';
export type AcaoDroga = 'retirar' | 'guardar';

export const MOTIVOS_RETIRADA: ReadonlyArray<readonly [MotivoRetirada, string]> = [
  ['parceria', 'Venda parceria'],
  ['pista', 'Venda pista'],
  ['pessoal', 'Venda pessoal'],
  ['outro', 'Outro motivo'],
];
export const MOTIVOS_GUARDAR: ReadonlyArray<readonly [MotivoGuardar, string]> = [
  ['devolucao', 'Devolução (sobrou da venda)'],
  ['producao', 'Produção'],
  ['outro', 'Outro motivo'],
];

export const ROTULO_MOTIVO: Readonly<Record<string, string>> = Object.fromEntries([...MOTIVOS_RETIRADA, ...MOTIVOS_GUARDAR]);

export function ehMotivoRetirada(v: unknown): v is MotivoRetirada {
  return MOTIVOS_RETIRADA.some(([id]) => id === v);
}
export function ehMotivoGuardar(v: unknown): v is MotivoGuardar {
  return MOTIVOS_GUARDAR.some(([id]) => id === v);
}

/** Motivo que gera cobrança (o valor precisa ser depositado no caixa). "Outro" não cobra. */
export function motivoCobra(m: MotivoRetirada): boolean {
  return m !== 'outro';
}

/** Preço por unidade a cobrar do cliente. Venda pessoal segue a tabela da pista. */
export function precoUnitario(motivo: MotivoRetirada, quantidade: number): number {
  if (motivo === 'outro') return 0;
  if (motivo === 'parceria') return PRECO.parceria;
  return quantidade > PRECO.LIMITE_ATACADO ? PRECO.pistaAtacado : PRECO.pista;
}

export interface CalculoVenda {
  unitario: number;
  total: number;
  atacado: boolean;
}

export function calcularVenda(motivo: MotivoRetirada, quantidade: number): CalculoVenda {
  const unitario = precoUnitario(motivo, quantidade);
  return { unitario, total: unitario * quantidade, atacado: motivo !== 'parceria' && motivo !== 'outro' && quantidade > PRECO.LIMITE_ATACADO };
}
