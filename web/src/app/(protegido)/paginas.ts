import type { NivelAcesso } from '@/compartilhado/api-tipos';

/** Tabela página × nível (architecture.md §6). Guarda de UX; a segurança real é a das rotas de API. */
export const NIVEL_POR_PAGINA: ReadonlyArray<{ prefixo: string; nivel: NivelAcesso }> = [
  { prefixo: '/bau/membros', nivel: 1 },
  { prefixo: '/bau/gerencia', nivel: 2 },
  { prefixo: '/caixa', nivel: 2 },
  { prefixo: '/painel', nivel: 2 },
  { prefixo: '/ajuste', nivel: 2 },
  { prefixo: '/logs', nivel: 1 },
  { prefixo: '/auditoria', nivel: 2 },
];

/** Nível mínimo de um caminho; o que não consta na tabela exige só estar logado (a página decide o resto). */
export function nivelDaPagina(caminho: string): NivelAcesso {
  const limpo = caminho.split(/[?#]/)[0] ?? '';
  const achado = NIVEL_POR_PAGINA.find((p) => limpo === p.prefixo || limpo.startsWith(`${p.prefixo}/`));
  return achado?.nivel ?? 1;
}
