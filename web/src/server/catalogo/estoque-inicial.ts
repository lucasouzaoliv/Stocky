import 'server-only';
import type { DocBau, TipoBau } from '../dominio/tipos';

/**
 * Estoque contado nos prints do jogo (última contagem: 11/11/2026), por baú. O botão "Atualizar catálogo" do Painel
 * grava exatamente estas quantidades; o dinheiro sujo do caixa passa a ser o total de notas marcadas.
 * Colete novo = barra verde; colete com barra amarela/vermelha = danificado.
 */
export const ESTOQUE_INICIAL: Readonly<Record<TipoBau, DocBau['itens']>> = {
  membros: {
    medicamentos: { analgesico: 976, gaze: 1265, adrenalina: 4 },
    coletesemuni: { colete: 1 },
    materiais: { bateria_de_impressora: 4, material_reciclavel: 216, sucata_metal: 10, pneu: 1, kit_de_reparos: 1 },
    drogas: { cocaina: 2 },
  },
  gerencia: {
    armas: { c_4: 9 },
    coletesemuni: { colete: 7 },
    materiais: { plastico: 29, pecas_roupas: 1 },
    drogas: { saco_de_meta: 1028, insumo_para_fabricacao_de_drogas: 3, mesa_de_metanfetamina: 4 },
    extras: { chaves_de_casa: 1, notas_marcadas: 100646 },
  },
  casa: {
    armas: { desert: 7, usp: 6, cz_scorpion_evo: 2, assault_rifle_mk2: 3, tec_9: 1 },
    coletesemuni: { muni_50ae: 823, muni_9mm: 372, muni_45acp: 1590, muni_556x45: 853 },
    extras: { arquivo_ghost: 2 },
  },
};
