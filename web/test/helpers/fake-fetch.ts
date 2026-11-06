export interface ChamadaFetch {
  url: string;
  metodo: string;
  headers: Headers;
  corpo: string;
  init: RequestInit;
}

export type RespostaFake = Response | Promise<Response> | Error;

export function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

export function criarFakeFetch(responder: (chamada: ChamadaFetch, indice: number) => RespostaFake) {
  const chamadas: ChamadaFetch[] = [];
  const fakeFetch = (async (entrada: RequestInfo | URL, init: RequestInit = {}) => {
    const chamada: ChamadaFetch = {
      url: String(entrada),
      metodo: (init.method ?? 'GET').toUpperCase(),
      headers: new Headers(init.headers),
      corpo: typeof init.body === 'string' ? init.body : '',
      init,
    };
    chamadas.push(chamada);
    const r = responder(chamada, chamadas.length - 1);
    if (r instanceof Error) throw r;
    return await r;
  }) as typeof fetch;
  return { fetch: fakeFetch, chamadas };
}
