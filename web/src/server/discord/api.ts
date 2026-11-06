import 'server-only';
import { ErroApp } from '../erros';
import { getEnv } from '../env';
import { getFetch } from '../contexto';
import { log } from '../log';

const BASE = 'https://discord.com/api/v10';
const TIMEOUT_MS = 5000;
const NOME_MAX = 32;

export type ResultadoMembro =
  | { tipo: 'membro'; userId: string; roles: string[]; nome: string; avatar: string | null }
  | { tipo: 'naoMembro' };

async function chamar(etapa: string, url: string, init: RequestInit): Promise<Response> {
  try {
    return await getFetch()(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    log.aviso('Falha de rede ao falar com o Discord', { etapa, motivo: e instanceof Error ? e.name : 'desconhecido' });
    throw new ErroApp('INTERNO');
  }
}

async function lerJsonDiscord(res: Response, etapa: string): Promise<Record<string, unknown>> {
  try {
    const corpo: unknown = await res.json();
    if (typeof corpo === 'object' && corpo !== null && !Array.isArray(corpo)) return corpo as Record<string, unknown>;
  } catch {
    // cai no erro genérico abaixo
  }
  log.aviso('Resposta inesperada do Discord', { etapa, status: res.status });
  throw new ErroApp('INTERNO');
}

export async function trocarCodigo(code: string): Promise<{ accessToken: string }> {
  const { discord, appUrl } = getEnv();
  const corpo = new URLSearchParams({
    client_id: discord.clientId,
    client_secret: discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${appUrl}/api/auth/callback`,
  });
  const res = await chamar('token', `${BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: corpo.toString(),
  });
  if (!res.ok) {
    log.aviso('Discord recusou a troca de código', { status: res.status });
    throw new ErroApp('INTERNO');
  }
  const json = await lerJsonDiscord(res, 'token');
  if (typeof json.access_token !== 'string' || !json.access_token) throw new ErroApp('INTERNO');
  return { accessToken: json.access_token };
}

export async function obterMembro(accessToken: string): Promise<ResultadoMembro> {
  const res = await chamar('membro', `${BASE}/users/@me/guilds/${getEnv().discord.guildId}/member`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (res.status === 404) return { tipo: 'naoMembro' };
  if (!res.ok) {
    log.aviso('Discord recusou a leitura do membro', { status: res.status });
    throw new ErroApp('INTERNO');
  }
  const json = await lerJsonDiscord(res, 'membro');
  const user = json.user as Record<string, unknown> | undefined;
  const roles = json.roles;
  if (
    typeof user !== 'object' ||
    user === null ||
    typeof user.id !== 'string' ||
    !user.id ||
    !Array.isArray(roles) ||
    !roles.every((r) => typeof r === 'string')
  ) {
    throw new ErroApp('INTERNO');
  }
  const candidatos = [json.nick, user.global_name, user.username];
  const nome = candidatos.find((n): n is string => typeof n === 'string' && n.trim() !== '') ?? user.id;
  return {
    tipo: 'membro',
    userId: user.id,
    roles: roles as string[],
    nome: Array.from(nome.trim()).slice(0, NOME_MAX).join(''),
    avatar: typeof user.avatar === 'string' ? user.avatar : null,
  };
}
