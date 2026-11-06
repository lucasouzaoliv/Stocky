const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { criarInteracao } = require('./helpers/fake-interaction');
const { CONFIG_TESTE, usarConfigTeste } = require('./helpers/config-teste');
const { setConfig, resetConfig } = require('../utils/config');
const permissoes = require('../utils/permissoes');

const { NIVEIS, MENSAGENS, getNivel, verificarPermissao, negarAcesso, exigirNivel } = permissoes;

test.beforeEach(() => usarConfigTeste());
test.afterEach(() => resetConfig());

const CARGOS = {
  nenhum: [],
  membro: ['r-membro'],
  gerente: ['r-gerente'],
  dono: ['r-dono']
};
const NIVEL_DO_CARGO = { nenhum: 0, membro: 1, gerente: 2, dono: 3 };

const botao = (opcoes = {}) => criarInteracao({ tipo: 'button', customId: 'x', ...opcoes });

test('NIVEIS e MENSAGENS seguem o contrato', () => {
  assert.deepEqual({ ...NIVEIS }, { membro: 1, gerente: 2, dono: 3 });
  assert.ok(Object.isFrozen(NIVEIS));
  assert.equal(MENSAGENS.dm, '❌ Use este comando dentro do servidor.');
  assert.equal(MENSAGENS.sem_cargo, '❌ Você não tem permissão para isso.');
  assert.equal(MENSAGENS.config_ausente, '❌ Cargos do bot não configurados. Avise a administração.');
});

test('tabela cargo x nível exigido', () => {
  for (const [cargo, ids] of Object.entries(CARGOS)) {
    for (const exigido of Object.keys(NIVEIS)) {
      const resultado = verificarPermissao(botao({ cargos: ids }), exigido);
      const esperado = NIVEL_DO_CARGO[cargo] >= NIVEIS[exigido];
      assert.equal(resultado.permitido, esperado, `${cargo} exigindo ${exigido}`);
      if (!esperado) {
        assert.equal(resultado.motivo, 'sem_cargo');
        assert.equal(resultado.mensagem, MENSAGENS.sem_cargo);
      }
    }
  }
});

test('getNivel: member nulo ou indefinido devolve 0 sem lançar', () => {
  assert.equal(getNivel(null), 0);
  assert.equal(getNivel(undefined), 0);
  assert.equal(getNivel({}), 0);
});

test('getNivel: aceita roles.cache.has e roles como array; vale o maior cargo', () => {
  assert.equal(getNivel(botao({ cargos: ['r-membro', 'r-gerente'] }).member), 2);
  assert.equal(getNivel(botao({ cargos: ['r-membro', 'r-dono'], rolesComoArray: true }).member), 3);
  assert.equal(getNivel(botao({ cargos: ['r-membro'], rolesComoArray: true }).member), 1);
  assert.equal(getNivel(botao({ cargos: ['outro'], rolesComoArray: true }).member), 0);
});

test('getNivel: cargo com id vazio na config nunca casa', () => {
  setConfig({ ...CONFIG_TESTE, roles: { membro: '', gerente: '', dono: '' } });
  assert.equal(getNivel({ roles: [''] }), 0);
  assert.equal(getNivel({ roles: { cache: { has: () => true } } }), 0);
});

test('getNivel: config indisponível nega em vez de lançar', () => {
  resetConfig();
  const antes = { ...process.env };
  for (const chave of Object.keys(process.env)) {
    if (/^(TOKEN|CLIENT_ID|GUILD_ID|ROLE_|CH_)/.test(chave)) delete process.env[chave];
  }
  try {
    assert.equal(getNivel(botao({ cargos: ['r-dono'] }).member), 0);
  } finally {
    Object.assign(process.env, antes);
  }
});

test('member nulo com inGuild (sem membro) é negado como sem_cargo', () => {
  const r = verificarPermissao(botao({ semMembro: true }), 'membro');
  assert.deepEqual([r.permitido, r.motivo], [false, 'sem_cargo']);
});

test('DM devolve motivo dm com mensagem própria, mesmo para quem teria o cargo', () => {
  const r = verificarPermissao(botao({ emDM: true, cargos: ['r-dono'] }), 'membro');
  assert.equal(r.permitido, false);
  assert.equal(r.motivo, 'dm');
  assert.equal(r.mensagem, MENSAGENS.dm);
  assert.notEqual(r.mensagem, MENSAGENS.sem_cargo);
});

test('roles da config vazias ou ausentes negam com config_ausente', () => {
  setConfig({ ...CONFIG_TESTE, roles: { membro: '', gerente: '', dono: '' } });
  const r = verificarPermissao(botao({ cargos: ['', 'r-membro'] }), 'membro');
  assert.deepEqual([r.permitido, r.motivo, r.mensagem], [false, 'config_ausente', MENSAGENS.config_ausente]);

  setConfig({ ...CONFIG_TESTE, roles: {} });
  assert.equal(verificarPermissao(botao({ cargos: ['r-dono'] }), 'gerente').motivo, 'config_ausente');
});

test('nível exigido inválido nega com sem_cargo (fail-closed)', () => {
  for (const nivel of ['publico', undefined, null, '', 'DONO', '__proto__', 2]) {
    const r = verificarPermissao(botao({ cargos: ['r-dono'] }), nivel);
    assert.deepEqual([r.permitido, r.motivo], [false, 'sem_cargo'], String(nivel));
  }
});

test('negarAcesso em interação nova usa reply efêmero uma única vez', async () => {
  const i = botao();
  await negarAcesso(i, { permitido: false, motivo: 'sem_cargo', mensagem: MENSAGENS.sem_cargo });
  assert.equal(i.chamadas.length, 1);
  assert.equal(i.chamadas[0].metodo, 'reply');
  assert.deepEqual(i.chamadas[0].payload, { content: MENSAGENS.sem_cargo, flags: MessageFlags.Ephemeral });
});

test('negarAcesso em interação deferida usa followUp efêmero uma única vez', async () => {
  const i = botao();
  await i.deferUpdate();
  await negarAcesso(i, { permitido: false, motivo: 'dm', mensagem: MENSAGENS.dm });
  const respostas = i.chamadas.filter((c) => c.metodo !== 'deferUpdate');
  assert.equal(respostas.length, 1);
  assert.equal(respostas[0].metodo, 'followUp');
  assert.equal(respostas[0].payload.flags, MessageFlags.Ephemeral);
  assert.equal(respostas[0].payload.content, MENSAGENS.dm);
});

test('negarAcesso em interação já respondida usa followUp', async () => {
  const i = botao();
  await i.reply({ content: 'oi' });
  await negarAcesso(i, { permitido: false, motivo: 'sem_cargo', mensagem: MENSAGENS.sem_cargo });
  assert.equal(i.chamadas.at(-1).metodo, 'followUp');
});

test('negarAcesso não lança quando o Discord rejeita a resposta', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const i = botao();
  i.reply.mock.mockImplementation(() => Promise.reject(new Error('Unknown interaction')));
  await assert.doesNotReject(negarAcesso(i, { permitido: false, motivo: 'sem_cargo', mensagem: 'x' }));
  assert.equal(log.mock.callCount(), 1);

  const sincrono = botao();
  sincrono.reply.mock.mockImplementation(() => { throw new Error('boom'); });
  await assert.doesNotReject(negarAcesso(sincrono, { permitido: false, motivo: 'sem_cargo', mensagem: 'x' }));
});

test('exigirNivel: true sem responder quando permitido', async () => {
  const i = botao({ cargos: ['r-gerente'] });
  assert.equal(await exigirNivel(i, 'gerente'), true);
  assert.equal(i.chamadas.length, 0);
});

test('exigirNivel: false e uma única resposta efêmera quando negado', async () => {
  const i = botao({ cargos: ['r-membro'] });
  assert.equal(await exigirNivel(i, 'gerente'), false);
  assert.equal(i.chamadas.length, 1);
  assert.equal(i.chamadas[0].payload.content, MENSAGENS.sem_cargo);
});

test('exigirNivel em DM responde a mensagem de DM', async () => {
  const i = botao({ emDM: true });
  assert.equal(await exigirNivel(i, 'membro'), false);
  assert.equal(i.chamadas[0].payload.content, MENSAGENS.dm);
});

test('funções legadas seguem null-safe e com a mesma regra', () => {
  const membro = botao({ cargos: ['r-membro'] }).member;
  const gerente = botao({ cargos: ['r-gerente'] }).member;
  assert.equal(permissoes.podeUsarBau(membro), true);
  assert.equal(permissoes.podeUsarBauGerencia(membro), false);
  assert.equal(permissoes.podeUsarBauGerencia(gerente), true);
  for (const fn of ['podeUsarBau', 'podeUsarBauGerencia', 'podeVerLogs', 'podeGerenciarCatalogo', 'podeZerarBau']) {
    assert.equal(permissoes[fn](null), false, fn);
    assert.equal(permissoes[fn](undefined), false, fn);
  }
  assert.equal(permissoes.getNomeNivel(null), '❌ Sem acesso');
  assert.equal(permissoes.getNomeNivel(botao({ cargos: ['r-dono'] }).member), '👑 El Diablo');
});
