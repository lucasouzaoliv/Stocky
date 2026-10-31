const test = require('node:test');
const assert = require('node:assert/strict');
const { criarFakeFirestore } = require('./helpers/fake-firestore');
const { setDb, resetDb } = require('../utils/firebase');
const { adicionarAoBau, removerDoBau, getBau } = require('../utils/db');
const { ErroValidacao } = require('../utils/validacao');

const item = (quantidade, id = 'gaze', cat = 'medicamentos') => ({
  nome: id, categoria: cat, categoriaId: cat, quantidade
});

let fake;

function criarBase(seed = {}) {
  fake = criarFakeFirestore({ seed });
  setDb(fake);
}

test.afterEach(() => resetDb());

test('adicionarAoBau cria a chave e devolve a nova quantidade', async () => {
  criarBase();
  const qtd = await adicionarAoBau('membros', 'medicamentos', 'gaze', 5, 'Gaze', 'Medicamentos');
  assert.equal(qtd, 5);
  assert.deepEqual(fake.dump()['bau/membros'], {
    medicamentos__gaze: { nome: 'Gaze', categoria: 'Medicamentos', categoriaId: 'medicamentos', quantidade: 5 }
  });
});

test('sanidade: ler-alterar-gravar ingênuo perde atualização neste fake (o teste de concorrência é significativo)', async () => {
  criarBase({ 'bau/membros': { medicamentos__gaze: item(0) } });
  const ref = fake.collection('bau').doc('membros');
  const ingenuo = async (n) => {
    const dados = (await ref.get()).data();
    dados.medicamentos__gaze.quantidade += n;
    await ref.set(dados);
  };
  await Promise.all([ingenuo(5), ingenuo(7)]);
  assert.notEqual(fake.dump()['bau/membros'].medicamentos__gaze.quantidade, 12);
});

test('concorrência: +5 e +7 simultâneos no mesmo item resultam em 12', async () => {
  criarBase();
  const resultados = await Promise.all([
    adicionarAoBau('membros', 'medicamentos', 'gaze', 5, 'Gaze', 'Medicamentos'),
    adicionarAoBau('membros', 'medicamentos', 'gaze', 7, 'Gaze', 'Medicamentos')
  ]);
  assert.equal(fake.dump()['bau/membros'].medicamentos__gaze.quantidade, 12);
  assert.deepEqual([...resultados].sort((a, b) => a - b), [5, 12]);
});

test('concorrência: 50 adições simultâneas não perdem nenhuma', async () => {
  criarBase();
  await Promise.all(Array.from({ length: 50 }, () => (
    adicionarAoBau('membros', 'armas', 'colt', 2, 'Colt', 'Armas')
  )));
  assert.equal(fake.dump()['bau/membros'].armas__colt.quantidade, 100);
});

test('concorrência: remoções 6+6 com estoque 10 -> uma falha e o estoque fica em 4', async () => {
  criarBase({ 'bau/membros': { medicamentos__gaze: item(10) } });
  const resultados = await Promise.all([
    removerDoBau('membros', 'medicamentos', 'gaze', 6),
    removerDoBau('membros', 'medicamentos', 'gaze', 6)
  ]);
  assert.equal(resultados.filter((r) => r.sucesso).length, 1);
  const falha = resultados.find((r) => !r.sucesso);
  assert.match(falha.motivo, /Estoque insuficiente\. Disponível: \*\*4\*\*/);
  assert.equal(fake.dump()['bau/membros'].medicamentos__gaze.quantidade, 4);
});

test('concorrência: itens diferentes do mesmo baú em paralelo são todos preservados', async () => {
  criarBase({ 'bau/membros': { armas__colt: item(10, 'colt', 'armas') } });
  await Promise.all([
    adicionarAoBau('membros', 'medicamentos', 'gaze', 3, 'Gaze', 'Medicamentos'),
    adicionarAoBau('membros', 'drogas', 'lsd', 4, 'LSD', 'Drogas'),
    removerDoBau('membros', 'armas', 'colt', 4),
    adicionarAoBau('membros', 'medicamentos', 'gaze', 2, 'Gaze', 'Medicamentos')
  ]);
  const bau = fake.dump()['bau/membros'];
  assert.equal(bau.medicamentos__gaze.quantidade, 5);
  assert.equal(bau.drogas__lsd.quantidade, 4);
  assert.equal(bau.armas__colt.quantidade, 6);
});

test('concorrência: baús de tipos diferentes não interferem', async () => {
  criarBase();
  await Promise.all([
    adicionarAoBau('membros', 'armas', 'colt', 1, 'Colt', 'Armas'),
    adicionarAoBau('gerencia', 'armas', 'colt', 9, 'Colt', 'Armas')
  ]);
  assert.equal(fake.dump()['bau/membros'].armas__colt.quantidade, 1);
  assert.equal(fake.dump()['bau/gerencia'].armas__colt.quantidade, 9);
});

test('remover até zerar apaga a chave e devolve novaQtd 0', async () => {
  criarBase({ 'bau/membros': { medicamentos__gaze: item(3), armas__colt: item(1, 'colt', 'armas') } });
  const r = await removerDoBau('membros', 'medicamentos', 'gaze', 3);
  assert.deepEqual(r, { sucesso: true, novaQtd: 0 });
  const bau = fake.dump()['bau/membros'];
  assert.equal('medicamentos__gaze' in bau, false);
  assert.ok(bau.armas__colt);
});

test('remover parte do estoque devolve a quantidade restante', async () => {
  criarBase({ 'bau/membros': { medicamentos__gaze: item(10) } });
  assert.deepEqual(await removerDoBau('membros', 'medicamentos', 'gaze', 4), { sucesso: true, novaQtd: 6 });
});

test('estoque insuficiente e item inexistente não gravam nada', async () => {
  criarBase({ 'bau/membros': { medicamentos__gaze: item(2) } });
  const antes = fake.dump();
  const insuficiente = await removerDoBau('membros', 'medicamentos', 'gaze', 3);
  assert.equal(insuficiente.sucesso, false);
  assert.match(insuficiente.motivo, /Disponível: \*\*2\*\*/);
  const inexistente = await removerDoBau('membros', 'armas', 'colt', 1);
  assert.deepEqual(inexistente, { sucesso: false, motivo: 'Item não encontrado no baú.' });
  assert.deepEqual(fake.dump(), antes);
  assert.equal(fake.chamadas.some((c) => c.op === 'set'), false);
});

test('remover de baú inexistente devolve item não encontrado', async () => {
  criarBase();
  const r = await removerDoBau('gerencia', 'armas', 'colt', 1);
  assert.equal(r.sucesso, false);
  assert.deepEqual(fake.dump(), {});
});

test('quantidade inválida lança ErroValidacao e não grava nada', async () => {
  criarBase({ 'bau/membros': { medicamentos__gaze: item(10) } });
  const antes = fake.dump();
  for (const invalida of [0, -1, 1.5, '5', NaN, Infinity, null, undefined, 100001]) {
    await assert.rejects(adicionarAoBau('membros', 'medicamentos', 'gaze', invalida, 'Gaze', 'Medicamentos'), ErroValidacao);
    await assert.rejects(removerDoBau('membros', 'medicamentos', 'gaze', invalida), ErroValidacao);
  }
  assert.deepEqual(fake.dump(), antes);
  assert.equal(fake.chamadas.length, 0);
});

test('o limite exato de quantidade é aceito', async () => {
  criarBase();
  assert.equal(await adicionarAoBau('membros', 'armas', 'colt', 100000, 'Colt', 'Armas'), 100000);
});

test('tipo de baú inválido lança ErroValidacao sem tocar o banco', async () => {
  criarBase();
  for (const tipo of ['xyz', undefined, null, '', 'MEMBROS', '__proto__']) {
    await assert.rejects(adicionarAoBau(tipo, 'armas', 'colt', 1, 'Colt', 'Armas'), ErroValidacao);
    await assert.rejects(removerDoBau(tipo, 'armas', 'colt', 1), ErroValidacao);
    await assert.rejects(getBau(tipo), ErroValidacao);
  }
  assert.equal(fake.chamadas.length, 0);
});

test('ids vazios ou novo item sem nomes lançam ErroValidacao e não gravam', async () => {
  criarBase();
  await assert.rejects(adicionarAoBau('membros', '', 'colt', 1, 'Colt', 'Armas'), ErroValidacao);
  await assert.rejects(adicionarAoBau('membros', 'armas', '', 1, 'Colt', 'Armas'), ErroValidacao);
  await assert.rejects(adicionarAoBau('membros', 'armas', 'colt', 1, undefined, 'Armas'), ErroValidacao);
  await assert.rejects(adicionarAoBau('membros', 'armas', 'colt', 1, 'Colt', undefined), ErroValidacao);
  assert.deepEqual(fake.dump(), {});
});

test('toda escrita em bau/* acontece dentro de runTransaction', async () => {
  criarBase({ 'bau/membros': { medicamentos__gaze: item(10) } });
  await Promise.all([
    adicionarAoBau('membros', 'medicamentos', 'gaze', 5, 'Gaze', 'Medicamentos'),
    removerDoBau('membros', 'medicamentos', 'gaze', 3),
    adicionarAoBau('gerencia', 'armas', 'colt', 1, 'Colt', 'Armas')
  ]);
  const escritas = fake.chamadas.filter((c) => c.caminho.startsWith('bau/') && c.op !== 'get');
  assert.ok(escritas.length >= 3);
  assert.ok(escritas.every((c) => c.emTransacao));
  assert.ok(fake.chamadas.filter((c) => c.op === 'get').every((c) => c.emTransacao));
});

test('falha no commit não altera o estoque e propaga o erro original', async () => {
  criarBase({ 'bau/membros': { medicamentos__gaze: item(10) } });
  const erro = new Error('UNAVAILABLE');
  fake.falharProximoCommit(erro);
  await assert.rejects(adicionarAoBau('membros', 'medicamentos', 'gaze', 5, 'Gaze', 'Medicamentos'), erro);
  assert.equal(fake.dump()['bau/membros'].medicamentos__gaze.quantidade, 10);
  assert.equal(await adicionarAoBau('membros', 'medicamentos', 'gaze', 1, 'Gaze', 'Medicamentos'), 11);
});

test('estoque acima de MAX_SAFE_INTEGER é recusado sem gravar', async () => {
  criarBase({ 'bau/membros': { armas__colt: item(Number.MAX_SAFE_INTEGER, 'colt', 'armas') } });
  await assert.rejects(adicionarAoBau('membros', 'armas', 'colt', 1, 'Colt', 'Armas'), ErroValidacao);
  assert.equal(fake.dump()['bau/membros'].armas__colt.quantidade, Number.MAX_SAFE_INTEGER);
});
