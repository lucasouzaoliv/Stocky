'use strict';

// Ambiente padrão dos testes de handler: Firestore falso, config de teste e console.error mudo.

const { mock } = require('node:test');
const { criarFakeFirestore } = require('./fake-firestore');
const { usarConfigTeste } = require('./config-teste');
const { setDb, resetDb } = require('../../utils/firebase');
const { resetConfig } = require('../../utils/config');

const CATALOGO = Object.freeze({
  armas: { nome: 'Armas', emoji: '🔫', items: [{ id: 'colt', nome: 'Colt' }, { id: 'usp', nome: 'USP' }] },
  medicamentos: { nome: 'Medicamentos', emoji: '💊', items: [{ id: 'gaze', nome: 'Gaze' }] }
});

function montarAmbiente({ seed = {}, registro = [] } = {}) {
  const config = usarConfigTeste();
  const fake = criarFakeFirestore({ seed: { 'catalogo/items': JSON.parse(JSON.stringify(CATALOGO)), ...seed }, registro });
  setDb(fake);
  const erros = mock.method(console, 'error', () => {});
  return {
    fake,
    config,
    registro,
    erros,
    limpar() {
      erros.mock.restore();
      resetDb();
      resetConfig();
    }
  };
}

function ehEfemera(payload) {
  return payload && payload.flags !== undefined && (payload.flags & 64) === 64;
}

function metodos(interaction) {
  return interaction.chamadas.map((c) => c.metodo);
}

function ultima(interaction, metodo) {
  const achadas = interaction.chamadas.filter((c) => c.metodo === metodo);
  return achadas[achadas.length - 1];
}

function idsDasLinhas(components) {
  return components.map((row) => row.toJSON().components.map((c) => c.custom_id));
}

module.exports = { montarAmbiente, CATALOGO, ehEfemera, metodos, ultima, idsDasLinhas };
