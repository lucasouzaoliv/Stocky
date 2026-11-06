import { vi } from 'vitest';
import { criarClienteApi } from '@/components/api';

export const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
export const ok = (dados: unknown) => json({ ok: true, dados });
export const falha = (status: number, codigo: string, erro: string, detalhes?: unknown) => json({ ok: false, codigo, erro, detalhes }, status);
export type Resp = Response | Promise<Response>;

export interface Chamada {
  url: string;
  metodo: string;
  corpo?: Record<string, unknown>;
}

/** Cliente HTTP com fetch falso; `rota` decide a resposta de cada chamada. */
export function clienteFalso(rota: (c: Chamada) => Resp) {
  const chamadas: Chamada[] = [];
  const falso = vi.fn(async (url: string, init?: RequestInit) => {
    const c: Chamada = {
      url,
      metodo: init?.method ?? 'GET',
      corpo: init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined,
    };
    chamadas.push(c);
    return rota(c);
  });
  const cliente = criarClienteApi({ fetch: falso as unknown as typeof fetch, navegar: vi.fn(), caminhoAtual: () => '/' });
  return { cliente, chamadas };
}
