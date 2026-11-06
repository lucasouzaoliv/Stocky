import 'server-only';
import type { CanalWebhook } from '../env';
import { editarWebhook, enviarWebhook, type PayloadWebhook, type ResultadoWebhook } from '../discord/webhook';
import { refMensagemFixa } from '../dominio/refs';
import type { ChaveMensagem } from '../dominio/tipos';
import { getDb } from '../firebase';
import { log } from '../log';

export const RESERVA_MS = 30_000;

interface Estado {
  mensagemId: string | null;
  reservadoAte: number;
}

function lerEstado(dados: unknown): Estado {
  const d = (typeof dados === 'object' && dados !== null ? dados : {}) as Record<string, unknown>;
  const reservado = typeof d.reservadoAte === 'string' ? Date.parse(d.reservadoAte) : Number.NaN;
  return {
    mensagemId: typeof d.mensagemId === 'string' && d.mensagemId ? d.mensagemId : null,
    reservadoAte: Number.isFinite(reservado) ? reservado : 0,
  };
}

const agora = (): string => new Date().toISOString();

async function lerId(chave: ChaveMensagem): Promise<Estado> {
  const db = getDb();
  return await db.runTransaction(async (tx) => lerEstado((await tx.get(refMensagemFixa(db, chave))).data()));
}

/** Zera o id só se ainda for o que falhou (outro atualizador pode já ter gravado um novo). */
async function limparId(chave: ChaveMensagem, idRuim: string): Promise<void> {
  const db = getDb();
  await db.runTransaction(async (tx) => {
    const ref = refMensagemFixa(db, chave);
    const estado = lerEstado((await tx.get(ref)).data());
    if (estado.mensagemId === idRuim) tx.set(ref, { mensagemId: null, reservadoAte: null, atualizadoEm: agora() });
  });
}

/** Reserva o direito de criar a mensagem. Devolve o id, se alguém já criou, ou `true` se a reserva é nossa. */
async function reservar(chave: ChaveMensagem): Promise<{ id: string } | { reservado: boolean }> {
  const db = getDb();
  return await db.runTransaction(async (tx) => {
    const ref = refMensagemFixa(db, chave);
    const estado = lerEstado((await tx.get(ref)).data());
    if (estado.mensagemId) return { id: estado.mensagemId };
    if (estado.reservadoAte > Date.now()) return { reservado: false };
    tx.set(ref, { mensagemId: null, reservadoAte: new Date(Date.now() + RESERVA_MS).toISOString(), atualizadoEm: agora() });
    return { reservado: true };
  });
}

async function gravarId(chave: ChaveMensagem, mensagemId: string | null): Promise<void> {
  const db = getDb();
  await db.runTransaction(async (tx) => {
    tx.set(refMensagemFixa(db, chave), { mensagemId, reservadoAte: null, atualizadoEm: agora() });
  });
}

async function criar(chave: ChaveMensagem, canal: CanalWebhook, payload: PayloadWebhook): Promise<ResultadoWebhook> {
  const r = await reservar(chave);
  if ('id' in r) return await editarOuRecriar(chave, canal, payload, r.id, false);
  if (!r.reservado) return { ok: false, motivo: 'limite' };
  const enviado = await enviarWebhook(canal, payload);
  if (!enviado.ok) {
    await gravarId(chave, null);
    return enviado;
  }
  try {
    await gravarId(chave, enviado.mensagemId);
  } catch {
    await gravarId(chave, enviado.mensagemId);
  }
  return enviado;
}

async function editarOuRecriar(
  chave: ChaveMensagem,
  canal: CanalWebhook,
  payload: PayloadWebhook,
  mensagemId: string,
  podeRecriar: boolean,
): Promise<ResultadoWebhook> {
  const r = await editarWebhook(canal, mensagemId, payload);
  if (r.ok || r.motivo !== 'nao_encontrada') return r;
  if (!podeRecriar) return r;
  await limparId(chave, mensagemId);
  return await criar(chave, canal, payload);
}

/**
 * Mantém UMA mensagem fixa por chave (WEB-049/050): edita a que existe; se foi apagada (404) cria uma nova;
 * qualquer outra falha não cria duplicata. A criação usa reserva transacional para dois atualizadores
 * simultâneos nunca postarem duas mensagens. Nunca lança.
 */
export async function publicarMensagemFixa(
  chave: ChaveMensagem,
  canal: CanalWebhook,
  payload: PayloadWebhook,
): Promise<ResultadoWebhook> {
  try {
    const { mensagemId } = await lerId(chave);
    if (mensagemId) return await editarOuRecriar(chave, canal, payload, mensagemId, true);
    return await criar(chave, canal, payload);
  } catch (e) {
    log.erro('Falha ao atualizar mensagem fixa do Discord', e, { chave });
    return { ok: false, motivo: 'interno' };
  }
}
