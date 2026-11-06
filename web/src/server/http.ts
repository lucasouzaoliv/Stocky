import 'server-only';
import { ErroApp, paraErroApp } from './erros';
import { log } from './log';

const CABECALHOS_BASE = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function montar(corpo: unknown, status: number, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  for (const [k, v] of Object.entries(CABECALHOS_BASE)) headers.set(k, v);
  return new Response(JSON.stringify(corpo), { status, headers });
}

export function responderOk<T>(dados: T, init?: { status?: number; headers?: HeadersInit }): Response {
  return montar({ ok: true, dados }, init?.status ?? 200, init?.headers);
}

export function responderErro(e: unknown): Response {
  const erro = paraErroApp(e);
  if (erro.codigo === 'INTERNO') log.erro('Erro interno na API', e);
  const corpo: Record<string, unknown> = { ok: false, erro: erro.message, codigo: erro.codigo };
  if (erro.detalhes) corpo.detalhes = erro.detalhes;
  const headers: Record<string, string> = {};
  if (erro.codigo === 'LIMITE_REQUISICOES' && erro.detalhes?.retryAfter !== undefined) {
    headers['Retry-After'] = String(Math.max(1, Math.ceil(erro.detalhes.retryAfter)));
  }
  return montar(corpo, erro.status, headers);
}

async function lerBytes(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declarado = req.headers.get('content-length');
  if (declarado !== null && /^\d+$/.test(declarado) && Number(declarado) > maxBytes) {
    throw new ErroApp('CORPO_GRANDE');
  }
  if (!req.body) return new Uint8Array();
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await leitor.cancel().catch(() => undefined);
      throw new ErroApp('CORPO_GRANDE');
    }
    partes.push(value);
  }
  const todo = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    todo.set(parte, posicao);
    posicao += parte.byteLength;
  }
  return todo;
}

export async function lerJson(req: Request, maxBytes: number): Promise<unknown> {
  const bytes = await lerBytes(req, maxBytes);
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ErroApp('VALIDACAO', 'O corpo da requisição não é um JSON válido.');
  }
  if (!texto.trim()) throw new ErroApp('VALIDACAO', 'O corpo da requisição está vazio.');
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new ErroApp('VALIDACAO', 'O corpo da requisição não é um JSON válido.');
  }
}
