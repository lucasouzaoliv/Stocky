'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao, criarCanalFalso, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima, idsDasLinhas } = require('./helpers/ambiente');
const comando = require('../commands/setup-caixa');

function preparar(env, { comCanal = true, registro } = {}) {
  const canal = criarCanalFalso({ id: env.config.channels.caixaGangue });
  const client = criarClientFalso({ canais: comCanal ? [canal] : [] });
  const i = criarInteracao({ tipo: 'comando', commandName: 'setup-caixa', client, registro });
  return { canal, client, i };
}

test('o saldo é lido com await: embed enviado traz $1.500 e $300 (não Promise)', async (t) => {
  const env = montarAmbiente({ seed: { 'caixa/saldo': { sujo: 1500, limpo: 300 } } });
  t.after(env.limpar);
  const { canal, client, i } = preparar(env);
  await comando.execute(i, client);

  const enviado = canal.send.mock.calls[0].arguments[0];
  const json = enviado.embeds[0].toJSON();
  assert.equal(json.fields[0].value, '$1.500');
  assert.equal(json.fields[1].value, '$300');
  const texto = JSON.stringify(json);
  assert.ok(!texto.includes('undefined') && !texto.includes('[object') && !texto.includes('NaN'));
  assert.deepEqual(idsDasLinhas(enviado.components), [['caixa_adicionar', 'caixa_retirar', 'caixa_logs']]);
  assert.match(ultima(i, 'editReply').payload.content, /Caixa enviado/);
});

test('sem documento de saldo: usa $0 e não lança', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const { canal, client, i } = preparar(env);
  await assert.doesNotReject(comando.execute(i, client));
  const json = canal.send.mock.calls[0].arguments[0].embeds[0].toJSON();
  assert.equal(json.fields[0].value, '$0');
  assert.equal(json.fields[1].value, '$0');
});

test('deferReply acontece antes da primeira leitura do banco', async (t) => {
  const registro = [];
  const env = montarAmbiente({ registro });
  t.after(env.limpar);
  const { client, i } = preparar(env, { registro });
  await comando.execute(i, client);
  const defer = registro.find((r) => r.metodo === 'deferReply');
  const leitura = registro.find((r) => r.origem === 'db');
  assert.ok(defer && leitura && defer.seq < leitura.seq);
  assert.ok(ehEfemera(defer.payload));
});

test('canal ausente: resposta efêmera, sem leitura nem envio', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const { client, i } = preparar(env, { comCanal: false });
  await comando.execute(i, client);
  assert.deepEqual(metodos(i), ['reply']);
  assert.ok(ehEfemera(ultima(i, 'reply').payload));
  assert.equal(env.fake.chamadas.length, 0);
});

test('falha do banco: erro genérico efêmero e nada enviado ao canal', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('get', /caixa\/saldo/, new Error('segredo'));
  const { canal, client, i } = preparar(env);
  await assert.doesNotReject(comando.execute(i, client));
  assert.equal(canal.send.mock.callCount(), 0);
  assert.ok(!/segredo/.test(ultima(i, 'followUp').payload.content));
});

test('falha ao enviar ao canal: erro genérico efêmero', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const { canal, client, i } = preparar(env);
  canal.send.mock.mockImplementation(() => Promise.reject(new Error('Missing Access')));
  await assert.doesNotReject(comando.execute(i, client));
  assert.ok(ehEfemera(ultima(i, 'followUp').payload));
});
