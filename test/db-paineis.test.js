const test = require('node:test');
const assert = require('node:assert/strict');
const { criarFakeFirestore } = require('./helpers/fake-firestore');
const { setDb, resetDb } = require('../utils/firebase');
const { resetConfig } = require('../utils/config');
const { usarConfigTeste } = require('./helpers/config-teste');
const { CHAVES_PAINEL, salvarMensagemPainel, obterMensagemPainel, getBau } = require('../utils/db');
const { embedInventario } = require('../utils/embeds');
const { ErroValidacao } = require('../utils/validacao');

const bauSeed = () => ({
  medicamentos__gaze: { nome: 'Gaze', categoria: 'Medicamentos', categoriaId: 'medicamentos', quantidade: 4 }
});

let fake;
function criarBase(seed = {}) {
  fake = criarFakeFirestore({ seed });
  setDb(fake);
}

test.beforeEach(() => usarConfigTeste());

test.afterEach(() => {
  resetDb();
  resetConfig();
});

test('CHAVES_PAINEL é congelado e tem as 3 chaves do contrato', () => {
  assert.ok(Object.isFrozen(CHAVES_PAINEL));
  assert.deepEqual(CHAVES_PAINEL, {
    INVENTARIO_MEMBROS: 'inventario_membros',
    INVENTARIO_GERENCIA: 'inventario_gerencia',
    SALDO_CAIXA: 'saldo_caixa'
  });
});

test('salvar e obter devolvem { canalId, mensagemId } e gravam em paineis/{chave}', async () => {
  criarBase();
  await salvarMensagemPainel(CHAVES_PAINEL.INVENTARIO_MEMBROS, 'c1', 'm1');
  assert.deepEqual(await obterMensagemPainel('inventario_membros'), { canalId: 'c1', mensagemId: 'm1' });
  const doc = fake.dump()['paineis/inventario_membros'];
  assert.equal(doc.canalId, 'c1');
  assert.equal(doc.mensagemId, 'm1');
  assert.equal(new Date(doc.atualizadoEm).toISOString(), doc.atualizadoEm);
});

test('sem mensagem registrada devolve null sem lançar', async () => {
  criarBase();
  for (const chave of Object.values(CHAVES_PAINEL)) assert.equal(await obterMensagemPainel(chave), null);
});

test('salvar de novo substitui o id anterior e as chaves são independentes', async () => {
  criarBase();
  await salvarMensagemPainel('saldo_caixa', 'c1', 'm1');
  await salvarMensagemPainel('inventario_gerencia', 'c2', 'm9');
  await salvarMensagemPainel('saldo_caixa', 'c1', 'm2');
  assert.deepEqual(await obterMensagemPainel('saldo_caixa'), { canalId: 'c1', mensagemId: 'm2' });
  assert.deepEqual(await obterMensagemPainel('inventario_gerencia'), { canalId: 'c2', mensagemId: 'm9' });
});

test('chave inválida ou ids vazios lançam ErroValidacao sem gravar', async () => {
  criarBase();
  for (const chave of ['xyz', '', undefined, 'membros', '../bau']) {
    await assert.rejects(salvarMensagemPainel(chave, 'c', 'm'), ErroValidacao);
    await assert.rejects(obterMensagemPainel(chave), ErroValidacao);
  }
  await assert.rejects(salvarMensagemPainel('saldo_caixa', '', 'm'), ErroValidacao);
  await assert.rejects(salvarMensagemPainel('saldo_caixa', 'c', undefined), ErroValidacao);
  assert.deepEqual(fake.dump(), {});
});

test('gravar o painel não altera bau/*, e getBau e embedInventario ignoram a coleção paineis', async () => {
  criarBase({ 'bau/membros': bauSeed(), 'bau/gerencia': {} });
  const antes = { membros: fake.dump()['bau/membros'], gerencia: fake.dump()['bau/gerencia'] };
  for (const chave of Object.values(CHAVES_PAINEL)) await salvarMensagemPainel(chave, 'c1', 'm1');
  const dump = fake.dump();
  assert.deepEqual(dump['bau/membros'], antes.membros);
  assert.deepEqual(dump['bau/gerencia'], antes.gerencia);
  assert.deepEqual(Object.keys(dump).filter((c) => c.startsWith('bau/')).sort(), ['bau/gerencia', 'bau/membros']);

  const bau = await getBau('membros');
  assert.deepEqual(Object.keys(bau), ['medicamentos__gaze']);
  assert.deepEqual(await getBau('gerencia'), {});
  const embed = await embedInventario(bau, 'membros');
  const json = JSON.stringify(embed.toJSON());
  assert.match(json, /Gaze/);
  assert.doesNotMatch(json, /mensagemId|canalId|undefined|m1/);
});
