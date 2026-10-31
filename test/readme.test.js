const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { VARIAVEIS_OBRIGATORIAS } = require('../utils/config');
const { VARIAVEIS_FIREBASE } = require('../utils/firebase');
const { LIMITES } = require('../utils/validacao');
const { TTL_PENDENTE_MS } = require('../utils/ajustes-pendentes');

const RAIZ = path.join(__dirname, '..');
const lerArquivo = (nome) => fs.readFileSync(path.join(RAIZ, nome), 'utf8');
const README = lerArquivo('README.md');
const PACKAGE = JSON.parse(lerArquivo('package.json'));

function formatarMilhar(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

test('o README cita todas as variáveis obrigatórias do Discord, em ordem de código estável', () => {
  assert.ok(VARIAVEIS_OBRIGATORIAS.length > 0);
  const faltando = VARIAVEIS_OBRIGATORIAS.filter((nome) => !README.includes(`\`${nome}\``));
  assert.deepEqual(faltando, []);
});

test('o README cita as variáveis FIREBASE_* de utils/firebase.js', () => {
  assert.equal(VARIAVEIS_FIREBASE.length, 4);
  const faltando = VARIAVEIS_FIREBASE.filter((nome) => !README.includes(`\`${nome}\``));
  assert.deepEqual(faltando, []);
});

test('os limites citados no README batem com LIMITES de utils/validacao.js', () => {
  const citados = [
    LIMITES.QUANTIDADE_ITEM_MAX,
    LIMITES.VALOR_CAIXA_MAX,
    LIMITES.ITENS_POR_CATEGORIA_MAX,
    LIMITES.AJUSTE_LINHAS_MAX
  ];
  for (const valor of citados) {
    assert.ok(README.includes(formatarMilhar(valor)), `README não cita o limite ${valor}`);
  }
  const porCaracteres = [LIMITES.NOME_ITEM_MAX, LIMITES.ID_ITEM_MAX, LIMITES.ANOTACAO_MAX];
  for (const valor of porCaracteres) {
    assert.match(README, new RegExp(`até ${valor} caracteres`), `README não cita ${valor} caracteres`);
  }
});

test('a validade da confirmação do ajuste no README bate com o código', () => {
  const minutos = TTL_PENDENTE_MS / 60000;
  assert.match(README, new RegExp(`\\*\\*${minutos} minutos\\*\\*`));
});

test('o README documenta auditoria e a coleção de painéis', () => {
  assert.match(README, /`auditoria`/);
  assert.match(README, /`paineis`/);
  for (const termo of ['zerar baú', 'ajuste em massa', 'remover item do catálogo']) {
    assert.ok(README.toLowerCase().includes(termo), `README não menciona: ${termo}`);
  }
  assert.match(README, /# Categoria/);
  assert.match(README, /Item: quantidade/);
});

test('o README cita a licença ISC e o LICENSE existe e é ISC', () => {
  assert.match(README, /\[ISC\]\(LICENSE\)/);
  assert.ok(fs.existsSync(path.join(RAIZ, 'LICENSE')));
  assert.match(lerArquivo('LICENSE'), /^ISC License/);
  assert.equal(PACKAGE.license, 'ISC');
});

test('o README não contém padrões de segredo', () => {
  const padroes = [
    { nome: 'chave privada PEM', regex: new RegExp('BEGIN (RSA |EC )?PRIVATE ' + 'KEY') },
    { nome: 'token do Discord', regex: /[MNO][A-Za-z\d_-]{23,25}\.[\w-]{6}\.[\w-]{27,}/ },
    { nome: 'conta de serviço Google', regex: new RegExp('iam\\.' + 'gserviceaccount\\.com') },
    { nome: 'private_key_id hexadecimal', regex: /private_key_id["']?\s*[:=]\s*["']?[0-9a-f]{20,}/i },
    { nome: 'chave de API do Google', regex: /AIza[\w-]{35}/ },
    { nome: 'token do GitHub', regex: /gh[pousr]_[A-Za-z0-9]{36,}/ }
  ];
  const achados = padroes.filter(({ regex }) => regex.test(README)).map(({ nome }) => nome);
  assert.deepEqual(achados, []);
});

test('o README aponta para docs/WORKFLOW.md e CLAUDE.md, que existem', () => {
  assert.ok(README.includes('(docs/WORKFLOW.md)'));
  assert.ok(README.includes('(CLAUDE.md)'));
  assert.ok(fs.existsSync(path.join(RAIZ, 'docs', 'WORKFLOW.md')));
  assert.ok(fs.existsSync(path.join(RAIZ, 'CLAUDE.md')));
});

test('os comandos npm do README existem nos scripts do package.json', () => {
  const comandos = new Set([...README.matchAll(/npm (?:run )?([a-z:-]+)/g)].map((m) => m[1]));
  for (const obrigatorio of ['install', 'test', 'lint', 'start', 'deploy']) {
    assert.ok(comandos.has(obrigatorio), `README não cita npm ${obrigatorio}`);
  }
  const nativos = new Set(['install']);
  for (const comando of comandos) {
    if (nativos.has(comando)) continue;
    assert.ok(PACKAGE.scripts[comando], `script npm "${comando}" citado no README não existe`);
  }
});

test('o README avisa sobre rotação de chave e que o start.js não gera config.json', () => {
  assert.match(README, /revogue/i);
  assert.match(README, /gere uma nova/i);
  assert.match(README, /`start\.js`\s+\*\*não gera\*\*\s+`config\.json`/);
});
