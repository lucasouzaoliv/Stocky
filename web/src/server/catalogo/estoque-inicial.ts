import 'server-only';
import type { DocBau, TipoBau } from '../dominio/tipos';

/**
 * Estoque contado nos prints do jogo (07/11/2026), por baú. O botão "Atualizar catálogo" do Painel
 * grava exatamente estas quantidades. Colete novo = barra verde; colete com barra amarela/vermelha = danificado.
 */
export const ESTOQUE_INICIAL: Readonly<Record<TipoBau, DocBau['itens']>> = {
  membros: {
    medicamentos: { analgesico: 1074, gaze: 1261, adrenalina: 5 },
    coletesemuni: { muni_45acp: 105 },
    materiais: { alicate_de_corte: 1, lockpick: 2, pistola_pneumatica: 1, serra_eletrica: 1, chave_de_roda: 1, vara_nivel_3: 1 },
    drogas: { saco_de_metanfetamina: 100, mesa_de_metanfetamina: 1 },
    extras: { trojan_bancario: 1, tablet: 1, usb_trojan: 8, snikkel: 1, chave_de_carro: 1, cafe_do_cassino: 2 },
  },
  gerencia: {
    armas: { desert: 1, usp: 8, cz_scorpion_evo: 3, c_4: 9 },
    coletesemuni: { colete: 3, colete_danificado: 2, muni_9mm: 462, muni_45acp: 1705, muni_50ae: 693 },
    materiais: { bateria_de_impressora: 4, plastico: 1053, removedor_de_piche: 1 },
    drogas: { insumo_para_fabricacao_de_drogas: 8, saco_de_metanfetamina: 596 },
    extras: { placa_falsa: 1, chaves_de_casa: 4, notas_marcadas: 99654, arquivo_ghost: 2 },
  },
};
