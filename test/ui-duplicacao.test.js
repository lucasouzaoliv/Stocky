'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ARQUIVOS = ['interactions', 'commands']
  .flatMap((pasta) => fs.readdirSync(path.join(RAIZ, pasta)).filter((f) => f.endsWith('.js')).map((f) => path.join(pasta, f)))
  .concat([path.join('utils', 'embeds.js')]);

test('varredura cobre handlers, comandos e embeds', () => {
  assert.ok(ARQUIVOS.length >= 14);
});

for (const arquivo of ARQUIVOS) {
  test(`${arquivo}: sem cópias de UI nem require de config.json`, () => {
    const fonte = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    assert.ok(
      !/function\s+(rowMenuBau|rowMenuGerencia2?|rowCaixa|embedCaixa|embedLogCaixa|rowCancelar\w*)\b/.test(fonte),
      'definição local de componente de UI'
    );
    assert.ok(!/require\(\s*['"][^'"]*config\.json['"]\s*\)/.test(fonte), 'require de config.json');
  });
}

test('arquivos de interactions/commands não usam flags: 64 literal', () => {
  for (const arquivo of ARQUIVOS) {
    const fonte = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    assert.ok(!/flags:\s*64\b/.test(fonte), `${arquivo} usa flags: 64`);
  }
});

test('todo custom id base das rows de ui.js tem um handler em interactions/', () => {
  const ui = require('../utils/ui');
  const rows = [
    ui.rowMenuBau('membros'), ui.rowCancelarBau('membros'), ...ui.rowsPainelGerencia(),
    ui.rowCancelarGerencia(), ui.rowCaixa(), ui.rowConfirmarAjuste('abc')
  ];
  const registrados = new Set();
  for (const f of fs.readdirSync(path.join(RAIZ, 'interactions'))) {
    const mod = require(path.join(RAIZ, 'interactions', f));
    (mod.customIds || []).forEach((id) => registrados.add(id));
  }
  const ausentes = [];
  for (const row of rows) {
    for (const c of row.toJSON().components) {
      const base = c.custom_id.split(':')[0];
      // ger_ajuste_* pertence ao handler novo da onda 3 (STK-015)
      if (!registrados.has(base) && !base.startsWith('ger_ajuste_')) ausentes.push(base);
    }
  }
  assert.deepEqual(ausentes, []);
});
