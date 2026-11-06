'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima, idsDasLinhas } = require('./helpers/ambiente');
const handler = require('../interactions/gerencia-ajustar');
const { obterPendente, limparPendentes } = require('../utils/ajustes-pendentes');

const BAU = { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 3 } };
const CATALOGO_COM_DUPLO = {
  armas: { nome: 'Armas', emoji: '🔫', items: [{ id: 'colt', nome: 'Colt' }, { id: 'p50', nome: 'Pistola: .50' }, { id: 'kit', nome: 'Kit' }] },
  medicamentos: { nome: 'Medicamentos', emoji: '💊', items: [{ id: 'kit', nome: 'Kit' }] }
};

function modal(texto, { tipo = 'membros', registro } = {}) {
  return criarInteracao({ tipo: 'modal', customId: `ger_modal_ajustar:${tipo}`, campos: { inventario: texto }, registro });
}

function idPendente(interaction) {
  const [confirmar] = idsDasLinhas(ultima(interaction, 'editReply').payload.components)[0];
  return confirmar.split(':')[1];
}

test('gera resumo com Confirmar/Cancelar, não grava nada e guarda a pendência do usuário', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU } });
  t.after(() => { env.limpar(); limparPendentes(); });
  const antes = env.fake.dump();
  const i = modal('# Armas\nColt:0\nUSP:9\n# Medicamentos\nGaze:4');
  await handler.execute(i, criarClientFalso());

  assert.deepEqual(env.fake.dump(), antes);
  assert.deepEqual(metodos(i), ['deferReply', 'editReply']);
  assert.ok(ehEfemera(i.chamadas[0].payload));
  const p = ultima(i, 'editReply').payload;
  assert.deepEqual(idsDasLinhas(p.components)[0].map((id) => id.split(':')[0]), ['ger_ajuste_confirmar', 'ger_ajuste_cancelar']);
  const desc = p.embeds[0].toJSON().description;
  assert.match(desc, /\*\*Colt\*\* \(Armas\): `3` → `0` \(remove\)/);
  assert.match(desc, /\*\*USP\*\* \(Armas\): `0` → `9`/);
  const pendente = obterPendente(idPendente(i));
  assert.equal(pendente.usuarioId, 'u1');
  assert.equal(pendente.tipo, 'membros');
  assert.equal(pendente.mudancas.length, 3);
});

test('deferReply é a primeira chamada, antes de qualquer acesso ao banco', async (t) => {
  const registro = [];
  const env = montarAmbiente({ registro });
  t.after(() => { env.limpar(); limparPendentes(); });
  await handler.execute(modal('# Armas\nColt:1', { registro }), criarClientFalso());
  assert.equal(registro[0].metodo, 'deferReply');
  assert.ok(registro.slice(1).some((c) => c.origem === 'db'));
});

test('só entram na pendência as linhas que realmente mudam', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU } });
  t.after(() => { env.limpar(); limparPendentes(); });
  const i = modal('# Armas\nColt:3\nUSP:2');
  await handler.execute(i, criarClientFalso());
  assert.deepEqual(obterPendente(idPendente(i)).mudancas.map((m) => m.itemId), ['usp']);
});

test('quantidades iguais às atuais: avisa que não há alteração e não cria pendência', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU } });
  t.after(() => { env.limpar(); limparPendentes(); });
  const i = modal('# Armas\nColt:3');
  await handler.execute(i, criarClientFalso());
  const p = ultima(i, 'editReply').payload;
  assert.match(p.content, /Nenhuma alteração/);
  assert.equal(p.components, undefined);
});

test('nome com ":" é interpretado; mesmo nome em categorias diferentes cai em cada uma', async (t) => {
  const env = montarAmbiente({ seed: { 'catalogo/items': CATALOGO_COM_DUPLO } });
  t.after(() => { env.limpar(); limparPendentes(); });
  const i = modal('# Armas\nPistola: .50:3\nKit:1\n# Medicamentos\nKit:2');
  await handler.execute(i, criarClientFalso());
  const m = obterPendente(idPendente(i)).mudancas;
  assert.deepEqual(m.map((x) => [x.categoriaId, x.itemId, x.quantidade]), [['armas', 'p50', 3], ['armas', 'kit', 1], ['medicamentos', 'kit', 2]]);
});

test('linha malformada, quantidade inválida ou acima do limite: erro efêmero com a linha, nada pendente nem gravado', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU } });
  t.after(() => { env.limpar(); limparPendentes(); });
  const antes = env.fake.dump();
  const i = modal('# Armas\nColt:10abc\nUSP\nGaze:100001\nFantasma:1');
  await handler.execute(i, criarClientFalso());
  assert.deepEqual(env.fake.dump(), antes);
  const p = ultima(i, 'editReply').payload;
  assert.equal(p.components, undefined);
  const desc = p.embeds[0].toJSON().description;
  assert.match(desc, /Linha 2: .*\n`Colt:10abc`/);
  assert.match(desc, /Linha 3:/);
  assert.match(desc, /Linha 4:/);
  assert.match(desc, /Linha 5:/);
  assert.match(desc, /Nada foi alterado/);
});

test('mistura de linhas boas e ruins não deixa nada pendente', async (t) => {
  const env = montarAmbiente();
  t.after(() => { env.limpar(); limparPendentes(); });
  const i = modal('# Armas\nColt:1\nFantasma:1');
  await handler.execute(i, criarClientFalso());
  assert.equal(ultima(i, 'editReply').payload.components, undefined);
});

test('muitos erros: lista truncada, embed dentro do limite de 4096', async (t) => {
  const env = montarAmbiente();
  t.after(() => { env.limpar(); limparPendentes(); });
  const linhas = Array.from({ length: 150 }, (_, n) => `Item muito longo numero ${n} ${'x'.repeat(80)}:1`);
  const i = modal(linhas.join('\n'));
  await handler.execute(i, criarClientFalso());
  const desc = ultima(i, 'editReply').payload.embeds[0].toJSON().description;
  assert.ok(desc.length <= 4096);
  assert.match(desc, /e mais \d+ erro/);
});

test('falha do banco: erro genérico efêmero (followUp) sem vazar detalhes e nada gravado', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU } });
  t.after(() => { env.limpar(); limparPendentes(); });
  env.fake.falharEm('get', /bau\/membros/, new Error('segredo'));
  const i = modal('# Armas\nUSP:1');
  await assert.doesNotReject(handler.execute(i, criarClientFalso()));
  assert.deepEqual(metodos(i), ['deferReply', 'followUp']);
  assert.ok(ehEfemera(ultima(i, 'followUp').payload));
  assert.ok(!/segredo/.test(ultima(i, 'followUp').payload.content));
  assert.deepEqual(env.fake.dump()['bau/membros'], BAU);
});

test('o handler não faz escrita direta no banco', () => {
  const fonte = require('node:fs').readFileSync(require.resolve('../interactions/gerencia-ajustar'), 'utf8');
  assert.ok(!/getDb/.test(fonte));
});
