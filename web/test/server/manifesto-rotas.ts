export type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type NivelManifesto = 1 | 2 | 3 | 'opcional' | 'publica';

export interface EntradaManifesto {
  metodo: Metodo;
  /** Caminho com segmentos dinâmicos entre colchetes, como no sistema de arquivos. */
  caminho: string;
  nivel: NivelManifesto;
  /** Rotas cujo nível depende do `tipo` do baú. */
  nivelPorTipo?: Readonly<Record<string, 1 | 2 | 3>>;
  /** Valores usados nos segmentos dinâmicos ao chamar a rota. */
  params?: Readonly<Record<string, string>>;
  /** Onda do plano em que a rota passa a existir (docs/web/architecture.md §8). */
  onda: 2 | 3 | 4 | 5 | 6;
}

const BAU = { membros: 1, gerencia: 2 } as const;
const TIPO = { tipo: 'membros' } as const;

/** As 20 rotas de docs/web/architecture.md §5. Rota nova fora desta lista faz o teste de cobertura falhar. */
export const MANIFESTO: readonly EntradaManifesto[] = [
  { metodo: 'GET', caminho: '/api/auth/login', nivel: 'publica', onda: 2 },
  { metodo: 'GET', caminho: '/api/auth/callback', nivel: 'publica', onda: 2 },
  { metodo: 'POST', caminho: '/api/auth/logout', nivel: 'opcional', onda: 2 },
  { metodo: 'GET', caminho: '/api/csrf', nivel: 1, onda: 3 },
  { metodo: 'GET', caminho: '/api/catalogo', nivel: 1, onda: 4 },
  { metodo: 'POST', caminho: '/api/catalogo/itens', nivel: 2, onda: 5 },
  {
    metodo: 'DELETE',
    caminho: '/api/catalogo/itens/[categoriaId]/[itemId]',
    nivel: 3,
    params: { categoriaId: 'medicamentos', itemId: 'analgesico' },
    onda: 5,
  },
  { metodo: 'GET', caminho: '/api/bau/[tipo]', nivel: 1, nivelPorTipo: BAU, params: TIPO, onda: 4 },
  { metodo: 'POST', caminho: '/api/bau/[tipo]/adicionar', nivel: 1, nivelPorTipo: BAU, params: TIPO, onda: 4 },
  { metodo: 'POST', caminho: '/api/bau/[tipo]/remover', nivel: 1, nivelPorTipo: BAU, params: TIPO, onda: 4 },
  { metodo: 'POST', caminho: '/api/bau/[tipo]/ajuste/previa', nivel: 2, params: TIPO, onda: 5 },
  { metodo: 'POST', caminho: '/api/bau/[tipo]/ajuste/confirmar', nivel: 2, params: TIPO, onda: 5 },
  { metodo: 'POST', caminho: '/api/bau/zerar', nivel: 3, onda: 5 },
  { metodo: 'POST', caminho: '/api/catalogo/atualizar', nivel: 2, onda: 5 },
  { metodo: 'GET', caminho: '/api/caixa', nivel: 2, onda: 4 },
  { metodo: 'GET', caminho: '/api/caixa/historico', nivel: 2, onda: 4 },
  { metodo: 'POST', caminho: '/api/caixa/movimentar', nivel: 2, onda: 4 },
  { metodo: 'GET', caminho: '/api/logs/bau/[tipo]', nivel: 1, nivelPorTipo: BAU, params: TIPO, onda: 6 },
  { metodo: 'GET', caminho: '/api/logs/caixa', nivel: 2, onda: 6 },
  { metodo: 'GET', caminho: '/api/auditoria', nivel: 2, onda: 6 },
  { metodo: 'GET', caminho: '/api/auditoria/[id]', nivel: 2, params: { id: 'abc123' }, onda: 6 },
];

/** Únicas rotas públicas permitidas (WEB-026 AC2). */
export const ROTAS_PUBLICAS: readonly string[] = ['/api/auth/login', '/api/auth/callback'];

export function caminhoReal(e: EntradaManifesto, params: Readonly<Record<string, string>> = e.params ?? {}): string {
  return e.caminho.replace(/\[(\w+)\]/g, (_, nome: string) => params[nome] ?? 'x');
}

export function arquivoDaRota(caminho: string): string {
  return `src/app${caminho}/route.ts`;
}
