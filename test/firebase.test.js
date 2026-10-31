const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {
  VARIAVEIS_FIREBASE,
  validarEnvFirebase,
  montarCredencialFirebase,
  getDb,
  setDb,
  resetDb
} = require('../utils/firebase');

const ENV_FALSO = Object.freeze({
  FIREBASE_PROJECT_ID: 'projeto-falso',
  FIREBASE_CLIENT_EMAIL: 'falso@exemplo.invalid',
  FIREBASE_PRIVATE_KEY: 'chave-falsa-linha1\\nchave-falsa-linha2',
  FIREBASE_PRIVATE_KEY_ID: 'id-falso-0000'
});

function comEnv(valores, fn) {
  const antes = Object.fromEntries(VARIAVEIS_FIREBASE.map((nome) => [nome, process.env[nome]]));
  VARIAVEIS_FIREBASE.forEach((nome) => delete process.env[nome]);
  Object.assign(process.env, valores);
  const restaurar = () => {
    VARIAVEIS_FIREBASE.forEach((nome) => {
      if (antes[nome] === undefined) delete process.env[nome];
      else process.env[nome] = antes[nome];
    });
  };
  try {
    return fn();
  } finally {
    restaurar();
  }
}

function espionarAdmin() {
  const originais = {
    initializeApp: admin.initializeApp,
    cert: admin.credential.cert
  };
  const espiao = { inicializacoes: [], certificados: [], firestoreFalso: { falso: true } };
  admin.credential.cert = (conta) => {
    espiao.certificados.push(conta);
    return { conta };
  };
  admin.initializeApp = (opcoes) => {
    espiao.inicializacoes.push(opcoes);
  };
  Object.defineProperty(admin, 'firestore', { value: () => espiao.firestoreFalso, configurable: true, writable: true });
  espiao.restaurar = () => {
    admin.initializeApp = originais.initializeApp;
    delete admin.firestore;
    admin.credential.cert = originais.cert;
  };
  return espiao;
}

test('montarCredencialFirebase usa exclusivamente as 4 variáveis', () => {
  assert.deepEqual(montarCredencialFirebase(ENV_FALSO), {
    projectId: 'projeto-falso',
    clientEmail: 'falso@exemplo.invalid',
    privateKey: 'chave-falsa-linha1\nchave-falsa-linha2',
    privateKeyId: 'id-falso-0000'
  });
});

test('\\n literal vira quebra de linha real e quebra real é preservada', () => {
  const cred = montarCredencialFirebase({ ...ENV_FALSO, FIREBASE_PRIVATE_KEY: 'a\\nb\nc' });
  assert.equal(cred.privateKey, 'a\nb\nc');
});

for (const nome of VARIAVEIS_FIREBASE) {
  test(`${nome} ausente lança erro citando o nome`, () => {
    const env = { ...ENV_FALSO };
    delete env[nome];
    assert.throws(() => validarEnvFirebase(env), (e) => e.message.includes(nome) && /ausentes/.test(e.message));
    assert.throws(() => montarCredencialFirebase(env), new RegExp(nome));
  });

  test(`${nome} vazio ou só com espaços é tratado como ausente`, () => {
    for (const valor of ['', '   ', '\n\t']) {
      assert.throws(() => validarEnvFirebase({ ...ENV_FALSO, [nome]: valor }), new RegExp(nome));
    }
  });
}

test('o erro lista todas as variáveis ausentes de uma vez', () => {
  assert.throws(
    () => validarEnvFirebase({}),
    (e) => VARIAVEIS_FIREBASE.every((nome) => e.message.includes(nome))
  );
});

test('validarEnvFirebase não lança com tudo preenchido', () => {
  assert.doesNotThrow(() => validarEnvFirebase(ENV_FALSO));
});

test('setDb faz getDb devolver o fake sem tocar no firebase-admin; resetDb remove a injeção', () => {
  const espiao = espionarAdmin();
  try {
    const fake = { colecao: true };
    setDb(fake);
    assert.equal(getDb(), fake);
    assert.equal(espiao.inicializacoes.length, 0);
    resetDb();
    comEnv({}, () => assert.throws(() => getDb(), /Variáveis de ambiente ausentes/));
  } finally {
    resetDb();
    espiao.restaurar();
  }
});

test('setDb recusa valor que não é objeto', () => {
  assert.throws(() => setDb(null), TypeError);
  assert.throws(() => setDb('db'), TypeError);
});

test('getDb sem variáveis lança antes de initializeApp', () => {
  resetDb();
  const espiao = espionarAdmin();
  try {
    comEnv({}, () => assert.throws(() => getDb(), /FIREBASE_PROJECT_ID/));
    assert.equal(espiao.inicializacoes.length, 0);
    assert.equal(espiao.certificados.length, 0);
  } finally {
    espiao.restaurar();
  }
});

test('getDb com as 4 variáveis monta o certificado só a partir delas', () => {
  resetDb();
  const espiao = espionarAdmin();
  try {
    const db = comEnv(ENV_FALSO, () => getDb());
    assert.equal(db, espiao.firestoreFalso);
    assert.equal(espiao.inicializacoes.length, 1);
    assert.deepEqual(espiao.certificados, [{
      type: 'service_account',
      project_id: 'projeto-falso',
      private_key_id: 'id-falso-0000',
      private_key: 'chave-falsa-linha1\nchave-falsa-linha2',
      client_email: 'falso@exemplo.invalid'
    }]);
  } finally {
    espiao.restaurar();
  }
});
