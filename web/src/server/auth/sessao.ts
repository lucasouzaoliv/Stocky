import 'server-only';
import { randomBytes } from 'node:crypto';
import { SignJWT, decodeJwt, jwtVerify } from 'jose';
import { SESSAO_DURACAO_MS } from '@/compartilhado/limites';
import { ErroApp } from '../erros';
import { getEnv } from '../env';
import type { NivelAcesso } from '../dominio/tipos';
import { chaveAssinatura } from './segredo';
import type { DefinicaoCookie } from './cookies';
import { precisaRevalidar } from './revalidacao';

export interface Sessao {
  sub: string;
  nome: string;
  nivel: NivelAcesso;
  sid: string;
  ini: number;
  cv: number;
  exp: number;
}

export type EstadoSessao = 'ok' | 'revalidar';

export function nomeCookieSessao(): string {
  return getEnv().producao ? '__Host-stocky_sessao' : 'stocky_sessao';
}

export async function criarTokenSessao(d: {
  userId: string;
  nome: string;
  nivel: NivelAcesso;
  ini?: number;
}): Promise<string> {
  const chave = chaveAssinatura();
  const agora = Date.now();
  const ini = d.ini ?? agora;
  if (![1, 2, 3].includes(d.nivel)) throw new ErroApp('INTERNO');
  if (ini + SESSAO_DURACAO_MS <= agora) throw new ErroApp('SEM_SESSAO');
  return await new SignJWT({
    sub: d.userId,
    nome: d.nome,
    nivel: d.nivel,
    sid: randomBytes(16).toString('base64url'),
    ini,
    cv: agora,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor((ini + SESSAO_DURACAO_MS) / 1000))
    .sign(chave);
}

export async function lerSessao(token: string | undefined): Promise<Sessao | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chaveAssinatura(), { algorithms: ['HS256'] });
    const { sub, nome, nivel, sid, ini, cv, exp } = payload as Record<string, unknown>;
    if (typeof sub !== 'string' || !sub || typeof nome !== 'string' || typeof sid !== 'string' || !sid) return null;
    if (nivel !== 1 && nivel !== 2 && nivel !== 3) return null;
    if (typeof ini !== 'number' || typeof cv !== 'number' || typeof exp !== 'number') return null;
    return { sub, nome, nivel, sid, ini, cv, exp: exp * 1000 };
  } catch {
    return null;
  }
}

export function estadoSessao(s: Sessao, agoraMs: number): EstadoSessao {
  return precisaRevalidar(s, agoraMs) ? 'revalidar' : 'ok';
}

export function cookieSessao(token: string): DefinicaoCookie {
  const exp = decodeJwt(token).exp ?? 0;
  return {
    name: nomeCookieSessao(),
    value: token,
    httpOnly: true,
    secure: getEnv().producao,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, exp - Math.floor(Date.now() / 1000)),
  };
}

export function cookieApagarSessao(): DefinicaoCookie {
  return {
    name: nomeCookieSessao(),
    value: '',
    httpOnly: true,
    secure: getEnv().producao,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  };
}
