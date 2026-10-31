const { SlashCommandBuilder } = require('discord.js');
const { getConfig } = require('../utils/config');
const { getSaldo } = require('../utils/caixa');
const { rowCaixa, embedCaixa, respostaEfemera, responderErro } = require('../utils/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-caixa')
    .setDescription('Envia a mensagem fixa do caixa no canal (use apenas uma vez)'),

  async execute(interaction, client) {
    const canal = client.channels.cache.get(getConfig().channels.caixaGangue);
    if (!canal) {
      return interaction.reply(respostaEfemera({ content: '❌ Canal do caixa não encontrado.' }));
    }

    await interaction.deferReply(respostaEfemera());
    try {
      const saldo = await getSaldo();
      await canal.send({ embeds: [embedCaixa(saldo)], components: [rowCaixa()] });
      return await interaction.editReply({ content: '✅ Caixa enviado!' });
    } catch (erro) {
      console.error('Erro em /setup-caixa:', erro);
      await responderErro(interaction);
    }
  }
};
