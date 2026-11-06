import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ErroApp } from '../erros';
import { getEnv } from '../env';
import type { Sessao } from '../auth/sessao';

export function tokenCsrf(sid: string): string {
  return createHmac('sha256', getEnv().sessionSecret).update(`csrf:${sid}`).digest('base64url');
}

function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function verificarMutacao(req: Request, sessao: Sessao | null): void {
  if (req.headers.get('origin') !== getEnv().appUrl) throw new ErroApp('CSRF');
  const site = req.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') throw new ErroApp('CSRF');
  if (sessao === null) return;
  const tipo = (req.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (tipo !== 'application/json' && req.method !== 'DELETE') throw new ErroApp('TIPO_CONTEUDO');
  const enviado = req.headers.get('x-csrf-token');
  if (enviado === null || !iguais(enviado, tokenCsrf(sessao.sid))) throw new ErroApp('CSRF');
}
