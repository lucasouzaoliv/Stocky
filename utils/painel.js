'use strict';

// Atualização dos painéis fixos (inventário e saldo do caixa). Contrato: docs/architecture.md §4.9.
// Usa o id da mensagem guardado no banco; a busca legada (última mensagem do bot nas 10 últimas)
// só acontece uma vez, quando ainda não há id guardado. Nunca lança: falha vira { ok: false }.

const { getConfig } = require('./config');
const { getBau, obterMensagemPainel, salvarMensagemPainel, CHAVES_PAINEL } = require('./db');
const { getSaldo } = require('./caixa');
const { embedInventario } = require('./embeds');
const { embedCaixa } = require('./ui');

const MENSAGEM_APAGADA = 10008;

async function buscarMensagemAntiga(canal, client) {
  const mensagens = await canal.messages.fetch({ limit: 10 });
  return mensagens.find((m) => m.author && m.author.id === client.user.id) || null;
}

async function guardarId(chave, canal, mensagem) {
  try {
    await salvarMensagemPainel(chave, canal.id, mensagem.id);
  } catch (erro) {
    console.error(`Falha ao guardar o id do painel ${chave}:`, erro);
  }
}

async function atualizarPainel(client, { chave, canalId, montarEmbed }) {
  try {
    const canal = client.channels.cache.get(canalId);
    if (!canal) return { ok: false, acao: 'ignorado' };

    const payload = { embeds: [await montarEmbed()] };
    const guardada = await obterMensagemPainel(chave);
    let mensagem = null;

    if (guardada && guardada.canalId === canal.id) {
      try {
        mensagem = await canal.messages.fetch(guardada.mensagemId);
      } catch (erro) {
        if (!erro || erro.code !== MENSAGEM_APAGADA) throw erro;
      }
      if (mensagem) {
        await mensagem.edit(payload);
        return { ok: true, acao: 'editado' };
      }
    } else {
      mensagem = await buscarMensagemAntiga(canal, client);
      if (mensagem) {
        await mensagem.edit(payload);
        await guardarId(chave, canal, mensagem);
        return { ok: true, acao: 'editado' };
      }
    }

    const nova = await canal.send(payload);
    await guardarId(chave, canal, nova);
    return { ok: true, acao: 'enviado' };
  } catch (erro) {
    console.error(`Falha ao atualizar o painel ${chave}:`, erro);
    return { ok: false, acao: 'erro' };
  }
}

async function atualizarPainelInventario(client, tipo) {
  const gerencia = tipo === 'gerencia';
  let alvo;
  try {
    const { channels } = getConfig();
    alvo = {
      chave: gerencia ? CHAVES_PAINEL.INVENTARIO_GERENCIA : CHAVES_PAINEL.INVENTARIO_MEMBROS,
      canalId: gerencia ? channels.inventarioGerencia : channels.inventarioMembros,
      montarEmbed: async () => embedInventario(await getBau(tipo), tipo)
    };
  } catch (erro) {
    console.error('Falha ao ler a configuração do painel de inventário:', erro);
    return { ok: false, acao: 'erro' };
  }
  return await atualizarPainel(client, alvo);
}

async function atualizarPainelSaldo(client, saldo) {
  let canalId;
  try {
    canalId = getConfig().channels.saldoCaixa;
  } catch (erro) {
    console.error('Falha ao ler a configuração do painel de saldo:', erro);
    return { ok: false, acao: 'erro' };
  }
  return await atualizarPainel(client, {
    chave: CHAVES_PAINEL.SALDO_CAIXA,
    canalId,
    montarEmbed: async () => embedCaixa(saldo || await getSaldo())
  });
}

module.exports = { atualizarPainelInventario, atualizarPainelSaldo };
