import 'server-only';
import type { DocBau, TipoBau } from '../dominio/tipos';

/**
 * Estoque contado nos prints do jogo (07/11/2026), por baú. O botão "Atualizar catálogo" do Painel
 * grava exatamente estas quantidades; o dinheiro sujo do caixa passa a ser o total de notas marcadas.
 * Colete novo = barra verde; colete com barra amarela/vermelha = danificado.
 */
export const ESTOQUE_INICIAL: Readonly<Record<TipoBau, DocBau['itens']>> = {
  membros: {
    medicamentos: { analgesico: 1036, gaze: 1260, adrenalina: 5 },
    coletesemuni: { muni_45acp: 117 },
    materiais: { bateria_de_impressora: 4, pistola_pneumatica: 1, serra_eletrica: 1 },
    drogas: { saco_de_meta: 65 },
    extras: { trojan_bancario: 2, usb_trojan: 3 },
  },
  gerencia: {
    armas: { c_4: 9 },
    coletesemuni: { colete: 6, colete_danificado: 2, muni_9mm: 160 },
    materiais: { removedor_de_piche: 1 },
    drogas: { mesa_de_metanfetamina: 4, saco_de_meta: 12, insumo_para_fabricacao_de_drogas: 24 },
    extras: { placa_falsa: 1, notas_marcadas: 73924, chaves_de_casa: 2 },
  },
  casa: {
    armas: { desert: 1, usp: 7, cz_scorpion_evo: 3 },
    coletesemuni: { muni_50ae: 277, muni_9mm: 302, muni_45acp: 1587 },
    extras: { arquivo_ghost: 2 },
  },
};
