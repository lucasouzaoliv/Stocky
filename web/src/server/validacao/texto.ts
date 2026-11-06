import 'server-only';
import { LIMITES } from '@/compartilhado/limites';
import { ErroApp } from '../erros';

/** Quebras e espaços de qualquer tipo (inclui NBSP, espaços largos, U+2028/U+2029): viram um espaço comum. */
const ESPACOS = /[\t\n\v\f\r\u0085\p{Zs}\p{Zl}\p{Zp}]/gu;

/**
 * Caracteres que não aparecem na tela ou só mudam a exibição: controles (Cc), formato (Cf: ZWSP, ZWNJ, ZWJ, LRM/RLM,
 * LRE/RLE/PDF/LRO/RLO, isolates, BOM, soft hyphen, tag chars), uso privado e surrogates soltos, seletores de variação,
 * CGJ, preenchedores do hangul e braille em branco.
 */
const INVISIVEIS = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}͏︀-️\u{E0100}-\u{E01EF}ᅟᅠㅤﾠ⠀]/gu;

const VISIVEL = /[\p{L}\p{N}\p{P}\p{S}]/u;

/**
 * Saneamento ÚNICO de texto livre do usuário (nome de item e anotação do caixa): NFC, espaços exóticos viram espaço
 * comum, remove toda a classe de invisíveis/controle/direção acima e colapsa espaços. Decisão: os invisíveis são
 * removidos (não recusados), então emojis com ZWJ ou seletor de variação perdem a junção (👨‍👩‍👧 vira três emojis,
 * ❤️ vira ❤); o texto fica previsível e sem como esconder ou inverter conteúdo.
 */
export function sanearTexto(texto: string): string {
  return texto
    .normalize('NFC')
    .replace(ESPACOS, ' ')
    .replace(INVISIVEIS, '')
    .replace(/ {2,}/g, ' ')
    .trim()
    .normalize('NFC');
}

/** Tem ao menos uma letra, número, pontuação ou símbolo (marcas combinantes soltas não contam). */
export function temCaractereVisivel(texto: string): boolean {
  return VISIVEL.test(texto);
}

/** Chave de comparação de nomes: NFKC, sem diacríticos, minúsculas. "Colt", "ćolt" e "COLT" têm a mesma chave. */
export function chaveDeNome(nome: string): string {
  return sanearTexto(nome)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .normalize('NFC');
}

export function normalizarAnotacao(v: unknown): string {
  if (typeof v !== 'string') throw new ErroApp('VALIDACAO', 'Informe a anotação.');
  const limpa = sanearTexto(v);
  if (!temCaractereVisivel(limpa)) throw new ErroApp('VALIDACAO', 'Informe a anotação.');
  if (Array.from(limpa).length > LIMITES.ANOTACAO_MAX) {
    throw new ErroApp('VALIDACAO', `A anotação pode ter no máximo ${LIMITES.ANOTACAO_MAX} caracteres.`);
  }
  return limpa;
}
