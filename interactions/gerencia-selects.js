const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const { embedGerencia, embedSucesso, embedErro } = require('../utils/embeds');
const { getItensDaCategoria, zerarBau, getLogs, removerItemDoCatalogo } = require('../utils/db');
const { atualizarPainelInventario } = require('../utils/painel');
const { LIMITES } = require('../utils/validacao');
const { rowsPainelGerencia, embedLogsBau, responderErro } = require('../utils/ui');

const TIPOS_ZERAR = ['membros', 'gerencia', 'ambos'];

// Falha ao atualizar o painel nunca desfaz nem esconde o sucesso da operação (o painel nunca lança).
async function atualizarPaineis(client, tipos) {
  for (const tipo of tipos) {
    await atualizarPainelInventario(client, tipo);
  }
}

function abrirModalAdicionar(interaction) {
  const categoriaId = interaction.values[0];
  const modal = new ModalBuilder()
    .setCustomId(`ger_modal_adicionar:${categoriaId}`)
    .setTitle('Adicionar Item ao Catalogo');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Nome do item')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Granada')
        .setRequired(true)
        .setMaxLength(LIMITES.NOME_ITEM_MAX)
    )
  );

  return interaction.showModal(modal);
}

async function escolherItemParaRemover(interaction) {
  const categoriaId = interaction.values[0];
  const itens = await getItensDaCategoria(categoriaId);

  if (!itens.length) {
    return interaction.editReply({
      embeds: [embedErro('Sem itens', 'Essa categoria nao possui itens cadastrados.')],
      components: rowsPainelGerencia()
    });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`ger_item_remover:${categoriaId}`)
    .setPlaceholder('Selecione o item para remover...')
    .addOptions(itens.map(item => ({ label: item.nome, value: item.id })));

  return interaction.editReply({
    embeds: [embedGerencia().setDescription('> Selecione o item que deseja remover do catalogo:')],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

async function removerItem(interaction, client) {
  const [, categoriaId] = interaction.customId.split(':');
  const itemId = interaction.values[0];

  const resultado = await removerItemDoCatalogo(categoriaId, itemId, interaction.user);
  if (!resultado.sucesso) {
    return interaction.editReply({
      embeds: [embedErro('Erro', resultado.motivo)],
      components: rowsPainelGerencia()
    });
  }

  await interaction.editReply({
    embeds: [embedSucesso('Item removido!', 'Item removido do catalogo e dos baus com sucesso.')],
    components: rowsPainelGerencia()
  });
  await atualizarPaineis(client, ['membros', 'gerencia']);
}

async function zerar(interaction, client) {
  const tipo = interaction.values[0];

  if (!TIPOS_ZERAR.includes(tipo)) {
    return interaction.editReply({
      embeds: [embedErro('Erro', 'Opção de baú inválida.')],
      components: rowsPainelGerencia()
    });
  }

  const resultado = await zerarBau(tipo, interaction.user);
  if (!resultado.sucesso) {
    return interaction.editReply({
      embeds: [embedErro('Erro', resultado.motivo || 'Não foi possível zerar o baú.')],
      components: rowsPainelGerencia()
    });
  }

  await interaction.editReply({
    embeds: [embedSucesso('Bau zerado!', 'O bau foi resetado e o inventario atualizado.')],
    components: rowsPainelGerencia()
  });
  await atualizarPaineis(client, resultado.tipos);
}

async function verLogs(interaction) {
  const tipo = interaction.values[0];
  const logs = await getLogs(tipo);

  if (!logs.length) {
    return interaction.editReply({
      embeds: [embedErro('Sem logs', 'Nenhuma movimentacao registrada ainda.')],
      components: rowsPainelGerencia()
    });
  }

  return interaction.editReply({
    embeds: [embedLogsBau(tipo, logs)],
    components: rowsPainelGerencia()
  });
}

module.exports = {
  type: 'select',
  customIds: ['ger_cat_adicionar', 'ger_cat_remover', 'ger_zerar_confirmar', 'ger_logs_tipo', 'ger_item_remover'],
  permissao: 'gerente',

  async execute(interaction, client) {
    const acao = interaction.customId;

    if (acao === 'ger_cat_adicionar') {
      return abrirModalAdicionar(interaction);
    }

    await interaction.deferUpdate();

    try {
      if (acao === 'ger_cat_remover') return await escolherItemParaRemover(interaction);
      if (acao.startsWith('ger_item_remover')) return await removerItem(interaction, client);
      if (acao === 'ger_zerar_confirmar') return await zerar(interaction, client);
      if (acao === 'ger_logs_tipo') return await verLogs(interaction);
    } catch (erro) {
      console.error(`Erro em ${acao}:`, erro);
      try {
        await interaction.editReply({ embeds: [embedGerencia()], components: rowsPainelGerencia() });
      } catch (erroPainel) {
        console.error('Falha ao restaurar o painel:', erroPainel);
      }
      await responderErro(interaction);
    }
  }
};
