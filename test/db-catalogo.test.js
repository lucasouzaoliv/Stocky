const test = require('node:test');
const assert = require('node:assert/strict');
const { criarFakeFirestore } = require('./helpers/fake-firestore');
const { setDb, resetDb } = require('../utils/firebase');
const { adicionarItemAoCatalogo, getCatalogo } = require('../utils/db');
const { ErroValidacao, LIMITES } = require('../utils/validacao');

let fake;
function criarBase(seed = {}) {
  fake = criarFakeFirestore({ seed });
  setDb(fake);
}

const itensDe = (cat) => fake.dump()['catalogo/items'][cat].items;

test.afterEach(() => resetDb());

test('nome válido cadastra com id gerado, nome limpo e grava atomicamente', async () => {
  criarBase();
  const r = await adicionarItemAoCatalogo('armas', '  Pistola   Nova  ');
  assert.deepEqual(r, { sucesso: true, item: { id: 'pistola_nova', nome: 'Pistola Nova' } });
  assert.deepEqual(itensDe('armas').at(-1), { id: 'pistola_nova', nome: 'Pistola Nova' });
  const escritas = fake.chamadas.filter((c) => c.op === 'set');
  assert.ok(escritas.length > 0 && escritas.every((c) => c.emTransacao));
});

test('acentos e símbolos geram id seguro, sem barra e nunca vazio', async () => {
  criarBase();
  const r = await adicionarItemAoCatalogo('materiais', 'Ação/Ré: 9mm!');
  assert.equal(r.sucesso, true);
  assert.equal(r.item.id, 'acao_re_9mm');
  assert.doesNotMatch(r.item.id, /[/.]/);
});

test('id vazio (nome só com símbolos), nome vazio e não-string são recusados sem gravar', async () => {
  criarBase();
  await getCatalogo();
  const antes = fake.dump();
  for (const nome of ['!!!', '', '   ', '///', undefined, null, 42]) {
    const r = await adicionarItemAoCatalogo('armas', nome);
    assert.equal(r.sucesso, false, `nome ${String(nome)}`);
    assert.ok(r.motivo);
  }
  assert.deepEqual(fake.dump(), antes);
});

test('nome com 51 caracteres é recusado e com 50 é aceito', async () => {
  criarBase();
  const r51 = await adicionarItemAoCatalogo('armas', 'a'.repeat(LIMITES.NOME_ITEM_MAX + 1));
  assert.equal(r51.sucesso, false);
  const r50 = await adicionarItemAoCatalogo('armas', 'a'.repeat(LIMITES.NOME_ITEM_MAX));
  assert.equal(r50.sucesso, true);
});

test('colisão de ids parecidos: "Pistola 9mm" e depois "pistola-9mm" é recusado como duplicado', async () => {
  criarBase();
  assert.equal((await adicionarItemAoCatalogo('armas', 'Pistola 9mm')).sucesso, true);
  const antes = fake.dump();
  const r = await adicionarItemAoCatalogo('armas', 'pistola-9mm');
  assert.equal(r.sucesso, false);
  assert.match(r.motivo, /já existe/);
  assert.deepEqual(fake.dump(), antes);
});

test('duplicado ignora caixa e acento, inclusive contra itens padrão', async () => {
  criarBase();
  assert.equal((await adicionarItemAoCatalogo('medicamentos', 'GAZE')).sucesso, false);
  assert.equal((await adicionarItemAoCatalogo('medicamentos', 'gaze')).sucesso, false);
  assert.equal((await adicionarItemAoCatalogo('extras', 'AGULHA')).sucesso, false);
  assert.equal((await adicionarItemAoCatalogo('materiais', 'Alcool em gel')).sucesso, false);
  assert.equal((await adicionarItemAoCatalogo('armas', 'Desert Eagle')).sucesso, false);
});

test('mesmo nome em outra categoria é permitido', async () => {
  criarBase();
  assert.equal((await adicionarItemAoCatalogo('armas', 'Gaze')).sucesso, true);
});

test('categoria inexistente é recusada sem gravar', async () => {
  criarBase();
  const r = await adicionarItemAoCatalogo('nao_existe', 'Item');
  assert.equal(r.sucesso, false);
  assert.match(r.motivo, /Categoria/);
  assert.equal(fake.dump()['catalogo/items'], undefined);
  await assert.rejects(adicionarItemAoCatalogo('', 'Item'), ErroValidacao);
  await assert.rejects(adicionarItemAoCatalogo(undefined, 'Item'), ErroValidacao);
});

test('categoria cheia: o 26º item é recusado e o 25º é aceito', async () => {
  const items = Array.from({ length: 24 }, (_, i) => ({ id: `item_${i}`, nome: `Item ${i}` }));
  criarBase({ 'catalogo/items': { cat: { nome: 'Cat', emoji: 'x', items } } });
  const r25 = await adicionarItemAoCatalogo('cat', 'Item vinte e cinco');
  assert.equal(r25.sucesso, true);
  assert.equal(itensDe('cat').length, LIMITES.ITENS_POR_CATEGORIA_MAX);
  const antes = fake.dump();
  const r26 = await adicionarItemAoCatalogo('cat', 'Item vinte e seis');
  assert.equal(r26.sucesso, false);
  assert.match(r26.motivo, /25/);
  assert.deepEqual(fake.dump(), antes);
});

test('concorrência: dois cadastros simultâneos do mesmo nome gravam só um', async () => {
  criarBase();
  const rs = await Promise.all([
    adicionarItemAoCatalogo('armas', 'Fuzil Novo'),
    adicionarItemAoCatalogo('armas', 'fuzil-novo')
  ]);
  assert.deepEqual(rs.map((r) => r.sucesso).sort(), [false, true]);
  assert.equal(itensDe('armas').filter((i) => i.id === 'fuzil_novo').length, 1);
});

test('concorrência: nomes diferentes simultâneos são todos preservados', async () => {
  criarBase();
  const rs = await Promise.all(['A1', 'B2', 'C3', 'D4', 'E5'].map((n) => adicionarItemAoCatalogo('armas', n)));
  assert.ok(rs.every((r) => r.sucesso));
  const ids = itensDe('armas').map((i) => i.id);
  for (const id of ['a1', 'b2', 'c3', 'd4', 'e5']) assert.ok(ids.includes(id));
  assert.equal(ids.length, 4 + 5);
});

test('concorrência: 30 cadastros simultâneos numa categoria de 12 respeitam o teto de 25', async () => {
  criarBase();
  const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => adicionarItemAoCatalogo('materiais', `Novo ${i}`)));
  assert.equal(rs.filter((r) => r.sucesso).length, 13);
  assert.equal(itensDe('materiais').length, 25);
});

test('falha no commit não grava o item', async () => {
  criarBase();
  fake.falharProximoCommit(new Error('commit'));
  await assert.rejects(adicionarItemAoCatalogo('armas', 'Fuzil'), /commit/);
  assert.equal(fake.dump()['catalogo/items'], undefined);
});
