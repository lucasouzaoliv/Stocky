const fs = require('fs');
const path = require('path');
const { MessageFlags } = require('discord.js');
const { NIVEIS, MENSAGENS, exigirNivel, negarAcesso } = require('./permissoes');

const TIPOS_INTERACAO = ['button', 'select', 'modal'];
const MENSAGEM_ERRO = '❌ Ocorreu um erro ao processar essa interação.';

function nivelValido(permissao) {
  return typeof permissao === 'function' || Object.prototype.hasOwnProperty.call(NIVEIS, permissao);
}

function listarModulos(diretorio) {
  if (!diretorio) return [];
  return fs.readdirSync(diretorio)
    .filter((arquivo) => arquivo.endsWith('.js'))
    .sort()
    .map((arquivo) => ({ arquivo, modulo: require(path.join(diretorio, arquivo)) }));
}

function exigirBase(modulo, origem) {
  if (typeof modulo.execute !== 'function') throw new Error(`${origem}: handler sem execute().`);
  if (!nivelValido(modulo.permissao)) {
    throw new Error(`${origem}: handler sem \`permissao\` válida (use 'membro', 'gerente', 'dono' ou uma função).`);
  }
}

function registrarComando(registro, modulo, origem) {
  if (!modulo.data || typeof modulo.data.name !== 'string') throw new Error(`${origem}: comando sem data.name.`);
  exigirBase(modulo, origem);
  if (registro.comandos.has(modulo.data.name)) throw new Error(`${origem}: comando duplicado "${modulo.data.name}".`);
  registro.comandos.set(modulo.data.name, modulo);
}

function registrarInteracao(registro, modulo, origem) {
  if (!TIPOS_INTERACAO.includes(modulo.type)) {
    throw new Error(`${origem}: type inválido "${modulo.type}" (use ${TIPOS_INTERACAO.join(', ')}).`);
  }
  if (!Array.isArray(modulo.customIds) || modulo.customIds.length === 0) {
    throw new Error(`${origem}: customIds ausente ou vazio.`);
  }
  exigirBase(modulo, origem);
  for (const id of modulo.customIds) {
    if (typeof id !== 'string' || id === '') throw new Error(`${origem}: customId inválido.`);
    if (id.includes(':')) throw new Error(`${origem}: customId "${id}" não pode conter ":".`);
    if (registro[modulo.type].has(id)) throw new Error(`${origem}: customId duplicado "${id}" em ${modulo.type}.`);
    registro[modulo.type].set(id, modulo);
  }
}

function carregarHandlers({ commandsDir, interactionsDir } = {}) {
  const registro = { comandos: new Map(), button: new Map(), select: new Map(), modal: new Map() };
  for (const { arquivo, modulo } of listarModulos(commandsDir)) {
    registrarComando(registro, modulo, `commands/${arquivo}`);
  }
  for (const { arquivo, modulo } of listarModulos(interactionsDir)) {
    registrarInteracao(registro, modulo, `interactions/${arquivo}`);
  }
  return registro;
}

function idBase(customId) {
  return String(customId).split(':')[0];
}

function resolverHandler(registro, interaction) {
  if (interaction.isChatInputCommand()) {
    const handler = registro.comandos.get(interaction.commandName);
    return handler ? { handler, tipo: 'comando' } : null;
  }
  const tipo = interaction.isButton() ? 'button'
    : interaction.isStringSelectMenu() ? 'select'
      : interaction.isModalSubmit() ? 'modal' : null;
  if (!tipo) return null;
  const handler = registro[tipo].get(idBase(interaction.customId));
  return handler ? { handler, tipo } : null;
}

function resolverNivel(handler, interaction) {
  let nivel = handler.permissao;
  if (typeof nivel === 'function') {
    try {
      nivel = nivel(interaction);
    } catch (erro) {
      console.error('Erro ao resolver permissão do handler:', erro);
      return null;
    }
  }
  return Object.prototype.hasOwnProperty.call(NIVEIS, nivel) ? nivel : null;
}

async function responderErro(interaction) {
  const payload = { content: MENSAGEM_ERRO, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (erro) {
    console.error('Falha ao responder erro da interação:', erro);
  }
}

async function rotearInteracao(interaction, registro, client) {
  try {
    const resolvido = resolverHandler(registro, interaction);
    if (!resolvido) return 'sem_handler';

    const nivel = resolverNivel(resolvido.handler, interaction);
    if (nivel === null) {
      await negarAcesso(interaction, { permitido: false, motivo: 'sem_cargo', mensagem: MENSAGENS.sem_cargo });
      return 'negado';
    }
    if (!(await exigirNivel(interaction, nivel))) return 'negado';

    await resolvido.handler.execute(interaction, client);
    return 'executado';
  } catch (erro) {
    console.error('Erro na interação:', erro);
    await responderErro(interaction);
    return 'erro';
  }
}

function registrarHandlersDeProcesso(proc = process, sair = (codigo) => process.exit(codigo)) {
  proc.on('unhandledRejection', (motivo) => {
    console.error('Promise rejeitada sem tratamento:', motivo);
  });
  proc.on('uncaughtException', (erro) => {
    console.error('Exceção não capturada:', erro);
    sair(1);
  });
}

module.exports = {
  carregarHandlers,
  resolverHandler,
  resolverNivel,
  rotearInteracao,
  registrarHandlersDeProcesso
};
