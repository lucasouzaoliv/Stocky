const { getDb } = require('./firebase');
const { LIMITES, TIPOS_CAIXA, ErroValidacao, exigirInteiro } = require('./validacao');

function refSaldo(db) {
  return db.collection('caixa').doc('saldo');
}

function normalizarSaldo(dados) {
  const lido = dados || {};
  return {
    sujo: Number.isSafeInteger(lido.sujo) ? lido.sujo : 0,
    limpo: Number.isSafeInteger(lido.limpo) ? lido.limpo : 0
  };
}

function exigirOperacao(tipo, valor) {
  if (!TIPOS_CAIXA.includes(tipo)) throw new ErroValidacao('Tipo de caixa inválido.');
  exigirInteiro(valor, { min: 1, max: LIMITES.VALOR_CAIXA_MAX, campo: 'valor' });
}

async function getSaldo() {
  const doc = await refSaldo(getDb()).get();
  return normalizarSaldo(doc.exists ? doc.data() : null);
}

async function adicionarCaixa(tipo, valor) {
  exigirOperacao(tipo, valor);
  const db = getDb();
  const ref = refSaldo(db);
  return await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const saldo = normalizarSaldo(doc.exists ? doc.data() : null);
    const novo = saldo[tipo] + valor;
    if (!Number.isSafeInteger(novo)) throw new ErroValidacao('O saldo excede o limite suportado.');
    saldo[tipo] = novo;
    tx.set(ref, saldo);
    return saldo;
  });
}

async function retirarCaixa(tipo, valor) {
  exigirOperacao(tipo, valor);
  const db = getDb();
  const ref = refSaldo(db);
  return await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const saldo = normalizarSaldo(doc.exists ? doc.data() : null);
    if (saldo[tipo] < valor) {
      return { sucesso: false, motivo: `Saldo insuficiente. Disponível: **$${saldo[tipo].toLocaleString('pt-BR')}**` };
    }
    saldo[tipo] -= valor;
    tx.set(ref, saldo);
    return { sucesso: true, saldo };
  });
}

async function addLogCaixa(entrada) {
  const db = getDb();
  await db.collection('caixa').doc('logs').collection('entradas').add({
    ...entrada,
    timestamp: new Date().toISOString()
  });
}

async function getLogsCaixa() {
  const db = getDb();
  const snap = await db.collection('caixa').doc('logs').collection('entradas')
    .orderBy('timestamp', 'desc').limit(10).get();
  return snap.docs.map(d => d.data());
}

module.exports = { getSaldo, adicionarCaixa, retirarCaixa, addLogCaixa, getLogsCaixa };
