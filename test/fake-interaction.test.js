'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarInteracao, criarCanalFalso, criarClientFalso } = require('./helpers/fake-interaction');

test('tipo inválido ou ausente lança erro', () => {
  assert.throws(() => criarInteracao({ tipo: 'xyz' }), /tipo inválido/);
  assert.throws(() => criarInteracao(), /tipo inválido/);
});

test('predicados isX refletem o tipo', () => {
  const casos = [
    ['button', 'isButton'],
    ['select', 'isStringSelectMenu'],
    ['modal', 'isModalSubmit'],
    ['comando', 'isChatInputCommand']
  ];
  for (const [tipo, metodo] of casos) {
    const i = criarInteracao({ tipo });
    for (const [, outro] of casos) {
      assert.equal(i[outro](), outro === metodo, `${tipo}.${outro}`);
    }
  }
});

test('membro com cargos: roles.cache.has e roles como array', () => {
  const normal = criarInteracao({ tipo: 'button', cargos: ['r-membro'] });
  assert.equal(normal.member.roles.cache.has('r-membro'), true);
  assert.equal(normal.member.roles.cache.has('r-dono'), false);
  assert.equal(normal.inGuild(), true);
  assert.equal(normal.guildId, 'g1');

  const array = criarInteracao({ tipo: 'button', cargos: ['r-gerente'], rolesComoArray: true });
  assert.deepEqual(array.member.roles, ['r-gerente']);
});

test('DM e semMembro: member nulo; só DM zera guild e inGuild', () => {
  const dm = criarInteracao({ tipo: 'button', emDM: true });
  assert.equal(dm.member, null);
  assert.equal(dm.guild, null);
  assert.equal(dm.guildId, null);
  assert.equal(dm.inGuild(), false);

  const sem = criarInteracao({ tipo: 'button', semMembro: true });
  assert.equal(sem.member, null);
  assert.equal(sem.inGuild(), true);
});

test('usuário padrão e customizado', () => {
  assert.deepEqual(criarInteracao({ tipo: 'button' }).user, { id: 'u1', tag: 'user#0001' });
  const i = criarInteracao({ tipo: 'button', usuario: { id: 'x', tag: 'x#1' } });
  assert.equal(i.user.id, 'x');
  assert.equal(i.member.id, 'x');
});

test('fields.getTextInputValue devolve o campo e lança se ausente', () => {
  const i = criarInteracao({ tipo: 'modal', customId: 'm', campos: { valor: '10', vazio: '' } });
  assert.equal(i.fields.getTextInputValue('valor'), '10');
  assert.equal(i.fields.getTextInputValue('vazio'), '');
  assert.throws(() => i.fields.getTextInputValue('nada'), /não existe/);
});

test('options.getString devolve a opção ou null', () => {
  const i = criarInteracao({ tipo: 'comando', commandName: 'setup', opcoes: { tipo: 'membros' } });
  assert.equal(i.commandName, 'setup');
  assert.equal(i.options.getString('tipo'), 'membros');
  assert.equal(i.options.getString('outra'), null);
});

test('customId e values chegam ao handler', () => {
  const i = criarInteracao({ tipo: 'select', customId: 'bau_categoria:adicionar:membros', values: ['armas'] });
  assert.equal(i.customId, 'bau_categoria:adicionar:membros');
  assert.deepEqual(i.values, ['armas']);
});

test('reply marca replied e responde só uma vez', async () => {
  const i = criarInteracao({ tipo: 'button' });
  await i.reply({ content: 'oi' });
  assert.equal(i.replied, true);
  assert.equal(i.deferred, false);
  await assert.rejects(() => i.reply({ content: 'de novo' }), /AlreadyReplied/);
  await assert.rejects(() => i.deferReply(), /AlreadyReplied/);
  await assert.rejects(() => i.deferUpdate(), /AlreadyReplied/);
  await assert.rejects(() => i.showModal({}), /AlreadyReplied/);
  await assert.rejects(() => i.update({}), /AlreadyReplied/);
});

test('deferReply: marca deferred, depois só editReply/followUp', async () => {
  const i = criarInteracao({ tipo: 'comando' });
  await i.deferReply({ flags: 64 });
  assert.equal(i.deferred, true);
  await assert.rejects(() => i.reply({}), /AlreadyReplied/);
  await assert.rejects(() => i.deferReply(), /AlreadyReplied/);
  await i.editReply({ content: 'ok' });
  await i.followUp({ content: 'mais' });
  assert.deepEqual(i.chamadas.map((c) => c.metodo), ['deferReply', 'editReply', 'followUp']);
});

test('deferUpdate em botão e em select; depois editReply funciona', async () => {
  for (const tipo of ['button', 'select']) {
    const i = criarInteracao({ tipo });
    await i.deferUpdate();
    assert.equal(i.deferred, true);
    await i.editReply({ content: 'x' });
  }
});

test('deferUpdate e update não existem em comando', async () => {
  const i = criarInteracao({ tipo: 'comando' });
  await assert.rejects(() => i.deferUpdate(), /não existe/);
  await assert.rejects(() => i.update({}), /não existe/);
  assert.equal(i.deferred, false);
});

test('update responde uma vez em botão', async () => {
  const i = criarInteracao({ tipo: 'button' });
  await i.update({ content: 'novo' });
  assert.equal(i.replied, true);
  await assert.rejects(() => i.update({}), /AlreadyReplied/);
});

test('editReply e followUp sem resposta anterior lançam', async () => {
  const i = criarInteracao({ tipo: 'button' });
  await assert.rejects(() => i.editReply({}), /NotReplied/);
  await assert.rejects(() => i.followUp({}), /NotReplied/);
  assert.equal(i.chamadas.length, 0);
});

test('showModal como primeira resposta marca replied; depois de defer lança', async () => {
  const ok = criarInteracao({ tipo: 'button' });
  await ok.showModal({ titulo: 'm' });
  assert.equal(ok.replied, true);
  assert.equal(ok.chamadas[0].metodo, 'showModal');

  const depois = criarInteracao({ tipo: 'button' });
  await depois.deferUpdate();
  await assert.rejects(() => depois.showModal({}), /AlreadyReplied/);

  const deferReply = criarInteracao({ tipo: 'button' });
  await deferReply.deferReply();
  await assert.rejects(() => deferReply.showModal({}), /AlreadyReplied/);
});

test('showModal não existe em envio de modal', async () => {
  const i = criarInteracao({ tipo: 'modal' });
  await assert.rejects(() => i.showModal({}), /não existe/);
});

test('chamadas falhas não são registradas', async () => {
  const i = criarInteracao({ tipo: 'button' });
  await i.reply({ content: 'a' });
  await assert.rejects(() => i.reply({ content: 'b' }));
  assert.equal(i.chamadas.length, 1);
  assert.equal(i.reply.mock.callCount(), 2);
});

test('chamadas guardam seq, origem, metodo e payload', async () => {
  const i = criarInteracao({ tipo: 'button' });
  await i.deferUpdate();
  await i.editReply({ content: 'x' });
  assert.deepEqual(i.chamadas.map((c) => [c.seq, c.origem, c.metodo]), [
    [1, 'interaction', 'deferUpdate'],
    [2, 'interaction', 'editReply']
  ]);
  assert.deepEqual(i.chamadas[1].payload, { content: 'x' });
});

test('registro compartilhado dá ordem global entre fontes', async () => {
  const registro = [];
  const i = criarInteracao({ tipo: 'button', registro });
  registro.push({ seq: registro.length + 1, origem: 'db', op: 'get', caminho: 'bau/membros', emTransacao: false });
  await i.deferUpdate();
  const ordem = registro.map((r) => r.origem);
  assert.deepEqual(ordem, ['db', 'interaction']);
  assert.deepEqual(registro.map((r) => r.seq), [1, 2]);
  assert.equal(i.registro, registro);
});

test('message.edit é espião e a mensagem padrão existe nos componentes', async () => {
  const i = criarInteracao({ tipo: 'button' });
  await i.message.edit({ content: 'novo' });
  assert.equal(i.message.edit.mock.callCount(), 1);
  assert.equal(i.message.content, 'novo');
  assert.equal(criarInteracao({ tipo: 'comando' }).message, null);
});

test('message customizada é usada, com edit injetado quando falta', async () => {
  const i = criarInteracao({ tipo: 'modal', message: { id: 'abc' } });
  assert.equal(i.message.id, 'abc');
  await i.message.edit({ content: 'z' });
  assert.equal(i.message.edit.mock.callCount(), 1);
});

test('client padrão existe e o informado é respeitado', () => {
  assert.equal(criarInteracao({ tipo: 'button' }).client.user.id, 'bot');
  const client = criarClientFalso({ userId: 'meu-bot' });
  assert.equal(criarInteracao({ tipo: 'button', client }).client, client);
});

test('criarCanalFalso: send cria mensagem com edit e fetch por id', async () => {
  const canal = criarCanalFalso({ id: 'c-1' });
  const msg = await canal.send({ content: 'oi' });
  assert.ok(msg.id);
  assert.equal(canal.send.mock.callCount(), 1);
  assert.equal(await canal.messages.fetch(msg.id), msg);
  await msg.edit({ content: 'editada' });
  assert.equal(msg.content, 'editada');
});

test('criarCanalFalso: fetch de id inexistente rejeita com code 10008', async () => {
  const canal = criarCanalFalso({ id: 'c-1' });
  await assert.rejects(() => canal.messages.fetch('nao-existe'), (e) => e.code === 10008);
});

test('criarCanalFalso: fetch({ limit }) respeita limite, ordem e find', async () => {
  const canal = criarCanalFalso({
    id: 'c-1',
    mensagens: [
      { id: 'm3', author: { id: 'outro' } },
      { id: 'm2', author: { id: 'bot' } },
      { id: 'm1', author: { id: 'bot' } }
    ]
  });
  const dois = await canal.messages.fetch({ limit: 2 });
  assert.equal(dois.size, 2);
  assert.deepEqual([...dois.keys()], ['m3', 'm2']);
  assert.equal(dois.find((m) => m.author.id === 'bot').id, 'm2');
  assert.equal(dois.find((m) => m.author.id === 'ninguem'), undefined);
});

test('criarCanalFalso: mensagem nova vai para o topo do fetch({ limit })', async () => {
  const canal = criarCanalFalso({ id: 'c-1', mensagens: [{ id: 'velha' }] });
  const nova = await canal.send({ content: 'n' });
  const lista = await canal.messages.fetch({ limit: 10 });
  assert.deepEqual([...lista.keys()], [nova.id, 'velha']);
});

test('criarClientFalso: cache.get, fetch, user', async () => {
  const canal = criarCanalFalso({ id: 'c-1' });
  const client = criarClientFalso({ canais: [canal], userId: 'b1' });
  assert.equal(client.user.id, 'b1');
  assert.equal(client.channels.cache.get('c-1'), canal);
  assert.equal(client.channels.cache.get('c-2'), undefined);
  assert.equal(await client.channels.fetch('c-1'), canal);
  await assert.rejects(() => client.channels.fetch('c-2'), (e) => e.code === 10003);
});
