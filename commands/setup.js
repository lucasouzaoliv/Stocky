const { SlashCommandBuilder } = require('discord.js');
const { embedMenuPrincipal, embedGerencia } = require('../utils/embeds');
const { getConfig } = require('../utils/config');
const { rowMenuBau, rowsPainelGerencia, respostaEfemera, responderErro } = require('../utils/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Envia a mensagem fixa no canal (use apenas uma vez)')
    .addStringOption(option =>
      option.setName('tipo')
        .setDescription('Qual painel configurar?')
        .setRequired(true)
        .addChoices(
          { name: '📦 Baú dos Membros', value: 'membros' },
          { name: '🔐 Baú da Gerência', value: 'gerencia' },
          { name: '⚙️ Painel da Gerência', value: 'painel' }
        )
    ),

  async execute(interaction, client) {
    const tipo = interaction.options.getString('tipo');
    const { channels } = getConfig();

    let canal;
    let mensagem;
    let sucesso;

    if (tipo === 'painel') {
      canal = client.channels.cache.get(channels.painelGerencia);
      if (!canal) return interaction.reply(respostaEfemera({ content: '❌ Canal do painel não encontrado.' }));
      mensagem = { embeds: [embedGerencia()], components: rowsPainelGerencia() };
      sucesso = '✅ Painel da gerência enviado!';
    } else {
      const canalId = tipo === 'gerencia' ? channels.bauGerencia : channels.bauMembros;
      canal = client.channels.cache.get(canalId);
      if (!canal) return interaction.reply(respostaEfemera({ content: '❌ Canal não encontrado.' }));
      mensagem = { embeds: [embedMenuPrincipal(tipo)], components: [rowMenuBau(tipo)] };
      sucesso = '✅ Mensagem fixa enviada!';
    }

    await interaction.deferReply(respostaEfemera());
    try {
      await canal.send(mensagem);
      return await interaction.editReply({ content: sucesso });
    } catch (erro) {
      console.error('Erro em /setup:', erro);
      await responderErro(interaction);
    }
  }
};
