const admin = require('firebase-admin');

const VARIAVEIS_FIREBASE = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_PRIVATE_KEY_ID'
];

let dbInjetado = null;

function validarEnvFirebase(env = process.env) {
  const ausentes = VARIAVEIS_FIREBASE.filter((nome) => {
    const valor = env[nome];
    return typeof valor !== 'string' || valor.trim() === '';
  });
  if (ausentes.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${ausentes.join(', ')}`);
  }
}

function montarCredencialFirebase(env = process.env) {
  validarEnvFirebase(env);
  return {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    privateKeyId: env.FIREBASE_PRIVATE_KEY_ID
  };
}

function getDb() {
  if (dbInjetado) return dbInjetado;

  if (!admin.apps.length) {
    const credencial = montarCredencialFirebase(process.env);
    admin.initializeApp({
      credential: admin.credential.cert({
        type: 'service_account',
        project_id: credencial.projectId,
        private_key_id: credencial.privateKeyId,
        private_key: credencial.privateKey,
        client_email: credencial.clientEmail
      })
    });
  }
  return admin.firestore();
}

function setDb(db) {
  if (!db || typeof db !== 'object') throw new TypeError('setDb exige um objeto Firestore.');
  dbInjetado = db;
}

function resetDb() {
  dbInjetado = null;
}

module.exports = {
  VARIAVEIS_FIREBASE,
  validarEnvFirebase,
  montarCredencialFirebase,
  getDb,
  setDb,
  resetDb
};
