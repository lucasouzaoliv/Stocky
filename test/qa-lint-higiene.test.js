'use strict';

// QA: STK-023 critérios 1, 2 e 4 provados por teste automatizado (antes só havia verificação manual).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');

function arquivosJs() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.js'], { cwd: RAIZ, encoding: 'utf8' })
    .split('\n').filter(Boolean).filter((f) => !f.startsWith('node_modules/'));
}

test('STK-023: nenhum eslint-disable em arquivo .js do projeto', () => {
  const achados = arquivosJs().filter((f) => f !== 'test/qa-lint-higiene.test.js').filter((f) => /eslint-disable/.test(fs.readFileSync(path.join(RAIZ, f), 'utf8')));
  assert.deepEqual(achados, []);
});

test('STK-023: eslint.config.js não desliga regras', () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'eslint.config.js'), 'utf8');
  assert.doesNotMatch(fonte, /['"]off['"]|:\s*0\b|['"]warn['"]|:\s*1\b/);
  assert.match(fonte, /js\.configs\.recommended/);
});

test('STK-023: node --check passa em todos os .js', () => {
  for (const f of arquivosJs()) {
    execFileSync(process.execPath, ['--check', path.join(RAIZ, f)], { stdio: 'pipe' });
  }
});

test('STK-023: ESLint sem erros e sem avisos', async () => {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: RAIZ });
  const resultados = await eslint.lintFiles(['.']);
  const erros = resultados.reduce((s, r) => s + r.errorCount, 0);
  const avisos = resultados.reduce((s, r) => s + r.warningCount, 0);
  const detalhes = resultados.filter((r) => r.messages.length).map((r) => `${path.relative(RAIZ, r.filePath)}: ${r.messages.map((m) => m.ruleId).join(',')}`);
  assert.equal(erros, 0, detalhes.join('\n'));
  assert.equal(avisos, 0, detalhes.join('\n'));
});
