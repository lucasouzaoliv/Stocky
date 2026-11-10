import 'server-only';
import type { DocBau, TipoBau } from '../dominio/tipos';

/**
 * Estoque contado nos prints do jogo (07/11/2026; Casa e Gerência atualizadas em 09/11), por baú. O botão "Atualizar catálogo" do Painel
 * grava exatamente estas quantidades; o dinheiro sujo do caixa passa a ser o total de notas marcadas.
 * Colete novo = barra verde; colete com barra amarela/vermelha = danificado.
 */
export const ESTOQUE_INICIAL: Readonly<Record<TipoBau, DocBau['itens']>> = {
  membros: {
    medicamentos: { analgesico: 1004, gaze: 1246, adrenalina: 4 },
    coletesemuni: { colete: 6, colete_danificado: 1, muni_45acp: 117 },
    materiais: {
      bateria_de_impressora: 4,
      bateria: 6,
      pecas_roupas: 16,
      material_reciclavel: 750,
      pistola_pneumatica: 1,
      serra_eletrica: 1,
    },
    extras: { agulha: 6, linha: 6, resina: 6, tesoura: 6, placa_falsa: 2, notas_marcadas: 1335, chave_de_carro: 1 },
  },
  gerencia: {
    armas: { c_4: 9 },
    materiais: { plastico: 86, removedor_de_piche: 1 },
    drogas: { mesa_de_metanfetamina: 3, saco_de_meta: 385 },
    extras: { chaves_de_casa: 1, notas_marcadas: 76594 },
  },
  casa: {
    armas: { desert: 1, usp: 5, cz_scorpion_evo: 3, assault_rifle_mk2: 3 },
    coletesemuni: { muni_50ae: 277, muni_9mm: 302, muni_45acp: 1385, muni_556x45: 500 },
    extras: { arquivo_ghost: 2 },
  },
};
