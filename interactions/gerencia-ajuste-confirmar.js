const { embedSucesso, embedErro } = require('../utils/embeds');
const { ajustarBauEmMassa } = require('../utils/db');
const { obterPendente, removerPendente } = require('../utils/ajustes-pendentes');
const { atualizarPainelInventario } = require('../utils/painel');
const { respostaEfemera, responderErro } = require('../utils/ui');

const MSG_EXPIRADA = '⏱️ Essa confirmação expirou ou já foi usada. Refaça o ajuste pelo painel.';
const MSG_OUTRO_USUARIO = '🚫 Só quem gerou esse ajuste pode confirmá-lo ou cancelá-lo.';
const MAX_INVALIDOS_EXIBIDOS = 10;

function descreverInvalidos(resultado) {
  const invalidos = Array.isArray(resultado.invalidos) ? resultado.invalidos : [];
  const linhas = invalidos.slice(0, MAX_INVALIDOS_EXIBIDOS).map((i) => `• ${i.itemId || '?'}: ${i.motivo}`);
  if (invalidos.length > MAX_INVALIDOS_EXIBIDOS) linhas.push(`… e mais ${invalidos.length - MAX_INVALIDOS_EXIBIDOS}.`);
  return [resultado.motivo, ...linhas].filter(Boolean).join('\n');
}

async function confirmar(interaction, client, pendenteId) {
  const pendente = obterPendente(pendenteId);
  if (!pendente) return interaction.reply(respostaEfemera({ content: MSG_EXPIRADA }));
  if (pendente.usuarioId !== interaction.user.id) {
    return interaction.reply(respostaEfemera({ content: MSG_OUTRO_USUARIO }));
  }

  // Consome a pendência antes de qualquer await: um segundo clique não aplica de novo.
  removerPendente(pendenteId);
  await interaction.deferUpdate();

  let resultado;
  try {
    resultado = await ajustarBauEmMassa(pendente.tipo, pendente.mudancas, interaction.user);
  } catch (erro) {
    console.error('Erro ao aplicar o ajuste em massa:', erro);
    await interaction.editReply({
      content: '❌ Não foi possível aplicar o ajuste. Confira o baú e refaça o ajuste se necessário.',
      embeds: [],
      components: []
    });
    return;
  }

  if (!resultado.sucesso) {
    return interaction.editReply({
      content: '',
      embeds: [embedErro('Ajuste não aplicado', descreverInvalidos(resultado))],
      components: []
    });
  }

  const descricao = resultado.alterados > 0
    ? `**${resultado.alterados}** item(s) alterado(s) com sucesso!`
    : 'Nenhum item precisou ser alterado.';
  await interaction.editReply({ content: '', embeds: [embedSucesso('Inventário ajustado!', descricao)], components: [] });

  if (resultado.alterados > 0) {
    const painel = await atualizarPainelInventario(client, pendente.tipo);
    if (painel.acao === 'erro') {
      await interaction.followUp(respostaEfemera({ content: '⚠️ O ajuste foi aplicado, mas o painel de inventário não pôde ser atualizado agora.' })).catch(() => {});
    }
  }
}

function cancelar(interaction, pendenteId) {
  const pendente = obterPendente(pendenteId);
  if (pendente && pendente.usuarioId !== interaction.user.id) {
    return interaction.reply(respostaEfemera({ content: MSG_OUTRO_USUARIO }));
  }
  removerPendente(pendenteId);
  return interaction.update({ content: '❌ Ajuste cancelado. Nada foi alterado.', embeds: [], components: [] });
}

module.exports = {
  type: 'button',
  customIds: ['ger_ajuste_confirmar', 'ger_ajuste_cancelar'],
  permissao: 'gerente',

  async execute(interaction, client) {
    const [acao, pendenteId] = interaction.customId.split(':');
    try {
      if (acao === 'ger_ajuste_confirmar') return await confirmar(interaction, client, pendenteId);
      return await cancelar(interaction, pendenteId);
    } catch (erro) {
      console.error(`Erro em ${acao}:`, erro);
      await responderErro(interaction);
    }
  }
};
