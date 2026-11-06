const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { GatewayIntentBits, MessageFlags } = require('discord.js');
const { criarInteracao } = require('./helpers/fake-interaction');
const { usarConfigTeste } = require('./helpers/config-teste');
const { resetConfig } = require('../utils/config');
const { MENSAGENS } = require('../utils/permissoes');
const {
  carregarHandlers, resolverHandler, resolverNivel, rotearInteracao, registrarHandlersDeProcesso
} = require('../utils/roteador');
const index = require('../index');

const RAIZ = path.join(__dirname, '..');
const MENSAGEM_ERRO = '❌ Ocorreu um erro ao processar essa interação.';
const dirsTemporarios = [];

test.beforeEach(() => usarConfigTeste());
test.afterEach(() => resetConfig());
test.after(() => dirsTemporarios.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function criarFixture({ comandos = {}, interacoes = {} }) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'stocky-roteador-'));
  dirsTemporarios.push(raiz);
  const commandsDir = path.join(raiz, 'commands');
  const interactionsDir = path.join(raiz, 'interactions');
  fs.mkdirSync(commandsDir);
  fs.mkdirSync(interactionsDir);
  for (const [arquivo, corpo] of Object.entries(comandos)) fs.writeFileSync(path.join(commandsDir, arquivo), corpo);
  for (const [arquivo, corpo] of Object.entries(interacoes)) fs.writeFileSync(path.join(interactionsDir, arquivo), corpo);
  return { commandsDir, interactionsDir };
}

const modulo = (campos) => `module.exports = { async execute() {}, ${campos} };`;
const interacaoFixture = (type, ids, permissao = "'membro'") => modulo(
  `type: '${type}', customIds: ${JSON.stringify(ids)}, permissao: ${permissao}`
);
const comandoFixture = (nome, permissao = "'gerente'") => modulo(`data: { name: '${nome}' }, permissao: ${permissao}`);

// Tabela de ids base reais (interactions/ atuais) -> arquivo e tipo.
const TABELA = [
  ['bau_adicionar', 'button', 'bau-menu'], ['bau_remover', 'button', 'bau-menu'],
  ['bau_estoque', 'button', 'bau-menu'], ['bau_cancelar', 'button', 'bau-menu'],
  ['bau_categoria', 'select', 'bau-categoria'], ['bau_item', 'select', 'bau-item'],
  ['bau_quantidade', 'modal', 'bau-quantidade'],
  ['caixa_adicionar', 'button', 'caixa-menu'], ['caixa_retirar', 'button', 'caixa-menu'],
  ['caixa_logs', 'button', 'caixa-menu'], ['caixa_modal', 'modal', 'caixa-modal'],
  ['ger_abrir_modal_ajustar', 'button', 'gerencia-abrir-modal'],
  ['ger_modal_ajustar', 'modal', 'gerencia-ajustar'],
  ['ger_adicionar_item', 'button', 'gerencia-menu'], ['ger_remover_item', 'button', 'gerencia-menu'],
  ['ger_zerar_bau', 'button', 'gerencia-menu'], ['ger_ver_logs', 'button', 'gerencia-menu'],
  ['ger_cancelar', 'button', 'gerencia-menu'], ['ger_ajustar_membros', 'button', 'gerencia-menu'],
  ['ger_ajustar_gerencia', 'button', 'gerencia-menu'],
  ['ger_modal_adicionar', 'modal', 'gerencia-modals'],
  ['ger_cat_adicionar', 'select', 'gerencia-selects'], ['ger_cat_remover', 'select', 'gerencia-selects'],
  ['ger_zerar_confirmar', 'select', 'gerencia-selects'], ['ger_logs_tipo', 'select', 'gerencia-selects'],
  ['ger_item_remover', 'select', 'gerencia-selects']
];

function montarFixtureDaTabela(permissao = "'membro'") {
  const porArquivo = {};
  for (const [id, tipo, arquivo] of TABELA) {
    (porArquivo[arquivo] ||= { tipo, ids: [] }).ids.push(id);
  }
  const interacoes = Object.fromEntries(
    Object.entries(porArquivo).map(([arquivo, { tipo, ids }]) => [`${arquivo}.js`, interacaoFixture(tipo, ids, permissao)])
  );
  return criarFixture({
    comandos: { 'setup.js': comandoFixture('setup'), 'setup-caixa.js': comandoFixture('setup-caixa') },
    interacoes
  });
}

function carregarTabela(permissao) {
  const dirs = montarFixtureDaTabela(permissao);
  return carregarHandlers(dirs);
}

function interacao(tipo, customId, cargos = ['r-dono'], extra = {}) {
  return criarInteracao({ tipo, customId, cargos, ...extra });
}

// ─── carregarHandlers ───────────────────────────────────────────────────────

test('carregarHandlers monta o registro por tipo com id base', () => {
  const registro = carregarTabela();
  assert.deepEqual([...registro.comandos.keys()].sort(), ['setup', 'setup-caixa']);
  assert.equal(registro.button.size, TABELA.filter(([, t]) => t === 'button').length);
  assert.equal(registro.select.size, TABELA.filter(([, t]) => t === 'select').length);
  assert.equal(registro.modal.size, TABELA.filter(([, t]) => t === 'modal').length);
});

test('carregarHandlers lança se um handler não declara permissao (o bot não sobe)', () => {
  const dirs = criarFixture({
    interacoes: { 'sem-permissao.js': modulo("type: 'button', customIds: ['a']") }
  });
  assert.throws(() => carregarHandlers(dirs), /sem-permissao\.js.*permissao/);
});

test('carregarHandlers lança para comando sem permissao, sem data ou sem execute', () => {
  assert.throws(() => carregarHandlers(criarFixture({
    comandos: { 'a.js': modulo("data: { name: 'a' }") }
  })), /permissao/);
  assert.throws(() => carregarHandlers(criarFixture({
    comandos: { 'b.js': "module.exports = { permissao: 'gerente', async execute() {} };" }
  })), /data\.name/);
  assert.throws(() => carregarHandlers(criarFixture({
    comandos: { 'c.js': "module.exports = { data: { name: 'c' }, permissao: 'gerente' };" }
  })), /execute/);
});

test('carregarHandlers rejeita permissao inválida (incluindo "publico")', () => {
  for (const permissao of ["'publico'", "'DONO'", '2', 'null', 'undefined']) {
    const dirs = criarFixture({ interacoes: { 'a.js': interacaoFixture('button', ['a'], permissao) } });
    assert.throws(() => carregarHandlers(dirs), /permissao/, permissao);
  }
});

test('carregarHandlers aceita permissao como função', () => {
  const dirs = criarFixture({ interacoes: { 'a.js': interacaoFixture('button', ['a'], '() => "membro"') } });
  assert.equal(carregarHandlers(dirs).button.size, 1);
});

test('carregarHandlers lança para type inválido, customIds ausente ou vazio', () => {
  assert.throws(() => carregarHandlers(criarFixture({
    interacoes: { 'a.js': interacaoFixture('menu', ['a']) }
  })), /type inválido/);
  assert.throws(() => carregarHandlers(criarFixture({
    interacoes: { 'a.js': modulo("type: 'button', permissao: 'membro'") }
  })), /customIds/);
  assert.throws(() => carregarHandlers(criarFixture({
    interacoes: { 'a.js': interacaoFixture('button', []) }
  })), /customIds/);
});

test('carregarHandlers lança para customId duplicado no mesmo type, mas aceita em types diferentes', () => {
  assert.throws(() => carregarHandlers(criarFixture({
    interacoes: { 'a.js': interacaoFixture('button', ['x']), 'b.js': interacaoFixture('button', ['x']) }
  })), /duplicado/);
  assert.throws(() => carregarHandlers(criarFixture({
    interacoes: { 'a.js': interacaoFixture('button', ['x', 'x']) }
  })), /duplicado/);
  const registro = carregarHandlers(criarFixture({
    interacoes: { 'a.js': interacaoFixture('button', ['x']), 'b.js': interacaoFixture('select', ['x']) }
  }));
  assert.equal(registro.button.size + registro.select.size, 2);
});

test('carregarHandlers lança para customId contendo ":"', () => {
  assert.throws(() => carregarHandlers(criarFixture({
    interacoes: { 'a.js': interacaoFixture('button', ['bau:adicionar']) }
  })), /":"/);
});

test('carregarHandlers lança para comando duplicado e ignora arquivos que não são .js', () => {
  assert.throws(() => carregarHandlers(criarFixture({
    comandos: { 'a.js': comandoFixture('setup'), 'b.js': comandoFixture('setup') }
  })), /duplicado/);
  const registro = carregarHandlers(criarFixture({ comandos: { 'LEIAME.md': '# nada', 'a.js': comandoFixture('a') } }));
  assert.equal(registro.comandos.size, 1);
});

// ─── resolverHandler ────────────────────────────────────────────────────────

test('tabela: cada id base atual resolve para o handler certo, com e sem argumentos', () => {
  const registro = carregarTabela();
  for (const [id, tipo, arquivo] of TABELA) {
    for (const customId of [id, `${id}:membros`, `${id}:adicionar:membros:armas`]) {
      const resolvido = resolverHandler(registro, interacao(tipo, customId));
      assert.ok(resolvido, customId);
      assert.equal(resolvido.tipo, tipo);
      assert.ok(resolvido.handler.customIds.includes(id), `${customId} -> ${arquivo}`);
    }
  }
});

test('resolverHandler: id desconhecido, tipo trocado e prefixo parcial não resolvem', () => {
  const registro = carregarTabela();
  assert.equal(resolverHandler(registro, interacao('button', 'nao_existe:x')), null);
  assert.equal(resolverHandler(registro, interacao('select', 'bau_adicionar:membros')), null);
  assert.equal(resolverHandler(registro, interacao('button', 'bau_adicion')), null);
  assert.equal(resolverHandler(registro, interacao('button', 'bau_adicionarX')), null);
  assert.equal(resolverHandler(registro, interacao('button', '')), null);
  assert.equal(resolverHandler(registro, interacao('button', '__proto__')), null);
});

test('resolverHandler resolve comandos pelo nome e ignora comando desconhecido', () => {
  const registro = carregarTabela();
  assert.equal(resolverHandler(registro, criarInteracao({ tipo: 'comando', commandName: 'setup-caixa' })).tipo, 'comando');
  assert.equal(resolverHandler(registro, criarInteracao({ tipo: 'comando', commandName: 'fantasma' })), null);
});

// ─── resolverNivel ──────────────────────────────────────────────────────────

test('resolverNivel: string, função, valor inválido e função que lança', (t) => {
  t.mock.method(console, 'error', () => {});
  const i = interacao('button', 'x');
  assert.equal(resolverNivel({ permissao: 'gerente' }, i), 'gerente');
  assert.equal(resolverNivel({ permissao: () => 'dono' }, i), 'dono');
  assert.equal(resolverNivel({ permissao: () => null }, i), null);
  assert.equal(resolverNivel({ permissao: () => 'publico' }, i), null);
  assert.equal(resolverNivel({ permissao: 'publico' }, i), null);
  assert.equal(resolverNivel({ permissao: () => { throw new Error('x'); } }, i), null);
  assert.equal(resolverNivel({ permissao: () => Promise.resolve('membro') }, i), null);
});

// ─── rotearInteracao ────────────────────────────────────────────────────────

function registroComEspiao(permissao, corpo = async () => {}) {
  const chamadas = [];
  const handler = {
    type: 'button',
    customIds: ['acao'],
    permissao,
    execute: async (i, client) => {
      chamadas.push({ i, client });
      await corpo(i, client);
    }
  };
  const registro = { comandos: new Map(), button: new Map([['acao', handler]]), select: new Map(), modal: new Map() };
  return { registro, chamadas };
}

test('rotearInteracao executa o handler quando permitido e repassa interaction e client', async () => {
  const { registro, chamadas } = registroComEspiao('gerente');
  const i = interacao('button', 'acao:x', ['r-gerente']);
  const client = { id: 'cliente' };
  assert.equal(await rotearInteracao(i, registro, client), 'executado');
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].i, i);
  assert.equal(chamadas[0].client, client);
  assert.equal(i.chamadas.length, 0);
});

test('rotearInteracao: negado não chama execute e a negação é a primeira e única resposta', async () => {
  const { registro, chamadas } = registroComEspiao('gerente');
  const i = interacao('button', 'acao', ['r-membro']);
  assert.equal(await rotearInteracao(i, registro, {}), 'negado');
  assert.equal(chamadas.length, 0);
  assert.equal(i.chamadas.length, 1);
  assert.equal(i.chamadas[0].metodo, 'reply');
  assert.deepEqual(i.chamadas[0].payload, { content: MENSAGENS.sem_cargo, flags: MessageFlags.Ephemeral });
});

test('rotearInteracao: sem cargo, DM e sem membro são negados sem executar', async () => {
  const { registro, chamadas } = registroComEspiao('membro');
  for (const extra of [{ cargos: [] }, { emDM: true }, { semMembro: true }]) {
    const i = interacao('button', 'acao', [], extra);
    assert.equal(await rotearInteracao(i, registro, {}), 'negado');
    assert.equal(i.chamadas.length, 1);
  }
  assert.equal(chamadas.length, 0);
  const dm = interacao('button', 'acao', [], { emDM: true });
  await rotearInteracao(dm, registro, {});
  assert.equal(dm.chamadas[0].payload.content, MENSAGENS.dm);
});

test('rotearInteracao: dono passa por exigência de gerente e membro (hierarquia)', async () => {
  for (const nivel of ['membro', 'gerente', 'dono']) {
    const { registro } = registroComEspiao(nivel);
    assert.equal(await rotearInteracao(interacao('button', 'acao', ['r-dono']), registro, {}), 'executado', nivel);
  }
});

test('rotearInteracao: permissao função usa o customId (baú por tipo) e tipo forjado é negado', async () => {
  const permissao = (i) => ({ membros: 'membro', gerencia: 'gerente' })[i.customId.split(':')[1]] ?? null;
  const { registro, chamadas } = registroComEspiao(permissao);

  assert.equal(await rotearInteracao(interacao('button', 'acao:membros', ['r-membro']), registro, {}), 'executado');
  assert.equal(await rotearInteracao(interacao('button', 'acao:gerencia', ['r-membro']), registro, {}), 'negado');
  assert.equal(await rotearInteracao(interacao('button', 'acao:gerencia', ['r-gerente']), registro, {}), 'executado');
  const forjado = interacao('button', 'acao:xyz', ['r-dono']);
  assert.equal(await rotearInteracao(forjado, registro, {}), 'negado');
  assert.equal(forjado.chamadas[0].payload.content, MENSAGENS.sem_cargo);
  assert.equal(chamadas.length, 2);
});

test('rotearInteracao: função de permissão que lança é negada, não derruba', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { registro, chamadas } = registroComEspiao(() => { throw new Error('boom'); });
  const i = interacao('button', 'acao', ['r-dono']);
  assert.equal(await rotearInteracao(i, registro, {}), 'negado');
  assert.equal(chamadas.length, 0);
});

test('rotearInteracao: showModal só acontece se permitido (negação vem antes)', async () => {
  const corpo = (i) => i.showModal({ customId: 'm' });
  const { registro } = registroComEspiao('gerente', corpo);
  const negada = interacao('button', 'acao', ['r-membro']);
  await rotearInteracao(negada, registro, {});
  assert.equal(negada.showModal.mock.callCount(), 0);
  const ok = interacao('button', 'acao', ['r-gerente']);
  assert.equal(await rotearInteracao(ok, registro, {}), 'executado');
  assert.equal(ok.chamadas[0].metodo, 'showModal');
});

test('rotearInteracao: id desconhecido devolve sem_handler, sem resposta e sem log', async (t) => {
  const erro = t.mock.method(console, 'error', () => {});
  const log = t.mock.method(console, 'log', () => {});
  const { registro } = registroComEspiao('membro');
  for (const tipo of ['button', 'select', 'modal']) {
    const i = interacao(tipo, 'desconhecido:1');
    assert.equal(await rotearInteracao(i, registro, {}), 'sem_handler');
    assert.equal(i.chamadas.length, 0);
  }
  assert.equal(erro.mock.callCount(), 0);
  assert.equal(log.mock.callCount(), 0);
});

test('rotearInteracao: handler que lança devolve erro e responde efêmero com reply', async (t) => {
  const erro = t.mock.method(console, 'error', () => {});
  const { registro } = registroComEspiao('membro', () => Promise.reject(new Error('falhou')));
  const i = interacao('button', 'acao', ['r-membro']);
  assert.equal(await rotearInteracao(i, registro, {}), 'erro');
  assert.equal(i.chamadas.length, 1);
  assert.equal(i.chamadas[0].metodo, 'reply');
  assert.deepEqual(i.chamadas[0].payload, { content: MENSAGEM_ERRO, flags: MessageFlags.Ephemeral });
  assert.equal(erro.mock.callCount(), 1);
});

test('rotearInteracao: handler que lança depois de defer responde com followUp', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { registro } = registroComEspiao('membro', async (i) => {
    await i.deferUpdate();
    throw new Error('falhou');
  });
  const i = interacao('button', 'acao', ['r-membro']);
  assert.equal(await rotearInteracao(i, registro, {}), 'erro');
  assert.equal(i.chamadas.at(-1).metodo, 'followUp');
  assert.equal(i.chamadas.at(-1).payload.content, MENSAGEM_ERRO);
});

test('rotearInteracao nunca lança, mesmo se a resposta de erro também falhar', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { registro } = registroComEspiao('membro', () => Promise.reject(new Error('falhou')));
  const i = interacao('button', 'acao', ['r-membro']);
  i.reply.mock.mockImplementation(() => Promise.reject(new Error('Unknown interaction')));
  assert.equal(await rotearInteracao(i, registro, {}), 'erro');
});

test('rotearInteracao roteia comandos com a permissão do comando', async () => {
  const { registro } = registroComEspiao('membro');
  const chamadas = [];
  registro.comandos.set('setup', { data: { name: 'setup' }, permissao: 'gerente', execute: () => Promise.resolve(chamadas.push(1)) });
  const membro = criarInteracao({ tipo: 'comando', commandName: 'setup', cargos: ['r-membro'] });
  const gerente = criarInteracao({ tipo: 'comando', commandName: 'setup', cargos: ['r-gerente'] });
  assert.equal(await rotearInteracao(membro, registro, {}), 'negado');
  assert.equal(await rotearInteracao(gerente, registro, {}), 'executado');
  assert.equal(chamadas.length, 1);
});

// ─── processo, intents e index ──────────────────────────────────────────────

test('registrarHandlersDeProcesso: unhandledRejection só loga; uncaughtException loga e sai com 1', (t) => {
  const erro = t.mock.method(console, 'error', () => {});
  const proc = new EventEmitter();
  const saidas = [];
  registrarHandlersDeProcesso(proc, (codigo) => saidas.push(codigo));
  assert.equal(proc.listenerCount('unhandledRejection'), 1);
  assert.equal(proc.listenerCount('uncaughtException'), 1);

  proc.emit('unhandledRejection', new Error('rejeitada'));
  assert.equal(erro.mock.callCount(), 1);
  assert.deepEqual(saidas, []);

  proc.emit('uncaughtException', new Error('fatal'));
  assert.equal(erro.mock.callCount(), 2);
  assert.deepEqual(saidas, [1]);
});

test('INTENTS contém apenas Guilds (sem GuildMessages)', () => {
  assert.deepEqual(index.INTENTS, [GatewayIntentBits.Guilds]);
  assert.equal(index.INTENTS.includes(GatewayIntentBits.GuildMessages), false);
  assert.equal(typeof index.criarCliente, 'function');
  assert.equal(typeof index.iniciar, 'function');
});

test('carregar index.js não faz login nem cria cliente (só iniciar faz)', () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'index.js'), 'utf8');
  assert.equal(/^\s*client\.login\(/m.test(fonte), false);
  const cliente = index.criarCliente();
  assert.equal(cliente.isReady(), false);
  cliente.destroy();
});

test('varredura: sem logs por interação nem require de config.json em index.js e roteador.js', () => {
  for (const arquivo of ['index.js', path.join('utils', 'roteador.js'), path.join('utils', 'permissoes.js')]) {
    const fonte = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    assert.equal(/RECEBIDO|NENHUM HANDLER/.test(fonte), false, arquivo);
    assert.equal(/console\.log\([^)]*(customId|interaction)/.test(fonte), false, arquivo);
    assert.equal(/config\.json/.test(fonte), false, arquivo);
    assert.equal(/GuildMessages/.test(fonte), false, arquivo);
  }
});
