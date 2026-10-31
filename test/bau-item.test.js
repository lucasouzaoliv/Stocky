'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima } = require('./helpers/ambiente');
const handler = require('../interactions/bau-item');

function selecao(item) {
  return criarInteracao({ tipo: 'select', customId: 'bau_item:adicionar:membros:armas', values: [item] });
}

test('item existente: showModal é a primeira resposta, com maxLength 6', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = selecao('colt');
  await handler.execute(i);
  assert.deepEqual(metodos(i), ['showModal']);
  const modal = ultima(i, 'showModal').payload.toJSON();
  assert.equal(modal.custom_id, 'bau_quantidade:adicionar:membros:armas:colt');
  assert.match(modal.title, /Colt/);
  assert.equal(modal.components[0].components[0].max_length, 6);
});

test('item inexistente: efêmero "Item não encontrado" e nenhum modal', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = selecao('removido');
  await assert.doesNotReject(handler.execute(i));
  assert.deepEqual(metodos(i), ['reply']);
  const p = ultima(i, 'reply').payload;
  assert.ok(ehEfemera(p));
  assert.match(p.content, /Item não encontrado/);
  assert.equal(i.showModal.mock.callCount(), 0);
});

test('categoria inexistente também vira "Item não encontrado"', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = criarInteracao({ tipo: 'select', customId: 'bau_item:adicionar:membros:xyz', values: ['colt'] });
  await handler.execute(i);
  assert.match(ultima(i, 'reply').payload.content, /Item não encontrado/);
});

test('título do modal respeita 45 caracteres mesmo com nome longo', async (t) => {
  const env = montarAmbiente({ seed: { 'catalogo/items': { armas: { nome: 'Armas', emoji: '🔫', items: [{ id: 'longo', nome: 'N'.repeat(50) }] } } } });
  t.after(env.limpar);
  const i = selecao('longo');
  await handler.execute(i);
  assert.ok(ultima(i, 'showModal').payload.toJSON().title.length <= 45);
});

test('falha de leitura: erro genérico efêmero, sem modal e sem vazar detalhe', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('get', /catalogo\/items/, new Error('segredo interno'));
  const i = selecao('colt');
  await assert.doesNotReject(handler.execute(i));
  assert.deepEqual(metodos(i), ['reply']);
  const p = ultima(i, 'reply').payload;
  assert.ok(ehEfemera(p));
  assert.ok(!/segredo interno/.test(p.content));
});
