const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getSaldo, getLogsCaixa } = require('../utils/caixa');
const { podeUsarBauGerencia } = require('../utils/permissoes');
const { rowCaixa, embedCaixa, embedHistoricoCaixa, respostaEfemera, responderErro } = require('../utils/ui');

module.exports = {
  type: 'button',
  customIds: ['caixa_adicionar', 'caixa_retirar', 'caixa_logs'],

  async execute(interaction) {
    if (!podeUsarBauGerencia(interaction.member)) {
      return interaction.reply(respostaEfemera({
        content: '❌ Apenas **Consejeros** e **El Diablo** podem usar o caixa.'
      }));
    }

    const acao = interaction.customId;

    if (acao === 'caixa_logs') {
      await interaction.deferUpdate();
      try {
        const logs = await getLogsCaixa();

        if (!logs.length) {
          const saldo = await getSaldo();
          return await interaction.editReply({
            embeds: [embedCaixa(saldo).setDescription('> 📭 Nenhuma movimentação registrada ainda.')],
            components: [rowCaixa()]
          });
        }

        return await interaction.editReply({
          embeds: [embedHistoricoCaixa(logs)],
          components: [rowCaixa()]
        });
      } catch (erro) {
        console.error('Erro em caixa_logs:', erro);
        await responderErro(interaction);
      }
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`caixa_modal:${acao === 'caixa_adicionar' ? 'adicionar' : 'retirar'}`)
      .setTitle(acao === 'caixa_adicionar' ? '➕ Adicionar ao Caixa' : '➖ Retirar do Caixa');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('tipo')
          .setLabel('Tipo (sujo ou limpo)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('sujo ou limpo')
          .setRequired(true)
          .setMaxLength(5)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('valor')
          .setLabel('Valor')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 50000')
          .setRequired(true)
          .setMaxLength(15)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('anotacao')
          .setLabel('Anotação')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: Comprar LSD')
          .setRequired(true)
          .setMaxLength(100)
      )
    );

    return interaction.showModal(modal);
  }
};
