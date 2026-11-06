const test = require('node:test');
const assert = require('node:assert/strict');
const { criarFakeFirestore } = require('./helpers/fake-firestore');
const { setDb, resetDb } = require('../utils/firebase');
const { getSaldo, adicionarCaixa, retirarCaixa } = require('../utils/caixa');
const { ErroValidacao } = require('../utils/validacao');

let fake;

function criarBase(saldo) {
  fake = criarFakeFirestore({ seed: saldo ? { 'caixa/saldo': saldo } : {} });
  setDb(fake);
}

test.afterEach(() => resetDb());

test('getSaldo: documento inexistente e campo ausente viram 0', async () => {
  criarBase();
  assert.deepEqual(await getSaldo(), { sujo: 0, limpo: 0 });
  criarBase({ sujo: 40 });
  assert.deepEqual(await getSaldo(), { sujo: 40, limpo: 0 });
});

for (const tipo of ['sujo', 'limpo']) {
  test(`concorrência (${tipo}): dois adicionarCaixa somam os dois valores`, async () => {
    criarBase({ sujo: 100, limpo: 200 });
    await Promise.all([adicionarCaixa(tipo, 500), adicionarCaixa(tipo, 700)]);
    const base = { sujo: 100, limpo: 200 };
    assert.equal(fake.dump()['caixa/saldo'][tipo], base[tipo] + 1200);
  });

  test(`concorrência (${tipo}): retiradas 600+600 com saldo 1000 -> uma falha, saldo 400`, async () => {
    criarBase({ sujo: 1000, limpo: 1000 });
    const resultados = await Promise.all([retirarCaixa(tipo, 600), retirarCaixa(tipo, 600)]);
    assert.equal(resultados.filter((r) => r.sucesso).length, 1);
    assert.match(resultados.find((r) => !r.sucesso).motivo, /Saldo insuficiente\. Disponível: \*\*\$400\*\*/);
    assert.equal(fake.dump()['caixa/saldo'][tipo], 400);
  });
}

test('concorrência: 40 operações mistas em sujo e limpo preservam as duas contas', async () => {
  criarBase({ sujo: 0, limpo: 0 });
  await Promise.all(Array.from({ length: 20 }, (_, i) => [
    adicionarCaixa('sujo', 10),
    adicionarCaixa('limpo', i + 1)
  ]).flat());
  assert.deepEqual(fake.dump()['caixa/saldo'], { sujo: 200, limpo: 210 });
});

test('adicionarCaixa devolve o saldo { sujo, limpo } e cria o documento inexistente', async () => {
  criarBase();
  assert.deepEqual(await adicionarCaixa('limpo', 50), { sujo: 0, limpo: 50 });
  assert.deepEqual(fake.dump()['caixa/saldo'], { sujo: 0, limpo: 50 });
});

test('retirarCaixa devolve { sucesso, saldo } e a retirada exata do saldo deixa 0', async () => {
  criarBase({ sujo: 300, limpo: 5 });
  assert.deepEqual(await retirarCaixa('sujo', 300), { sucesso: true, saldo: { sujo: 0, limpo: 5 } });
  assert.deepEqual(fake.dump()['caixa/saldo'], { sujo: 0, limpo: 5 });
});

test('retirarCaixa com saldo insuficiente ou documento inexistente não grava', async () => {
  criarBase({ sujo: 10, limpo: 0 });
  const r = await retirarCaixa('sujo', 11);
  assert.equal(r.sucesso, false);
  criarBase();
  assert.equal((await retirarCaixa('limpo', 1)).sucesso, false);
  assert.deepEqual(fake.dump(), {});
  assert.equal(fake.chamadas.some((c) => c.op === 'set'), false);
});

test('valor inválido lança ErroValidacao e não grava', async () => {
  criarBase({ sujo: 10, limpo: 10 });
  const antes = fake.dump();
  for (const valor of [NaN, 0, -1, 1.5, '5', null, undefined, Infinity, 1000000001]) {
    await assert.rejects(adicionarCaixa('sujo', valor), ErroValidacao);
    await assert.rejects(retirarCaixa('sujo', valor), ErroValidacao);
  }
  assert.deepEqual(fake.dump(), antes);
  assert.equal(fake.chamadas.length, 0);
});

test('o limite exato VALOR_CAIXA_MAX é aceito', async () => {
  criarBase();
  assert.deepEqual(await adicionarCaixa('sujo', 1000000000), { sujo: 1000000000, limpo: 0 });
});

test('tipo de caixa inválido lança ErroValidacao sem tocar o banco', async () => {
  criarBase({ sujo: 10, limpo: 10 });
  for (const tipo of ['xyz', undefined, null, '', 'SUJO', '__proto__']) {
    await assert.rejects(adicionarCaixa(tipo, 10), ErroValidacao);
    await assert.rejects(retirarCaixa(tipo, 10), ErroValidacao);
  }
  assert.equal(fake.chamadas.length, 0);
});

test('toda leitura e escrita em caixa/saldo das operações acontece dentro de runTransaction', async () => {
  criarBase({ sujo: 100, limpo: 100 });
  await Promise.all([adicionarCaixa('sujo', 5), retirarCaixa('limpo', 5), retirarCaixa('sujo', 99999)]);
  const chamadas = fake.chamadas.filter((c) => c.caminho === 'caixa/saldo');
  assert.ok(chamadas.some((c) => c.op === 'set'));
  assert.ok(chamadas.every((c) => c.emTransacao));
});

test('falha no commit não altera o saldo e propaga o erro original', async () => {
  criarBase({ sujo: 100, limpo: 0 });
  const erro = new Error('UNAVAILABLE');
  fake.falharProximoCommit(erro);
  await assert.rejects(adicionarCaixa('sujo', 50), erro);
  assert.deepEqual(fake.dump()['caixa/saldo'], { sujo: 100, limpo: 0 });
});

test('saldo acima de MAX_SAFE_INTEGER é recusado sem gravar', async () => {
  criarBase({ sujo: Number.MAX_SAFE_INTEGER, limpo: 0 });
  await assert.rejects(adicionarCaixa('sujo', 1), ErroValidacao);
  assert.equal(fake.dump()['caixa/saldo'].sujo, Number.MAX_SAFE_INTEGER);
});
