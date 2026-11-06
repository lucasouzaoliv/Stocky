'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima, idsDasLinhas } = require('./helpers/ambiente');
const handler = require('../interactions/bau-categoria');

function selecao(categoria, registro) {
  return criarInteracao({ tipo: 'select', customId: 'bau_categoria:adicionar:membros', values: [categoria], registro });
}

test('categoria com itens: select de itens + Cancelar', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = selecao('armas');
  await handler.execute(i);
  const p = ultima(i, 'editReply').payload;
  assert.deepEqual(idsDasLinhas(p.components), [['bau_item:adicionar:membros:armas'], ['bau_cancelar:membros']]);
  assert.deepEqual(p.components[0].toJSON().components[0].options.map((o) => o.value), ['colt', 'usp']);
  assert.match(p.embeds[0].toJSON().title, /Armas/);
});

test('categoria sem itens volta ao menu principal', async (t) => {
  const env = montarAmbiente({ seed: { 'catalogo/items': { vazia: { nome: 'Vazia', emoji: '📦', items: [] } } } });
  t.after(env.limpar);
  const i = selecao('vazia');
  await handler.execute(i);
  assert.deepEqual(idsDasLinhas(ultima(i, 'editReply').payload.components), [['bau_adicionar:membros', 'bau_remover:membros', 'bau_estoque:membros']]);
});

test('categoria inexistente (entrada inválida) não lança e volta ao menu', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = selecao('nao_existe');
  await handler.execute(i);
  assert.deepEqual(metodos(i), ['deferUpdate', 'editReply']);
});

test('falha do banco: painel restaurado e aviso efêmero', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('get', /catalogo\/items/, new Error('x'));
  const i = selecao('armas');
  await handler.execute(i);
  assert.deepEqual(metodos(i), ['deferUpdate', 'editReply', 'followUp']);
  assert.ok(ehEfemera(ultima(i, 'followUp').payload));
});
