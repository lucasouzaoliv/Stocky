'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao, criarCanalFalso, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima, idsDasLinhas } = require('./helpers/ambiente');
const comando = require('../commands/setup');

function preparar(env, tipo, { comCanal = true } = {}) {
  const ids = { membros: env.config.channels.bauMembros, gerencia: env.config.channels.bauGerencia, painel: env.config.channels.painelGerencia };
  const canal = criarCanalFalso({ id: ids[tipo] });
  const client = criarClientFalso({ canais: comCanal ? [canal] : [] });
  const i = criarInteracao({ tipo: 'comando', commandName: 'setup', opcoes: { tipo }, client });
  return { canal, client, i };
}

test('baú dos membros e da gerência: embed + linha do baú com ids do tipo', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  for (const tipo of ['membros', 'gerencia']) {
    const { canal, client, i } = preparar(env, tipo);
    await comando.execute(i, client);
    const enviado = canal.send.mock.calls[0].arguments[0];
    assert.deepEqual(idsDasLinhas(enviado.components), [[`bau_adicionar:${tipo}`, `bau_remover:${tipo}`, `bau_estoque:${tipo}`]]);
    assert.match(ultima(i, 'editReply').payload.content, /Mensagem fixa enviada/);
  }
});

test('painel da gerência: envia as duas linhas de botões', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const { canal, client, i } = preparar(env, 'painel');
  await comando.execute(i, client);
  assert.deepEqual(idsDasLinhas(canal.send.mock.calls[0].arguments[0].components), [
    ['ger_adicionar_item', 'ger_remover_item', 'ger_zerar_bau', 'ger_ver_logs'],
    ['ger_ajustar_membros', 'ger_ajustar_gerencia']
  ]);
});

test('canal ausente: resposta efêmera sem enviar nada', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  for (const tipo of ['membros', 'painel']) {
    const { client, i } = preparar(env, tipo, { comCanal: false });
    await comando.execute(i, client);
    assert.deepEqual(metodos(i), ['reply']);
    assert.ok(ehEfemera(ultima(i, 'reply').payload));
  }
});

test('falha ao enviar ao canal: erro genérico efêmero', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const { canal, client, i } = preparar(env, 'membros');
  canal.send.mock.mockImplementation(() => Promise.reject(new Error('Missing Access')));
  await assert.doesNotReject(comando.execute(i, client));
  const aviso = ultima(i, 'followUp').payload;
  assert.ok(ehEfemera(aviso));
  assert.ok(!/Missing Access/.test(aviso.content));
});
