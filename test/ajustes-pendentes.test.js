'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../utils/ajustes-pendentes');

const dados = (usuarioId = 'u1') => ({ tipo: 'membros', mudancas: [{ categoriaId: 'armas', itemId: 'colt', quantidade: 1 }], usuarioId });

test('cria, obtém e remove; id tem 8 hex', (t) => {
  t.after(P.limparPendentes);
  const id = P.criarPendente(dados(), 1000);
  assert.match(id, /^[0-9a-f]{8}$/);
  assert.deepEqual(P.obterPendente(id, 1001), dados());
  P.removerPendente(id);
  assert.equal(P.obterPendente(id, 1001), null);
});

test('expira em 10 minutos (no limite exato já expirou) e id desconhecido é null', (t) => {
  t.after(P.limparPendentes);
  const id = P.criarPendente(dados(), 0);
  assert.notEqual(P.obterPendente(id, P.TTL_PENDENTE_MS - 1), null);
  assert.equal(P.obterPendente(id, P.TTL_PENDENTE_MS), null);
  assert.equal(P.obterPendente('naoexiste'), null);
});

test('guarda no máximo MAX_PENDENTES, descartando o mais antigo', (t) => {
  t.after(P.limparPendentes);
  const primeiro = P.criarPendente(dados(), 0);
  const ids = [];
  for (let n = 0; n < P.MAX_PENDENTES; n++) ids.push(P.criarPendente(dados(), 0));
  assert.equal(P.obterPendente(primeiro, 1), null);
  assert.notEqual(P.obterPendente(ids[0], 1), null);
  assert.notEqual(P.obterPendente(ids[ids.length - 1], 1), null);
});
