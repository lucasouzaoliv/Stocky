const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const index = require('../index');
const { main } = require('../start');
const { VARIAVEIS_OBRIGATORIAS, getConfig, resetConfig } = require('../utils/config');
const { VARIAVEIS_FIREBASE } = require('../utils/firebase');

const RAIZ = path.join(__dirname, '..');
const ENV_COMPLETA = Object.freeze({
  ...Object.fromEntries(VARIAVEIS_OBRIGATORIAS.map((nome) => [nome, `valor-${nome}`])),
  ...Object.fromEntries(VARIAVEIS_FIREBASE.map((nome) => [nome, `valor-${nome}`]))
});

let dirTemporario;
let caminhoInexistente;
let exitCodeOriginal;

test.beforeEach(() => {
  dirTemporario = fs.mkdtempSync(path.join(os.tmpdir(), 'stocky-start-'));
  caminhoInexistente = path.join(dirTemporario, 'config.json');
  exitCodeOriginal = process.exitCode;
  process.exitCode = undefined;
  resetConfig();
});

test.afterEach(() => {
  process.exitCode = exitCodeOriginal;
  resetConfig();
  fs.rmSync(dirTemporario, { recursive: true, force: true });
});

function executar(t, env) {
  const iniciar = t.mock.method(index, 'iniciar', () => Promise.resolve({}));
  const erro = t.mock.method(console, 'error', () => {});
  return { iniciar, erro, rodar: () => main(env, { caminhoConfigJson: caminhoInexistente }) };
}

test('env completa: valida, guarda a config e chama iniciar uma vez, sem exitCode', async (t) => {
  const { iniciar, erro, rodar } = executar(t, ENV_COMPLETA);
  await rodar();
  assert.equal(iniciar.mock.callCount(), 1);
  assert.equal(erro.mock.callCount(), 0);
  assert.equal(process.exitCode, undefined);
  assert.equal(getConfig().token, 'valor-TOKEN');
  assert.equal(getConfig().channels.saldoCaixa, 'valor-CH_SALDO_CAIXA');
});

for (const nome of [...VARIAVEIS_OBRIGATORIAS, ...VARIAVEIS_FIREBASE]) {
  test(`variável ausente ${nome}: mensagem cita o nome, exitCode 1 e sem iniciar`, async (t) => {
    const env = { ...ENV_COMPLETA };
    delete env[nome];
    const { iniciar, erro, rodar } = executar(t, env);
    await rodar();
    assert.equal(iniciar.mock.callCount(), 0);
    assert.equal(process.exitCode, 1);
    assert.match(erro.mock.calls.map((c) => c.arguments.join(' ')).join('\n'), new RegExp(nome));
  });

  test(`variável vazia ${nome}: falha da mesma forma`, async (t) => {
    const { iniciar, rodar } = executar(t, { ...ENV_COMPLETA, [nome]: '   ' });
    await rodar();
    assert.equal(iniciar.mock.callCount(), 0);
    assert.equal(process.exitCode, 1);
  });
}

test('lista todas as variáveis ausentes de uma vez (bot e Firebase)', async (t) => {
  const { erro, rodar } = executar(t, {});
  await rodar();
  const saida = erro.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
  for (const nome of [...VARIAVEIS_OBRIGATORIAS, ...VARIAVEIS_FIREBASE]) assert.match(saida, new RegExp(nome));
  assert.doesNotMatch(saida, /undefined/);
  assert.equal(process.exitCode, 1);
});

test('main não grava config.json', async (t) => {
  const { rodar } = executar(t, ENV_COMPLETA);
  await rodar();
  assert.equal(fs.existsSync(caminhoInexistente), false);
  assert.equal(fs.existsSync(path.join(RAIZ, 'config.json')), false);
  const { rodar: rodarFalha } = executar(t, {});
  await rodarFalha();
  assert.equal(fs.existsSync(path.join(RAIZ, 'config.json')), false);
});

test('config.json válido dispensa as variáveis do bot, mas o Firebase continua obrigatório', async (t) => {
  const bruto = {
    token: 't', clientId: 'c', guildId: 'g',
    channels: Object.fromEntries(['bauMembros', 'bauGerencia', 'logMembros', 'logGerencia', 'inventarioMembros',
      'inventarioGerencia', 'painelGerencia', 'caixaGangue', 'logCaixa', 'saldoCaixa'].map((k) => [k, `ch-${k}`])),
    roles: { membro: 'm', gerente: 'g', dono: 'd' }
  };
  fs.writeFileSync(caminhoInexistente, JSON.stringify(bruto));
  const somenteFirebase = Object.fromEntries(VARIAVEIS_FIREBASE.map((nome) => [nome, 'x']));
  const { iniciar, rodar } = executar(t, somenteFirebase);
  await rodar();
  assert.equal(iniciar.mock.callCount(), 1);
  assert.equal(getConfig().token, 't');
  resetConfig();

  const { iniciar: iniciar2, rodar: rodar2 } = executar(t, {});
  await rodar2();
  assert.equal(iniciar2.mock.callCount(), 0);
  assert.equal(process.exitCode, 1);
});

test('config.json com campo vazio ou "undefined" falha com mensagem clara', async (t) => {
  fs.writeFileSync(caminhoInexistente, JSON.stringify({ token: 'undefined', clientId: 'c' }));
  const { iniciar, erro, rodar } = executar(t, ENV_COMPLETA);
  await rodar();
  assert.equal(iniciar.mock.callCount(), 0);
  assert.equal(process.exitCode, 1);
  assert.match(erro.mock.calls.map((c) => c.arguments.join(' ')).join('\n'), /token/);
});

test('iniciar rejeitando (ex.: login inválido) vira exitCode 1 sem lançar', async (t) => {
  const iniciar = t.mock.method(index, 'iniciar', () => Promise.reject(new Error('TokenInvalid')));
  t.mock.method(console, 'error', () => {});
  await assert.doesNotReject(main(ENV_COMPLETA, { caminhoConfigJson: caminhoInexistente }));
  assert.equal(iniciar.mock.callCount(), 1);
  assert.equal(process.exitCode, 1);
});

test('start.js não grava arquivos nem contém fallbacks/segredos', () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'start.js'), 'utf8');
  assert.equal(/writeFileSync|fs\./.test(fonte), false);
  assert.equal(/config\.json/.test(fonte), false);
});
