import 'server-only';
import { formatarDinheiro, formatarNumero } from '@/compartilhado/formatacao';
import type { CanalWebhook } from '../env';
import type { Embed } from '../discord/webhook';
import { NOME_DO_BAU } from '@/compartilhado/api-tipos';
import { ROTULO_MOTIVO } from '@/compartilhado/drogas';
import type { LogBau, LogCaixa, TipoBau, UsuarioRef } from '../dominio/tipos';
import { COR, RODAPE, escaparMarkdown, garantirLimites, truncar } from './formatacao';

const NOME_BAU: Readonly<Record<TipoBau, string>> = NOME_DO_BAU;

/** Texto do usuário já limpo para o Discord: escapado e cortado antes de entrar em título, campo ou descrição. */
const limpo = (t: string | null | undefined, max: number): string => truncar(escaparMarkdown(t ?? ''), max);

export function canalDeLogBau(tipo: TipoBau): CanalWebhook {
  return tipo === 'membros' ? 'logMembros' : 'logGerencia';
}

export const CANAL_LOG_CAIXA: CanalWebhook = 'logCaixa';
export const CANAL_SALDO_CAIXA: CanalWebhook = 'saldoCaixa';

export function embedMovimentoBau(log: LogBau, tipo: TipoBau): Embed {
  const entrada = log.acao === 'adicionar';
  const quem = limpo(log.usuario.nome, 100);
  return garantirLimites({
    title: entrada ? '📥 Item adicionado' : '📤 Item removido',
    description: `**${quem}** ${entrada ? 'adicionou' : 'removeu'} **${formatarNumero(log.quantidade ?? 0)}x ${limpo(log.nomeItem, 120)}**.`,
    color: entrada ? COR.entrada : COR.saida,
    fields: [
      { name: 'Baú', value: NOME_BAU[tipo], inline: true },
      { name: 'Categoria', value: limpo(log.nomeCategoria, 120) || '—', inline: true },
      { name: 'Estoque agora', value: formatarNumero(log.saldoResultante ?? 0), inline: true },
    ],
    footer: { text: RODAPE },
    timestamp: log.data,
  });
}

export function embedMovimentoCaixa(log: LogCaixa): Embed {
  const entrada = log.acao === 'entrada';
  const tipo = log.tipo === 'sujo' ? 'dinheiro sujo' : 'dinheiro limpo';
  return garantirLimites({
    title: entrada ? '💵 Entrada no caixa' : '💸 Saída do caixa',
    description: `**${limpo(log.usuario.nome, 100)}** ${entrada ? 'depositou' : 'retirou'} **${formatarDinheiro(log.valor)}** de ${tipo}.`,
    color: entrada ? COR.entrada : COR.saida,
    fields: [
      { name: 'Anotação', value: limpo(log.anotacao, 400) || '—' },
      { name: 'Saldo resultante', value: `${formatarDinheiro(log.saldoResultante)} (${tipo})`, inline: true },
    ],
    footer: { text: RODAPE },
    timestamp: log.data,
  });
}

const TITULO_AVISO: Readonly<Record<string, string>> = {
  zerar: '🧹 Baú zerado',
  ajuste: '🛠️ Ajuste em massa',
  catalogo_remover: '🗑️ Item removido do catálogo',
};

/** Zerar, ajuste em massa e remoção de item do catálogo (eventos da gerência). */
export function embedAvisoBau(log: LogBau, tipo: TipoBau): Embed {
  const removido = log.acao === 'catalogo_remover' && log.quantidade !== null;
  return garantirLimites({
    title: TITULO_AVISO[log.acao] ?? 'Aviso do baú',
    description: limpo(log.resumo, 1000) || undefined,
    color: COR.aviso,
    fields: [
      { name: 'Baú', value: NOME_BAU[tipo], inline: true },
      { name: 'Responsável', value: limpo(log.usuario.nome, 100), inline: true },
      ...(removido ? [{ name: 'Unidades que estavam no baú', value: formatarNumero(log.quantidade ?? 0), inline: true }] : []),
    ],
    footer: { text: RODAPE },
    timestamp: log.data,
  });
}

/** Aviso aos gerentes: alguém retirou droga para venda e ainda não depositou o valor. */
export function embedPendenciaDroga(e: { usuario: UsuarioRef; devido: number; quantidade: number; motivo: string; comprador: string; jaPendente: boolean }): Embed {
  return garantirLimites({
    title: e.jaPendente ? '🚨 Retirou de novo e segue em pendência' : '⚠️ Pendência de depósito',
    description: `**${limpo(e.usuario.nome, 100)}** retirou **${formatarNumero(e.quantidade)}x Saco de Meta** (${limpo(ROTULO_MOTIVO[e.motivo] ?? e.motivo, 60)}) e ainda precisa depositar no caixa.`,
    color: COR.aviso,
    fields: [
      { name: 'Falta depositar', value: formatarDinheiro(e.devido), inline: true },
      ...(e.comprador ? [{ name: 'Vendido para', value: limpo(e.comprador, 100), inline: true }] : []),
    ],
    footer: { text: RODAPE },
    timestamp: new Date().toISOString(),
  });
}
