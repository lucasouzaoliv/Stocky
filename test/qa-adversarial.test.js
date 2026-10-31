'use strict';

// QA: testes adversariais (permissão exaustiva por customId, DM, membro ausente, entradas
// gigantes e unicode, painel apagado/migrado) usando o roteador real.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { criarInteracao, criarCanalFalso, criarClientFalso } = require('./helpers/fake-interaction');
const { montarAmbiente, ehEfemera, metodos, ultima } = require('./helpers/ambiente');
const { carregarHandlers, rotearInteracao } = require('../utils/roteador');
const { MENSAGENS } = require('../utils/permissoes');
const { limparPendentes } = require('../utils/ajustes-pendentes');
const { validarNomeItem, parseInteiroPositivo, LIMITES } = require('../utils/validacao');
const { embedResumoAjuste, embedHistoricoCaixa, embedLogsBau } = require('../utils/ui');

const registro = carregarHandlers({
  commandsDir: path.join(__dirname, '..', 'commands'),
  interactionsDir: path.join(__dirname, '..', 'interactions')
});

// Gera, para cada id base registrado, os customIds reais que o bot produz.
function variantes(tipo, id) {
  if (id.startsWith('bau_')) {
    const sufixos = { bau_categoria: ['adicionar:{t}'], bau_item: ['adicionar:{t}:armas'], bau_quantidade: ['adicionar:{t}:armas:colt'] };
    const s = sufixos[id] || ['{t}'];
    return ['membros', 'gerencia', 'xyz', ''].flatMap((t) => s.map((x) => `${id}:${x.replace('{t}', t)}`)).concat([id]);
  }
  return [id, `${id}:membros`, `${id}:armas`];
}

function todosOsAlvos() {
  const alvos = [];
  for (const tipo of ['button', 'select', 'modal']) {
    for (const id of registro[tipo].keys()) {
      for (const customId of variantes(tipo, id)) alvos.push({ tipo, customId });
    }
  }
  for (const nome of registro.comandos.keys()) alvos.push({ tipo: 'comando', commandName: nome });
  return alvos;
}

function nivelEsperado({ customId }) {
  if (customId && customId.startsWith('bau_')) {
    const partes = customId.split(':');
    const pos = customId.startsWith('bau_categoria') || customId.startsWith('bau_item') || customId.startsWith('bau_quantidade') ? 2 : 1;
    if (partes[pos] === 'membros') return 'membro';
    if (partes[pos] === 'gerencia') return 'gerente';
    return null;
  }
  return 'gerente';
}

const CAMPOS = { quantidade: '1', tipo: 'sujo', valor: '1', anotacao: 'x', inventario: 'Colt:1', nome: 'Novo' };

async function rotear(alvo, extras, t) {
  const env = montarAmbiente();
  t.after(() => { env.limpar(); limparPendentes(); });
  const i = criarInteracao({ ...alvo, values: ['armas'], campos: CAMPOS, opcoes: { tipo: 'membros' }, ...extras });
  const resultado = await rotearInteracao(i, registro, criarClientFalso());
  return { i, resultado, env };
}

test('nenhum customId nem comando escapa: DM, sem membro, sem cargo e cargo desconhecido são negados antes de tocar o banco', async (t) => {
  const alvos = todosOsAlvos();
  assert.ok(alvos.length > 60);
  const cenarios = [
    [{ emDM: true }, MENSAGENS.dm],
    [{ semMembro: true }, MENSAGENS.sem_cargo],
    [{ cargos: [] }, MENSAGENS.sem_cargo],
    [{ cargos: ['r-outro'], rolesComoArray: true }, MENSAGENS.sem_cargo]
  ];
  for (const alvo of alvos) {
    for (const [extras, mensagem] of cenarios) {
      const { i, resultado, env } = await rotear(alvo, extras, t);
      const rotulo = `${alvo.customId || alvo.commandName} ${JSON.stringify(extras)}`;
      assert.equal(resultado, 'negado', rotulo);
      assert.deepEqual(metodos(i), ['reply'], rotulo);
      assert.ok(ehEfemera(i.chamadas[0].payload), rotulo);
      // Tipo de baú forjado é recusado antes de olhar a guilda: em DM a mensagem é a de sem cargo (ainda negado).
      const esperada = nivelEsperado(alvo) === null ? MENSAGENS.sem_cargo : mensagem;
      assert.equal(i.chamadas[0].payload.content, esperada, rotulo);
      assert.equal(env.fake.chamadas.length, 0, rotulo);
    }
  }
});

test('membro só passa onde o nível exigido é membro; o resto é negado sem tocar o banco', async (t) => {
  for (const alvo of todosOsAlvos()) {
    const esperado = nivelEsperado(alvo);
    for (const rolesComoArray of [false, true]) {
      const { i, resultado, env } = await rotear(alvo, { cargos: ['r-membro'], rolesComoArray }, t);
      const rotulo = alvo.customId || alvo.commandName;
      if (esperado === 'membro') {
        assert.notEqual(resultado, 'negado', rotulo);
      } else {
        assert.equal(resultado, 'negado', rotulo);
        assert.equal(env.fake.chamadas.length, 0, rotulo);
        assert.deepEqual(metodos(i), ['reply'], rotulo);
      }
    }
  }
});

test('gerente e dono executam tudo exceto tipo forjado de baú; nenhuma execução termina em erro não tratado', async (t) => {
  for (const alvo of todosOsAlvos()) {
    for (const cargos of [['r-gerente'], ['r-dono']]) {
      const { i, resultado } = await rotear(alvo, { cargos }, t);
      const rotulo = `${alvo.customId || alvo.commandName} ${cargos}`;
      if (nivelEsperado(alvo) === null) {
        assert.equal(resultado, 'negado', rotulo);
      } else {
        assert.equal(resultado, 'executado', rotulo);
        assert.ok(i.chamadas.length >= 1, `${rotulo}: interação sem resposta`);
      }
    }
  }
});

test('roteador: id base desconhecido e prefixo parecido não executam nada nem respondem', async (t) => {
  for (const customId of ['bau', 'bau_adicionarx:membros', 'ger_', 'caixa_modalX:adicionar', 'BAU_ADICIONAR:membros']) {
    const { i, resultado } = await rotear({ tipo: 'button', customId }, { cargos: ['r-dono'] }, t);
    assert.equal(resultado, 'sem_handler', customId);
    assert.equal(i.chamadas.length, 0);
  }
});

test('entrada gigante e unicode na quantidade: erro efêmero, nada gravado', async (t) => {
  for (const quantidade of ['9'.repeat(100000), '1'.repeat(16), '５', '１０', '10​', '١٢', '🔫', ' \t\n ', '1_000', '0x10', 'Infinity', 'NaN']) {
    const { i, resultado, env } = await rotear({ tipo: 'modal', customId: 'bau_quantidade:adicionar:membros:armas:colt' }, { cargos: ['r-membro'], campos: { quantidade } }, t);
    assert.equal(resultado, 'executado');
    const r = ultima(i, 'reply').payload;
    assert.ok(ehEfemera(r));
    assert.match(r.embeds[0].toJSON().title, /inválida/);
    assert.equal(env.fake.dump()['bau/membros'], undefined, JSON.stringify(quantidade.slice(0, 10)));
  }
});

test('valor gigante no caixa: erro efêmero, saldo intacto, sem histórico', async (t) => {
  for (const valor of ['9'.repeat(5000), '1000000001', '1e9', '-0', '0']) {
    const { i, env } = await rotear({ tipo: 'modal', customId: 'caixa_modal:adicionar' }, { cargos: ['r-gerente'], campos: { tipo: 'sujo', valor, anotacao: 'x' } }, t);
    assert.match(ultima(i, 'reply').payload.content, /Valor inválido/);
    assert.equal(env.fake.dump()['caixa/saldo'], undefined);
    assert.equal(Object.keys(env.fake.dump()).filter((k) => k.startsWith('caixa/logs/')).length, 0);
  }
});

test('nomes de item: emoji, acento, zero-width, só símbolos, gigantes e cirílico', () => {
  assert.deepEqual(validarNomeItem('🔫 AK‑47'), { ok: true, nome: '🔫 AK‑47', id: 'ak_47' });
  assert.equal(validarNomeItem('Ação Ü').id, 'acao_u');
  for (const ruim of ['​​', '🔫🔫🔫', '!!!', '   ', '', 'x'.repeat(51), '🔫'.repeat(26), 'a'.repeat(1e6), 'Кольт']) {
    const r = validarNomeItem(ruim);
    assert.equal(r.ok, false, JSON.stringify(ruim.slice(0, 10)));
    assert.equal(typeof r.erro, 'string');
  }
  const r = validarNomeItem('a/b\\c.d#e$f[g]');
  assert.ok(r.ok);
  assert.doesNotMatch(r.id, /[/\\.#$[\]]/);
});

test('nome gigante via modal de cadastro: recusado e catálogo intacto', async (t) => {
  const { i, env } = await rotear({ tipo: 'modal', customId: 'ger_modal_adicionar:armas' }, { cargos: ['r-gerente'], campos: { nome: 'Z'.repeat(100000) } }, t);
  assert.ok(ehEfemera(ultima(i, 'reply').payload));
  assert.equal(env.fake.dump()['catalogo/items'].armas.items.length, 2);
});

test('ajuste com 4000 caracteres de lixo: erro listado, embed dentro dos limites, nada pendente', async (t) => {
  const lixo = Array.from({ length: 199 }, (_, k) => `ÍtemQueNãoExiste${k}🔫:${k}`).join('\n').slice(0, 4000);
  const { i, env } = await rotear({ tipo: 'modal', customId: 'ger_modal_ajustar:membros' }, { cargos: ['r-gerente'], campos: { inventario: lixo } }, t);
  const p = ultima(i, 'editReply').payload;
  const json = p.embeds[0].toJSON();
  assert.ok(json.description.length <= 4096);
  assert.equal(p.components, undefined);
  assert.equal(env.fake.dump()['bau/membros'], undefined);
});

test('embeds de lista (resumo, histórico, logs) nunca passam de 4096 com entradas enormes e unicode', () => {
  const nomeLongo = '🔫'.repeat(500);
  const resumo = embedResumoAjuste('membros', Array.from({ length: 200 }, () => ({ nome: nomeLongo, categoria: 'Ármas', antes: 1, depois: 0 }))).toJSON();
  assert.ok(resumo.description.length <= 4096);
  assert.match(resumo.description, /… e mais \d+$/);
  const hist = embedHistoricoCaixa(Array.from({ length: 10 }, () => ({ acao: 'adicionar', valor: 1e9, tipo: 'sujo', anotacao: 'ç'.repeat(5000), usuarioId: '1', timestamp: 'x' }))).toJSON();
  assert.ok(hist.description.length <= 4096);
  const logs = embedLogsBau('membros', Array.from({ length: 10 }, () => ({ acao: 'remover', item: { nome: nomeLongo }, quantidade: 1, usuarioId: '1', timestamp: 0 }))).toJSON();
  assert.ok(logs.description.length <= 4096);
});

test('limites do Discord nos componentes gerados: no máximo 25 opções por select e 5 linhas', async (t) => {
  const cheio = { nome: 'Armas', emoji: '🔫', items: Array.from({ length: 25 }, (_, k) => ({ id: `i${k}`, nome: `Item ${k}` })) };
  const env = montarAmbiente({ seed: { 'catalogo/items': { armas: cheio } } });
  t.after(env.limpar);
  const alvos = [
    { tipo: 'button', customId: 'bau_adicionar:membros' },
    { tipo: 'select', customId: 'bau_categoria:adicionar:membros', values: ['armas'] },
    { tipo: 'button', customId: 'ger_remover_item' },
    { tipo: 'select', customId: 'ger_cat_remover', values: ['armas'] },
    { tipo: 'button', customId: 'ger_zerar_bau' }
  ];
  for (const alvo of alvos) {
    const i = criarInteracao({ ...alvo, cargos: ['r-gerente'] });
    assert.equal(await rotearInteracao(i, registro, criarClientFalso()), 'executado');
    const p = ultima(i, 'editReply').payload;
    assert.ok(p.components.length <= 5, alvo.customId);
    for (const row of p.components) {
      for (const c of row.toJSON().components) {
        if (c.options) assert.ok(c.options.length <= 25, alvo.customId);
      }
    }
  }
});

test('painel: canal guardado diferente do configurado -> migra para o canal atual e grava o novo id', async (t) => {
  const env = montarAmbiente({ seed: { 'paineis/inventario_membros': { canalId: 'canal-antigo-apagado', mensagemId: 'm-velha' } } });
  t.after(env.limpar);
  const inv = criarCanalFalso({ id: env.config.channels.inventarioMembros, mensagens: [{ id: 'm-bot', author: { id: 'bot' } }] });
  const client = criarClientFalso({ canais: [inv] });
  const i = criarInteracao({ tipo: 'modal', customId: 'bau_quantidade:adicionar:membros:armas:colt', campos: { quantidade: '1' }, cargos: ['r-membro'], client });
  assert.equal(await rotearInteracao(i, registro, client), 'executado');
  assert.equal(inv.mensagens.find((m) => m.id === 'm-bot').edit.mock.callCount(), 1);
  assert.deepEqual(
    { canalId: env.fake.dump()['paineis/inventario_membros'].canalId, mensagemId: env.fake.dump()['paineis/inventario_membros'].mensagemId },
    { canalId: env.config.channels.inventarioMembros, mensagemId: 'm-bot' }
  );
});

test('painel: id guardado de mensagem apagada -> recria uma única vez e as próximas editam a nova', async (t) => {
  const env = montarAmbiente({ seed: { 'paineis/inventario_membros': { canalId: 'c-inv-membros', mensagemId: 'apagada' } } });
  t.after(env.limpar);
  const inv = criarCanalFalso({ id: env.config.channels.inventarioMembros });
  const client = criarClientFalso({ canais: [inv] });
  for (let k = 0; k < 3; k++) {
    const i = criarInteracao({ tipo: 'modal', customId: 'bau_quantidade:adicionar:membros:armas:colt', campos: { quantidade: '1' }, cargos: ['r-membro'], client });
    await rotearInteracao(i, registro, client);
  }
  assert.equal(inv.send.mock.callCount(), 1);
  assert.equal(inv.mensagens[0].edit.mock.callCount(), 2);
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 3);
});

test('parse estrito: limites exatos e vizinhos', () => {
  assert.equal(parseInteiroPositivo(String(LIMITES.QUANTIDADE_ITEM_MAX), { max: LIMITES.QUANTIDADE_ITEM_MAX }).ok, true);
  assert.equal(parseInteiroPositivo(String(LIMITES.QUANTIDADE_ITEM_MAX + 1), { max: LIMITES.QUANTIDADE_ITEM_MAX }).ok, false);
  assert.equal(parseInteiroPositivo('000000000000001', { max: 5 }).valor, 1);
  assert.equal(parseInteiroPositivo('0000000000000001', { max: 5 }).ok, false);
});
