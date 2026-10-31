const { embedSucesso, embedErro, embedLog, embedInventario, embedMenuPrincipal } = require('../utils/embeds');
const { adicionarAoBau, removerDoBau, getItensDaCategoria, getCategorias, addLog, getBau } = require('../utils/db');
const { getConfig } = require('../utils/config');
const { parseInteiroPositivo, LIMITES } = require('../utils/validacao');
const { rowMenuBau, respostaEfemera, responderErro, permissaoBau } = require('../utils/ui');

async function restaurarMenu(interaction, tipo) {
  await interaction.message.edit({ embeds: [embedMenuPrincipal(tipo)], components: [rowMenuBau(tipo)] });
}

async function atualizarInventario(client, tipo) {
  const { channels } = getConfig();
  const canalInvId = tipo === 'gerencia' ? channels.inventarioGerencia : channels.inventarioMembros;
  const canalInv = client.channels.cache.get(canalInvId);
  if (!canalInv) return;
  const bau = await getBau(tipo);
  const inventarioEmbed = await embedInventario(bau, tipo);
  const msgs = await canalInv.messages.fetch({ limit: 10 });
  const msgBot = msgs.find(m => m.author.id === client.user.id);
  if (msgBot) {
    await msgBot.edit({ embeds: [inventarioEmbed] });
  } else {
    await canalInv.send({ embeds: [inventarioEmbed] });
  }
}

// Efeitos secundários (log e painéis): falhar aqui não desfaz a movimentação já feita.
async function registrarEfeitos(interaction, client, dados) {
  const { acao, tipo, itemId, item, categoria, quantidade, novaQtd } = dados;
  try {
    await addLog(tipo, {
      acao,
      usuarioId: interaction.user.id,
      usuarioTag: interaction.user.tag,
      item: { id: itemId, nome: item.nome },
      categoria: categoria.nome,
      quantidade,
      novaQtd
    });

    const { channels } = getConfig();
    const canalLogId = tipo === 'gerencia' ? channels.logGerencia : channels.logMembros;
    const canalLog = client.channels.cache.get(canalLogId);
    if (canalLog) {
      await canalLog.send({ embeds: [embedLog(acao, interaction.user, item, categoria.nome, quantidade, novaQtd, tipo)] });
    }

    await atualizarInventario(client, tipo);
  } catch (erro) {
    console.error('Falha ao registrar log/atualizar inventário:', erro);
  }
}

module.exports = {
  type: 'modal',
  customIds: ['bau_quantidade'],
  permissao: permissaoBau(2),

  async execute(interaction, client) {
    const [, acao, tipo, categoriaId, itemId] = interaction.customId.split(':');
    const quantidadeRaw = interaction.fields.getTextInputValue('quantidade');
    const analise = parseInteiroPositivo(quantidadeRaw, { max: LIMITES.QUANTIDADE_ITEM_MAX });

    try {
      if (!analise.ok) {
        await interaction.reply(respostaEfemera({ embeds: [embedErro('Quantidade inválida', analise.erro)] }));
        await restaurarMenu(interaction, tipo);
        return;
      }

      const quantidade = analise.valor;
      const itens = await getItensDaCategoria(categoriaId);
      const item = itens.find(i => i.id === itemId);
      const categorias = await getCategorias();
      const categoria = categorias.find(c => c.id === categoriaId);

      if (!item || !categoria) {
        await interaction.reply(respostaEfemera({ embeds: [embedErro('Erro', 'Item ou categoria não encontrado.')] }));
        await restaurarMenu(interaction, tipo);
        return;
      }

      let novaQtd;

      if (acao === 'adicionar') {
        novaQtd = await adicionarAoBau(tipo, categoriaId, itemId, quantidade, item.nome, categoria.nome);
        await interaction.reply(respostaEfemera({
          embeds: [embedSucesso('Item adicionado!', `**${item.nome}** — adicionado **${quantidade}** unidade(s).\nSaldo atual: **${novaQtd}**`)]
        }));
      } else {
        const resultado = await removerDoBau(tipo, categoriaId, itemId, quantidade);
        if (!resultado.sucesso) {
          await interaction.reply(respostaEfemera({ embeds: [embedErro('Estoque insuficiente', resultado.motivo)] }));
          await restaurarMenu(interaction, tipo);
          return;
        }
        novaQtd = resultado.novaQtd;
        await interaction.reply(respostaEfemera({
          embeds: [embedSucesso('Item removido!', `**${item.nome}** — removido **${quantidade}** unidade(s).\nSaldo atual: **${novaQtd}**`)]
        }));
      }

      await restaurarMenu(interaction, tipo);
      await registrarEfeitos(interaction, client, { acao, tipo, itemId, item, categoria, quantidade, novaQtd });
    } catch (erro) {
      console.error('Erro em bau_quantidade:', erro);
      await responderErro(interaction);
    }
  }
};
