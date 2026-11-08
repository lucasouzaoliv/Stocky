import 'server-only';
import { NOME_DO_BAU, type BauDTO } from '@/compartilhado/api-tipos';
import { formatarNumero } from '@/compartilhado/formatacao';
import type { Embed } from '../discord/webhook';
import { COR, LIMITES_DISCORD, RODAPE, escaparMarkdown, truncar } from './formatacao';

const NOME_BAU = NOME_DO_BAU;
const NOME_LINHA_MAX = 120;
/** Espaço guardado, quando algo fica de fora, para o aviso "… e mais N itens" com o link e o rodapé. */
const RESERVA_AVISO = 400;

interface Bloco {
  titulo: string;
  linhas: string[];
}

interface Montagem {
  embeds: Embed[];
  restantes: number;
}

function textoAviso(restantes: number, linkSite: string): string {
  const rotulo = restantes === 1 ? 'item' : 'itens';
  return `… e mais ${formatarNumero(restantes)} ${rotulo}. Veja o estoque completo no site: ${linkSite}`;
}

/**
 * Enche embeds em ordem até `maxEmbeds` embeds ou `orcamento` caracteres; para no primeiro item que não couber.
 * Uma categoria que passa de 4096 caracteres continua em outro embed.
 */
function encher(blocos: Bloco[], tituloBau: string, linkSite: string, maxEmbeds: number, orcamento: number): Montagem {
  const embeds: Embed[] = [];
  let usado = 0;
  let mostrados = 0;
  type Aberto = { embed: Embed; linhas: string[]; tamanho: number };
  let atual = null as Aberto | null;

  const fechar = (): void => {
    if (atual) {
      atual.embed.description = atual.linhas.join('\n');
      embeds.push(atual.embed);
      atual = null;
    }
  };

  externo: for (const bloco of blocos) {
    let continuacao = false;
    for (const linha of bloco.linhas) {
      if (atual && atual.tamanho + 1 + linha.length > LIMITES_DISCORD.DESCRICAO) {
        fechar();
        continuacao = true;
      }
      if (!atual) {
        if (embeds.length >= maxEmbeds) break externo;
        const primeiro = embeds.length === 0;
        const titulo = truncar(
          `${primeiro ? `${tituloBau} · ` : ''}${bloco.titulo}${continuacao ? ' (cont.)' : ''}`,
          LIMITES_DISCORD.TITULO,
        );
        if (usado + titulo.length + linha.length > orcamento) break externo;
        usado += titulo.length;
        atual = { embed: { title: titulo, ...(primeiro ? { url: linkSite } : {}), color: COR.roxo }, linhas: [], tamanho: 0 };
      } else if (usado + 1 + linha.length > orcamento) {
        break externo;
      }
      usado += linha.length + (atual.linhas.length > 0 ? 1 : 0);
      atual.tamanho += linha.length + (atual.linhas.length > 0 ? 1 : 0);
      atual.linhas.push(linha);
      mostrados += 1;
    }
    fechar();
  }
  fechar();
  const total = blocos.reduce((soma, b) => soma + b.linhas.length, 0);
  return { embeds, restantes: total - mostrados };
}

/**
 * Embeds de uma mensagem fixa de inventário (ADR-17): no máximo 10 embeds e 6000 caracteres no total.
 * O que não couber vira "… e mais N itens" com link para o site; nada some sem aviso.
 */
export function montarEmbedsInventario(bau: BauDTO, linkSite: string): Embed[] {
  const tituloBau = truncar(`📦 ${NOME_BAU[bau.tipo]}`, LIMITES_DISCORD.TITULO);
  const timestamp = new Date().toISOString();
  const rodape = { text: RODAPE };
  const blocos: Bloco[] = bau.categorias
    .filter((c) => c.itens.length > 0)
    .map((c) => ({
      titulo: truncar(`${c.emoji} ${escaparMarkdown(c.nome)}`, 120),
      linhas: c.itens.map((i) => `${truncar(escaparMarkdown(i.nome), NOME_LINHA_MAX)}: **${formatarNumero(i.quantidade)}**`),
    }));

  if (blocos.length === 0) {
    return [{ title: tituloBau, url: linkSite, description: 'Nenhum item registrado.', color: COR.roxo, footer: rodape, timestamp }];
  }

  const completo = encher(blocos, tituloBau, linkSite, LIMITES_DISCORD.EMBEDS, LIMITES_DISCORD.TOTAL - RODAPE.length);
  if (completo.restantes === 0) {
    const ultimo = completo.embeds[completo.embeds.length - 1] as Embed;
    ultimo.footer = rodape;
    ultimo.timestamp = timestamp;
    return completo.embeds;
  }

  const parcial = encher(blocos, tituloBau, linkSite, LIMITES_DISCORD.EMBEDS - 1, LIMITES_DISCORD.TOTAL - RESERVA_AVISO);
  parcial.embeds.push({
    description: truncar(textoAviso(parcial.restantes, linkSite), LIMITES_DISCORD.DESCRICAO),
    color: COR.aviso,
    footer: rodape,
    timestamp,
  });
  return parcial.embeds;
}
