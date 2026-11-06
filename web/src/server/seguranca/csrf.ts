import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ErroApp } from '../erros';
import { getEnv } from '../env';
import type { Sessao } from '../auth/sessao';

/** Métodos que alteram dados: exigem Origin, Content-Type JSON e token CSRF (ADR-06). GET e HEAD nunca alteram. */
const METODOS_MUTACAO: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function ehMutacao(metodo: string): boolean {
  return METODOS_MUTACAO.has(metodo.toUpperCase());
}

export function tokenCsrf(sid: string): string {
  return createHmac('sha256', getEnv().sessionSecret).update(`csrf:${sid}`).digest('base64url');
}

function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** DELETE sem Content-Type, sem Content-Length e sem Transfer-Encoding não carrega corpo. */
function semCorpoDeclarado(req: Request): boolean {
  const comprimento = req.headers.get('content-length');
  return (
    !req.headers.has('content-type') &&
    !req.headers.has('transfer-encoding') &&
    (comprimento === null || comprimento === '0')
  );
}

export function deleteSemCorpo(req: Request): boolean {
  return req.method.toUpperCase() === 'DELETE' && semCorpoDeclarado(req);
}

/**
 * Valida uma mutação. Ordem: Origin → Sec-Fetch-Site → (com sessão) Content-Type → token.
 * Sem sessão (só o logout) basta a Origin certa, porque não há o que proteger.
 * Lança CSRF (403) ou TIPO_CONTEUDO (415).
 */
export function verificarMutacao(req: Request, sessao: Sessao | null): void {
  if (req.headers.get('origin') !== getEnv().appUrl) throw new ErroApp('CSRF');
  const site = req.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') throw new ErroApp('CSRF');
  if (sessao === null) return;
  const tipo = (req.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (tipo !== 'application/json' && !deleteSemCorpo(req)) throw new ErroApp('TIPO_CONTEUDO');
  const enviado = req.headers.get('x-csrf-token');
  if (enviado === null || !iguais(enviado, tokenCsrf(sessao.sid))) throw new ErroApp('CSRF');
}
