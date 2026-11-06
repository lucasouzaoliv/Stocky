import 'server-only';
import { formatarDinheiro } from '@/compartilhado/formatacao';
import { lerSaldo } from '../caixa/leitura';
import type { Embed, ResultadoWebhook } from '../discord/webhook';
import { log } from '../log';
import { publicarMensagemFixa } from './mensagem-fixa';
import { COR, RODAPE, garantirLimites } from './formatacao';

export function embedSaldo(saldo: { sujo?: number; limpo?: number }): Embed {
  const valor = (n: number | undefined): string => formatarDinheiro(Number.isFinite(n) ? (n as number) : 0);
  return garantirLimites({
    title: '💰 Caixa da gangue',
    color: COR.roxo,
    fields: [
      { name: 'Dinheiro sujo', value: valor(saldo.sujo), inline: true },
      { name: 'Dinheiro limpo', value: valor(saldo.limpo), inline: true },
    ],
    footer: { text: RODAPE },
    timestamp: new Date().toISOString(),
  });
}

/** Lê o saldo ATUAL no momento do envio e edita a mensagem fixa do canal de saldo. Nunca lança. */
export async function atualizarSaldo(): Promise<ResultadoWebhook> {
  try {
    const saldo = await lerSaldo();
    return await publicarMensagemFixa('saldo_caixa', 'saldoCaixa', { embeds: [embedSaldo(saldo)] });
  } catch (e) {
    log.erro('Falha ao montar o saldo para o Discord', e);
    return { ok: false, motivo: 'interno' };
  }
}
