'use strict';

// Fakes de interação, canal e client do Discord para testes (contrato: docs/architecture.md §4.11).
// A interação é ESTRITA como o Discord: respostas duplicadas, editReply sem defer e
// showModal depois de defer lançam erro, para que o teste falhe onde o bot falharia de verdade.

const { mock } = require('node:test');

// Funções do Discord devolvem Promise: erros síncronos viram rejeição, como no discord.js.
function asincrona(fn) {
  return (...args) => {
    try {
      return Promise.resolve(fn(...args));
    } catch (erro) {
      return Promise.reject(erro);
    }
  };
}

const TIPOS = ['button', 'select', 'modal', 'comando'];

class ColecaoFalsa extends Map {
  find(fn) {
    for (const [chave, valor] of this) {
      if (fn(valor, chave, this)) return valor;
    }
    return undefined;
  }

  first() {
    return this.values().next().value;
  }
}

function erroDiscord(code, message) {
  const erro = new Error(message);
  erro.code = code;
  return erro;
}

function proximaSeq(registro) {
  return registro.length + 1;
}

function criarMensagem(base, userId) {
  const mensagem = { author: { id: userId }, content: '', ...base };
  if (typeof mensagem.edit !== 'function') {
    mensagem.edit = mock.fn(asincrona((payload) => {
      Object.assign(mensagem, typeof payload === 'string' ? { content: payload } : payload);
      return mensagem;
    }));
  }
  return mensagem;
}

function criarCanalFalso({ id, mensagens = [], userId = 'bot' } = {}) {
  // `mensagens`: a mais nova primeiro (como o Discord devolve em fetch({ limit })).
  const lista = mensagens.map((m) => criarMensagem(m, userId));
  let contador = lista.length;

  const canal = {
    id,
    mensagens: lista,
    send: mock.fn(asincrona((payload) => {
      contador += 1;
      const base = typeof payload === 'string' ? { content: payload } : { ...payload };
      const mensagem = criarMensagem({ ...base, id: `msg-${id}-${contador}` }, userId);
      lista.unshift(mensagem);
      return mensagem;
    })),
    messages: {
      fetch: mock.fn(asincrona((arg) => {
        if (typeof arg === 'string') {
          const achada = lista.find((m) => m.id === arg);
          if (!achada) throw erroDiscord(10008, 'Unknown Message');
          return achada;
        }
        const limite = arg && Number.isInteger(arg.limit) ? arg.limit : 50;
        const colecao = new ColecaoFalsa();
        for (const m of lista.slice(0, limite)) colecao.set(m.id, m);
        return colecao;
      }))
    }
  };
  return canal;
}

function criarClientFalso({ canais = [], userId = 'bot' } = {}) {
  const cache = new ColecaoFalsa();
  for (const canal of canais) cache.set(canal.id, canal);

  return {
    user: { id: userId },
    channels: {
      cache,
      fetch: mock.fn(asincrona((id) => {
        const canal = cache.get(id);
        if (!canal) throw erroDiscord(10003, 'Unknown Channel');
        return canal;
      }))
    }
  };
}

function criarMember({ cargos, rolesComoArray, usuario }) {
  if (rolesComoArray) {
    return { id: usuario.id, roles: [...cargos] };
  }
  return {
    id: usuario.id,
    roles: { cache: { has: (idCargo) => cargos.includes(idCargo) } }
  };
}

function criarInteracao({
  tipo,
  customId,
  values = [],
  campos = {},
  commandName,
  opcoes = {},
  cargos = [],
  emDM = false,
  semMembro = false,
  rolesComoArray = false,
  usuario = { id: 'u1', tag: 'user#0001' },
  client,
  message,
  registro = []
} = {}) {
  if (!TIPOS.includes(tipo)) {
    throw new Error(`criarInteracao: tipo inválido "${tipo}" (use ${TIPOS.join(', ')}).`);
  }

  const ehComponente = tipo === 'button' || tipo === 'select';
  const clientFinal = client || criarClientFalso();

  const interaction = {
    type: tipo,
    customId,
    commandName,
    values,
    user: usuario,
    client: clientFinal,
    guild: emDM ? null : { id: 'g1' },
    guildId: emDM ? null : 'g1',
    member: emDM || semMembro ? null : criarMember({ cargos, rolesComoArray, usuario }),
    message: null,
    replied: false,
    deferred: false,
    chamadas: [],
    registro,

    isButton: () => tipo === 'button',
    isStringSelectMenu: () => tipo === 'select',
    isModalSubmit: () => tipo === 'modal',
    isChatInputCommand: () => tipo === 'comando',
    inGuild: () => !emDM,

    fields: {
      getTextInputValue(id) {
        if (!Object.prototype.hasOwnProperty.call(campos, id)) {
          throw new Error(`Campo de modal "${id}" não existe.`);
        }
        return campos[id];
      }
    },
    options: {
      getString(nome) {
        return Object.prototype.hasOwnProperty.call(opcoes, nome) ? opcoes[nome] : null;
      }
    }
  };

  if (tipo !== 'comando') {
    interaction.message = criarMensagem(message || { id: 'msg-origem' }, clientFinal.user.id);
  }

  function registrar(metodo, payload) {
    const entrada = { seq: proximaSeq(registro), origem: 'interaction', metodo, payload };
    registro.push(entrada);
    interaction.chamadas.push(entrada);
  }

  function exigirNaoRespondida(metodo) {
    if (interaction.replied || interaction.deferred) {
      throw new Error(`InteractionAlreadyReplied: ${metodo}() chamado depois de a interação já ter sido respondida ou deferida.`);
    }
  }

  function exigirRespondida(metodo) {
    if (!interaction.replied && !interaction.deferred) {
      throw new Error(`InteractionNotReplied: ${metodo}() chamado antes de reply() ou defer().`);
    }
  }

  function exigirComponente(metodo) {
    if (!ehComponente && !(tipo === 'modal' && interaction.message)) {
      throw new Error(`${metodo}() não existe em interações do tipo "${tipo}".`);
    }
  }

  interaction.reply = mock.fn(asincrona((payload) => {
    exigirNaoRespondida('reply');
    interaction.replied = true;
    registrar('reply', payload);
    return payload;
  }));

  interaction.deferReply = mock.fn(asincrona((payload) => {
    exigirNaoRespondida('deferReply');
    interaction.deferred = true;
    registrar('deferReply', payload);
  }));

  interaction.deferUpdate = mock.fn(asincrona(() => {
    exigirComponente('deferUpdate');
    exigirNaoRespondida('deferUpdate');
    interaction.deferred = true;
    registrar('deferUpdate', undefined);
  }));

  interaction.update = mock.fn(asincrona((payload) => {
    exigirComponente('update');
    exigirNaoRespondida('update');
    interaction.replied = true;
    registrar('update', payload);
    return payload;
  }));

  interaction.editReply = mock.fn(asincrona((payload) => {
    exigirRespondida('editReply');
    registrar('editReply', payload);
    return payload;
  }));

  interaction.followUp = mock.fn(asincrona((payload) => {
    exigirRespondida('followUp');
    registrar('followUp', payload);
    return payload;
  }));

  interaction.showModal = mock.fn(asincrona((modal) => {
    if (tipo === 'modal') {
      throw new Error('showModal() não existe em envio de modal.');
    }
    exigirNaoRespondida('showModal');
    interaction.replied = true;
    registrar('showModal', modal);
  }));

  return interaction;
}

module.exports = { criarInteracao, criarCanalFalso, criarClientFalso, ColecaoFalsa };
