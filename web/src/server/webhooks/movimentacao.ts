import 'server-only';
import { formatarDinheiro, formatarNumero } from '@/compartilhado/formatacao';
import type { CanalWebhook } from '../env';
import type { Embed } from '../discord/webhook';
import type { LogBau, LogCaixa, TipoBau } from '../dominio/tipos';
import { COR, RODAPE, escaparMarkdown, garantirLimites, truncar } from './formatacao';

const NOME_BAU: Readonly<Record<TipoBau, string>> = { membros: 'Baú dos Membros', gerencia: 'Baú da Gerência' };

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
