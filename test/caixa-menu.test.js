'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima, idsDasLinhas } = require('./helpers/ambiente');

const handler = require('../interactions/caixa-menu');

const GERENTE = ['r-gerente'];

function clique(customId, extras = {}) {
  return criarInteracao({ tipo: 'button', customId, cargos: GERENTE, ...extras });
}

test('sem cargo: resposta efêmera e nenhuma leitura', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = clique('caixa_logs', { cargos: ['r-membro'] });
  await handler.execute(i);
  assert.deepEqual(metodos(i), ['reply']);
  assert.ok(ehEfemera(ultima(i, 'reply').payload));
  assert.equal(env.fake.chamadas.length, 0);
});

test('Adicionar/Retirar abrem o modal do caixa como primeira resposta', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  for (const [id, acao] of [['caixa_adicionar', 'adicionar'], ['caixa_retirar', 'retirar']]) {
    const i = clique(id);
    await handler.execute(i);
    assert.deepEqual(metodos(i), ['showModal']);
    const modal = ultima(i, 'showModal').payload.toJSON();
    assert.equal(modal.custom_id, `caixa_modal:${acao}`);
    assert.deepEqual(modal.components.map((c) => c.components[0].custom_id), ['tipo', 'valor', 'anotacao']);
  }
});

test('Ver Histórico: lista as movimentações e mantém rowCaixa', async (t) => {
  const registro = [];
  const env = montarAmbiente({ registro });
  t.after(env.limpar);
  const logs = env.fake.collection('caixa').doc('logs').collection('entradas');
  await logs.add({ acao: 'adicionar', usuarioId: 'u9', tipo: 'sujo', valor: 1500, anotacao: 'venda', timestamp: '2026-10-01T10:00:00.000Z' });
  registro.length = 0;
  const i = clique('caixa_logs', { registro });
  await handler.execute(i);
  const p = ultima(i, 'editReply').payload;
  const json = p.embeds[0].toJSON();
  assert.equal(json.title, '📋 Histórico do Caixa');
  assert.match(json.description, /\$1\.500/);
  assert.match(json.description, /venda/);
  assert.deepEqual(idsDasLinhas(p.components), [['caixa_adicionar', 'caixa_retirar', 'caixa_logs']]);
  assert.equal(registro.find((r) => r.metodo === 'deferUpdate').seq < registro.find((r) => r.origem === 'db').seq, true);
});

test('Ver Histórico sem movimentações mostra o saldo e a mensagem de vazio', async (t) => {
  const env = montarAmbiente({ seed: { 'caixa/saldo': { sujo: 300, limpo: 50 } } });
  t.after(env.limpar);
  const i = clique('caixa_logs');
  await handler.execute(i);
  const json = ultima(i, 'editReply').payload.embeds[0].toJSON();
  assert.match(json.description, /Nenhuma movimentação/);
  assert.equal(json.fields[0].value, '$300');
  assert.equal(json.fields[1].value, '$50');
});

test('Ver Histórico: falha do banco vira erro efêmero sem lançar', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('get', /caixa\/logs\/entradas/, new Error('x'));
  const i = clique('caixa_logs');
  await assert.doesNotReject(handler.execute(i));
  assert.deepEqual(metodos(i), ['deferUpdate', 'followUp']);
  assert.ok(ehEfemera(ultima(i, 'followUp').payload));
});
