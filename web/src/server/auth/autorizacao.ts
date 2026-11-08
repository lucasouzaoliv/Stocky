import 'server-only';
import { NextRequest } from 'next/server';
import { LIMITES } from '@/compartilhado/limites';
import { ErroApp } from '../erros';
import { responderErro, lerJson } from '../http';
import { exigirTipoBau } from '../dominio/refs';
import type { NivelAcesso, UsuarioSessao } from '../dominio/tipos';
import { deleteSemCorpo, ehMutacao, verificarMutacao } from '../seguranca/csrf';
import { consumirLimite, ipDaRequisicao } from '../seguranca/limite';
import { lerCookie } from './cookies';
import { estadoSessao, lerSessao, nomeCookieSessao } from './sessao';

/** Marca anexada a toda rota exportada; o teste de cobertura (WEB-026) exige a marca em cada método. */
export const MARCA_ROTA: unique symbol = Symbol.for('stocky.rota.autorizacao');

export type DeclaracaoRota =
  | { publica: true }
  | { publica: false; nivel: NivelAcesso | 'opcional' | 'por-parametro'; corpoMax: number };

export type NivelRota<P> = NivelAcesso | 'opcional' | ((params: P) => NivelAcesso);

export interface OpcoesRota<P> {
  nivel: NivelRota<P>;
  corpoMax?: number;
}

export interface ContextoRota<P> {
  req: NextRequest;
  usuario: UsuarioSessao | null;
  params: P;
  corpo: unknown;
}

type ContextoNext<P> = { params: Promise<P> };
type ComMarca = { [MARCA_ROTA]: DeclaracaoRota };

export type RotaProtegida<P> = ((req: Request, ctx?: ContextoNext<P>) => Promise<Response>) & ComMarca;
export type RotaPublica = ((req: Request) => Promise<Response>) & ComMarca;

/** Nível exigido por um baú: `membros` 1, `gerencia` 2; qualquer outro tipo é 400 e o handler não roda. */
export function nivelDoBau(params: { tipo: string }): NivelAcesso {
  return exigirTipoBau(params.tipo) === 'membros' ? 1 : 2;
}

function comoNextRequest(req: Request): NextRequest {
  return req instanceof NextRequest ? req : new NextRequest(req);
}

async function lerCorpoMutacao(req: Request, maxBytes: number): Promise<unknown> {
  if (deleteSemCorpo(req)) return undefined;
  return await lerJson(req, maxBytes);
}

function validarOpcoes<P>(opcoes: OpcoesRota<P>): void {
  const n = opcoes.nivel;
  const valido = n === 1 || n === 2 || n === 3 || n === 'opcional' || typeof n === 'function';
  if (!valido) throw new Error('comAutorizacao exige um nível declarado (1, 2, 3, "opcional" ou função).');
  if (opcoes.corpoMax !== undefined && (!Number.isInteger(opcoes.corpoMax) || opcoes.corpoMax < 1)) {
    throw new Error('corpoMax inválido.');
  }
}

/**
 * Envolve toda rota protegida. Ordem fixa, antes de qualquer leitura ou escrita no domínio:
 * sessão (401 SEM_SESSAO) → revalidar (401 REVALIDAR) → nível (400 tipo, 403) →
 * CSRF/Origin/Content-Type nas mutações (403, 415) → limite por usuário (429) → corpo (413, 400) → handler.
 * Exceções viram resposta de erro padronizada; INTERNO nunca vaza detalhe.
 * O CSRF é automático em POST/PUT/PATCH/DELETE e não pode ser desligado.
 */
export function comAutorizacao<P extends Record<string, string> = Record<string, never>>(
  opcoes: OpcoesRota<P>,
  handler: (ctx: ContextoRota<P>) => Promise<Response>,
): RotaProtegida<P> {
  validarOpcoes(opcoes);
  const opcional = opcoes.nivel === 'opcional';
  const corpoMax = opcoes.corpoMax ?? LIMITES.CORPO_MAX_BYTES;

  const rota = async (req: Request, ctx?: ContextoNext<P>): Promise<Response> => {
    try {
      const reqNext = comoNextRequest(req);
      const sessao = await lerSessao(lerCookie(req, nomeCookieSessao()));
      if (!sessao && !opcional) throw new ErroApp('SEM_SESSAO');
      if (sessao && !opcional && estadoSessao(sessao, Date.now()) === 'revalidar') {
        throw new ErroApp('REVALIDAR', undefined, {});
      }

      const params = (ctx ? await ctx.params : {}) as P;
      if (!opcional && sessao) {
        const exigido = typeof opcoes.nivel === 'function' ? opcoes.nivel(params) : opcoes.nivel;
        if (exigido !== 1 && exigido !== 2 && exigido !== 3) throw new ErroApp('INTERNO');
        if (sessao.nivel < exigido) throw new ErroApp('SEM_PERMISSAO');
      }

      const mutacao = ehMutacao(req.method);
      if (mutacao) verificarMutacao(req, sessao);

      consumirLimite('usuario', sessao ? `u:${sessao.sub}` : `ip:${ipDaRequisicao(req)}`);

      const corpo = mutacao ? await lerCorpoMutacao(reqNext, corpoMax) : undefined;
      const usuario = sessao ? { id: sessao.sub, nome: sessao.nome, nivel: sessao.nivel } : null;
      return await handler({ req: reqNext, usuario, params, corpo });
    } catch (e) {
      return responderErro(e);
    }
  };

  const declaracao: DeclaracaoRota = {
    publica: false,
    nivel: typeof opcoes.nivel === 'function' ? 'por-parametro' : opcoes.nivel,
    corpoMax,
  };
  return Object.assign(rota, { [MARCA_ROTA]: declaracao });
}

/**
 * Rota sem sessão (só login e callback do OAuth). Aceita apenas GET (nunca altera dados)
 * e aplica o limite por IP, separado por caminho.
 */
export function rotaPublica(handler: (req: NextRequest) => Promise<Response>): RotaPublica {
  const rota = async (req: Request): Promise<Response> => {
    try {
      if (ehMutacao(req.method)) throw new ErroApp('METODO');
      consumirLimite('ip', `${new URL(req.url).pathname}|${ipDaRequisicao(req)}`);
      return await handler(comoNextRequest(req));
    } catch (e) {
      return responderErro(e);
    }
  };
  return Object.assign(rota, { [MARCA_ROTA]: { publica: true } as DeclaracaoRota });
}
