'use strict';

// Confirmações pendentes do ajuste em massa, em memória (contrato: docs/architecture.md §4.10).
// Um restart do bot descarta tudo: o gerente refaz o ajuste.

const crypto = require('node:crypto');

const TTL_PENDENTE_MS = 600000;
const MAX_PENDENTES = 50;

const pendentes = new Map();

function criarPendente({ tipo, mudancas, usuarioId }, agora = Date.now()) {
  let id;
  do {
    id = crypto.randomBytes(4).toString('hex');
  } while (pendentes.has(id));

  pendentes.set(id, { tipo, mudancas, usuarioId, criadoEm: agora });
  while (pendentes.size > MAX_PENDENTES) {
    pendentes.delete(pendentes.keys().next().value); // descarta o mais antigo
  }
  return id;
}

function obterPendente(id, agora = Date.now()) {
  const pendente = pendentes.get(id);
  if (!pendente) return null;
  if (agora - pendente.criadoEm >= TTL_PENDENTE_MS) {
    pendentes.delete(id);
    return null;
  }
  const { tipo, mudancas, usuarioId } = pendente;
  return { tipo, mudancas, usuarioId };
}

function removerPendente(id) {
  pendentes.delete(id);
}

function limparPendentes() {
  pendentes.clear();
}

module.exports = { criarPendente, obterPendente, removerPendente, limparPendentes, TTL_PENDENTE_MS, MAX_PENDENTES };
