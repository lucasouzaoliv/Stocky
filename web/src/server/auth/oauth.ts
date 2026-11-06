/**
 * OAuth2 do Discord (WEB-016, WEB-019).
 *
 * Fallback fora do contrato (acrescentado na onda 2, mantido): o login usa `prompt=none`; se o usuário
 * ainda não autorizou o app, o Discord devolve `consent_required` (ou `interaction_required` /
 * `login_required`) ao callback. Em vez de falhar, o callback redireciona para
 * `/api/auth/login?consentimento=1&volta=...`, e `iniciarLogin(volta, { consentir: true })` refaz o
 * authorize com `prompt=consent`. O state é revalidado normalmente antes (o redirecionamento só ocorre
 * com state válido). Com `prompt=consent` o Discord sempre mostra a tela, então não há laço; ainda assim
 * cada passo conta no limite por IP de `rotaPublica` (10/min por caminho).
 */
import 'server-only';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getEnv } from '../env';
import { log } from '../log';
import { obterMembro, trocarCodigo } from '../discord/api';
import { nivelDeCargos } from './niveis';
import { chaveAssinatura } from './segredo';
import { criarTokenSessao, type Sessao } from './sessao';
import type { DefinicaoCookie } from './cookies';

export const NOME_COOKIE_STATE = 'stocky_oauth';
const CAMINHO_COOKIE_STATE = '/api/auth';
const STATE_DURACAO_S = 10 * 60;

const CAMINHOS_VOLTA: readonly string[] = [
  '/',
  '/bau/membros',
  '/bau/gerencia',
  '/caixa',
  '/painel',
  '/ajuste/membros',
  '/ajuste/gerencia',
  '/logs',
  '/auditoria',
];

const ERROS_CONSENTIMENTO = ['consent_required', 'interaction_required', 'login_required'];

export type ErroLogin = 'state' | 'negado' | 'sem_acesso' | 'discord';
export type ResultadoLogin =
  | { ok: true; token: string; volta: string }
  | { ok: false; erro: ErroLogin | 'consentimento'; volta?: string; encerrarSessao?: boolean };

export function caminhoVoltaSeguro(v: unknown): string {
  return typeof v === 'string' && CAMINHOS_VOLTA.includes(v) ? v : '/';
}

export function cookieApagarState(): DefinicaoCookie {
  return {
    name: NOME_COOKIE_STATE,
    value: '',
    httpOnly: true,
    secure: getEnv().producao,
    sameSite: 'lax',
    path: CAMINHO_COOKIE_STATE,
    maxAge: 0,
  };
}

export async function iniciarLogin(
  volta: unknown,
  opcoes: { consentir?: boolean } = {},
): Promise<{ url: string; cookieState: DefinicaoCookie }> {
  const { discord, appUrl, producao } = getEnv();
  const state = randomBytes(32).toString('base64url');
  const caminho = caminhoVoltaSeguro(volta);
  const jwt = await new SignJWT({ tp: 'state', state, volta: caminho })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(Date.now() / 1000) + STATE_DURACAO_S)
    .sign(chaveAssinatura());
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: discord.clientId,
    redirect_uri: `${appUrl}/api/auth/callback`,
    response_type: 'code',
    scope: 'identify guilds.members.read',
    state,
    prompt: opcoes.consentir ? 'consent' : 'none',
  }).toString();
  return {
    url: url.toString(),
    cookieState: {
      name: NOME_COOKIE_STATE,
      value: jwt,
      httpOnly: true,
      secure: producao,
      sameSite: 'lax',
      path: CAMINHO_COOKIE_STATE,
      maxAge: STATE_DURACAO_S,
    },
  };
}

async function lerCookieState(token: string | undefined): Promise<{ state: string; volta: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chaveAssinatura(), { algorithms: ['HS256'] });
    if (payload.tp !== 'state' || typeof payload.state !== 'string' || !payload.state) return null;
    return { state: payload.state, volta: caminhoVoltaSeguro(payload.volta) };
  } catch {
    return null;
  }
}

function statesIguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function concluirLogin(
  url: URL,
  cookieState: string | undefined,
  sessaoAtual: Sessao | null,
): Promise<ResultadoLogin> {
  const guardado = await lerCookieState(cookieState);
  const recebido = url.searchParams.get('state');
  if (!guardado || !recebido || !statesIguais(guardado.state, recebido)) return { ok: false, erro: 'state' };

  const erroDiscord = url.searchParams.get('error');
  if (erroDiscord) {
    if (ERROS_CONSENTIMENTO.includes(erroDiscord)) return { ok: false, erro: 'consentimento', volta: guardado.volta };
    return { ok: false, erro: 'negado' };
  }
  const code = url.searchParams.get('code');
  if (!code) return { ok: false, erro: 'negado' };

  try {
    const { accessToken } = await trocarCodigo(code);
    const membro = await obterMembro(accessToken);
    if (membro.tipo === 'naoMembro') return { ok: false, erro: 'sem_acesso', encerrarSessao: true };
    const nivel = nivelDeCargos(membro.roles, getEnv().discord.cargos);
    if (nivel === 0) return { ok: false, erro: 'sem_acesso', encerrarSessao: true };
    const ini = sessaoAtual && sessaoAtual.sub === membro.userId ? sessaoAtual.ini : undefined;
    const token = await criarTokenSessao({ userId: membro.userId, nome: membro.nome, nivel, ini });
    return { ok: true, token, volta: guardado.volta };
  } catch (e) {
    log.aviso('Falha ao concluir o login', { motivo: e instanceof Error ? e.name : 'desconhecido' });
    return { ok: false, erro: 'discord' };
  }
}
