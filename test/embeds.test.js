'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { montarAmbiente } = require('./helpers/ambiente');
const { setConfig, resetConfig } = require('../utils/config');
const { CONFIG_TESTE } = require('./helpers/config-teste');
const embeds = require('../utils/embeds');

test('carregar embeds.js não exige config; a cor vem de getConfig() na hora de montar', (t) => {
  resetConfig();
  setConfig({ ...CONFIG_TESTE, cor: 0x112233 });
  t.after(resetConfig);
  assert.equal(embeds.embedMenuPrincipal('membros').toJSON().color, 0x112233);
  setConfig({ ...CONFIG_TESTE, cor: 0 });
  assert.equal(embeds.embedGerencia().toJSON().color, 0x3498DB);
});

test('embedInventario devolve um embed (await) agrupado por categoria', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const bau = { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 2 } };
  const embed = await embeds.embedInventario(bau, 'membros');
  const json = embed.toJSON();
  assert.equal(json.fields[0].name, '🔫 Armas');
  assert.equal(json.fields[0].value, '**Colt** — `2`');
});

test('embedInventario vazio', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const json = (await embeds.embedInventario({}, 'gerencia')).toJSON();
  assert.match(json.title, /Gerência/);
  assert.match(json.description, /Nenhum item/);
});

test('embedInventario trunca campo acima de 1024 e mantém o resto', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const bau = {};
  for (let n = 0; n < 60; n++) {
    bau[`armas__i${n}`] = { nome: `Item ${n} ${'y'.repeat(20)}`, categoria: 'Armas', categoriaId: 'armas', quantidade: n + 1 };
  }
  const json = (await embeds.embedInventario(bau, 'membros')).toJSON();
  assert.ok(json.fields[0].value.length <= 1024);
  assert.match(json.fields[0].value, /\n… e mais \d+$/);
});

test('embedInventario com um único item gigante ainda respeita 1024', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const bau = { armas__a: { nome: 'z'.repeat(2000), categoria: 'Armas', categoriaId: 'armas', quantidade: 1 } };
  const json = (await embeds.embedInventario(bau, 'membros')).toJSON();
  assert.ok(json.fields[0].value.length <= 1024);
});
