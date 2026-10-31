'use strict';

// Componentes de UI compartilhados (linhas de botões e embeds). Contrato: docs/architecture.md §4.8.
// Não lê config.json nem utils/config.js: tudo que depende de configuração chega por parâmetro.

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');

const COR_PADRAO = 0x3498DB;
const COR_SUCESSO = 0x2ECC71;
const COR_ERRO = 0xE74C3C;
const RODAPE = 'Marabunta Grande — Stocky';

const LIMITE_DESCRICAO = 4096;
const LIMITE_CAMPO = 1024;
const LIMITE_ANOTACAO = 100;

function respostaEfemera(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

const MENSAGEM_ERRO_GENERICA = '❌ Ocorreu um erro ao processar essa ação. Tente novamente em instantes.';

// Resposta efêmera de erro sem detalhes internos. Usa reply se a interação ainda
// não foi respondida e followUp caso contrário; nunca lança.
async function responderErro(interaction, mensagem = MENSAGEM_ERRO_GENERICA) {
  const payload = respostaEfemera({ content: mensagem });
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (erro) {
    console.error('Falha ao responder erro ao usuário:', erro);
  }
}

function numeroSeguro(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

// Formata sem depender do ICU do Node: 1000 -> "$1.000".
function formatarDinheiro(n) {
  const inteiro = Math.trunc(numeroSeguro(n));
  const sinal = inteiro < 0 ? '-' : '';
  const digitos = String(Math.abs(inteiro)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sinal}$${digitos}`;
}

function truncar(texto, max) {
  const t = String(texto ?? '');
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

// Junta linhas sem passar de `max`; o que não couber vira "… e mais N".
function juntarLinhas(linhas, max = LIMITE_DESCRICAO) {
  const itens = linhas.map((l) => truncar(l, 400));
  const completo = itens.join('\n');
  if (completo.length <= max) return completo;

  const sufixo = (restantes) => `\n… e mais ${restantes}`;
  const reserva = sufixo(itens.length).length;
  const aceitas = [];
  let tamanho = 0;
  for (const linha of itens) {
    const extra = (aceitas.length ? 1 : 0) + linha.length;
    if (tamanho + extra + reserva > max) break;
    aceitas.push(linha);
    tamanho += extra;
  }
  return aceitas.join('\n') + sufixo(itens.length - aceitas.length);
}

function nomeBau(tipo) {
  return tipo === 'gerencia' ? 'Gerência' : 'Membros';
}

function nomeTipoCaixa(tipo) {
  return tipo === 'sujo' ? '🖤 Sujo' : '💵 Limpo';
}

function formatarData(timestamp) {
  const data = new Date(timestamp);
  return Number.isNaN(data.getTime()) ? 'data desconhecida' : data.toLocaleString('pt-BR');
}

// ---------- Linhas de botões ----------

function rowMenuBau(tipo) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bau_adicionar:${tipo}`).setLabel('📥 Adicionar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bau_remover:${tipo}`).setLabel('📤 Remover').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`bau_estoque:${tipo}`).setLabel('📋 Ver Estoque').setStyle(ButtonStyle.Primary)
  );
}

function rowCancelarBau(tipo) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bau_cancelar:${tipo}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary)
  );
}

function rowMenuGerencia() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ger_adicionar_item').setLabel('➕ Adicionar Item').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ger_remover_item').setLabel('➖ Remover Item').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ger_zerar_bau').setLabel('🗑️ Zerar Baú').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ger_ver_logs').setLabel('📋 Ver Logs').setStyle(ButtonStyle.Primary)
  );
}

function rowMenuGerencia2() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ger_ajustar_membros').setLabel('📝 Ajustar Baú Membros').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ger_ajustar_gerencia').setLabel('📝 Ajustar Baú Gerência').setStyle(ButtonStyle.Secondary)
  );
}

function rowsPainelGerencia() {
  return [rowMenuGerencia(), rowMenuGerencia2()];
}

function rowCancelarGerencia() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ger_cancelar').setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary)
  );
}

function rowCaixa() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('caixa_adicionar').setLabel('➕ Adicionar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('caixa_retirar').setLabel('➖ Retirar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('caixa_logs').setLabel('📋 Ver Histórico').setStyle(ButtonStyle.Primary)
  );
}

function rowConfirmarAjuste(pendenteId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ger_ajuste_confirmar:${pendenteId}`).setLabel('✅ Confirmar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ger_ajuste_cancelar:${pendenteId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary)
  );
}

// ---------- Embeds ----------

function embedCaixa(saldo) {
  const s = saldo || {};
  return new EmbedBuilder()
    .setColor(COR_PADRAO)
    .setTitle('💰 Caixa da Gangue')
    .setDescription('> Área restrita para **Consejeros** e **El Diablo**.')
    .addFields(
      { name: '🖤 Dinheiro Sujo', value: formatarDinheiro(s.sujo), inline: true },
      { name: '💵 Dinheiro Limpo', value: formatarDinheiro(s.limpo), inline: true }
    )
    .setFooter({ text: RODAPE })
    .setTimestamp();
}

function embedLogCaixa(acao, usuario, tipo, valor, anotacao, saldo) {
  const isAdd = acao === 'adicionar';
  const s = saldo || {};
  const u = usuario || {};
  const tipoNome = tipo === 'sujo' ? '🖤 Dinheiro Sujo' : '💵 Dinheiro Limpo';
  const nota = truncar(anotacao, LIMITE_CAMPO).trim() || '—';
  return new EmbedBuilder()
    .setColor(isAdd ? COR_SUCESSO : COR_ERRO)
    .setTitle(isAdd ? '➕ Entrada no Caixa' : '➖ Saída do Caixa')
    .addFields(
      { name: '👤 Responsável', value: truncar(`<@${u.id}> — ${u.tag}`, LIMITE_CAMPO), inline: true },
      { name: '💰 Tipo', value: tipoNome, inline: true },
      { name: isAdd ? '➕ Valor Adicionado' : '➖ Valor Retirado', value: formatarDinheiro(valor), inline: true },
      { name: '📝 Anotação', value: nota, inline: false },
      { name: '🖤 Saldo Sujo', value: formatarDinheiro(s.sujo), inline: true },
      { name: '💵 Saldo Limpo', value: formatarDinheiro(s.limpo), inline: true }
    )
    .setFooter({ text: RODAPE })
    .setTimestamp();
}

function embedHistoricoCaixa(logs) {
  const lista = Array.isArray(logs) ? logs : [];
  const embed = new EmbedBuilder()
    .setColor(COR_PADRAO)
    .setTitle('📋 Histórico do Caixa')
    .setFooter({ text: RODAPE })
    .setTimestamp();

  if (!lista.length) {
    return embed.setDescription('> 📭 Nenhuma movimentação registrada ainda.');
  }

  const linhas = lista.map((l) => {
    const icone = l.acao === 'adicionar' ? '➕' : '➖';
    const nota = truncar(l.anotacao, LIMITE_ANOTACAO);
    return `${icone} **${formatarDinheiro(l.valor)}** ${nomeTipoCaixa(l.tipo)} — ${nota} — <@${l.usuarioId}> — ${formatarData(l.timestamp)}`;
  });
  return embed.setDescription(juntarLinhas(linhas));
}

function embedLogsBau(tipo, logs) {
  const lista = Array.isArray(logs) ? logs : [];
  const embed = new EmbedBuilder()
    .setColor(COR_PADRAO)
    .setTitle(`📋 Ultimas movimentacoes — ${tipo === 'gerencia' ? 'Bau da Gerencia' : 'Bau dos Membros'}`)
    .setFooter({ text: RODAPE })
    .setTimestamp();

  if (!lista.length) {
    return embed.setDescription('> 📭 Nenhuma movimentação registrada ainda.');
  }

  const linhas = lista.map((l) => {
    const icone = l.acao === 'adicionar' ? '📥' : '📤';
    const nome = l.item && l.item.nome ? l.item.nome : 'Item removido';
    return `${icone} **${nome}** x${l.quantidade} — <@${l.usuarioId}> — ${formatarData(l.timestamp)}`;
  });
  return embed.setDescription(juntarLinhas(linhas));
}

function embedResumoAjuste(tipo, linhas) {
  const lista = Array.isArray(linhas) ? linhas : [];
  const embed = new EmbedBuilder()
    .setColor(COR_PADRAO)
    .setTitle(`📝 Resumo do Ajuste — Baú ${nomeBau(tipo)}`)
    .setFooter({ text: RODAPE })
    .setTimestamp();

  if (!lista.length) {
    return embed.setDescription('> Nenhuma alteração a aplicar.');
  }

  const texto = lista.map((l) => {
    const depois = Number(l.depois) === 0 ? '`0` (remove)' : `\`${l.depois}\``;
    return `**${l.nome}** (${l.categoria}): \`${l.antes}\` → ${depois}`;
  });
  return embed.setDescription(juntarLinhas(texto));
}

// Permissão dos handlers do baú: o nível depende do `tipo` presente no customId.
// `posicaoTipo` é o índice do tipo ao separar o customId por ':'.
function permissaoBau(posicaoTipo) {
  return (interaction) => {
    const tipo = String(interaction.customId).split(':')[posicaoTipo];
    if (tipo === 'membros') return 'membro';
    if (tipo === 'gerencia') return 'gerente';
    return null;
  };
}

module.exports = {
  MENSAGEM_ERRO_GENERICA,
  permissaoBau,
  respostaEfemera,
  responderErro,
  formatarDinheiro,
  rowMenuBau,
  rowCancelarBau,
  rowMenuGerencia,
  rowMenuGerencia2,
  rowsPainelGerencia,
  rowCancelarGerencia,
  rowCaixa,
  rowConfirmarAjuste,
  embedCaixa,
  embedLogCaixa,
  embedHistoricoCaixa,
  embedLogsBau,
  embedResumoAjuste
};
