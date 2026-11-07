import 'server-only';
import { agendar } from '../contexto';
import { enviarWebhook, type PayloadWebhook } from '../discord/webhook';
import type { LogBau, LogCaixa, TipoBau, UsuarioRef } from '../dominio/tipos';
import { log } from '../log';
import { atualizarInventario } from './inventario';
import { CANAL_LOG_CAIXA, canalDeLogBau, embedAvisoBau, embedMovimentoBau, embedMovimentoCaixa, embedPendenciaDroga } from './movimentacao';
import { atualizarSaldo } from './saldo';

export type EventoDominio =
  | { tipo: 'bau.movimento'; bau: TipoBau; log: LogBau }
  | { tipo: 'bau.aviso'; baus: TipoBau[]; log: LogBau }
  | { tipo: 'caixa.movimento'; log: LogCaixa }
  | { tipo: 'droga.pendencia'; usuario: UsuarioRef; devido: number; quantidade: number; motivo: string; comprador: string; jaPendente: boolean };

/** Resultado de uma escrita: a resposta da rota e os avisos a publicar DEPOIS do commit (WEB-051). */
export interface ComEvento<T> {
  dto: T;
  eventos: EventoDominio[];
}

type Tarefa = () => Promise<unknown>;

/** Mapa evento → webhooks (WEB-051). `catalogo.adicionar_item` não gera evento. */
function tarefasDo(e: EventoDominio): Tarefa[] {
  const enviar = (canal: Parameters<typeof enviarWebhook>[0], payload: PayloadWebhook): Tarefa => () => enviarWebhook(canal, payload);
  switch (e.tipo) {
    case 'bau.movimento':
      return [
        enviar(canalDeLogBau(e.bau), { embeds: [embedMovimentoBau(e.log, e.bau)] }),
        () => atualizarInventario(e.bau),
      ];
    case 'bau.aviso':
      return e.baus.flatMap((bau) => [
        enviar(canalDeLogBau(bau), { embeds: [embedAvisoBau(e.log, bau)] }),
        () => atualizarInventario(bau),
      ]);
    case 'caixa.movimento':
      return [enviar(CANAL_LOG_CAIXA, { embeds: [embedMovimentoCaixa(e.log)] }), () => atualizarSaldo()];
    case 'droga.pendencia':
      return [enviar(canalDeLogBau('gerencia'), { embeds: [embedPendenciaDroga(e)] })];
  }
}

async function isolar(tarefa: Tarefa): Promise<void> {
  try {
    await tarefa();
  } catch (erro) {
    log.erro('Falha ao avisar o Discord', erro);
  }
}

/**
 * Só agenda (via `agendar`, que usa `after()` do Next): a resposta da rota não espera o Discord.
 * Chamar SOMENTE depois que a transação confirmou. Cada tarefa é isolada; nada aqui lança.
 */
export function publicarEvento(e: EventoDominio): void {
  try {
    const tarefas = tarefasDo(e);
    agendar(async () => {
      await Promise.all(tarefas.map(isolar));
    });
  } catch (erro) {
    log.erro('Falha ao agendar aviso do Discord', erro);
  }
}

export function publicarEventos(eventos: readonly EventoDominio[]): void {
  for (const e of eventos) publicarEvento(e);
}
