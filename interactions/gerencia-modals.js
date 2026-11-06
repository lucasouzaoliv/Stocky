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

    try {
      const resultado = await adicionarItemAoCatalogo(categoriaId, nome);

      if (!resultado.sucesso) {
        await interaction.reply(respostaEfemera({ embeds: [embedErro('Erro', resultado.motivo)] }));
      } else {
        await interaction.reply(respostaEfemera({
          embeds: [embedSucesso('Item adicionado!', `**${resultado.item.nome}** foi adicionado ao catalogo com sucesso!`)]
        }));
      }
    } catch (erro) {
      console.error('Erro em ger_modal_adicionar:', erro);
      await responderErro(interaction);
      return;
    }

    // O painel volta ao normal (duas linhas de botões); falhar aqui não esconde o resultado acima.
    try {
      await interaction.message.edit({ embeds: [embedGerencia()], components: rowsPainelGerencia() });
    } catch (erro) {
      console.error('Falha ao restaurar o painel da gerência:', erro);
    }
  }
};
