'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao, criarCanalFalso, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima, idsDasLinhas } = require('./helpers/ambiente');
const handler = require('../interactions/gerencia-selects');

const PAINEL = [
  ['ger_adicionar_item', 'ger_remover_item', 'ger_zerar_bau', 'ger_ver_logs'],
  ['ger_ajustar_membros', 'ger_ajustar_gerencia']
];
const BAU_COLT = { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 3 } };

function selecao(customId, valor, registro) {
  return criarInteracao({ tipo: 'select', customId, values: [valor], registro });
}

test('ger_cat_adicionar abre o modal como primeira resposta', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const i = selecao('ger_cat_adicionar', 'armas');
  await handler.execute(i, criarClientFalso());
  assert.deepEqual(metodos(i), ['showModal']);
  assert.equal(ultima(i, 'showModal').payload.toJSON().custom_id, 'ger_modal_adicionar:armas');
});

test('ger_cat_remover lista os itens da categoria; categoria sem itens volta ao painel completo', async (t) => {
  const env = montarAmbiente({ seed: { 'catalogo/items': { vazia: { nome: 'Vazia', emoji: '📦', items: [] }, armas: { nome: 'Armas', emoji: '🔫', items: [{ id: 'colt', nome: 'Colt' }] } } } });
  t.after(env.limpar);
  const a = selecao('ger_cat_remover', 'armas');
  await handler.execute(a, criarClientFalso());
  assert.deepEqual(idsDasLinhas(ultima(a, 'editReply').payload.components), [['ger_item_remover:armas']]);
  const b = selecao('ger_cat_remover', 'vazia');
  await handler.execute(b, criarClientFalso());
  assert.deepEqual(idsDasLinhas(ultima(b, 'editReply').payload.components), PAINEL);
});

test('remover item: tira do catálogo e dos dois baús e o painel volta com duas linhas', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU_COLT, 'bau/gerencia': BAU_COLT } });
  t.after(env.limpar);
  const i = selecao('ger_item_remover:armas', 'colt');
  await handler.execute(i, criarClientFalso());
  const dump = env.fake.dump();
  assert.ok(!dump['catalogo/items'].armas.items.some((x) => x.id === 'colt'));
  assert.deepEqual(dump['bau/membros'], {});
  assert.deepEqual(dump['bau/gerencia'], {});
  const p = ultima(i, 'editReply').payload;
  assert.match(p.embeds[0].toJSON().title, /Item removido/);
  assert.deepEqual(idsDasLinhas(p.components), PAINEL);
});

test('remover item inexistente: erro no painel completo, sem escrita nos baús', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU_COLT } });
  t.after(env.limpar);
  const i = selecao('ger_item_remover:armas', 'fantasma');
  await handler.execute(i, criarClientFalso());
  assert.match(ultima(i, 'editReply').payload.embeds[0].toJSON().title, /Erro/);
  assert.deepEqual(env.fake.dump()['bau/membros'], BAU_COLT);
});

test('zerar baú (um e ambos): esvazia, atualiza inventário e painel volta com duas linhas', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU_COLT, 'bau/gerencia': BAU_COLT } });
  t.after(env.limpar);
  const inv = criarCanalFalso({ id: env.config.channels.inventarioMembros });
  const client = criarClientFalso({ canais: [inv] });
  const um = selecao('ger_zerar_confirmar', 'membros');
  await handler.execute(um, client);
  assert.deepEqual(env.fake.dump()['bau/membros'], {});
  assert.deepEqual(env.fake.dump()['bau/gerencia'], BAU_COLT);
  assert.deepEqual(idsDasLinhas(ultima(um, 'editReply').payload.components), PAINEL);
  assert.equal(inv.send.mock.callCount(), 1);

  const ambos = selecao('ger_zerar_confirmar', 'ambos');
  await handler.execute(ambos, client);
  assert.deepEqual(env.fake.dump()['bau/gerencia'], {});
  assert.deepEqual(idsDasLinhas(ultima(ambos, 'editReply').payload.components), PAINEL);
});

test('ver logs: lista movimentações; sem logs mostra aviso; ambos com painel completo', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const vazio = selecao('ger_logs_tipo', 'membros');
  await handler.execute(vazio, criarClientFalso());
  assert.match(ultima(vazio, 'editReply').payload.embeds[0].toJSON().title, /Sem logs/);
  assert.deepEqual(idsDasLinhas(ultima(vazio, 'editReply').payload.components), PAINEL);

  await env.fake.collection('logs').doc('membros').collection('entradas').add({
    acao: 'adicionar', usuarioId: 'u9', item: { id: 'colt', nome: 'Colt' }, quantidade: 5, timestamp: '2026-10-01T10:00:00.000Z'
  });
  const cheio = selecao('ger_logs_tipo', 'membros');
  await handler.execute(cheio, criarClientFalso());
  const json = ultima(cheio, 'editReply').payload.embeds[0].toJSON();
  assert.match(json.title, /Bau dos Membros/);
  assert.match(json.description, /\*\*Colt\*\* x5/);
  assert.deepEqual(idsDasLinhas(ultima(cheio, 'editReply').payload.components), PAINEL);
});

test('deferUpdate antes de qualquer acesso ao banco', async (t) => {
  const registro = [];
  const env = montarAmbiente({ registro });
  t.after(env.limpar);
  const i = selecao('ger_logs_tipo', 'gerencia', registro);
  await handler.execute(i, criarClientFalso());
  assert.equal(registro[0].metodo, 'deferUpdate');
});

test('falha do banco: painel restaurado e aviso efêmero, sem lançar', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  env.fake.falharEm('get', /logs\/membros\/entradas/, new Error('segredo'));
  const i = selecao('ger_logs_tipo', 'membros');
  await assert.doesNotReject(handler.execute(i, criarClientFalso()));
  assert.deepEqual(metodos(i), ['deferUpdate', 'editReply', 'followUp']);
  assert.deepEqual(idsDasLinhas(ultima(i, 'editReply').payload.components), PAINEL);
  const aviso = ultima(i, 'followUp').payload;
  assert.ok(ehEfemera(aviso));
  assert.ok(!/segredo/.test(aviso.content));
});

// ---- STK-014 / STK-016f / STK-020 ----

const fs = require('node:fs');
const path = require('node:path');

const USUARIO = { id: 'g7', tag: 'gerente#0007' };

function auditorias(env) {
  return Object.entries(env.fake.dump()).filter(([c]) => c.startsWith('auditoria/')).map(([, d]) => d);
}

test('remover item registra auditoria com o usuário e informa de quais baús saiu', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU_COLT } });
  t.after(env.limpar);
  const i = criarInteracao({ tipo: 'select', customId: 'ger_item_remover:armas', values: ['colt'], usuario: USUARIO });
  await handler.execute(i, criarClientFalso());
  const aud = auditorias(env);
  assert.equal(aud.length, 1);
  assert.equal(aud[0].acao, 'catalogo.remover_item');
  assert.equal(aud[0].usuarioId, 'g7');
  assert.deepEqual(metodos(i), ['deferUpdate', 'editReply']);
  assert.match(ultima(i, 'editReply').payload.embeds[0].toJSON().title, /Item removido/);
});

test('zerar baú registra auditoria com o usuário; "ambos" gera um único registro', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU_COLT, 'bau/gerencia': BAU_COLT } });
  t.after(env.limpar);
  const i = criarInteracao({ tipo: 'select', customId: 'ger_zerar_confirmar', values: ['ambos'], usuario: USUARIO });
  await handler.execute(i, criarClientFalso());
  const aud = auditorias(env);
  assert.equal(aud.length, 1);
  assert.equal(aud[0].acao, 'bau.zerar');
  assert.equal(aud[0].usuarioId, 'g7');
  assert.deepEqual(aud[0].alvo.tipos, ['membros', 'gerencia']);
  assert.match(ultima(i, 'editReply').payload.embeds[0].toJSON().title, /zerado/);
});

test('o handler não importa getDb nem escreve direto no banco (varredura)', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'interactions', 'gerencia-selects.js'), 'utf8');
  assert.ok(!/getDb|firebase/.test(fonte));
  assert.ok(!/\.collection\(|\.set\(|\.update\(/.test(fonte));
});

test('zerar com valor forjado: erro amigável, nada gravado', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU_COLT } });
  t.after(env.limpar);
  const i = selecao('ger_zerar_confirmar', 'xyz');
  await handler.execute(i, criarClientFalso());
  assert.deepEqual(env.fake.dump()['bau/membros'], BAU_COLT);
  assert.match(ultima(i, 'editReply').payload.embeds[0].toJSON().title, /Erro/);
});

test('falha do Firestore ao remover/zerar: erro amigável, painel restaurado, nada gravado', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU_COLT } });
  t.after(env.limpar);
  for (const [id, valor] of [['ger_item_remover:armas', 'colt'], ['ger_zerar_confirmar', 'membros']]) {
    env.fake.falharProximoCommit(new Error('segredo'));
    const i = selecao(id, valor);
    await assert.doesNotReject(handler.execute(i, criarClientFalso()));
    assert.deepEqual(metodos(i), ['deferUpdate', 'editReply', 'followUp']);
    assert.ok(ehEfemera(ultima(i, 'followUp').payload));
    assert.ok(!/segredo/.test(ultima(i, 'followUp').payload.content));
    assert.deepEqual(idsDasLinhas(ultima(i, 'editReply').payload.components), PAINEL);
  }
  assert.deepEqual(env.fake.dump()['bau/membros'], BAU_COLT);
  assert.equal(auditorias(env).length, 0);
});

test('zerar: painel salvo que sumiu é recriado e o id novo é guardado', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU_COLT, 'paineis/inventario_membros': { canalId: 'c-inv-membros', mensagemId: 'sumiu' } } });
  t.after(env.limpar);
  const inv = criarCanalFalso({ id: env.config.channels.inventarioMembros });
  const i = selecao('ger_zerar_confirmar', 'membros');
  await handler.execute(i, criarClientFalso({ canais: [inv] }));
  assert.equal(inv.send.mock.callCount(), 1);
  assert.equal(env.fake.dump()['paineis/inventario_membros'].mensagemId, inv.mensagens[0].id);
});

test('falha ao atualizar o painel não esconde o sucesso de zerar', async (t) => {
  const env = montarAmbiente({ seed: { 'bau/membros': BAU_COLT } });
  t.after(env.limpar);
  const inv = criarCanalFalso({ id: env.config.channels.inventarioMembros });
  inv.send.mock.mockImplementation(() => Promise.reject(new Error('sem permissão')));
  const i = selecao('ger_zerar_confirmar', 'membros');
  await assert.doesNotReject(handler.execute(i, criarClientFalso({ canais: [inv] })));
  assert.deepEqual(env.fake.dump()['bau/membros'], {});
  assert.deepEqual(metodos(i), ['deferUpdate', 'editReply']);
  assert.match(ultima(i, 'editReply').payload.embeds[0].toJSON().title, /zerado/);
});

test('modal de cadastro tem campo de nome com maxLength 50', async () => {
  const i = selecao('ger_cat_adicionar', 'armas');
  await handler.execute(i, criarClientFalso());
  const campo = ultima(i, 'showModal').payload.toJSON().components[0].components[0];
  assert.equal(campo.max_length, 50);
});
