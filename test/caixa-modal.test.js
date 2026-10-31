'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao, criarCanalFalso, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima, idsDasLinhas } = require('./helpers/ambiente');
const handler = require('../interactions/caixa-modal');

function modal({ acao = 'adicionar', tipo = 'sujo', valor = '500', anotacao = 'teste', client } = {}) {
  return criarInteracao({ tipo: 'modal', customId: `caixa_modal:${acao}`, campos: { tipo, valor, anotacao }, client });
}

function cliente(config) {
  const log = criarCanalFalso({ id: config.channels.logCaixa });
  const saldo = criarCanalFalso({ id: config.channels.saldoCaixa });
  return { client: criarClientFalso({ canais: [log, saldo] }), log, saldo };
}

const SALDO = { 'caixa/saldo': { sujo: 1000, limpo: 200 } };

test('adicionar: soma, responde efêmero, atualiza painel, histórico e canais', async (t) => {
  const env = montarAmbiente({ seed: SALDO });
  t.after(env.limpar);
  const { client, log, saldo } = cliente(env.config);
  const i = modal({ client });
  await handler.execute(i, client);

  assert.equal(env.fake.dump()['caixa/saldo'].sujo, 1500);
  const r = ultima(i, 'reply').payload;
  assert.ok(ehEfemera(r));
  assert.match(r.embeds[0].toJSON().description, /\$500/);
  const painel = i.message.edit.mock.calls[0].arguments[0];
  assert.equal(painel.embeds[0].toJSON().fields[0].value, '$1.500');
  assert.deepEqual(idsDasLinhas(painel.components), [['caixa_adicionar', 'caixa_retirar', 'caixa_logs']]);
  assert.equal(log.send.mock.callCount(), 1);
  assert.equal(saldo.send.mock.callCount(), 1);
  const historico = Object.keys(env.fake.dump()).filter((c) => c.startsWith('caixa/logs/entradas/'));
  assert.equal(historico.length, 1);
});

test('retirar: subtrai o saldo', async (t) => {
  const env = montarAmbiente({ seed: SALDO });
  t.after(env.limpar);
  const { client } = cliente(env.config);
  const i = modal({ acao: 'retirar', tipo: 'LIMPO ', valor: '150', client });
  await handler.execute(i, client);
  assert.equal(env.fake.dump()['caixa/saldo'].limpo, 50);
  assert.match(ultima(i, 'reply').payload.embeds[0].toJSON().title, /Retirado/);
});

test('retirar mais que o saldo: erro efêmero, sem histórico', async (t) => {
  const env = montarAmbiente({ seed: SALDO });
  t.after(env.limpar);
  const { client, log } = cliente(env.config);
  const i = modal({ acao: 'retirar', valor: '999999', client });
  await handler.execute(i, client);
  assert.ok(ehEfemera(ultima(i, 'reply').payload));
  assert.equal(env.fake.dump()['caixa/saldo'].sujo, 1000);
  assert.equal(log.send.mock.callCount(), 0);
  assert.equal(Object.keys(env.fake.dump()).filter((c) => c.startsWith('caixa/logs/')).length, 0);
});

test('tipo inválido e valor inválido: erro efêmero, painel restaurado, nada gravado', async (t) => {
  const env = montarAmbiente({ seed: SALDO });
  t.after(env.limpar);
  const { client } = cliente(env.config);
  for (const campos of [{ tipo: 'ouro' }, { valor: 'abc' }, { valor: '0' }]) {
    const i = modal({ ...campos, client });
    await handler.execute(i, client);
    assert.ok(ehEfemera(ultima(i, 'reply').payload));
    assert.equal(i.message.edit.mock.callCount(), 1);
  }
  assert.deepEqual(env.fake.dump()['caixa/saldo'], { sujo: 1000, limpo: 200 });
});

test('falha do banco: erro genérico efêmero sem vazar detalhe', async (t) => {
  const env = montarAmbiente({ seed: SALDO });
  t.after(env.limpar);
  env.fake.falharProximoCommit(new Error('commit falhou'));
  const { client } = cliente(env.config);
  const i = modal({ client });
  await assert.doesNotReject(handler.execute(i, client));
  assert.deepEqual(metodos(i), ['reply']);
  assert.ok(!/commit falhou/.test(ultima(i, 'reply').payload.content));
});

test('falha ao gravar o histórico não esconde o sucesso', async (t) => {
  const env = montarAmbiente({ seed: SALDO });
  t.after(env.limpar);
  env.fake.falharEm('add', /caixa\/logs\/entradas/, new Error('x'));
  const { client } = cliente(env.config);
  const i = modal({ client });
  await handler.execute(i, client);
  assert.deepEqual(metodos(i), ['reply']);
  assert.equal(env.fake.dump()['caixa/saldo'].sujo, 1500);
});
