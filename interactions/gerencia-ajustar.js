const { embedErro } = require('../utils/embeds');
const { getCatalogo, getBau } = require('../utils/db');
const { interpretarAjuste } = require('../utils/ajuste-texto');
const { criarPendente, TTL_PENDENTE_MS } = require('../utils/ajustes-pendentes');
const { respostaEfemera, responderErro, rowConfirmarAjuste, embedResumoAjuste } = require('../utils/ui');

const MAX_ERROS_EXIBIDOS = 15;
const MAX_TRECHO_LINHA = 60;

function trecho(linha) {
  return linha.length > MAX_TRECHO_LINHA ? `${linha.slice(0, MAX_TRECHO_LINHA - 1)}…` : linha;
}

function descreverErros(erros) {
  const linhas = erros.slice(0, MAX_ERROS_EXIBIDOS).map(
    (e) => `Linha ${e.numero}: ${e.motivo}\n\`${trecho(e.linha).replace(/`/g, "'")}\``
  );
  if (erros.length > MAX_ERROS_EXIBIDOS) linhas.push(`… e mais ${erros.length - MAX_ERROS_EXIBIDOS} erro(s).`);
  return `${linhas.join('\n')}\n\nNada foi alterado. Corrija e envie de novo.`;
}

module.exports = {
  type: 'modal',
  customIds: ['ger_modal_ajustar'],
  permissao: 'gerente',

  async execute(interaction) {
    const [, tipo] = interaction.customId.split(':');
    const texto = interaction.fields.getTextInputValue('inventario');

    await interaction.deferReply(respostaEfemera());

    try {
      const catalogo = await getCatalogo();
      const bau = await getBau(tipo);
      const { mudancas, erros } = interpretarAjuste(texto, catalogo);

      if (erros.length > 0) {
        return await interaction.editReply({ embeds: [embedErro('Ajuste inválido', descreverErros(erros))] });
      }

      // Só o que de fato muda entra na pendência: o resto do baú fica como está.
      const alteracoes = mudancas
        .map((m) => {
          const atual = bau[`${m.categoriaId}__${m.itemId}`];
          return { ...m, antes: atual ? atual.quantidade : 0, categoria: catalogo[m.categoriaId].nome };
        })
        .filter((m) => m.antes !== m.quantidade);

      if (alteracoes.length === 0) {
        return await interaction.editReply({ content: 'ℹ️ Nenhuma alteração: as quantidades informadas já são as atuais.' });
      }

      const id = criarPendente({
        tipo,
        mudancas: alteracoes.map(({ categoriaId, itemId, nome, quantidade }) => ({ categoriaId, itemId, nome, quantidade })),
        usuarioId: interaction.user.id
      });

      const minutos = Math.round(TTL_PENDENTE_MS / 60000);
      return await interaction.editReply({
        content: `Confira as alterações abaixo. Nada foi gravado ainda; confirme em até ${minutos} minutos.`,
        embeds: [embedResumoAjuste(tipo, alteracoes.map((a) => ({ nome: a.nome, categoria: a.categoria, antes: a.antes, depois: a.quantidade })))],
        components: [rowConfirmarAjuste(id)]
      });
    } catch (erro) {
      console.error('Erro em ger_modal_ajustar:', erro);
      await responderErro(interaction);
    }
  }
};
