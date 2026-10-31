const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  VARIAVEIS_OBRIGATORIAS,
  ErroConfig,
  montarConfigDeEnv,
  validarConfig,
  lerConfigJson,
  getConfig,
  setConfig,
  resetConfig
} = require('../utils/config');
const { CONFIG_TESTE, usarConfigTeste } = require('./helpers/config-teste');

const ENV_COMPLETA = Object.freeze({
  TOKEN: 'tok',
  CLIENT_ID: 'cli',
  GUILD_ID: 'gui',
  ROLE_MEMBRO: 'rm',
  ROLE_GERENTE: 'rg',
  ROLE_DONO: 'rd',
  CH_BAU_MEMBROS: 'c1',
  CH_BAU_GERENCIA: 'c2',
  CH_LOG_MEMBROS: 'c3',
  CH_LOG_GERENCIA: 'c4',
  CH_INV_MEMBROS: 'c5',
  CH_INV_GERENCIA: 'c6',
  CH_PAINEL_GERENCIA: 'c7',
  CH_CAIXA: 'c8',
  CH_LOG_CAIXA: 'c9',
  CH_SALDO_CAIXA: 'c10'
});

const CONFIG_ESPERADA = {
  token: 'tok',
  clientId: 'cli',
  guildId: 'gui',
  channels: {
    bauMembros: 'c1',
    bauGerencia: 'c2',
    logMembros: 'c3',
    logGerencia: 'c4',
    inventarioMembros: 'c5',
    inventarioGerencia: 'c6',
    painelGerencia: 'c7',
    caixaGangue: 'c8',
    logCaixa: 'c9',
    saldoCaixa: 'c10'
  },
  roles: { membro: 'rm', gerente: 'rg', dono: 'rd' },
  cor: 3447003
};

const clonar = (objeto) => JSON.parse(JSON.stringify(objeto));

test.afterEach(() => resetConfig());

test('VARIAVEIS_OBRIGATORIAS lista as 16 variáveis do bot', () => {
  assert.equal(VARIAVEIS_OBRIGATORIAS.length, 16);
  assert.deepEqual([...VARIAVEIS_OBRIGATORIAS].sort(), Object.keys(ENV_COMPLETA).sort());
});

test('montarConfigDeEnv com env completa devolve o formato do config.example.json', () => {
  const config = montarConfigDeEnv(ENV_COMPLETA);
  assert.deepEqual(config, CONFIG_ESPERADA);
  const exemplo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.example.json'), 'utf8'));
  assert.deepEqual(Object.keys(config), Object.keys(exemplo));
  assert.deepEqual(Object.keys(config.channels), Object.keys(exemplo.channels));
  assert.deepEqual(Object.keys(config.roles), Object.keys(exemplo.roles));
});

for (const nome of VARIAVEIS_OBRIGATORIAS) {
  test(`${nome} ausente, vazia ou "undefined" lança ErroConfig citando o nome`, () => {
    for (const valor of [undefined, '', '   ', 'undefined']) {
      const env = { ...ENV_COMPLETA, [nome]: valor };
      assert.throws(
        () => montarConfigDeEnv(env),
        (e) => e instanceof ErroConfig && e.message.includes(nome),
        `valor: ${String(valor)}`
      );
    }
  });
}

test('o erro lista todas as variáveis ausentes de uma vez', () => {
  assert.throws(
    () => montarConfigDeEnv({}),
    (e) => VARIAVEIS_OBRIGATORIAS.every((nome) => e.message.includes(nome))
  );
});

test('COR opcional: padrão, decimal, hexadecimal e inválida', () => {
  assert.equal(montarConfigDeEnv({ ...ENV_COMPLETA, COR: '255' }).cor, 255);
  assert.equal(montarConfigDeEnv({ ...ENV_COMPLETA, COR: '#3498db' }).cor, 0x3498db);
  assert.equal(montarConfigDeEnv({ ...ENV_COMPLETA, COR: '' }).cor, 3447003);
  assert.throws(() => montarConfigDeEnv({ ...ENV_COMPLETA, COR: 'azul' }), /COR/);
});

test('valores são aparados e nunca viram "undefined"', () => {
  const config = montarConfigDeEnv({ ...ENV_COMPLETA, TOKEN: '  tok  ' });
  assert.equal(config.token, 'tok');
  assert.doesNotMatch(JSON.stringify(config), /undefined/);
});

test('validarConfig aceita config completa e preenche cor padrão', () => {
  const entrada = clonar(CONFIG_ESPERADA);
  delete entrada.cor;
  assert.deepEqual(validarConfig(entrada), CONFIG_ESPERADA);
});

test('validarConfig recusa campo ausente, vazio, "undefined" e não objeto', () => {
  const mutacoes = [
    (c) => { c.token = ''; },
    (c) => { c.clientId = undefined; },
    (c) => { c.guildId = 'undefined'; },
    (c) => { c.channels.logCaixa = '  '; },
    (c) => { delete c.channels; },
    (c) => { c.roles.dono = 42; },
    (c) => { c.cor = 'azul'; }
  ];
  for (const mutar of mutacoes) {
    const c = clonar(CONFIG_ESPERADA);
    mutar(c);
    assert.throws(() => validarConfig(c), ErroConfig);
  }
  assert.throws(() => validarConfig(null), ErroConfig);
  assert.throws(() => validarConfig('texto'), ErroConfig);
  assert.throws(() => validarConfig({ ...clonar(CONFIG_ESPERADA), roles: { membro: 'a', gerente: 'b', dono: undefined } }), /roles\.dono/);
});

test('lerConfigJson devolve null se o arquivo não existe e valida o conteúdo se existe', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stocky-config-'));
  try {
    assert.equal(lerConfigJson(path.join(dir, 'nao-existe.json')), null);

    const valido = path.join(dir, 'valido.json');
    fs.writeFileSync(valido, JSON.stringify(CONFIG_ESPERADA));
    assert.deepEqual(lerConfigJson(valido), CONFIG_ESPERADA);

    const incompleto = path.join(dir, 'incompleto.json');
    fs.writeFileSync(incompleto, JSON.stringify({ ...CONFIG_ESPERADA, token: 'undefined' }));
    assert.throws(() => lerConfigJson(incompleto), ErroConfig);

    const quebrado = path.join(dir, 'quebrado.json');
    fs.writeFileSync(quebrado, '{ nao e json');
    assert.throws(() => lerConfigJson(quebrado), /config\.json inválido/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('setConfig tem prioridade, resetConfig limpa o cache', () => {
  setConfig(CONFIG_TESTE);
  assert.equal(getConfig(), CONFIG_TESTE);
  resetConfig();
  assert.notEqual(getConfig, undefined);
  usarConfigTeste();
  assert.equal(getConfig().roles.gerente, 'r-gerente');
});

test('getConfig sem injeção usa config.json se existir, senão o process.env, e guarda em cache', () => {
  const arquivoLocal = path.join(__dirname, '..', 'config.json');
  const antes = Object.fromEntries(VARIAVEIS_OBRIGATORIAS.map((n) => [n, process.env[n]]));
  Object.assign(process.env, ENV_COMPLETA);
  try {
    resetConfig();
    if (fs.existsSync(arquivoLocal)) {
      assert.deepEqual(getConfig(), lerConfigJson());
    } else {
      assert.deepEqual(getConfig(), CONFIG_ESPERADA);
      process.env.TOKEN = 'outro';
      assert.equal(getConfig().token, 'tok');
    }
  } finally {
    for (const nome of VARIAVEIS_OBRIGATORIAS) {
      if (antes[nome] === undefined) delete process.env[nome];
      else process.env[nome] = antes[nome];
    }
  }
});

test('CONFIG_TESTE tem os ids fixos do contrato e passa em validarConfig', () => {
  assert.equal(CONFIG_TESTE.roles.membro, 'r-membro');
  assert.equal(CONFIG_TESTE.roles.gerente, 'r-gerente');
  assert.equal(CONFIG_TESTE.roles.dono, 'r-dono');
  assert.ok(Object.values(CONFIG_TESTE.channels).every((id) => id.startsWith('c-')));
  assert.deepEqual(validarConfig(CONFIG_TESTE), CONFIG_TESTE);
  assert.ok(Object.isFrozen(CONFIG_TESTE));
});
