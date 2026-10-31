const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
  type: 'button',
  customIds: ['ger_abrir_modal_ajustar'],

  execute(interaction) {
    const [, tipo] = interaction.customId.split(':');

    const modal = new ModalBuilder()
      .setCustomId(`ger_modal_ajustar:${tipo}`)
      .setTitle(`Ajustar Inventário — ${tipo === 'membros' ? 'Membros' : 'Gerência'}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('inventario')
          .setLabel('Cole o inventário editado aqui')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Gaze:120\nBandagem:97\n...')
          .setRequired(true)
          .setMaxLength(4000)
      )
    );

    return interaction.showModal(modal);
  }
};
