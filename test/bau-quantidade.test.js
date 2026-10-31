'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao, criarCanalFalso, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima, idsDasLinhas } = require('./helpers/ambiente');
const handler = require('../interactions/bau-quantidade');

function modal({ acao = 'adicionar', tipo = 'membros', item = 'colt', quantidade = '5', client } = {}) {
  return criarInteracao({
    tipo: 'modal',
    customId: `bau_quantidade:${acao}:${tipo}:armas:${item}`,
    campos: { quantidade },
    client
  });
}

function clienteComCanais(config) {
  const log = criarCanalFalso({ id: config.channels.logMembros });
  const inv = criarCanalFalso({ id: config.channels.inventarioMembros });
  return { client: criarClientFalso({ canais: [log, inv] }), log, inv };
}

test('adicionar: grava no baú, responde efêmero, restaura menu, registra log e atualiza canais', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 2 } } } });
  t.after(env.limpar);
  const { client, log, inv } = clienteComCanais(env.config);
  const i = modal({ client });
  await handler.execute(i, client);

  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 7);
  const r = ultima(i, 'reply').payload;
  assert.ok(ehEfemera(r));
  assert.match(r.embeds[0].toJSON().description, /Saldo atual: \*\*7\*\*/);
  assert.deepEqual(idsDasLinhas(i.message.edit.mock.calls[0].arguments[0].components), [['bau_adicionar:membros', 'bau_remover:membros', 'bau_estoque:membros']]);
  assert.equal(log.send.mock.callCount(), 1);
  assert.equal(inv.send.mock.callCount(), 1);
  const logs = Object.keys(env.fake.dump()).filter((c) => c.startsWith('logs/membros/entradas/'));
  assert.equal(logs.length, 1);
});

test('remover: sucesso reduz o estoque', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 10 } } } });
  t.after(env.limpar);
  const { client } = clienteComCanais(env.config);
  const i = modal({ acao: 'remover', quantidade: '4', client });
  await handler.execute(i, client);
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 6);
  assert.match(ultima(i, 'reply').payload.embeds[0].toJSON().title, /removido/);
});

test('remover acima do estoque: erro efêmero, nada gravado, menu restaurado', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 1 } } } });
  t.after(env.limpar);
  const { client, log } = clienteComCanais(env.config);
  const i = modal({ acao: 'remover', quantidade: '4', client });
  await handler.execute(i, client);
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 1);
  assert.ok(ehEfemera(ultima(i, 'reply').payload));
  assert.equal(i.message.edit.mock.callCount(), 1);
  assert.equal(log.send.mock.callCount(), 0);
});

test('quantidade inválida: erro efêmero e nenhuma escrita', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const { client } = clienteComCanais(env.config);
  const i = modal({ quantidade: 'abc', client });
  await handler.execute(i, client);
  assert.ok(ehEfemera(ultima(i, 'reply').payload));
  assert.equal(env.fake.chamadas.length, 0);
});

test('item inexistente: erro efêmero e nenhuma escrita', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const { client } = clienteComCanais(env.config);
  const i = modal({ item: 'fantasma', client });
  await handler.execute(i, client);
  assert.match(ultima(i, 'reply').payload.embeds[0].toJSON().description, /não encontrado/);
  assert.equal(env.fake.chamadas.filter((c) => c.op !== 'get').length, 0);
});

test('falha do banco ao gravar: erro genérico efêmero sem vazar detalhe', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharProximoCommit(new Error('commit falhou'));
  const { client } = clienteComCanais(env.config);
  const i = modal({ client });
  await assert.doesNotReject(handler.execute(i, client));
  const p = ultima(i, 'reply').payload;
  assert.ok(ehEfemera(p));
  assert.ok(!/commit falhou/.test(p.content));
  assert.deepEqual(metodos(i), ['reply']);
});

test('falha ao registrar log não desfaz nem esconde o sucesso', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('add', /logs\/membros\/entradas/, new Error('log falhou'));
  const { client } = clienteComCanais(env.config);
  const i = modal({ client });
  await handler.execute(i, client);
  assert.deepEqual(metodos(i), ['reply']);
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 5);
});

test('baú da gerência usa os canais da gerência', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const logG = criarCanalFalso({ id: env.config.channels.logGerencia });
  const client = criarClientFalso({ canais: [logG] });
  const i = modal({ tipo: 'gerencia', client });
  await handler.execute(i, client);
  assert.equal(logG.send.mock.callCount(), 1);
});

test('painel de inventário: usa o id guardado e não varre as últimas 10 mensagens', async (t) => {
  const env = montarAmbiente({ seed: { 'paineis/inventario_membros': { canalId: 'c-inv-membros', mensagemId: 'm-painel' } } });
  t.after(env.limpar);
  const inv = criarCanalFalso({ id: env.config.channels.inventarioMembros, mensagens: [{ id: 'm-painel', author: { id: 'bot' } }] });
  const client = criarClientFalso({ canais: [inv] });
  const i = modal({ client });
  await handler.execute(i, client);
  assert.equal(inv.mensagens[0].edit.mock.callCount(), 1);
  assert.equal(inv.send.mock.callCount(), 0);
  assert.equal(inv.messages.fetch.mock.calls[0].arguments[0], 'm-painel');
});

test('painel salvo apagado: recria e grava o novo id; o sucesso continua visível', async (t) => {
  const env = montarAmbiente({ seed: { 'paineis/inventario_membros': { canalId: 'c-inv-membros', mensagemId: 'sumiu' } } });
  t.after(env.limpar);
  const inv = criarCanalFalso({ id: env.config.channels.inventarioMembros });
  const client = criarClientFalso({ canais: [inv] });
  const i = modal({ client });
  await handler.execute(i, client);
  assert.equal(inv.send.mock.callCount(), 1);
  assert.equal(env.fake.dump()['paineis/inventario_membros'].mensagemId, inv.mensagens[0].id);
  assert.deepEqual(metodos(i), ['reply']);
});

test('falha ao atualizar o painel não desfaz nem esconde o sucesso', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const inv = criarCanalFalso({ id: env.config.channels.inventarioMembros });
  inv.send.mock.mockImplementation(() => Promise.reject(new Error('sem permissão')));
  const client = criarClientFalso({ canais: [inv] });
  const i = modal({ client });
  await assert.doesNotReject(handler.execute(i, client));
  assert.deepEqual(metodos(i), ['reply']);
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 5);
});

test('falha no log não impede a atualização do painel', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('add', /logs\/membros\/entradas/, new Error('log falhou'));
  const { client, inv } = clienteComCanais(env.config);
  await handler.execute(modal({ client }), client);
  assert.equal(inv.send.mock.callCount(), 1);
});
