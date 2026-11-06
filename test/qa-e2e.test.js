'use strict';

// QA: fluxos de ponta a ponta pelo roteador REAL (carregarHandlers com as pastas reais),
// Firestore falso e interações falsas estritas. Cada passo usa o custom id que o passo
// anterior realmente gerou, como o Discord faria.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { criarInteracao, criarCanalFalso, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima } = require('./helpers/ambiente');
const { carregarHandlers, rotearInteracao } = require('../utils/roteador');
const { limparPendentes } = require('../utils/ajustes-pendentes');

const registro = carregarHandlers({
  commandsDir: path.join(__dirname, '..', 'commands'),
  interactionsDir: path.join(__dirname, '..', 'interactions')
});

const MEMBRO = ['r-membro'];
const GERENTE = ['r-gerente'];

function preparar(t, seed = {}) {
  const env = montarAmbiente({ seed });
  t.after(() => { env.limpar(); limparPendentes(); });
  const c = env.config.channels;
  const canais = Object.fromEntries(
    ['logMembros', 'logGerencia', 'inventarioMembros', 'inventarioGerencia', 'logCaixa', 'saldoCaixa', 'caixaGangue', 'bauMembros', 'painelGerencia']
      .map((k) => [k, criarCanalFalso({ id: c[k] })])
  );
  const client = criarClientFalso({ canais: Object.values(canais) });
  return { env, canais, client };
}

async function rotear(client, opts) {
  const i = criarInteracao({ client, ...opts });
  const resultado = await rotearInteracao(i, registro, client);
  return { i, resultado };
}

function componentes(payload) {
  return (payload.components || []).map((row) => (typeof row.toJSON === 'function' ? row.toJSON() : row).components).flat();
}

function customIdsDe(payload) {
  return componentes(payload).map((c) => c.custom_id);
}

test('E2E baú: adicionar -> categoria -> item -> modal -> quantidade -> ver estoque', async (t) => {
  const { env, canais, client } = preparar(t);

  // 1. botão Adicionar no painel fixo
  const passo1 = await rotear(client, { tipo: 'button', customId: 'bau_adicionar:membros', cargos: MEMBRO });
  assert.equal(passo1.resultado, 'executado');
  assert.equal(metodos(passo1.i)[0], 'deferUpdate');
  const idSelectCategoria = customIdsDe(ultima(passo1.i, 'editReply').payload)[0];
  assert.equal(idSelectCategoria, 'bau_categoria:adicionar:membros');

  // 2. escolhe a categoria
  const passo2 = await rotear(client, { tipo: 'select', customId: idSelectCategoria, values: ['armas'], cargos: MEMBRO });
  assert.equal(passo2.resultado, 'executado');
  const idSelectItem = customIdsDe(ultima(passo2.i, 'editReply').payload)[0];
  assert.equal(idSelectItem, 'bau_item:adicionar:membros:armas');

  // 3. escolhe o item: showModal é a primeira resposta
  const passo3 = await rotear(client, { tipo: 'select', customId: idSelectItem, values: ['colt'], cargos: MEMBRO });
  assert.deepEqual(metodos(passo3.i), ['showModal']);
  const modal = passo3.i.chamadas[0].payload.toJSON();
  assert.equal(modal.custom_id, 'bau_quantidade:adicionar:membros:armas:colt');

  // 4. envia o modal
  const passo4 = await rotear(client, { tipo: 'modal', customId: modal.custom_id, campos: { quantidade: '7' }, cargos: MEMBRO });
  assert.equal(passo4.resultado, 'executado');
  assert.ok(ehEfemera(ultima(passo4.i, 'reply').payload));
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 7);
  assert.equal(canais.logMembros.send.mock.callCount(), 1);
  assert.equal(canais.inventarioMembros.send.mock.callCount(), 1, 'painel de inventário criado');
  assert.ok(env.fake.dump()['paineis/inventario_membros'], 'id do painel guardado');

  // 5. outro membro adiciona de novo: painel é editado pelo id guardado, sem nova mensagem
  const passo5 = await rotear(client, { tipo: 'modal', customId: modal.custom_id, campos: { quantidade: '3' }, cargos: MEMBRO, usuario: { id: 'u2', tag: 'b#2' } });
  assert.equal(passo5.resultado, 'executado');
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 10);
  assert.equal(canais.inventarioMembros.send.mock.callCount(), 1);
  assert.equal(canais.inventarioMembros.mensagens[0].edit.mock.callCount(), 1);

  // 6. ver estoque mostra o valor gravado
  const passo6 = await rotear(client, { tipo: 'button', customId: 'bau_estoque:membros', cargos: MEMBRO });
  const embed = ultima(passo6.i, 'editReply').payload.embeds[0].toJSON();
  assert.match(embed.fields[0].value, /Colt\*\* — `10`/);
});

test('E2E baú: remover até zerar apaga a chave; remover acima do estoque é recusado', async (t) => {
  const { env, client } = preparar(t, { 'bau/membros': { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 5 } } });
  const id = 'bau_quantidade:remover:membros:armas:colt';
  const demais = await rotear(client, { tipo: 'modal', customId: id, campos: { quantidade: '6' }, cargos: MEMBRO });
  assert.match(ultima(demais.i, 'reply').payload.embeds[0].toJSON().description, /Disponível: \*\*5\*\*/);
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 5);
  const tudo = await rotear(client, { tipo: 'modal', customId: id, campos: { quantidade: '5' }, cargos: MEMBRO });
  assert.equal(tudo.resultado, 'executado');
  assert.equal(env.fake.dump()['bau/membros'].armas__colt, undefined);
});

test('E2E concorrência: dois membros removem 6 e 6 de um estoque 10 pelo roteador -> um recusado, estoque 4', async (t) => {
  const { env, client } = preparar(t, { 'bau/membros': { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 10 } } });
  const id = 'bau_quantidade:remover:membros:armas:colt';
  const [a, b] = await Promise.all([
    rotear(client, { tipo: 'modal', customId: id, campos: { quantidade: '6' }, cargos: MEMBRO, usuario: { id: 'u1', tag: 'a#1' } }),
    rotear(client, { tipo: 'modal', customId: id, campos: { quantidade: '6' }, cargos: MEMBRO, usuario: { id: 'u2', tag: 'b#2' } })
  ]);
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 4);
  const titulos = [a, b].map((r) => ultima(r.i, 'reply').payload.embeds[0].toJSON().title);
  assert.equal(titulos.filter((x) => /removido/.test(x)).length, 1);
  assert.equal(titulos.filter((x) => /insuficiente/i.test(x)).length, 1);
  const logs = Object.keys(env.fake.dump()).filter((k) => k.startsWith('logs/membros/entradas/'));
  assert.equal(logs.length, 1, 'só a remoção bem-sucedida gera log');
});

test('E2E concorrência: adicionar e remover simultâneos no baú da gerência não perdem atualização', async (t) => {
  const { env, client } = preparar(t, { 'bau/gerencia': { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 10 } } });
  await Promise.all([
    rotear(client, { tipo: 'modal', customId: 'bau_quantidade:adicionar:gerencia:armas:colt', campos: { quantidade: '5' }, cargos: GERENTE }),
    rotear(client, { tipo: 'modal', customId: 'bau_quantidade:remover:gerencia:armas:colt', campos: { quantidade: '3' }, cargos: GERENTE }),
    rotear(client, { tipo: 'modal', customId: 'bau_quantidade:adicionar:gerencia:armas:usp', campos: { quantidade: '2' }, cargos: GERENTE })
  ]);
  const bau = env.fake.dump()['bau/gerencia'];
  assert.equal(bau.armas__colt.quantidade, 12);
  assert.equal(bau.armas__usp.quantidade, 2);
});

test('E2E caixa: abrir modal, adicionar, retirar acima do saldo, retirar, ver histórico', async (t) => {
  const { env, canais, client } = preparar(t);
  const abrir = await rotear(client, { tipo: 'button', customId: 'caixa_adicionar', cargos: GERENTE });
  assert.deepEqual(metodos(abrir.i), ['showModal']);
  const idModal = abrir.i.chamadas[0].payload.toJSON().custom_id;
  assert.equal(idModal, 'caixa_modal:adicionar');

  const add = await rotear(client, { tipo: 'modal', customId: idModal, campos: { tipo: 'Sujo ', valor: '1500', anotacao: 'venda 🔫' }, cargos: GERENTE });
  assert.equal(add.resultado, 'executado');
  assert.deepEqual(env.fake.dump()['caixa/saldo'], { sujo: 1500, limpo: 0 });

  const muito = await rotear(client, { tipo: 'modal', customId: 'caixa_modal:retirar', campos: { tipo: 'sujo', valor: '1501', anotacao: 'x' }, cargos: GERENTE });
  assert.match(ultima(muito.i, 'reply').payload.content, /Saldo insuficiente/);
  assert.deepEqual(env.fake.dump()['caixa/saldo'], { sujo: 1500, limpo: 0 });

  const ret = await rotear(client, { tipo: 'modal', customId: 'caixa_modal:retirar', campos: { tipo: 'sujo', valor: '500', anotacao: 'compra' }, cargos: GERENTE });
  assert.equal(ret.resultado, 'executado');
  assert.deepEqual(env.fake.dump()['caixa/saldo'], { sujo: 1000, limpo: 0 });
  assert.equal(canais.logCaixa.send.mock.callCount(), 2);
  assert.equal(canais.saldoCaixa.send.mock.callCount(), 1, 'painel de saldo criado uma vez e depois editado');
  assert.ok(env.fake.dump()['paineis/saldo_caixa']);

  const hist = await rotear(client, { tipo: 'button', customId: 'caixa_logs', cargos: GERENTE });
  const desc = ultima(hist.i, 'editReply').payload.embeds[0].toJSON().description;
  assert.equal(desc.split('\n').length, 2);
  assert.match(desc, /\$1\.500/);
  assert.match(desc, /venda 🔫/);
});

test('E2E ajuste em massa confirmado: texto -> modal -> resumo -> confirmar (uma vez) -> auditoria', async (t) => {
  const { env, canais, client } = preparar(t, { 'bau/membros': { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 3 } } });

  const abrir = await rotear(client, { tipo: 'button', customId: 'ger_ajustar_membros', cargos: GERENTE });
  assert.equal(metodos(abrir.i)[0], 'deferReply');
  const msg = ultima(abrir.i, 'editReply').payload;
  const texto = msg.content.match(/```\n([\s\S]*?)\n```/)[1];
  assert.equal(texto, '# Armas\nColt:3');
  const idBotao = customIdsDe(msg)[0];

  const botao = await rotear(client, { tipo: 'button', customId: idBotao, cargos: GERENTE });
  assert.deepEqual(metodos(botao.i), ['showModal']);
  const idModal = botao.i.chamadas[0].payload.toJSON().custom_id;

  const editado = `${texto.replace('Colt:3', 'Colt:0')}\nUSP:4\n# Medicamentos\nGaze:12`;
  const envio = await rotear(client, { tipo: 'modal', customId: idModal, campos: { inventario: editado }, cargos: GERENTE });
  const resumo = ultima(envio.i, 'editReply').payload;
  assert.match(resumo.embeds[0].toJSON().description, /Colt.*`3` → `0` \(remove\)/);
  const [idConfirmar, idCancelar] = customIdsDe(resumo);
  assert.match(idConfirmar, /^ger_ajuste_confirmar:[0-9a-f]{8}$/);
  assert.match(idCancelar, /^ger_ajuste_cancelar:[0-9a-f]{8}$/);
  assert.deepEqual(env.fake.dump()['bau/membros'], { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 3 } }, 'nada gravado antes de confirmar');

  // outro gerente tenta confirmar: negado e nada muda
  const intruso = await rotear(client, { tipo: 'button', customId: idConfirmar, cargos: GERENTE, usuario: { id: 'u9', tag: 'x#9' } });
  assert.match(ultima(intruso.i, 'reply').payload.content, /Só quem gerou/);
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 3);

  const conf = await rotear(client, { tipo: 'button', customId: idConfirmar, cargos: GERENTE });
  assert.equal(conf.resultado, 'executado');
  const bau = env.fake.dump()['bau/membros'];
  assert.equal(bau.armas__colt, undefined);
  assert.equal(bau.armas__usp.quantidade, 4);
  assert.equal(bau.medicamentos__gaze.quantidade, 12);
  const auds = Object.entries(env.fake.dump()).filter(([k]) => k.startsWith('auditoria/')).map(([, v]) => v);
  assert.equal(auds.length, 1);
  assert.equal(auds[0].acao, 'bau.ajuste_massa');
  assert.equal(auds[0].usuarioId, 'u1');
  assert.deepEqual(auds[0].antes, { armas__colt: 3, armas__usp: 0, medicamentos__gaze: 0 });
  assert.equal(canais.inventarioMembros.send.mock.callCount(), 1);

  // segundo clique (ou depois de restart): pede para refazer, sem nova auditoria
  const repetido = await rotear(client, { tipo: 'button', customId: idConfirmar, cargos: GERENTE });
  assert.match(ultima(repetido.i, 'reply').payload.content, /expirou ou já foi usada/);
  assert.equal(Object.keys(env.fake.dump()).filter((k) => k.startsWith('auditoria/')).length, 1);
});

test('E2E ajuste: dois cliques simultâneos em Confirmar aplicam uma vez só', async (t) => {
  const { env, client } = preparar(t);
  const envio = await rotear(client, { tipo: 'modal', customId: 'ger_modal_ajustar:membros', campos: { inventario: 'Colt:5' }, cargos: GERENTE });
  const [idConfirmar] = customIdsDe(ultima(envio.i, 'editReply').payload);
  await Promise.all([
    rotear(client, { tipo: 'button', customId: idConfirmar, cargos: GERENTE }),
    rotear(client, { tipo: 'button', customId: idConfirmar, cargos: GERENTE })
  ]);
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 5);
  assert.equal(Object.keys(env.fake.dump()).filter((k) => k.startsWith('auditoria/')).length, 1);
});

test('E2E ajuste: item removido do catálogo enquanto o ajuste está pendente -> confirmação recusa tudo', async (t) => {
  const { env, client } = preparar(t, { 'bau/membros': { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 3 } } });
  const envio = await rotear(client, { tipo: 'modal', customId: 'ger_modal_ajustar:membros', campos: { inventario: '# Armas\nColt:9\nUSP:2' }, cargos: GERENTE });
  const [idConfirmar] = customIdsDe(ultima(envio.i, 'editReply').payload);

  const remover = await rotear(client, { tipo: 'select', customId: 'ger_item_remover:armas', values: ['colt'], cargos: GERENTE, usuario: { id: 'u5', tag: 'g#5' } });
  assert.equal(remover.resultado, 'executado');
  assert.equal(env.fake.dump()['bau/membros'].armas__colt, undefined);

  const conf = await rotear(client, { tipo: 'button', customId: idConfirmar, cargos: GERENTE });
  assert.equal(conf.resultado, 'executado');
  const resposta = ultima(conf.i, 'editReply').payload.embeds[0].toJSON();
  assert.match(resposta.title, /não aplicado/);
  const bau = env.fake.dump()['bau/membros'] || {};
  assert.equal(bau.armas__colt, undefined, 'item removido não volta ao baú');
  assert.equal(bau.armas__usp, undefined, 'tudo ou nada: USP também não é aplicado');
  const acoes = Object.entries(env.fake.dump()).filter(([k]) => k.startsWith('auditoria/')).map(([, v]) => v.acao);
  assert.deepEqual(acoes, ['catalogo.remover_item']);
});

test('E2E gerência: cadastrar item com emoji e acento, usá-lo no baú e removê-lo do catálogo', async (t) => {
  const { env, client } = preparar(t);
  const cad = await rotear(client, { tipo: 'modal', customId: 'ger_modal_adicionar:armas', campos: { nome: '  🔫  Pistola   Ação ' }, cargos: GERENTE });
  assert.equal(cad.resultado, 'executado');
  const item = env.fake.dump()['catalogo/items'].armas.items.find((x) => x.id === 'pistola_acao');
  assert.deepEqual(item, { id: 'pistola_acao', nome: '🔫 Pistola Ação' });

  const dup = await rotear(client, { tipo: 'modal', customId: 'ger_modal_adicionar:armas', campos: { nome: 'pistola acao' }, cargos: GERENTE });
  assert.match(ultima(dup.i, 'reply').payload.embeds[0].toJSON().description, /já existe/);

  const usar = await rotear(client, { tipo: 'select', customId: 'bau_item:adicionar:membros:armas', values: ['pistola_acao'], cargos: MEMBRO });
  const modal = usar.i.chamadas[0].payload.toJSON();
  assert.ok(modal.title.length <= 45);
  await rotear(client, { tipo: 'modal', customId: modal.custom_id, campos: { quantidade: '2' }, cargos: MEMBRO });
  assert.equal(env.fake.dump()['bau/membros'].armas__pistola_acao.nome, '🔫 Pistola Ação');

  const rem = await rotear(client, { tipo: 'select', customId: 'ger_item_remover:armas', values: ['pistola_acao'], cargos: GERENTE });
  assert.equal(rem.resultado, 'executado');
  assert.equal(env.fake.dump()['bau/membros'].armas__pistola_acao, undefined);
});

test('E2E gerência: zerar ambos pelo roteador gera uma auditoria e atualiza os dois painéis', async (t) => {
  const item = { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 3 };
  const { env, canais, client } = preparar(t, { 'bau/membros': { armas__colt: item }, 'bau/gerencia': { armas__colt: item } });
  const r = await rotear(client, { tipo: 'select', customId: 'ger_zerar_confirmar', values: ['ambos'], cargos: GERENTE });
  assert.equal(r.resultado, 'executado');
  assert.deepEqual(env.fake.dump()['bau/membros'], {});
  assert.deepEqual(env.fake.dump()['bau/gerencia'], {});
  assert.equal(Object.keys(env.fake.dump()).filter((k) => k.startsWith('auditoria/')).length, 1);
  assert.equal(canais.inventarioMembros.send.mock.callCount(), 1);
  assert.equal(canais.inventarioGerencia.send.mock.callCount(), 1);
});
