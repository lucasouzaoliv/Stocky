const { embedSucesso, embedInventario } = require('../utils/embeds');
const { getCatalogo, getBau } = require('../utils/db');
const { getDb } = require('../utils/firebase');
const { getConfig } = require('../utils/config');
const { respostaEfemera, responderErro } = require('../utils/ui');

function aplicarLinhas(texto, catalogo, novoBau) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  let atualizados = 0;
  const erros = [];

  for (const linha of linhas) {
    if (!linha.includes(':')) continue;
    const [nomeRaw, qtdRaw] = linha.split(':');
    const nome = nomeRaw.trim();
    const qtd = parseInt(qtdRaw.trim());

    if (isNaN(qtd) || qtd < 0) {
      erros.push(`Quantidade inválida: **${linha}**`);
      continue;
    }

    let encontrado = false;
    for (const [catId, cat] of Object.entries(catalogo)) {
      const item = cat.items.find(i => i.nome.toLowerCase() === nome.toLowerCase());
      if (item) {
        const key = `${catId}__${item.id}`;
        if (qtd === 0) {
          delete novoBau[key];
        } else {
          novoBau[key] = { nome: item.nome, categoria: cat.nome, categoriaId: catId, quantidade: qtd };
        }
        atualizados++;
        encontrado = true;
        break;
      }
    }

    if (!encontrado) erros.push(`Item não encontrado: **${nome}**`);
  }

  return { atualizados, erros };
}

async function atualizarInventario(client, tipo, bau) {
  const { channels } = getConfig();
  const canalInvId = tipo === 'gerencia' ? channels.inventarioGerencia : channels.inventarioMembros;
  const canalInv = client.channels.cache.get(canalInvId);
  if (!canalInv) return;
  const inventarioEmbed = await embedInventario(bau, tipo);
  const msgs = await canalInv.messages.fetch({ limit: 10 });
  const msgBot = msgs.find(m => m.author.id === client.user.id);
  if (msgBot) {
    await msgBot.edit({ embeds: [inventarioEmbed] });
  } else {
    await canalInv.send({ embeds: [inventarioEmbed] });
  }
}

module.exports = {
  type: 'modal',
  customIds: ['ger_modal_ajustar'],
  permissao: 'gerente',

  async execute(interaction, client) {
    const [, tipo] = interaction.customId.split(':');
    const texto = interaction.fields.getTextInputValue('inventario');

    try {
      const catalogo = await getCatalogo();
      const bauAtual = await getBau(tipo);
      const novoBau = { ...bauAtual };
      const { atualizados, erros } = aplicarLinhas(texto, catalogo, novoBau);

      await getDb().collection('bau').doc(tipo).set(novoBau);
      await atualizarInventario(client, tipo, novoBau);

      let descricao = `**${atualizados}** item(s) atualizado(s) com sucesso!`;
      if (erros.length) descricao += `\n\n⚠️ Erros:\n${erros.join('\n')}`;

      return await interaction.reply(respostaEfemera({
        embeds: [embedSucesso('Inventário ajustado!', descricao)]
      }));
    } catch (erro) {
      console.error('Erro em ger_modal_ajustar:', erro);
      await responderErro(interaction);
    }
  }
};
