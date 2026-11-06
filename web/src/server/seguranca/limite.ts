import 'server-only';
import { ErroApp } from '../erros';

/**
 * Limite de requisições (ADR-07): janela deslizante em memória, por instância.
 * Na Vercel cada instância serverless tem a sua memória; o limite real pode chegar a (instâncias × max).
 * É defesa contra abuso acidental, não contra ataque distribuído. A interface `Limitador` permite
 * trocar por uma implementação no Firestore sem mexer nas rotas.
 */
export interface ConfigLimite {
  readonly max: number;
  readonly janelaMs: number;
}

export type ResultadoLimite = { ok: true } | { ok: false; retryAfterS: number };

export interface Limitador {
  consumir(chave: string, agoraMs: number): ResultadoLimite;
}

export const LIMITE_USUARIO: ConfigLimite = Object.freeze({ max: 60, janelaMs: 60_000 });
export const LIMITE_IP_AUTH: ConfigLimite = Object.freeze({ max: 10, janelaMs: 60_000 });

const MAX_CHAVES = 10_000;
const TAMANHO_MAX_IP = 45;

export function criarLimitadorMemoria(cfg: ConfigLimite): Limitador {
  if (!Number.isInteger(cfg.max) || cfg.max < 1 || !Number.isInteger(cfg.janelaMs) || cfg.janelaMs < 1) {
    throw new Error('Configuração de limite inválida.');
  }
  const janelas = new Map<string, number[]>();

  function podar(agoraMs: number): void {
    for (const [chave, marcas] of janelas) {
      const ultima = marcas[marcas.length - 1];
      if (ultima === undefined || ultima <= agoraMs - cfg.janelaMs) janelas.delete(chave);
    }
    for (const chave of janelas.keys()) {
      if (janelas.size <= MAX_CHAVES) break;
      janelas.delete(chave);
    }
  }

  return {
    consumir(chave, agoraMs) {
      const inicio = agoraMs - cfg.janelaMs;
      const marcas = (janelas.get(chave) ?? []).filter((t) => t > inicio);
      if (marcas.length >= cfg.max) {
        janelas.set(chave, marcas);
        const maisAntiga = marcas[0] ?? agoraMs;
        return { ok: false, retryAfterS: Math.max(1, Math.ceil((maisAntiga + cfg.janelaMs - agoraMs) / 1000)) };
      }
      marcas.push(agoraMs);
      janelas.set(chave, marcas);
      if (janelas.size > MAX_CHAVES) podar(agoraMs);
      return { ok: true };
    },
  };
}

type Qual = 'usuario' | 'ip';

const padrao = (): Record<Qual, Limitador> => ({
  usuario: criarLimitadorMemoria(LIMITE_USUARIO),
  ip: criarLimitadorMemoria(LIMITE_IP_AUTH),
});

let limitadores = padrao();

export function setLimitador(qual: Qual, l: Limitador): void {
  limitadores[qual] = l;
}

export function resetLimitadores(): void {
  limitadores = padrao();
}

/** Consome uma requisição da chave; estourou → ErroApp LIMITE_REQUISICOES (429) com `retryAfter`. */
export function consumirLimite(qual: Qual, chave: string): void {
  const r = limitadores[qual].consumir(chave, Date.now());
  if (!r.ok) {
    throw new ErroApp('LIMITE_REQUISICOES', undefined, { retryAfter: r.retryAfterS });
  }
}

/**
 * Primeiro valor de x-forwarded-for (a Vercel define o cabeçalho; fora dela o cliente pode forjá-lo).
 * Sem cabeçalho válido todos caem no mesmo balde 'desconhecido'.
 */
export function ipDaRequisicao(req: Request): string {
  const primeiro = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return primeiro && primeiro.length <= TAMANHO_MAX_IP ? primeiro : 'desconhecido';
}
