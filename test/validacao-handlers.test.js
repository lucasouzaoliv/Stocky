'use strict';

// STK-012: validação numérica estrita nos handlers bau-quantidade e caixa-modal.

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao, criarCanalFalso, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, ultima } = require('./helpers/ambiente');
const bau = require('../interactions/bau-quantidade');
const caixa = require('../interactions/caixa-modal');

const BAU = { 'bau/membros': { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 10 } } };
const SALDO = { 'caixa/saldo': { sujo: 1000, limpo: 200 } };

function clienteBau(config) {
  return criarClientFalso({ canais: [criarCanalFalso({ id: config.channels.logMembros }), criarCanalFalso({ id: config.channels.inventarioMembros })] });
}
function clienteCaixa(config) {
  return criarClientFalso({ canais: [criarCanalFalso({ id: config.channels.logCaixa }), criarCanalFalso({ id: config.channels.saldoCaixa })] });
}
const logsDe = (env, prefixo) => Object.keys(env.fake.dump()).filter((c) => c.startsWith(prefixo));

const INVALIDAS_BAU = ['10abc', '-50', '1.000,50', '50.000', '0', '1.5', '1,5', '100001', '', '  ', '1e3', '+5', '10 0'];

test('bau-quantidade recusa entradas inválidas com mensagem clara e não grava nada', async (t) => {
  for (const acao of ['adicionar', 'remover']) {
    for (const quantidade of INVALIDAS_BAU) {
      const env = montarAmbiente({ seed: BAU });
      const client = clienteBau(env.config);
      const i = criarInteracao({ tipo: 'modal', customId: `bau_quantidade:${acao}:membros:armas:colt`, campos: { quantidade }, client });
      await bau.execute(i, client);
      const reply = ultima(i, 'reply').payload;
      assert.ok(ehEfemera(reply), quantidade);
      const embed = reply.embeds[0].toJSON();
      assert.match(embed.title, /inválida/);
      assert.ok(embed.description.length > 5 && !/at |Error:/.test(embed.description));
      assert.equal(env.fake.chamadas.filter((c) => c.op !== 'get').length, 0, `escreveu com "${quantidade}"`);
      assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 10);
      assert.equal(logsDe(env, 'logs/').length, 0);
      env.limpar();
    }
  }
  t.diagnostic('ok');
});

test('bau-quantidade: mensagens dos erros de formato e de limite', async (t) => {
  const env = montarAmbiente({ seed: BAU });
  t.after(env.limpar);
  const client = clienteBau(env.config);
  const a = criarInteracao({ tipo: 'modal', customId: 'bau_quantidade:adicionar:membros:armas:colt', campos: { quantidade: '10abc' }, client });
  await bau.execute(a, client);
  assert.match(ultima(a, 'reply').payload.embeds[0].toJSON().description, /apenas números inteiros/);
  const b = criarInteracao({ tipo: 'modal', customId: 'bau_quantidade:adicionar:membros:armas:colt', campos: { quantidade: '100001' }, client });
  await bau.execute(b, client);
  assert.match(ultima(b, 'reply').payload.embeds[0].toJSON().description, /acima do limite \(máx\. 100\.000\)/);
});

test('bau-quantidade aceita válidos, inclusive o máximo exato e zeros à esquerda', async (t) => {
  for (const [entrada, esperado] of [['10', 20], ['007', 17], ['100000', 100010], [' 5 ', 15]]) {
    const env = montarAmbiente({ seed: BAU });
    const client = clienteBau(env.config);
    const i = criarInteracao({ tipo: 'modal', customId: 'bau_quantidade:adicionar:membros:armas:colt', campos: { quantidade: entrada }, client });
    await bau.execute(i, client);
    assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, esperado, entrada);
    env.limpar();
  }
  t.diagnostic('ok');
});

test('bau-quantidade: falha do back-end vira erro genérico sem vazar detalhe', async (t) => {
  const env = montarAmbiente({ seed: BAU });
  t.after(env.limpar);
  env.fake.falharProximoCommit(new Error('segredo interno xyz'));
  const client = clienteBau(env.config);
  const i = criarInteracao({ tipo: 'modal', customId: 'bau_quantidade:adicionar:membros:armas:colt', campos: { quantidade: '5' }, client });
  await bau.execute(i, client);
  const texto = JSON.stringify(i.chamadas.map((c) => c.payload));
  assert.ok(!texto.includes('segredo interno'));
  assert.ok(i.chamadas.some((c) => c.metodo === 'reply' || c.metodo === 'followUp'));
});

const INVALIDOS_CAIXA = ['10abc', '-50', '1.000,50', '50.000', '0', '1.5', '1000000001', '', 'abc', '1e3', 'R$ 500'];

test('caixa-modal recusa valores inválidos: mensagem clara, nada gravado, nenhum histórico', async (t) => {
  for (const acao of ['adicionar', 'retirar']) {
    for (const valor of INVALIDOS_CAIXA) {
      const env = montarAmbiente({ seed: SALDO });
      const client = clienteCaixa(env.config);
      const i = criarInteracao({ tipo: 'modal', customId: `caixa_modal:${acao}`, campos: { tipo: 'sujo', valor, anotacao: 'nota' }, client });
      await caixa.execute(i, client);
      const reply = ultima(i, 'reply').payload;
      assert.ok(ehEfemera(reply), valor);
      assert.match(reply.content, /Valor inválido/);
      assert.ok(!/at |Error:/.test(reply.content));
      assert.equal(env.fake.chamadas.filter((c) => c.op !== 'get').length, 0, `escreveu com "${valor}"`);
      assert.deepEqual(env.fake.dump()['caixa/saldo'], { sujo: 1000, limpo: 200 });
      assert.equal(logsDe(env, 'caixa/logs/').length, 0);
      env.limpar();
    }
  }
  t.diagnostic('ok');
});

test('caixa-modal: mensagem de limite cita o máximo', async (t) => {
  const env = montarAmbiente({ seed: SALDO });
  t.after(env.limpar);
  const client = clienteCaixa(env.config);
  const i = criarInteracao({ tipo: 'modal', customId: 'caixa_modal:adicionar', campos: { tipo: 'sujo', valor: '1000000001', anotacao: 'n' }, client });
  await caixa.execute(i, client);
  assert.match(ultima(i, 'reply').payload.content, /acima do limite \(máx\. 1\.000\.000\.000\)/);
});

test('caixa-modal: 500 grava 500 e o histórico é gravado uma vez; retirada recusada não grava histórico', async (t) => {
  const env = montarAmbiente({ seed: SALDO });
  t.after(env.limpar);
  const client = clienteCaixa(env.config);
  const i = criarInteracao({ tipo: 'modal', customId: 'caixa_modal:adicionar', campos: { tipo: 'sujo', valor: '500', anotacao: 'ok' }, client });
  await caixa.execute(i, client);
  assert.equal(env.fake.dump()['caixa/saldo'].sujo, 1500);
  assert.equal(logsDe(env, 'caixa/logs/').length, 1);

  const r = criarInteracao({ tipo: 'modal', customId: 'caixa_modal:retirar', campos: { tipo: 'sujo', valor: '999999', anotacao: 'x' }, client });
  await caixa.execute(r, client);
  assert.equal(env.fake.dump()['caixa/saldo'].sujo, 1500);
  assert.equal(logsDe(env, 'caixa/logs/').length, 1);
});

test('caixa-modal: máximo exato aceito', async (t) => {
  const env = montarAmbiente({ seed: SALDO });
  t.after(env.limpar);
  const client = clienteCaixa(env.config);
  const i = criarInteracao({ tipo: 'modal', customId: 'caixa_modal:adicionar', campos: { tipo: 'limpo', valor: '1000000000', anotacao: 'ok' }, client });
  await caixa.execute(i, client);
  assert.equal(env.fake.dump()['caixa/saldo'].limpo, 1000000200);
});
