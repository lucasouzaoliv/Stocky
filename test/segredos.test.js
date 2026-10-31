const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const IGNORADOS = [/^docs\//, /^\.claude\//, /^package-lock\.json$/, /^test\/segredos\.test\.js$/];

const PADROES = [
  { nome: 'chave privada PEM', regex: new RegExp('BEGIN (RSA |EC )?PRIVATE ' + 'KEY') },
  { nome: 'private_key_id com valor', regex: new RegExp('private_key' + '_id["\']?\\s*[:=]\\s*["\'][0-9a-f]{8,}') },
  { nome: 'e-mail de conta de serviço', regex: new RegExp('iam\\.' + 'gserviceaccount\\.com') },
  { nome: 'client_id literal', regex: new RegExp('client' + '_id["\']?\\s*[:=]\\s*["\']\\d{10,}["\']') }
];

function arquivosDoRepositorio() {
  try {
    const saida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: RAIZ,
      encoding: 'utf8'
    });
    return saida.split('\n').filter(Boolean);
  } catch (erro) {
    assert.fail(`Não foi possível listar os arquivos do repositório git (sem .git?): ${erro.message}`);
  }
}

test('nenhum arquivo do repositório contém credenciais do Firebase', () => {
  const achados = [];
  for (const arquivo of arquivosDoRepositorio()) {
    if (IGNORADOS.some((regex) => regex.test(arquivo))) continue;
    const caminho = path.join(RAIZ, arquivo);
    if (!fs.existsSync(caminho)) continue;
    const conteudo = fs.readFileSync(caminho, 'utf8');
    for (const { nome, regex } of PADROES) {
      if (regex.test(conteudo)) achados.push(`${arquivo}: ${nome}`);
    }
  }
  assert.deepEqual(achados, []);
});

test('utils/firebase.js não tem fallback com string literal para as variáveis FIREBASE_*', () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'utils', 'firebase.js'), 'utf8');
  assert.doesNotMatch(fonte, /process\.env\.FIREBASE_\w+\s*\|\|/);
  assert.doesNotMatch(fonte, /FIREBASE_\w+\s*\|\|\s*["'`]/);
});
