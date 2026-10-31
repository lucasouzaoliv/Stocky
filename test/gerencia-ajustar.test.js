'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao, criarCanalFalso, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima } = require('./helpers/ambiente');
const handler = require('../interactions/gerencia-ajustar');

const BAU = { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 3 } };

function modal(texto, tipo = 'membros') {
  return criarInteracao({ tipo: 'modal', customId: `ger_modal_ajustar:${tipo}`, campos: { inventario: texto } });
}

test('aplica quantidades, remove com 0, atualiza o painel de inventário e responde efêmero', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU } });
  t.after(env.limpar);
  const inv = criarCanalFalso({ id: env.config.channels.inventarioMembros });
  const client = criarClientFalso({ canais: [inv] });
  const i = modal('# Armas\nColt:0\nUSP:9\nGaze:4');
  await handler.execute(i, client);

  const bau = env.fake.dump()['bau/membros'];
  assert.equal(bau.armas__colt, undefined);
  assert.equal(bau.armas__usp.quantidade, 9);
  assert.equal(bau.medicamentos__gaze.quantidade, 4);
  assert.equal(inv.send.mock.callCount(), 1);
  const r = ultima(i, 'reply').payload;
  assert.ok(ehEfemera(r));
  assert.match(r.embeds[0].toJSON().description, /\*\*3\*\* item\(s\)/);
});

test('linhas inválidas e itens desconhecidos viram erros no resumo', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU } });
  t.after(env.limpar);
  const client = criarClientFalso();
  const i = modal('Colt:abc\nFantasma:2\nUSP:1');
  await handler.execute(i, client);
  const desc = ultima(i, 'reply').payload.embeds[0].toJSON().description;
  assert.match(desc, /Quantidade inválida/);
  assert.match(desc, /Item não encontrado: \*\*Fantasma\*\*/);
  assert.match(desc, /\*\*1\*\* item\(s\)/);
});

test('falha do banco: erro genérico efêmero e baú intacto', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU } });
  t.after(env.limpar);
  env.fake.falharEm('set', /bau\/membros/, new Error('segredo'));
  const i = modal('USP:1');
  await assert.doesNotReject(handler.execute(i, criarClientFalso()));
  assert.deepEqual(metodos(i), ['reply']);
  assert.ok(!/segredo/.test(ultima(i, 'reply').payload.content));
  assert.deepEqual(env.fake.dump()['bau/membros'], BAU);
});
