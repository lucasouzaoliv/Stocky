'use strict';

// Carrega TODOS os handlers reais e prova que cada um declara `permissao` e resolve no roteador.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarInteracao } = require('./helpers/fake-interaction');
const { carregarHandlers, resolverHandler, resolverNivel } = require('../utils/roteador');

const RAIZ = path.join(__dirname, '..');
const commandsDir = path.join(RAIZ, 'commands');
const interactionsDir = path.join(RAIZ, 'interactions');

test('carregarHandlers com as pastas reais não lança', () => {
  assert.doesNotThrow(() => carregarHandlers({ commandsDir, interactionsDir }));
});

test('todo módulo real declara permissao válida', () => {
  for (const dir of [commandsDir, interactionsDir]) {
    for (const arquivo of fs.readdirSync(dir).filter((a) => a.endsWith('.js'))) {
      const mod = require(path.join(dir, arquivo));
      const ok = ['membro', 'gerente', 'dono'].includes(mod.permissao) || typeof mod.permissao === 'function';
      assert.ok(ok, `${arquivo} sem permissao`);
    }
  }
});

test('todo customId e todo comando registrado resolve para o handler e tem permissao', () => {
  const registro = carregarHandlers({ commandsDir, interactionsDir });
  assert.deepEqual([...registro.comandos.keys()].sort(), ['setup', 'setup-caixa']);

  for (const [nome, mod] of registro.comandos) {
    const i = criarInteracao({ tipo: 'comando', commandName: nome });
    assert.equal(resolverHandler(registro, i).handler, mod);
    assert.equal(resolverNivel(mod, i), 'gerente');
  }
  const tipos = { button: 'button', select: 'select', modal: 'modal' };
  let total = 0;
  for (const tipo of Object.keys(tipos)) {
    for (const [id, mod] of registro[tipo]) {
      total += 1;
      const customId = `${id}:membros:armas`;
      const i = criarInteracao({ tipo, customId, values: ['x'] });
      assert.equal(resolverHandler(registro, i).handler, mod, id);
      const nivel = resolverNivel(mod, criarInteracao({ tipo, customId: id.startsWith('bau_') ? customId : id }));
      assert.ok(['membro', 'gerente', 'dono'].includes(nivel) || id.startsWith('bau_'), `${id} sem nível`);
    }
  }
  assert.ok(total >= 20);
});

test('módulo sem permissao faz carregarHandlers lançar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stocky-hand-'));
  try {
    fs.writeFileSync(path.join(dir, 'x.js'), "module.exports = { type: 'button', customIds: ['x'], async execute() {} };");
    assert.throws(() => carregarHandlers({ interactionsDir: dir }), /permissao/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
