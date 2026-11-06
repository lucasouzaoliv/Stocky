'use strict';

// Permissões provadas pelo roteador real, com os handlers reais de interactions/ e commands/.
// Cobre STK-004, STK-005 e STK-006.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mock } = require('node:test');
const { criarInteracao, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos } = require('./helpers/ambiente');
const { carregarHandlers, rotearInteracao, resolverHandler } = require('../utils/roteador');
const { MENSAGENS } = require('../utils/permissoes');

const registro = carregarHandlers({
  commandsDir: path.join(__dirname, '..', 'commands'),
  interactionsDir: path.join(__dirname, '..', 'interactions')
});

const SEM_CARGO = [];
const MEMBRO = ['r-membro'];
const GERENTE = ['r-gerente'];
const DONO = ['r-dono'];

const BOTOES_BAU = (tipo) => [`bau_adicionar:${tipo}`, `bau_remover:${tipo}`, `bau_estoque:${tipo}`, `bau_cancelar:${tipo}`];
const SELECTS_BAU = (tipo) => [`bau_categoria:adicionar:${tipo}`, `bau_item:adicionar:${tipo}:armas`];
const MODAIS_BAU = (tipo) => [`bau_quantidade:adicionar:${tipo}:armas:colt`];

function interacoesBau(tipo, extras) {
  return [
    ...BOTOES_BAU(tipo).map((customId) => criarInteracao({ tipo: 'button', customId, ...extras })),
    ...SELECTS_BAU(tipo).map((customId) => criarInteracao({ tipo: 'select', customId, values: ['armas'], ...extras })),
    ...MODAIS_BAU(tipo).map((customId) => criarInteracao({ tipo: 'modal', customId, campos: { quantidade: '5' }, ...extras }))
  ];
}

const GERENCIA = [
  ['button', 'ger_adicionar_item'], ['button', 'ger_remover_item'], ['button', 'ger_zerar_bau'],
  ['button', 'ger_ver_logs'], ['button', 'ger_cancelar'], ['button', 'ger_ajustar_membros'],
  ['button', 'ger_ajustar_gerencia'], ['button', 'ger_abrir_modal_ajustar:membros'],
  ['select', 'ger_cat_adicionar'], ['select', 'ger_cat_remover'], ['select', 'ger_zerar_confirmar'],
  ['select', 'ger_logs_tipo'], ['select', 'ger_item_remover:armas'],
  ['modal', 'ger_modal_adicionar:armas'], ['modal', 'ger_modal_ajustar:membros']
];
const CAIXA = [['button', 'caixa_adicionar'], ['button', 'caixa_retirar'], ['button', 'caixa_logs'], ['modal', 'caixa_modal:adicionar']];

function criar([tipo, customId], extras) {
  return criarInteracao({ tipo, customId, values: ['armas'], campos: { tipo: 'sujo', valor: '5', anotacao: 'x', inventario: '', nome: 'x' }, ...extras });
}

// Troca execute por espiões para provar que NÃO roda quando negado (e roda quando permitido).
const TODOS = new Set([...registro.comandos.values(), ...registro.button.values(), ...registro.select.values(), ...registro.modal.values()]);
const ORIGINAIS = new Map([...TODOS].map((m) => [m, m.execute]));

function espionarExecute(t) {
  for (const m of TODOS) m.execute = mock.fn(async () => {});
  t.after(() => { for (const [m, e] of ORIGINAIS) m.execute = e; });
  return (handler) => handler.execute.mock.callCount();
}

async function rotear(i, t) {
  const env = montarAmbiente();
  t.after(env.limpar);
  const chamadas = espionarExecute(t);
  const resultado = await rotearInteracao(i, registro, criarClientFalso());
  const resolvido = resolverHandler(registro, i);
  return { resultado, execucoes: resolvido ? chamadas(resolvido.handler) : 0, env };
}

function assertNegado(i, r, mensagem = MENSAGENS.sem_cargo) {
  assert.equal(r.resultado, 'negado');
  assert.equal(r.execucoes, 0, 'execute não pode rodar');
  assert.deepEqual(metodos(i), ['reply']);
  const payload = i.chamadas[0].payload;
  assert.ok(ehEfemera(payload));
  assert.equal(payload.content, mensagem);
  assert.equal(r.env.fake.chamadas.length, 0);
}

for (const tipo of ['membros', 'gerencia']) {
  test(`baú ${tipo}: sem cargo é negado em todos os handlers`, async (t) => {
    for (const i of interacoesBau(tipo, { cargos: SEM_CARGO })) {
      assertNegado(i, await rotear(i, t));
    }
  });
}

test('baú membros: membro, gerente e dono executam', async (t) => {
  for (const cargos of [MEMBRO, GERENTE, DONO]) {
    for (const i of interacoesBau('membros', { cargos })) {
      const r = await rotear(i, t);
      assert.equal(r.resultado, 'executado', i.customId);
      assert.equal(r.execucoes, 1);
    }
  }
});

test('baú gerencia: membro é negado; gerente e dono executam', async (t) => {
  for (const i of interacoesBau('gerencia', { cargos: MEMBRO })) assertNegado(i, await rotear(i, t));
  for (const cargos of [GERENTE, DONO]) {
    for (const i of interacoesBau('gerencia', { cargos })) {
      const r = await rotear(i, t);
      assert.equal(r.resultado, 'executado', i.customId);
      assert.equal(r.execucoes, 1);
    }
  }
});

test('baú: tipo forjado é negado mesmo para dono', async (t) => {
  for (const i of interacoesBau('xyz', { cargos: DONO })) assertNegado(i, await rotear(i, t));
});

test('baú: DM é negado com a mensagem de DM', async (t) => {
  for (const tipo of ['membros', 'gerencia']) {
    for (const i of interacoesBau(tipo, { emDM: true })) assertNegado(i, await rotear(i, t), MENSAGENS.dm);
  }
});

test('gerência e caixa: sem cargo e membro negados; gerente e dono executam; DM negado', async (t) => {
  for (const item of [...GERENCIA, ...CAIXA]) {
    for (const cargos of [SEM_CARGO, MEMBRO]) {
      const i = criar(item, { cargos });
      assertNegado(i, await rotear(i, t));
    }
    for (const cargos of [GERENTE, DONO]) {
      const i = criar(item, { cargos });
      const r = await rotear(i, t);
      assert.equal(r.resultado, 'executado', item[1]);
      assert.equal(r.execucoes, 1);
    }
    const dm = criar(item, { emDM: true });
    assertNegado(dm, await rotear(dm, t), MENSAGENS.dm);
  }
});

test('gerência/caixa: negado não escreve no banco real do handler (fake sem chamadas)', async (t) => {
  // Sem espionar execute: o handler real não pode rodar, logo nenhuma leitura/escrita acontece.
  const env = montarAmbiente();
  t.after(env.limpar);
  for (const item of [['select', 'ger_zerar_confirmar'], ['select', 'ger_item_remover:armas'], ['modal', 'ger_modal_ajustar:membros'], ['modal', 'caixa_modal:retirar']]) {
    const i = criar(item, { cargos: MEMBRO });
    assert.equal(await rotearInteracao(i, registro, criarClientFalso()), 'negado');
  }
  assert.equal(env.fake.chamadas.length, 0);
});

for (const [nome, extras] of [['ger_abrir_modal_ajustar:membros', {}]]) {
  test(`${nome} permitido: showModal é a primeira (e única) resposta`, async (t) => {
    const env = montarAmbiente();
    t.after(env.limpar);
    const i = criarInteracao({ tipo: 'button', customId: nome, cargos: GERENTE, ...extras });
    assert.equal(await rotearInteracao(i, registro, criarClientFalso()), 'executado');
    assert.deepEqual(metodos(i), ['showModal']);
  });
}

test('comandos /setup e /setup-caixa: gerente e dono executam; sem cargo, membro e DM negados', async (t) => {
  for (const nome of ['setup', 'setup-caixa']) {
    for (const cargos of [SEM_CARGO, MEMBRO]) {
      const i = criarInteracao({ tipo: 'comando', commandName: nome, cargos });
      assertNegado(i, await rotear(i, t));
    }
    const dm = criarInteracao({ tipo: 'comando', commandName: nome, emDM: true });
    assertNegado(dm, await rotear(dm, t), MENSAGENS.dm);
    for (const cargos of [GERENTE, DONO]) {
      const i = criarInteracao({ tipo: 'comando', commandName: nome, cargos });
      const r = await rotear(i, t);
      assert.equal(r.resultado, 'executado');
      assert.equal(r.execucoes, 1);
    }
  }
});

test('comandos negados não enviam mensagem em canal nem escrevem', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const client = criarClientFalso();
  for (const nome of ['setup', 'setup-caixa']) {
    const i = criarInteracao({ tipo: 'comando', commandName: nome, cargos: MEMBRO, opcoes: { tipo: 'bau' } });
    assert.equal(await rotearInteracao(i, registro, client), 'negado');
  }
  assert.equal(env.fake.chamadas.length, 0);
});
