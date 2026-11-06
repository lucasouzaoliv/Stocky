const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CAMINHO = path.join(__dirname, '..', 'package.json');
const pacote = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));

test('package.json é JSON válido carregável por require', () => {
  assert.equal(require(CAMINHO).name, 'stocky');
});

test('repository, bugs e homepage apontam para lucasouzaoliv/stocky', () => {
  assert.match(pacote.repository.url, /github\.com\/lucasouzaoliv\/stocky(\.git)?$/);
  assert.equal(pacote.bugs.url, 'https://github.com/lucasouzaoliv/stocky/issues');
  assert.match(pacote.homepage, /^https:\/\/github\.com\/lucasouzaoliv\/stocky(#readme)?$/);
});

test('package.json não menciona o repositório antigo', () => {
  assert.doesNotMatch(fs.readFileSync(CAMINHO, 'utf8'), /luuqee/i);
});

test('scripts test e lint e engines.node continuam presentes', () => {
  assert.ok(pacote.scripts.test);
  assert.ok(pacote.scripts.lint);
  assert.ok(pacote.engines.node);
});
