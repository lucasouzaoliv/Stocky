const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { embedSelecionarCategoria, embedInventario, embedMenuPrincipal } = require('../utils/embeds');
const { getCategorias, getBau } = require('../utils/db');
const { rowMenuBau, rowCancelarBau, responderErro } = require('../utils/ui');

module.exports = {
  type: 'button',
  customIds: ['bau_adicionar', 'bau_remover', 'bau_estoque', 'bau_cancelar'],

  async execute(interaction) {
    await interaction.deferUpdate();
    const [acao, tipo] = interaction.customId.split(':');

    if (acao === 'bau_cancelar') {
      return interaction.editReply({
        embeds: [embedMenuPrincipal(tipo)],
        components: [rowMenuBau(tipo)]
      });
    }

    try {
      if (acao === 'bau_estoque') {
        const bau = await getBau(tipo);
        const embed = await embedInventario(bau, tipo);
        return await interaction.editReply({
          embeds: [embed],
          components: [rowMenuBau(tipo)]
        });
      }

      const acaoNome = acao === 'bau_adicionar' ? 'adicionar' : 'remover';
      const categorias = await getCategorias();

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`bau_categoria:${acaoNome}:${tipo}`)
          .setPlaceholder('Selecione uma categoria...')
          .addOptions(categorias.map(cat => ({ label: cat.nome, value: cat.id, emoji: cat.emoji })))
      );

      return await interaction.editReply({
        embeds: [embedSelecionarCategoria(tipo, acaoNome)],
        components: [selectRow, rowCancelarBau(tipo)]
      });
    } catch (erro) {
      console.error('Erro em bau_menu:', erro);
      try {
        await interaction.editReply({ embeds: [embedMenuPrincipal(tipo)], components: [rowMenuBau(tipo)] });
      } catch (erroPainel) {
        console.error('Falha ao restaurar o painel:', erroPainel);
      }
      await responderErro(interaction);
    }
  }
};
