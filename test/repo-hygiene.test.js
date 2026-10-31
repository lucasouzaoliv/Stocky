const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');

function arquivosVersionados() {
  try {
    return execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (erro) {
    return assert.fail(`Não foi possível executar "git ls-files" (repositório git ausente?): ${erro.message}`);
  }
}

test('.gitignore contém node_modules/, .env e config.json', () => {
  const linhas = fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  for (const entrada of ['node_modules/', '.env', 'config.json']) {
    assert.ok(linhas.includes(entrada), `.gitignore deve conter "${entrada}"`);
  }
});

test('nenhum arquivo de node_modules/ está versionado', () => {
  const intrusos = arquivosVersionados().filter((arquivo) => arquivo.startsWith('node_modules/'));
  assert.equal(intrusos.length, 0, `${intrusos.length} arquivo(s) de node_modules/ versionados`);
});

test('config.json e .env não estão versionados', () => {
  const versionados = arquivosVersionados();
  for (const proibido of ['config.json', '.env']) {
    assert.ok(!versionados.includes(proibido), `${proibido} não pode ser versionado`);
  }
});
