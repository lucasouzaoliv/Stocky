import { NextResponse, type NextRequest } from 'next/server';
import { CABECALHOS_FIXOS, montarCsp } from '@/server/seguranca/cabecalhos';

export function proxy(req: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = montarCsp(nonce, process.env.NODE_ENV === 'production');

  const cabecalhosReq = new Headers(req.headers);
  cabecalhosReq.set('x-nonce', nonce);
  cabecalhosReq.set('content-security-policy', csp);

  const res = NextResponse.next({ request: { headers: cabecalhosReq } });
  res.headers.set('Content-Security-Policy', csp);
  for (const [chave, valor] of Object.entries(CABECALHOS_FIXOS)) res.headers.set(chave, valor);
  return res;
}

export const config = {
  matcher: [{ source: '/((?!_next/static|_next/image|favicon.ico).*)' }],
};
