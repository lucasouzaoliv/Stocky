'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima, idsDasLinhas } = require('./helpers/ambiente');
const handler = require('../interactions/bau-menu');

const BAU = {
  armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 7 }
};

function clique(customId, registro) {
  return criarInteracao({ tipo: 'button', customId, registro });
}

test('Ver Estoque: embeds recebe um embed resolvido (não Promise) com o estoque', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU } });
  t.after(env.limpar);
  const i = clique('bau_estoque:membros');
  await handler.execute(i);

  const payload = ultima(i, 'editReply').payload;
  assert.equal(payload.embeds.length, 1);
  assert.ok(!(payload.embeds[0] instanceof Promise), 'embed não pode ser Promise');
  assert.equal(typeof payload.embeds[0].toJSON, 'function');
  const json = payload.embeds[0].toJSON();
  assert.match(json.title, /Baú dos Membros/);
  assert.match(json.fields[0].value, /Colt/);
  assert.match(json.fields[0].value, /7/);
  assert.deepEqual(idsDasLinhas(payload.components), [['bau_adicionar:membros', 'bau_remover:membros', 'bau_estoque:membros']]);
});

test('Ver Estoque: baú vazio indica estoque vazio sem lançar', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = clique('bau_estoque:gerencia');
  await handler.execute(i);
  const json = ultima(i, 'editReply').payload.embeds[0].toJSON();
  assert.match(json.description, /Nenhum item/);
});

test('Ver Estoque: deferUpdate acontece antes da leitura do banco', async (t) => {
  const registro = [];
  const env = montarAmbiente({ registro });
  t.after(env.limpar);
  const i = clique('bau_estoque:membros', registro);
  await handler.execute(i);
  const defer = registro.find((r) => r.metodo === 'deferUpdate');
  const leitura = registro.find((r) => r.origem === 'db');
  assert.ok(defer && leitura);
  assert.ok(defer.seq < leitura.seq);
});

test('Ver Estoque: nenhum campo passa de 1024 caracteres', async (t) => {
  const bau = {};
  for (let n = 0; n < 25; n++) {
    bau[`armas__item${n}`] = { nome: `Item com nome bem comprido numero ${n} ${'x'.repeat(30)}`, categoria: 'Armas', categoriaId: 'armas', quantidade: 100000 };
  }
  const env = montarAmbiente({ seed: { 'bau/membros': bau } });
  t.after(env.limpar);
  const i = clique('bau_estoque:membros');
  await handler.execute(i);
  const json = ultima(i, 'editReply').payload.embeds[0].toJSON();
  for (const f of json.fields) assert.ok(f.value.length <= 1024, `campo com ${f.value.length}`);
  assert.match(json.fields[0].value, /… e mais \d+/);
});

test('Ver Estoque: falha do banco restaura o painel e avisa de forma efêmera', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('get', /bau\/membros/, new Error('firestore caiu'));
  const i = clique('bau_estoque:membros');
  await handler.execute(i);

  assert.deepEqual(metodos(i), ['deferUpdate', 'editReply', 'followUp']);
  const restaurado = ultima(i, 'editReply').payload;
  assert.match(restaurado.embeds[0].toJSON().title, /Baú dos Membros/);
  const aviso = ultima(i, 'followUp').payload;
  assert.ok(ehEfemera(aviso));
  assert.ok(!/firestore caiu/.test(aviso.content), 'não vaza detalhe interno');
});

test('Cancelar volta ao menu principal', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = clique('bau_cancelar:gerencia');
  await handler.execute(i);
  const p = ultima(i, 'editReply').payload;
  assert.match(p.embeds[0].toJSON().title, /Baú da Gerência/);
  assert.deepEqual(idsDasLinhas(p.components), [['bau_adicionar:gerencia', 'bau_remover:gerencia', 'bau_estoque:gerencia']]);
});

test('Adicionar/Remover: select de categorias do catálogo + Cancelar', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  for (const [id, acao] of [['bau_adicionar:membros', 'adicionar'], ['bau_remover:membros', 'remover']]) {
    const i = clique(id);
    await handler.execute(i);
    const p = ultima(i, 'editReply').payload;
    assert.deepEqual(idsDasLinhas(p.components), [[`bau_categoria:${acao}:membros`], ['bau_cancelar:membros']]);
    const opcoes = p.components[0].toJSON().components[0].options.map((o) => o.value);
    assert.deepEqual(opcoes, ['armas', 'medicamentos']);
  }
});

test('Adicionar: falha do banco restaura o painel e avisa', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('get', /catalogo\/items/, new Error('x'));
  const i = clique('bau_adicionar:membros');
  await handler.execute(i);
  assert.deepEqual(metodos(i), ['deferUpdate', 'editReply', 'followUp']);
  assert.ok(ehEfemera(ultima(i, 'followUp').payload));
});
