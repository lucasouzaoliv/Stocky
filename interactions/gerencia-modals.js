const { embedSucesso, embedErro, embedGerencia } = require('../utils/embeds');
const { adicionarItemAoCatalogo } = require('../utils/db');
const { rowsPainelGerencia, respostaEfemera, responderErro } = require('../utils/ui');

module.exports = {
  type: 'modal',
  customIds: ['ger_modal_adicionar'],
  permissao: 'gerente',

  async execute(interaction) {
    const [, categoriaId] = interaction.customId.split(':');
    const nome = interaction.fields.getTextInputValue('nome');
    const id = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    try {
      const resultado = await adicionarItemAoCatalogo(categoriaId, id, nome);

      if (!resultado.sucesso) {
        await interaction.reply(respostaEfemera({ embeds: [embedErro('Erro', resultado.motivo)] }));
      } else {
        await interaction.reply(respostaEfemera({ embeds: [embedSucesso('Item adicionado!', `**${nome}** foi adicionado ao catalogo com sucesso!`)] }));
      }

      await interaction.message.edit({
        embeds: [embedGerencia()],
        components: rowsPainelGerencia()
      });
    } catch (erro) {
      console.error('Erro em ger_modal_adicionar:', erro);
      await responderErro(interaction);
    }
  }
};
