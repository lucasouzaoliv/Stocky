'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { criarCanalFalso, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente } = require('./helpers/ambiente');
const { atualizarPainelInventario, atualizarPainelSaldo } = require('../utils/painel');

const BAU = { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 3 } };

function cenario(t, { seed = {}, mensagens = [] } = {}) {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU, ...seed } });
  t.after(env.limpar);
  const canal = criarCanalFalso({ id: env.config.channels.inventarioMembros, mensagens });
  return { env, canal, client: criarClientFalso({ canais: [canal] }) };
}

const painelSalvo = (env, chave) => env.fake.dump()[`paineis/${chave}`];

test('com id guardado: busca essa mensagem e edita, sem varrer as últimas 10', async (t) => {
  const { env, canal, client } = cenario(t, {
    mensagens: [{ id: 'm-outra', author: { id: 'bot' } }, { id: 'm-painel', author: { id: 'bot' } }],
    seed: { 'paineis/inventario_membros': { canalId: 'c-inv-membros', mensagemId: 'm-painel' } }
  });
  const r = await atualizarPainelInventario(client, 'membros');
  assert.deepEqual(r, { ok: true, acao: 'editado' });
  assert.equal(canal.messages.fetch.mock.callCount(), 1);
  assert.equal(canal.messages.fetch.mock.calls[0].arguments[0], 'm-painel');
  const alvo = canal.mensagens.find((m) => m.id === 'm-painel');
  assert.equal(alvo.edit.mock.callCount(), 1);
  assert.match(alvo.edit.mock.calls[0].arguments[0].embeds[0].toJSON().fields[0].value, /Colt/);
  assert.equal(canal.send.mock.callCount(), 0);
  assert.equal(painelSalvo(env, 'inventario_membros').mensagemId, 'm-painel');
});

test('sem id guardado: busca legada uma vez, adota a mensagem do bot e grava o id', async (t) => {
  const { env, canal, client } = cenario(t, {
    mensagens: [{ id: 'm-de-membro', author: { id: 'u9' } }, { id: 'm-bot', author: { id: 'bot' } }]
  });
  const r = await atualizarPainelInventario(client, 'membros');
  assert.deepEqual(r, { ok: true, acao: 'editado' });
  assert.deepEqual(canal.messages.fetch.mock.calls[0].arguments[0], { limit: 10 });
  assert.equal(painelSalvo(env, 'inventario_membros').mensagemId, 'm-bot');

  await atualizarPainelInventario(client, 'membros');
  assert.equal(canal.messages.fetch.mock.callCount(), 2);
  assert.equal(canal.messages.fetch.mock.calls[1].arguments[0], 'm-bot'); // agora por id, sem varrer
});

test('sem id e sem mensagem antiga: envia nova e grava o id', async (t) => {
  const { env, canal, client } = cenario(t);
  const r = await atualizarPainelInventario(client, 'membros');
  assert.deepEqual(r, { ok: true, acao: 'enviado' });
  assert.equal(canal.send.mock.callCount(), 1);
  assert.equal(painelSalvo(env, 'inventario_membros').mensagemId, canal.mensagens[0].id);
});

test('mensagem salva apagada (10008): recria e grava o novo id', async (t) => {
  const { env, canal, client } = cenario(t, {
    seed: { 'paineis/inventario_membros': { canalId: 'c-inv-membros', mensagemId: 'sumiu' } }
  });
  const r = await atualizarPainelInventario(client, 'membros');
  assert.deepEqual(r, { ok: true, acao: 'enviado' });
  assert.equal(canal.send.mock.callCount(), 1);
  const novoId = painelSalvo(env, 'inventario_membros').mensagemId;
  assert.notEqual(novoId, 'sumiu');
  assert.equal(novoId, canal.mensagens[0].id);
});

test('send rejeitando: { ok:false, acao:"erro" } sem lançar', async (t) => {
  const { env, canal, client } = cenario(t);
  canal.send.mock.mockImplementation(() => Promise.reject(new Error('sem permissão')));
  const r = await atualizarPainelInventario(client, 'membros');
  assert.deepEqual(r, { ok: false, acao: 'erro' });
  assert.equal(painelSalvo(env, 'inventario_membros'), undefined);
  assert.ok(env.erros.mock.callCount() > 0);
});

test('erro diferente de 10008 ao buscar a mensagem salva não recria o painel', async (t) => {
  const { canal, client } = cenario(t, {
    seed: { 'paineis/inventario_membros': { canalId: 'c-inv-membros', mensagemId: 'x' } }
  });
  canal.messages.fetch.mock.mockImplementation(() => Promise.reject(Object.assign(new Error('rede'), { code: 50013 })));
  const r = await atualizarPainelInventario(client, 'membros');
  assert.deepEqual(r, { ok: false, acao: 'erro' });
  assert.equal(canal.send.mock.callCount(), 0);
});

test('falha do banco ao ler o baú ou o id: erro sem lançar', async (t) => {
  const { env, client } = cenario(t);
  env.fake.falharEm('get', /bau\/membros/, new Error('x'));
  assert.deepEqual(await atualizarPainelInventario(client, 'membros'), { ok: false, acao: 'erro' });
});

test('canal ausente: ignorado', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const r = await atualizarPainelInventario(criarClientFalso(), 'gerencia');
  assert.deepEqual(r, { ok: false, acao: 'ignorado' });
});

test('gerência usa a chave e o canal da gerência', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const canal = criarCanalFalso({ id: env.config.channels.inventarioGerencia });
  const r = await atualizarPainelInventario(criarClientFalso({ canais: [canal] }), 'gerencia');
  assert.equal(r.acao, 'enviado');
  assert.ok(painelSalvo(env, 'inventario_gerencia'));
  assert.equal(painelSalvo(env, 'inventario_membros'), undefined);
});

test('saldo: usa o saldo recebido, ou lê do banco quando ausente', async (t) => {
  const env = montarAmbiente({ seed: { 'caixa/saldo': { sujo: 7, limpo: 9 } } });
  t.after(env.limpar);
  const canal = criarCanalFalso({ id: env.config.channels.saldoCaixa });
  const client = criarClientFalso({ canais: [canal] });
  const a = await atualizarPainelSaldo(client, { sujo: 1500, limpo: 300 });
  assert.equal(a.acao, 'enviado');
  const campos = canal.send.mock.calls[0].arguments[0].embeds[0].toJSON().fields;
  assert.deepEqual(campos.map((c) => c.value), ['$1.500', '$300']);
  assert.ok(painelSalvo(env, 'saldo_caixa'));

  const b = await atualizarPainelSaldo(client);
  assert.equal(b.acao, 'editado');
  assert.deepEqual(canal.mensagens[0].edit.mock.calls[0].arguments[0].embeds[0].toJSON().fields.map((c) => c.value), ['$7', '$9']);
});

test('varredura: "messages.fetch({ limit" só existe em utils/painel.js', () => {
  const raiz = path.join(__dirname, '..');
  const achados = [];
  for (const dir of ['interactions', 'commands', 'utils']) {
    for (const arquivo of fs.readdirSync(path.join(raiz, dir)).filter((f) => f.endsWith('.js'))) {
      if (/messages\.fetch\(\s*\{\s*limit/.test(fs.readFileSync(path.join(raiz, dir, arquivo), 'utf8'))) achados.push(`${dir}/${arquivo}`);
    }
  }
  assert.deepEqual(achados, ['utils/painel.js']);
});
