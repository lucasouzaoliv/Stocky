'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima, idsDasLinhas } = require('./helpers/ambiente');
const handler = require('../interactions/gerencia-menu');
const abrirModal = require('../interactions/gerencia-abrir-modal');

const PAINEL = [
  ['ger_adicionar_item', 'ger_remover_item', 'ger_zerar_bau', 'ger_ver_logs'],
  ['ger_ajustar_membros', 'ger_ajustar_gerencia']
];

function clique(customId, registro) {
  return criarInteracao({ tipo: 'button', customId, registro });
}

test('Cancelar volta ao painel com as duas linhas de botões', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = clique('ger_cancelar');
  await handler.execute(i);
  assert.deepEqual(idsDasLinhas(ultima(i, 'editReply').payload.components), PAINEL);
});

test('Adicionar/Remover item: select de categorias + Cancelar', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  for (const [id, select] of [['ger_adicionar_item', 'ger_cat_adicionar'], ['ger_remover_item', 'ger_cat_remover']]) {
    const i = clique(id);
    await handler.execute(i);
    assert.deepEqual(idsDasLinhas(ultima(i, 'editReply').payload.components), [[select], ['ger_cancelar']]);
  }
});

test('Zerar baú e Ver logs: selects corretos', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const z = clique('ger_zerar_bau');
  await handler.execute(z);
  const opcoesZ = ultima(z, 'editReply').payload.components[0].toJSON().components[0].options.map((o) => o.value);
  assert.deepEqual(opcoesZ, ['membros', 'gerencia', 'ambos']);
  const l = clique('ger_ver_logs');
  await handler.execute(l);
  assert.deepEqual(idsDasLinhas(ultima(l, 'editReply').payload.components), [['ger_logs_tipo'], ['ger_cancelar']]);
});

test('deferUpdate antes de qualquer leitura do banco', async (t) => {
  const registro = [];
  const env = montarAmbiente({ registro });
  t.after(env.limpar);
  const i = clique('ger_adicionar_item', registro);
  await handler.execute(i);
  assert.equal(registro[0].metodo, 'deferUpdate');
});

test('Ajustar baú: resposta efêmera com o inventário e botão do modal', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/gerencia': { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 3 } } } });
  t.after(env.limpar);
  const i = clique('ger_ajustar_gerencia');
  await handler.execute(i);
  const p = ultima(i, 'reply').payload;
  assert.ok(ehEfemera(p));
  assert.match(p.content, /# Armas\nColt:3/);
  assert.deepEqual(idsDasLinhas(p.components), [['ger_abrir_modal_ajustar:gerencia']]);
});

test('Ajustar baú vazio mostra "Bau vazio."', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = clique('ger_ajustar_membros');
  await handler.execute(i);
  assert.match(ultima(i, 'reply').payload.content, /Bau vazio\./);
});

test('falha do banco ao listar categorias: painel restaurado + aviso efêmero', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('get', /catalogo\/items/, new Error('x'));
  const i = clique('ger_remover_item');
  await handler.execute(i);
  assert.deepEqual(metodos(i), ['deferUpdate', 'editReply', 'followUp']);
  assert.deepEqual(idsDasLinhas(ultima(i, 'editReply').payload.components), PAINEL);
  assert.ok(ehEfemera(ultima(i, 'followUp').payload));
});

test('falha do banco em Ajustar: erro efêmero', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('get', /bau\/membros/, new Error('x'));
  const i = clique('ger_ajustar_membros');
  await assert.doesNotReject(handler.execute(i));
  assert.deepEqual(metodos(i), ['reply']);
  assert.ok(ehEfemera(ultima(i, 'reply').payload));
});

test('gerencia-abrir-modal: showModal é a primeira resposta, campo com maxLength 4000', async () => {
  const i = clique('ger_abrir_modal_ajustar:membros');
  await abrirModal.execute(i);
  assert.deepEqual(metodos(i), ['showModal']);
  const modal = ultima(i, 'showModal').payload.toJSON();
  assert.equal(modal.custom_id, 'ger_modal_ajustar:membros');
  assert.equal(modal.components[0].components[0].max_length, 4000);
});
