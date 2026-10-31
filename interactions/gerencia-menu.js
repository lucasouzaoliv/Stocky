const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { embedGerencia } = require('../utils/embeds');
const { getCategorias, getBau } = require('../utils/db');
const { gerarTextoAjuste } = require('../utils/ajuste-texto');
const { rowsPainelGerencia, rowCancelarGerencia, respostaEfemera, responderErro } = require('../utils/ui');

function selectCategorias(customId, placeholder, categorias) {
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(categorias.map(cat => ({ label: cat.nome, value: cat.id, emoji: cat.emoji })));
}

const LIMITE_MENSAGEM = 2000;
const INSTRUCOES = 'Edite as quantidades mantendo os cabeçalhos `# Categoria`. Linhas que você apagar ficam como estão. Use `0` para remover um item.';

async function abrirAjuste(interaction, acao) {
  const tipo = acao === 'ger_ajustar_membros' ? 'membros' : 'gerencia';
  await interaction.deferReply(respostaEfemera());

  const bau = await getBau(tipo);
  const categorias = await getCategorias();
  const texto = gerarTextoAjuste(bau, categorias);

  const rowAbrir = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ger_abrir_modal_ajustar:${tipo}`)
      .setLabel('✏️ Abrir Modal para Editar')
      .setStyle(ButtonStyle.Primary)
  );

  const titulo = `📋 **Inventário atual — Baú dos ${tipo === 'membros' ? 'Membros' : 'Gerência'}**`;
  const exemplo = '# Armas\nColt:2';
  const comBloco = (conteudo) => `${titulo}\n\n${INSTRUCOES}\n\`\`\`\n${conteudo}\n\`\`\``;

  if (!texto) {
    return interaction.editReply({
      content: `${titulo}\n\nO baú está vazio. Para adicionar itens, escreva neste formato:\n\`\`\`\n${exemplo}\n\`\`\``,
      components: [rowAbrir]
    });
  }

  const bloco = comBloco(texto);
  if (bloco.length <= LIMITE_MENSAGEM && !texto.includes('`')) {
    return interaction.editReply({ content: bloco, components: [rowAbrir] });
  }

  // Texto grande demais para a mensagem: vai como anexo.
  return interaction.editReply({
    content: `${titulo}\n\n${INSTRUCOES}\nO inventário é grande e está no arquivo anexo.`,
    files: [new AttachmentBuilder(Buffer.from(texto, 'utf8'), { name: `inventario-${tipo}.txt` })],
    components: [rowAbrir]
  });
}

async function montarTela(acao) {
  if (acao === 'ger_cancelar') {
    return { embeds: [embedGerencia()], components: rowsPainelGerencia() };
  }

  if (acao === 'ger_adicionar_item') {
    const categorias = await getCategorias();
    return {
      embeds: [embedGerencia().setDescription('> Selecione a categoria do novo item:')],
      components: [new ActionRowBuilder().addComponents(selectCategorias('ger_cat_adicionar', 'Selecione a categoria...', categorias)), rowCancelarGerencia()]
    };
  }

  if (acao === 'ger_remover_item') {
    const categorias = await getCategorias();
    return {
      embeds: [embedGerencia().setDescription('> Selecione a categoria do item que deseja remover:')],
      components: [new ActionRowBuilder().addComponents(selectCategorias('ger_cat_remover', 'Selecione a categoria...', categorias)), rowCancelarGerencia()]
    };
  }

  if (acao === 'ger_zerar_bau') {
    const select = new StringSelectMenuBuilder()
      .setCustomId('ger_zerar_confirmar')
      .setPlaceholder('Selecione qual baú zerar...')
      .addOptions([
        { label: 'Baú dos Membros', value: 'membros' },
        { label: 'Baú da Gerência', value: 'gerencia' },
        { label: 'Ambos os Baús', value: 'ambos' }
      ]);
    return {
      embeds: [embedGerencia().setDescription('> ⚠️ Selecione qual baú deseja zerar. Essa ação é irreversível!')],
      components: [new ActionRowBuilder().addComponents(select), rowCancelarGerencia()]
    };
  }

  if (acao === 'ger_ver_logs') {
    const select = new StringSelectMenuBuilder()
      .setCustomId('ger_logs_tipo')
      .setPlaceholder('Ver logs de qual baú?')
      .addOptions([
        { label: 'Baú dos Membros', value: 'membros' },
        { label: 'Baú da Gerência', value: 'gerencia' }
      ]);
    return {
      embeds: [embedGerencia().setDescription('> Selecione de qual baú deseja ver os logs:')],
      components: [new ActionRowBuilder().addComponents(select), rowCancelarGerencia()]
    };
  }

  return null;
}

module.exports = {
  type: 'button',
  customIds: ['ger_adicionar_item', 'ger_remover_item', 'ger_zerar_bau', 'ger_ver_logs', 'ger_cancelar', 'ger_ajustar_membros', 'ger_ajustar_gerencia'],
  permissao: 'gerente',

  async execute(interaction) {
    const acao = interaction.customId;

    if (acao === 'ger_ajustar_membros' || acao === 'ger_ajustar_gerencia') {
      try {
        return await abrirAjuste(interaction, acao);
      } catch (erro) {
        console.error('Erro em ger_ajustar:', erro);
        return responderErro(interaction);
      }
    }

    await interaction.deferUpdate();

    try {
      const tela = await montarTela(acao);
      if (tela) return await interaction.editReply(tela);
    } catch (erro) {
      console.error('Erro em gerencia_menu:', erro);
      try {
        await interaction.editReply({ embeds: [embedGerencia()], components: rowsPainelGerencia() });
      } catch (erroPainel) {
        console.error('Falha ao restaurar o painel:', erroPainel);
      }
      await responderErro(interaction);
    }
  }
};
