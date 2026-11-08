import 'server-only';
import { lerBau } from '../bau/leitura';
import type { ResultadoWebhook } from '../discord/webhook';
import { exigirTipoBau } from '../dominio/refs';
import type { ChaveMensagem, TipoBau } from '../dominio/tipos';
import { getEnv } from '../env';
import { log } from '../log';
import { montarEmbedsInventario } from './inventario-embeds';
import { publicarMensagemFixa } from './mensagem-fixa';

/** Lê o estado ATUAL do baú no momento do envio (ADR-10) e edita a mensagem fixa do canal de inventário. */
export async function atualizarInventario(tipoBruto: TipoBau): Promise<ResultadoWebhook> {
  try {
    const tipo = exigirTipoBau(tipoBruto);
    const bau = await lerBau(tipo);
    const embeds = montarEmbedsInventario(bau, `${getEnv().appUrl}/bau/${tipo}`);
    const chave: ChaveMensagem = `inventario_${tipo}`;
    return await publicarMensagemFixa(chave, tipo === 'membros' ? 'inventarioMembros' : 'inventarioGerencia', { embeds });
  } catch (e) {
    log.erro('Falha ao montar o inventário para o Discord', e);
    return { ok: false, motivo: 'interno' };
  }
}
