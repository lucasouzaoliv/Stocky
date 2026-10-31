const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { getItensDaCategoria } = require('../utils/db');
const { respostaEfemera, responderErro } = require('../utils/ui');

module.exports = {
  type: 'select',
  customIds: ['bau_item'],

  async execute(interaction) {
    const [, acao, tipo, categoriaId] = interaction.customId.split(':');
    const itemId = interaction.values[0];

    let item;
    try {
      const itens = await getItensDaCategoria(categoriaId);
      item = itens.find(i => i.id === itemId);
    } catch (erro) {
      console.error('Erro em bau_item:', erro);
      return responderErro(interaction);
    }

    if (!item) {
      return interaction.reply(respostaEfemera({ content: '❌ Item não encontrado. Ele pode ter sido removido do catálogo.' }));
    }

    const modal = new ModalBuilder()
      .setCustomId(`bau_quantidade:${acao}:${tipo}:${categoriaId}:${itemId}`)
      .setTitle(`${acao === 'adicionar' ? 'Adicionar' : 'Remover'} — ${item.nome}`.slice(0, 45));

    const input = new TextInputBuilder()
      .setCustomId('quantidade')
      .setLabel(`Quantidade para ${acao === 'adicionar' ? 'adicionar' : 'remover'}`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: 10')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(6);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }
};
