import 'server-only';
import { getFetch } from '../contexto';
import { getEnv, type CanalWebhook } from '../env';
import { log } from '../log';

export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

export interface PayloadWebhook {
  content?: string;
  embeds: Embed[];
}

export type MotivoFalha = 'http' | 'nao_encontrada' | 'timeout' | 'rede' | 'limite' | 'canal' | 'json' | 'interno';
export type ResultadoWebhook = { ok: true; mensagemId: string } | { ok: false; motivo: MotivoFalha };

export const TIMEOUT_WEBHOOK_MS = 5000;
export const ESPERA_MAX_429_S = 3;

const ID_MENSAGEM = /^\d{1,25}$/;

type Tentativa =
  | { tipo: 'resposta'; status: number; corpo: Record<string, unknown> | null; retryAfterS: number | null }
  | { tipo: 'timeout' }
  | { tipo: 'rede' };

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function segundosDe(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

/** Uma tentativa inteira (requisição e leitura do corpo) sob um único prazo. Nunca lança. */
async function tentar(url: string, init: RequestInit): Promise<Tentativa> {
  const controle = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<Tentativa>((resolve) => {
    timer = setTimeout(() => {
      controle.abort();
      resolve({ tipo: 'timeout' });
    }, TIMEOUT_WEBHOOK_MS);
  });
  const execucao = (async (): Promise<Tentativa> => {
    try {
      const res = await getFetch()(url, { ...init, signal: controle.signal });
      let corpo: Record<string, unknown> | null = null;
      try {
        const lido: unknown = await res.json();
        corpo = ehObjeto(lido) ? lido : null;
      } catch {
        corpo = null;
      }
      const retryAfterS = segundosDe(corpo?.retry_after) ?? segundosDe(res.headers.get('retry-after'));
      return { tipo: 'resposta', status: res.status, corpo, retryAfterS };
    } catch (e) {
      return e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
        ? { tipo: 'timeout' }
        : { tipo: 'rede' };
    }
  })();
  try {
    return await Promise.race([execucao, prazo]);
  } finally {
    clearTimeout(timer);
  }
}

const esperar = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function urlDoCanal(canal: CanalWebhook): string | null {
  try {
    const url = getEnv().webhooks[canal];
    return typeof url === 'string' && url ? url : null;
  } catch {
    return null;
  }
}

function corpoSeguro(payload: PayloadWebhook): string {
  return JSON.stringify({ ...payload, allowed_mentions: { parse: [] } });
}

async function executar(
  canal: CanalWebhook,
  metodo: 'POST' | 'PATCH',
  sufixo: string,
  payload: PayloadWebhook,
): Promise<ResultadoWebhook> {
  const base = urlDoCanal(canal);
  if (base === null) {
    log.aviso('Canal de webhook desconhecido ou sem configuração', { canal });
    return { ok: false, motivo: 'canal' };
  }
  const falhou = (motivo: MotivoFalha, extra: object = {}): ResultadoWebhook => {
    log.aviso('Webhook do Discord não entregue', { canal, metodo, motivo, ...extra });
    return { ok: false, motivo };
  };
  try {
    const url = `${base}${sufixo}`;
    const init: RequestInit = { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpoSeguro(payload) };
    for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
      const r = await tentar(url, init);
      if (r.tipo === 'timeout') return falhou('timeout');
      if (r.tipo === 'rede') return falhou('rede');
      if (r.status === 429) {
        const espera = r.retryAfterS;
        if (tentativa === 2 || espera === null || espera > ESPERA_MAX_429_S) return falhou('limite', { status: 429 });
        await esperar(Math.ceil(espera * 1000));
        continue;
      }
      if (r.status === 404 && metodo === 'PATCH') return falhou('nao_encontrada', { status: 404 });
      if (r.status < 200 || r.status >= 300) return falhou('http', { status: r.status });
      const id = r.corpo?.id;
      if (typeof id === 'string' && ID_MENSAGEM.test(id)) return { ok: true, mensagemId: id };
      return falhou('json', { status: r.status });
    }
    return falhou('limite');
  } catch {
    return falhou('interno');
  }
}

/** Cria a mensagem (`?wait=true` devolve o id). Nunca lança e nunca registra a URL do webhook. */
export async function enviarWebhook(canal: CanalWebhook, payload: PayloadWebhook): Promise<ResultadoWebhook> {
  return await executar(canal, 'POST', '?wait=true', payload);
}

/** Edita a mensagem existente; 404 vira `nao_encontrada` para o chamador recriar. */
export async function editarWebhook(
  canal: CanalWebhook,
  mensagemId: string,
  payload: PayloadWebhook,
): Promise<ResultadoWebhook> {
  if (typeof mensagemId !== 'string' || !ID_MENSAGEM.test(mensagemId)) {
    log.aviso('Id de mensagem de webhook inválido', { canal });
    return { ok: false, motivo: 'http' };
  }
  return await executar(canal, 'PATCH', `/messages/${mensagemId}`, payload);
}
