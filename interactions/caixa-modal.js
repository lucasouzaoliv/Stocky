const { EmbedBuilder } = require('discord.js');
const { getSaldo, adicionarCaixa, retirarCaixa, addLogCaixa } = require('../utils/caixa');
const { getConfig } = require('../utils/config');
const { atualizarPainelSaldo } = require('../utils/painel');
const { parseInteiroPositivo, LIMITES } = require('../utils/validacao');
const { rowCaixa, embedCaixa, embedLogCaixa, formatarDinheiro, respostaEfemera, responderErro } = require('../utils/ui');

async function restaurarPainel(interaction) {
  const saldo = await getSaldo();
  await interaction.message.edit({ embeds: [embedCaixa(saldo)], components: [rowCaixa()] });
}

// Efeitos secundários (histórico e canais): falhar aqui não desfaz a movimentação já feita.
async function registrarEfeitos(interaction, client, dados) {
  const { acao, tipo, valor, anotacao, saldo } = dados;
  try {
    await addLogCaixa({
      acao,
      usuarioId: interaction.user.id,
      usuarioTag: interaction.user.tag,
      tipo,
      valor,
      anotacao
    });

    const canalLog = client.channels.cache.get(getConfig().channels.logCaixa);
    if (canalLog) {
      await canalLog.send({ embeds: [embedLogCaixa(acao, interaction.user, tipo, valor, anotacao, saldo)] });
    }
  } catch (erro) {
    console.error('Falha ao registrar histórico da movimentação do caixa:', erro);
  }

  // O painel não depende do histórico e nunca lança.
  await atualizarPainelSaldo(client, saldo);
}

module.exports = {
  type: 'modal',
  customIds: ['caixa_modal'],
  permissao: 'gerente',

  async execute(interaction, client) {
    const [, acao] = interaction.customId.split(':');
    const tipoRaw = interaction.fields.getTextInputValue('tipo').toLowerCase().trim();
    const valorRaw = interaction.fields.getTextInputValue('valor');
    const anotacao = interaction.fields.getTextInputValue('anotacao');

    try {
      if (tipoRaw !== 'sujo' && tipoRaw !== 'limpo') {
        await interaction.reply(respostaEfemera({ content: '❌ Tipo inválido! Digite **sujo** ou **limpo**.' }));
        await restaurarPainel(interaction);
        return;
      }

      const analise = parseInteiroPositivo(valorRaw, { max: LIMITES.VALOR_CAIXA_MAX });
      if (!analise.ok) {
        await interaction.reply(respostaEfemera({ content: `❌ Valor inválido! ${analise.erro}` }));
        await restaurarPainel(interaction);
        return;
      }

      const valor = analise.valor;
      const nomeTipo = tipoRaw === 'sujo' ? '🖤 Dinheiro Sujo' : '💵 Dinheiro Limpo';
      let saldo;

      if (acao === 'adicionar') {
        saldo = await adicionarCaixa(tipoRaw, valor);
        await interaction.reply(respostaEfemera({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ECC71)
              .setTitle('✅ Adicionado ao Caixa!')
              .setDescription(`**${formatarDinheiro(valor)}** de ${nomeTipo} adicionado.\n📝 ${anotacao}`)
              .setFooter({ text: 'Marabunta Grande — Stocky' })
              .setTimestamp()
          ]
        }));
      } else {
        const resultado = await retirarCaixa(tipoRaw, valor);
        if (!resultado.sucesso) {
          await interaction.reply(respostaEfemera({ content: `❌ ${resultado.motivo}` }));
          await restaurarPainel(interaction);
          return;
        }
        saldo = resultado.saldo;
        await interaction.reply(respostaEfemera({
          embeds: [
            new EmbedBuilder()
              .setColor(0xE74C3C)
              .setTitle('✅ Retirado do Caixa!')
              .setDescription(`**${formatarDinheiro(valor)}** de ${nomeTipo} retirado.\n📝 ${anotacao}`)
              .setFooter({ text: 'Marabunta Grande — Stocky' })
              .setTimestamp()
          ]
        }));
      }

      await interaction.message.edit({ embeds: [embedCaixa(saldo)], components: [rowCaixa()] });
      await registrarEfeitos(interaction, client, { acao, tipo: tipoRaw, valor, anotacao, saldo });
    } catch (erro) {
      console.error('Erro em caixa_modal:', erro);
      await responderErro(interaction);
    }
  }
};
