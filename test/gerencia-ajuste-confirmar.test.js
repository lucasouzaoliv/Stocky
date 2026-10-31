'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { criarInteracao, criarCanalFalso, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima } = require('./helpers/ambiente');
const handler = require('../interactions/gerencia-ajuste-confirmar');
const { criarPendente, obterPendente, limparPendentes, TTL_PENDENTE_MS } = require('../utils/ajustes-pendentes');
const { carregarHandlers, rotearInteracao } = require('../utils/roteador');

const BAU = { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 3 } };
const MUDANCAS = [
  { categoriaId: 'armas', itemId: 'colt', nome: 'Colt', quantidade: 0 },
  { categoriaId: 'armas', itemId: 'usp', nome: 'USP', quantidade: 9 }
];

function clique(acao, id, extras = {}) {
  return criarInteracao({ tipo: 'button', customId: `ger_ajuste_${acao}:${id}`, ...extras });
}

function auditorias(env) {
  return Object.entries(env.fake.dump()).filter(([c]) => c.startsWith('auditoria/'));
}

function preparar(t, extras = {}) {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU }, ...extras });
  t.after(() => { env.limpar(); limparPendentes(); });
  return env;
}

test('confirmar aplica pelo ajustarBauEmMassa com o usuário, grava auditoria, atualiza o painel e responde', async (t) => {
  const env = preparar(t);
  const inv = criarCanalFalso({ id: env.config.channels.inventarioMembros });
  const client = criarClientFalso({ canais: [inv] });
  const id = criarPendente({ tipo: 'membros', mudancas: MUDANCAS, usuarioId: 'u1' });
  const i = clique('confirmar', id);
  await handler.execute(i, client);

  const bau = env.fake.dump()['bau/membros'];
  assert.equal(bau.armas__colt, undefined);
  assert.equal(bau.armas__usp.quantidade, 9);
  const aud = auditorias(env);
  assert.equal(aud.length, 1);
  assert.equal(aud[0][1].acao, 'bau.ajuste_massa');
  assert.equal(aud[0][1].usuarioId, 'u1');
  assert.equal(inv.send.mock.callCount(), 1);
  assert.deepEqual(metodos(i), ['deferUpdate', 'editReply']);
  const p = ultima(i, 'editReply').payload;
  assert.match(p.embeds[0].toJSON().description, /\*\*2\*\* item\(s\)/);
  assert.deepEqual(p.components, []);
  assert.equal(obterPendente(id), null);
});

test('duplo clique em Confirmar aplica uma única vez', async (t) => {
  const env = preparar(t);
  const id = criarPendente({ tipo: 'membros', mudancas: MUDANCAS, usuarioId: 'u1' });
  const a = clique('confirmar', id);
  const b = clique('confirmar', id);
  await Promise.all([handler.execute(a, criarClientFalso()), handler.execute(b, criarClientFalso())]);

  assert.equal(auditorias(env).length, 1);
  assert.equal(env.fake.dump()['bau/membros'].armas__usp.quantidade, 9);
  const respostas = [a, b].map((x) => metodos(x).join(','));
  assert.deepEqual(respostas.sort(), ['deferUpdate,editReply', 'reply']);
  const segundo = [a, b].find((x) => metodos(x)[0] === 'reply');
  assert.match(ultima(segundo, 'reply').payload.content, /expirou ou já foi usada/);
  assert.ok(ehEfemera(ultima(segundo, 'reply').payload));
});

test('pendência expirada: pede para refazer e não grava', async (t) => {
  const env = preparar(t);
  const id = criarPendente({ tipo: 'membros', mudancas: MUDANCAS, usuarioId: 'u1' }, Date.now() - TTL_PENDENTE_MS - 1000);
  const antes = env.fake.dump();
  const i = clique('confirmar', id);
  await handler.execute(i, criarClientFalso());
  assert.deepEqual(metodos(i), ['reply']);
  assert.match(ultima(i, 'reply').payload.content, /Refaça o ajuste/);
  assert.deepEqual(env.fake.dump(), antes);
});

test('id desconhecido (ex.: depois de restart) também pede para refazer', async (t) => {
  preparar(t);
  const i = clique('confirmar', 'deadbeef');
  await handler.execute(i, criarClientFalso());
  assert.match(ultima(i, 'reply').payload.content, /Refaça o ajuste/);
});

test('pendência de outro usuário: negado, nada gravado e a pendência continua valendo para o dono', async (t) => {
  const env = preparar(t);
  const id = criarPendente({ tipo: 'membros', mudancas: MUDANCAS, usuarioId: 'u1' });
  const antes = env.fake.dump();
  const intruso = clique('confirmar', id, { usuario: { id: 'u2', tag: 'outro#0002' } });
  await handler.execute(intruso, criarClientFalso());
  assert.deepEqual(metodos(intruso), ['reply']);
  assert.match(ultima(intruso, 'reply').payload.content, /Só quem gerou/);
  assert.ok(ehEfemera(ultima(intruso, 'reply').payload));
  assert.deepEqual(env.fake.dump(), antes);
  assert.notEqual(obterPendente(id), null);

  const cancelaIntruso = clique('cancelar', id, { usuario: { id: 'u2', tag: 'outro#0002' } });
  await handler.execute(cancelaIntruso, criarClientFalso());
  assert.match(ultima(cancelaIntruso, 'reply').payload.content, /Só quem gerou/);
  assert.notEqual(obterPendente(id), null);
});

test('cancelar: nada gravado, pendência removida e resposta de cancelamento', async (t) => {
  const env = preparar(t);
  const id = criarPendente({ tipo: 'membros', mudancas: MUDANCAS, usuarioId: 'u1' });
  const antes = env.fake.dump();
  const i = clique('cancelar', id);
  await handler.execute(i, criarClientFalso());
  assert.deepEqual(env.fake.dump(), antes);
  assert.equal(obterPendente(id), null);
  assert.deepEqual(metodos(i), ['update']);
  assert.match(ultima(i, 'update').payload.content, /cancelado/);
  assert.deepEqual(ultima(i, 'update').payload.components, []);
});

test('item inválido (removido do catálogo depois do resumo): nada gravado e erro explicado', async (t) => {
  const env = preparar(t);
  const id = criarPendente({
    tipo: 'membros',
    mudancas: [{ categoriaId: 'armas', itemId: 'colt', quantidade: 0 }, { categoriaId: 'armas', itemId: 'fantasma', quantidade: 1 }],
    usuarioId: 'u1'
  });
  const antes = env.fake.dump();
  const i = clique('confirmar', id);
  await handler.execute(i, criarClientFalso());
  assert.deepEqual(env.fake.dump(), antes);
  assert.equal(auditorias(env).length, 0);
  const p = ultima(i, 'editReply').payload;
  const json = p.embeds[0].toJSON();
  assert.match(json.title, /não aplicado/);
  assert.match(json.description, /fantasma/);
  assert.deepEqual(p.components, []);
});

test('falha do Firestore ao aplicar: mensagem amigável sem detalhes, nada gravado, sem lançar', async (t) => {
  const env = preparar(t);
  env.fake.falharProximoCommit(new Error('segredo'));
  const id = criarPendente({ tipo: 'membros', mudancas: MUDANCAS, usuarioId: 'u1' });
  const antes = env.fake.dump();
  const i = clique('confirmar', id);
  await assert.doesNotReject(handler.execute(i, criarClientFalso()));
  assert.deepEqual(env.fake.dump(), antes);
  const p = ultima(i, 'editReply').payload;
  assert.ok(!/segredo/.test(JSON.stringify(p)));
  assert.match(p.content, /Não foi possível aplicar/);
});

test('falha ao atualizar o painel não desfaz nem esconde o sucesso do ajuste', async (t) => {
  const env = preparar(t);
  const inv = criarCanalFalso({ id: env.config.channels.inventarioMembros });
  inv.send.mock.mockImplementation(() => Promise.reject(new Error('sem permissão')));
  const id = criarPendente({ tipo: 'membros', mudancas: MUDANCAS, usuarioId: 'u1' });
  const i = clique('confirmar', id);
  await assert.doesNotReject(handler.execute(i, criarClientFalso({ canais: [inv] })));
  assert.equal(env.fake.dump()['bau/membros'].armas__usp.quantidade, 9);
  assert.match(ultima(i, 'editReply').payload.embeds[0].toJSON().title, /ajustado/);
  assert.ok(ehEfemera(ultima(i, 'followUp').payload));
  assert.match(ultima(i, 'followUp').payload.content, /painel de inventário não pôde ser atualizado/);
});

test('deferUpdate vem antes de qualquer acesso ao banco', async (t) => {
  const registro = [];
  const env = preparar(t, { registro });
  const id = criarPendente({ tipo: 'membros', mudancas: MUDANCAS, usuarioId: 'u1' });
  const i = clique('confirmar', id, { registro });
  await handler.execute(i, criarClientFalso());
  assert.equal(registro[0].metodo, 'deferUpdate');
  assert.ok(registro.some((c) => c.origem === 'db'));
  assert.ok(env);
});

test('permissão pelo roteador real: sem cargo e membro são negados sem tocar no banco; gerente executa', async (t) => {
  const env = preparar(t);
  const registro = carregarHandlers({
    commandsDir: path.join(__dirname, '..', 'commands'),
    interactionsDir: path.join(__dirname, '..', 'interactions')
  });
  const id = criarPendente({ tipo: 'membros', mudancas: MUDANCAS, usuarioId: 'u1' });
  const antes = env.fake.dump();

  for (const cargos of [[], ['r-membro']]) {
    const i = clique('confirmar', id, { cargos });
    assert.equal(await rotearInteracao(i, registro, criarClientFalso()), 'negado');
    assert.equal(i.chamadas.length, 1);
    assert.ok(ehEfemera(i.chamadas[0].payload));
    assert.deepEqual(env.fake.dump(), antes);
  }
  const dm = clique('confirmar', id, { emDM: true });
  assert.equal(await rotearInteracao(dm, registro, criarClientFalso()), 'negado');
  assert.deepEqual(env.fake.dump(), antes);

  const ok = clique('confirmar', id, { cargos: ['r-gerente'] });
  assert.equal(await rotearInteracao(ok, registro, criarClientFalso()), 'executado');
  assert.equal(env.fake.dump()['bau/membros'].armas__usp.quantidade, 9);

  const cancelar = clique('cancelar', 'x', { cargos: ['r-membro'] });
  assert.equal(await rotearInteracao(cancelar, registro, criarClientFalso()), 'negado');
});
