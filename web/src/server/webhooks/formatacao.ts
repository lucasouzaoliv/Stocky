import 'server-only';
import type { Embed } from '../discord/webhook';

export const LIMITES_DISCORD = Object.freeze({
  TITULO: 256,
  DESCRICAO: 4096,
  CAMPO_NOME: 256,
  CAMPO_VALOR: 1024,
  CAMPOS: 25,
  EMBEDS: 10,
  TOTAL: 6000,
  RODAPE: 2048,
});

export const COR = Object.freeze({ roxo: 0x9000c0, entrada: 0x22c55e, saida: 0xef4444, aviso: 0xf59e0b });
export const RODAPE = 'Marabunta Grande • Stocky';

const ZWSP = '​';

/**
 * Neutraliza markdown e menções num texto vindo do usuário (nome, anotação, item).
 * `@` e `<@`, `<#`, `<:` ganham um espaço de largura zero; o resto recebe barra invertida.
 */
export function escaparMarkdown(t: string): string {
  return t
    .replace(/[\\*_~`|>#[\]()]/g, '\\$&')
    .replace(/@/g, `@${ZWSP}`)
    .replace(/<(?=[@#:/]|a:)/g, `<${ZWSP}`);
}

/** Corta em `max` caracteres (unidades UTF-16, a medida mais conservadora) sem partir um par substituto. */
export function truncar(t: string, max: number): string {
  if (t.length <= max) return t;
  if (max <= 0) return '';
  let corte = max - 1;
  const ultimo = t.charCodeAt(corte - 1);
  if (ultimo >= 0xd800 && ultimo <= 0xdbff) corte -= 1;
  return `${t.slice(0, corte)}…`;
}

/** Regra do Discord: título + descrição + nomes e valores dos campos + rodapé (+ autor, que não usamos). */
export function tamanhoEmbed(e: Embed): number {
  let total = (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0);
  for (const c of e.fields ?? []) total += c.name.length + c.value.length;
  return total;
}

export function tamanhoTotal(embeds: readonly Embed[]): number {
  return embeds.reduce((soma, e) => soma + tamanhoEmbed(e), 0);
}

/** Aplica os limites individuais e, se ainda passar de 6000, corta a descrição e depois os campos finais. */
export function garantirLimites(embed: Embed): Embed {
  const saida: Embed = { ...embed };
  if (saida.title !== undefined) saida.title = truncar(saida.title, LIMITES_DISCORD.TITULO);
  if (saida.description !== undefined) saida.description = truncar(saida.description, LIMITES_DISCORD.DESCRICAO);
  if (saida.footer) saida.footer = { text: truncar(saida.footer.text, LIMITES_DISCORD.RODAPE) };
  if (saida.fields) {
    saida.fields = saida.fields.slice(0, LIMITES_DISCORD.CAMPOS).map((c) => ({
      ...c,
      name: truncar(c.name, LIMITES_DISCORD.CAMPO_NOME) || ZWSP,
      value: truncar(c.value, LIMITES_DISCORD.CAMPO_VALOR) || ZWSP,
    }));
  }
  while (tamanhoEmbed(saida) > LIMITES_DISCORD.TOTAL) {
    const excesso = tamanhoEmbed(saida) - LIMITES_DISCORD.TOTAL;
    if (saida.description && saida.description.length > 0) {
      saida.description = truncar(saida.description, Math.max(0, saida.description.length - excesso));
    } else if (saida.fields && saida.fields.length > 0) {
      saida.fields = saida.fields.slice(0, -1);
    } else {
      saida.title = truncar(saida.title ?? '', Math.max(0, (saida.title?.length ?? 0) - excesso));
      break;
    }
  }
  return saida;
}
