const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { embedSelecionarItem, embedMenuPrincipal } = require('../utils/embeds');
const { getCategorias, getItensDaCategoria } = require('../utils/db');
const { rowMenuBau, rowCancelarBau, responderErro, permissaoBau } = require('../utils/ui');

module.exports = {
  type: 'select',
  customIds: ['bau_categoria'],
  permissao: permissaoBau(2),

  async execute(interaction) {
    await interaction.deferUpdate();
    const [, acao, tipo] = interaction.customId.split(':');
    const categoriaId = interaction.values[0];

    try {
      const categorias = await getCategorias();
      const categoria = categorias.find(c => c.id === categoriaId);
      const itens = categoria ? await getItensDaCategoria(categoriaId) : [];

      if (!categoria || !itens.length) {
        return await interaction.editReply({
          embeds: [embedMenuPrincipal(tipo)],
          components: [rowMenuBau(tipo)]
        });
      }

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`bau_item:${acao}:${tipo}:${categoriaId}`)
          .setPlaceholder('Selecione um item...')
          .addOptions(itens.map(item => ({ label: item.nome, value: item.id })))
      );

      return await interaction.editReply({
        embeds: [embedSelecionarItem(acao, categoria.nome, categoria.emoji)],
        components: [selectRow, rowCancelarBau(tipo)]
      });
    } catch (erro) {
      console.error('Erro em bau_categoria:', erro);
      try {
        await interaction.editReply({ embeds: [embedMenuPrincipal(tipo)], components: [rowMenuBau(tipo)] });
      } catch (erroPainel) {
        console.error('Falha ao restaurar o painel:', erroPainel);
      }
      await responderErro(interaction);
    }
  }
};
