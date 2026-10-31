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

test('Ajustar baú: defer efêmero antes do banco, texto com cabeçalhos # Categoria e botão do modal', async (t) => {
  const registro = [];
  const env = montarAmbiente({ registro, seed: { 'bau/gerencia': { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 3 } } } });
  t.after(env.limpar);
  const i = clique('ger_ajustar_gerencia', registro);
  await handler.execute(i);
  assert.deepEqual(metodos(i), ['deferReply', 'editReply']);
  assert.equal(registro[0].metodo, 'deferReply');
  assert.ok(ehEfemera(registro[0].payload));
  const p = ultima(i, 'editReply').payload;
  assert.match(p.content, /# Armas\nColt:3/);
  assert.deepEqual(idsDasLinhas(p.components), [['ger_abrir_modal_ajustar:gerencia']]);
});

test('Ajustar baú vazio explica o formato', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = clique('ger_ajustar_membros');
  await handler.execute(i);
  assert.match(ultima(i, 'editReply').payload.content, /vazio/);
  assert.match(ultima(i, 'editReply').payload.content, /# Armas\nColt:2/);
});

test('Ajustar baú grande: mensagem nunca passa de 2000 caracteres (texto vai em anexo)', async (t) => {
  const itens = Array.from({ length: 25 }, (_, n) => ({ id: `i${n}`, nome: `Item de nome bem comprido numero ${n} ${"x".repeat(40)}` }));
  const bau = Object.fromEntries(itens.map((it) => [`armas__${it.id}`, { nome: it.nome, categoria: 'Armas', categoriaId: 'armas', quantidade: 99999 }]));
  const env = montarAmbiente({ seed: { 'bau/membros': bau, 'catalogo/items': { armas: { nome: 'Armas', emoji: '🔫', items: itens } } } });
  t.after(env.limpar);
  const i = clique('ger_ajustar_membros');
  await handler.execute(i);
  const p = ultima(i, 'editReply').payload;
  assert.ok(p.content.length <= 2000);
  assert.equal(p.files.length, 1);
  const texto = p.files[0].attachment.toString('utf8');
  assert.match(texto, /^# Armas\nItem de nome bem comprido numero 0 x{40}:99999/);
  assert.equal(texto.split('\n').length, 26);
});

test('falha do banco em Ajustar: erro efêmero genérico depois do defer', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('get', /bau\/membros/, new Error('segredo'));
  const i = clique('ger_ajustar_membros');
  await assert.doesNotReject(handler.execute(i));
  assert.deepEqual(metodos(i), ['deferReply', 'followUp']);
  assert.ok(ehEfemera(ultima(i, 'followUp').payload));
  assert.ok(!/segredo/.test(ultima(i, 'followUp').payload.content));
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

test('gerencia-abrir-modal: showModal é a primeira resposta, campo com maxLength 4000', async () => {
  const i = clique('ger_abrir_modal_ajustar:membros');
  await abrirModal.execute(i);
  assert.deepEqual(metodos(i), ['showModal']);
  const modal = ultima(i, 'showModal').payload.toJSON();
  assert.equal(modal.custom_id, 'ger_modal_ajustar:membros');
  assert.equal(modal.components[0].components[0].max_length, 4000);
});
