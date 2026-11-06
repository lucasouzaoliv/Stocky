const { EmbedBuilder } = require('discord.js');
const { getConfig } = require('./config');
const { getCategorias } = require('./db');

const COR_PADRAO = 0x3498DB;
const LIMITE_CAMPO = 1024;

function baseEmbed() {
  return new EmbedBuilder()
    .setColor(getConfig().cor || COR_PADRAO)
    .setFooter({ text: '🏴 Marabunta Grande — Stocky' })
    .setTimestamp();
}

function embedMenuPrincipal(tipo) {
  const isMembros = tipo === 'membros';
  return baseEmbed()
    .setTitle(isMembros ? '📦 Baú dos Membros' : '🔐 Baú da Gerência')
    .setDescription('> Selecione abaixo a operação que deseja realizar.')
    .addFields(
      { name: '📥 Adicionar', value: 'Registrar entrada de itens', inline: true },
      { name: '📤 Remover', value: 'Registrar saída de itens', inline: true },
      { name: '📋 Ver Estoque', value: 'Consultar inventário atual', inline: true }
    );
}

function embedSelecionarCategoria(tipo, acao) {
  const icon = acao === 'adicionar' ? '📥' : '📤';
  return baseEmbed()
    .setTitle(`${icon} ${acao === 'adicionar' ? 'Adicionar' : 'Remover'} — Selecione a Categoria`)
    .setDescription('> Escolha a categoria do item:');
}

function embedSelecionarItem(acao, nomeCategoria, emojiCategoria) {
  const icon = acao === 'adicionar' ? '📥' : '📤';
  return baseEmbed()
    .setTitle(`${icon} ${emojiCategoria} ${nomeCategoria} — Selecione o Item`)
    .setDescription('> Escolha o item que deseja ' + (acao === 'adicionar' ? 'adicionar:' : 'remover:'));
}

function embedSucesso(titulo, descricao) {
  return new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle(`✅ ${titulo}`)
    .setDescription(descricao)
    .setFooter({ text: '🏴 Marabunta Grande — Stocky' })
    .setTimestamp();
}

function embedErro(titulo, descricao) {
  return new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle(`❌ ${titulo}`)
    .setDescription(descricao)
    .setFooter({ text: '🏴 Marabunta Grande — Stocky' })
    .setTimestamp();
}

function embedLog(acao, usuario, item, categoria, quantidade, novaQtd, tipoBau) {
  const isAdd = acao === 'adicionar';
  const bau = tipoBau === 'gerencia' ? '🔐 Baú da Gerência' : '📦 Baú dos Membros';
  return new EmbedBuilder()
    .setColor(isAdd ? 0x2ECC71 : 0xE74C3C)
    .setTitle(isAdd ? '📥 Entrada no Baú' : '📤 Saída do Baú')
    .addFields(
      { name: '🏴 Baú', value: bau, inline: false },
      { name: '👤 Responsável', value: `<@${usuario.id}> — ${usuario.tag}`, inline: true },
      { name: '📦 Item', value: item.nome, inline: true },
      { name: '📂 Categoria', value: categoria, inline: true },
      { name: isAdd ? '➕ Qtd. Adicionada' : '➖ Qtd. Retirada', value: `**${quantidade}**`, inline: true },
      { name: '📊 Saldo Atual', value: `**${novaQtd}**`, inline: true }
    )
    .setFooter({ text: '🏴 Marabunta Grande — Stocky' })
    .setTimestamp();
}

// Junta linhas sem passar de 1024 caracteres (limite de campo do Discord).
function juntarCampo(linhas) {
  const completo = linhas.join('\n');
  if (completo.length <= LIMITE_CAMPO) return completo || '—';
  const sufixo = (n) => `\n… e mais ${n}`;
  const reserva = sufixo(linhas.length).length;
  const aceitas = [];
  let tamanho = 0;
  for (const linha of linhas) {
    const extra = (aceitas.length ? 1 : 0) + linha.length;
    if (tamanho + extra + reserva > LIMITE_CAMPO) break;
    aceitas.push(linha);
    tamanho += extra;
  }
  if (!aceitas.length) return `${linhas[0].slice(0, LIMITE_CAMPO - 1)}…`;
  return aceitas.join('\n') + sufixo(linhas.length - aceitas.length);
}

async function embedInventario(bau, tipo) {
  const titulo = tipo === 'gerencia' ? '🔐 Inventário — Baú da Gerência' : '📦 Inventário — Baú dos Membros';
  const embed = baseEmbed().setTitle(titulo);

  const porCategoria = {};
  for (const item of Object.values(bau)) {
    if (!porCategoria[item.categoriaId]) {
      porCategoria[item.categoriaId] = { nome: item.categoria, itens: [] };
    }
    porCategoria[item.categoriaId].itens.push(item);
  }

  if (Object.keys(porCategoria).length === 0) {
    embed.setDescription('> 📭 Nenhum item registrado no momento.');
    return embed;
  }

  const categorias = await getCategorias();

  for (const [catId, dados] of Object.entries(porCategoria)) {
    const catInfo = categorias.find(c => c.id === catId);
    const emojiCat = catInfo ? catInfo.emoji : '📂';
    const linhas = dados.itens.map(i => `**${i.nome}** — \`${i.quantidade}\``);
    embed.addFields({ name: `${emojiCat} ${dados.nome}`.slice(0, 256), value: juntarCampo(linhas), inline: false });
  }

  return embed;
}

function embedGerencia() {
  return baseEmbed()
    .setTitle('⚙️ Painel da Gerência')
    .setDescription('> Área restrita para **Consejeros** e **El Diablo**.')
    .addFields(
      { name: '➕ Adicionar Item ao Catálogo', value: 'Cadastrar novo item para uso no baú', inline: false },
      { name: '➖ Remover Item do Catálogo', value: 'Remover item do catálogo permanentemente', inline: false },
      { name: '🗑️ Zerar Baú', value: 'Resetar todo o inventário', inline: false },
      { name: '📋 Ver Logs', value: 'Consultar histórico de movimentações', inline: false }
    );
}

module.exports = {
  embedMenuPrincipal, embedSelecionarCategoria, embedSelecionarItem,
  embedSucesso, embedErro, embedLog, embedInventario, embedGerencia
};