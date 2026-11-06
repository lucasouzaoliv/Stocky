export const CABECALHOS_ESPERADOS: Record<string, string>;
export function problemasDaSaidaDoBuild(texto: string): string[];
export function semVariaveisDoSite(env: Record<string, string | undefined>): Record<string, string | undefined>;
export function falhasDeCabecalhos(cabecalhos: Headers | Record<string, string | undefined>): string[];
export function construir(raiz: string, envBase?: Record<string, string | undefined>): { status: number; saida: string };
export function verificarServidor(raiz: string, envBase?: Record<string, string | undefined>): Promise<string[]>;
