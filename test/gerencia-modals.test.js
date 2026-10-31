'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima, idsDasLinhas } = require('./helpers/ambiente');
const handler = require('../interactions/gerencia-modals');
const PAINEL = [
  ['ger_adicionar_item', 'ger_remover_item', 'ger_zerar_bau', 'ger_ver_logs'],
  ['ger_ajustar_membros', 'ger_ajustar_gerencia']
];

function modal(nome, categoria = 'armas') {
  return criarInteracao({ tipo: 'modal', customId: `ger_modal_adicionar:${categoria}`, campos: { nome } });
}

test('cadastra item e o painel volta com as duas linhas de botões', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = modal('Granada Pesada');
  await handler.execute(i);
  const itens = env.fake.dump()['catalogo/items'].armas.items;
  assert.ok(itens.some((x) => x.id === 'granada_pesada' && x.nome === 'Granada Pesada'));
  assert.ok(ehEfemera(ultima(i, 'reply').payload));
  assert.match(ultima(i, 'reply').payload.embeds[0].toJSON().title, /Item adicionado/);
  assert.deepEqual(idsDasLinhas(i.message.edit.mock.calls[0].arguments[0].components), PAINEL);
});

test('item duplicado: erro efêmero, catálogo intacto e painel com duas linhas', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const antes = env.fake.dump()['catalogo/items'];
  const i = modal('Colt');
  await handler.execute(i);
  assert.match(ultima(i, 'reply').payload.embeds[0].toJSON().title, /Erro/);
  assert.deepEqual(env.fake.dump()['catalogo/items'], antes);
  assert.deepEqual(idsDasLinhas(i.message.edit.mock.calls[0].arguments[0].components), PAINEL);
});

test('categoria inexistente: erro efêmero', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = modal('Granada', 'nao_existe');
  await handler.execute(i);
  assert.match(ultima(i, 'reply').payload.embeds[0].toJSON().description, /Categoria não encontrada/);
});

test('falha do banco: erro genérico efêmero', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('get', /catalogo\/items/, new Error('segredo'));
  const i = modal('Granada');
  await assert.doesNotReject(handler.execute(i));
  assert.deepEqual(metodos(i), ['reply']);
  assert.ok(!/segredo/.test(ultima(i, 'reply').payload.content));
});
