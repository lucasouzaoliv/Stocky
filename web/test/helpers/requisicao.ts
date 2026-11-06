export interface OpcoesRequisicao {
  metodo?: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  corpo?: unknown;
}

export function criarRequisicao(url: string, o: OpcoesRequisicao = {}): Request {
  const headers = new Headers(o.headers);
  if (o.cookies) {
    headers.set(
      'cookie',
      Object.entries(o.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
    );
  }
  const temCorpo = o.corpo !== undefined;
  if (temCorpo && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Request(url, {
    method: o.metodo ?? 'GET',
    headers,
    ...(temCorpo ? { body: JSON.stringify(o.corpo) } : {}),
  });
}

export function cookiesDaResposta(res: Response): string[] {
  return res.headers.getSetCookie();
}

export function valorDoCookie(res: Response, nome: string): string | undefined {
  const linha = cookiesDaResposta(res).find((c) => c.startsWith(`${nome}=`));
  return linha?.split(';')[0]?.slice(nome.length + 1);
}
