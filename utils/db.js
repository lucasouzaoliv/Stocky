const { getDb } = require('./firebase');
const { LIMITES, TIPOS_BAU, ErroValidacao, exigirInteiro } = require('./validacao');

const CATALOGO_PADRAO = {
  medicamentos: {
    nome: "Medicamentos", emoji: "💊",
    items: [
      { id: "bandagem", nome: "Bandagem" },
      { id: "gaze", nome: "Gaze" },
      { id: "adrenalina", nome: "Adrenalina" }
    ]
  },
  armas: {
    nome: "Armas", emoji: "🔫",
    items: [
      { id: "colt", nome: "Colt" },
      { id: "usp", nome: "USP" },
      { id: "desert", nome: "Desert Eagle" },
      { id: "ak_47", nome: "AK 47" }
    ]
  },
  coletesemuni: {
    nome: "Coletes e Munição", emoji: "🦺",
    items: [
      { id: "colete", nome: "Colete" },
      { id: "colete_danificado", nome: "Colete Danificado" },
      { id: "muni_9mm", nome: "Munição 9MM" },
      { id: "muni_45acp", nome: "Munição .45 ACP" },
      { id: "muni_50", nome: "Munição .50" },
      { id: "muni_50ae", nome: "Munição .50 AE" }
    ]
  },
  materiais: {
    nome: "Materiais", emoji: "🪛",
    items: [
      { id: "laptop", nome: "Laptop" },
      { id: "caixa_polvora", nome: "Caixa de Pólvora" },
      { id: "sulfato_bario", nome: "Sulfato de Bário" },
      { id: "alcool_gel", nome: "Álcool em Gel" },
      { id: "sabonete", nome: "Sabonete" },
      { id: "pecas_roupas", nome: "Peças de Roupas" },
      { id: "kit_eletronico", nome: "Kit Eletrônico" },
      { id: "cobre", nome: "Cobre" },
      { id: "plastico", nome: "Plástico" },
      { id: "sucata_metal", nome: "Sucata de Metal" },
      { id: "aluminio", nome: "Alumínio" },
      { id: "borracha", nome: "Borracha" }
    ]
  },
  drogas: {
    nome: "Drogas", emoji: "🌿",
    items: [
      { id: "cocaina", nome: "Cocaína" },
      { id: "lsd", nome: "LSD" },
      { id: "meta", nome: "Meta" }
    ]
  },
  extras: {
    nome: "Extras", emoji: "📦",
    items: [
      { id: "fichas_cassino", nome: "Fichas de Cassino" },
      { id: "agulha", nome: "Agulha" },
      { id: "linha", nome: "Linha" },
      { id: "resina", nome: "Resina" },
      { id: "tesoura", nome: "Tesoura" },
      { id: "notas_marcadas", nome: "Notas Marcadas" }
    ]
  }
};

// ─── BAÚ ─────────────────────────────────────────────────────────────────────

function exigirTipoBau(tipo) {
  if (!TIPOS_BAU.includes(tipo)) throw new ErroValidacao('Tipo de baú inválido.');
}

function exigirTexto(valor, campo) {
  if (typeof valor !== 'string' || valor.trim() === '') throw new ErroValidacao(`O ${campo} é obrigatório.`);
}

function exigirQuantidadeItem(quantidade) {
  return exigirInteiro(quantidade, { min: 1, max: LIMITES.QUANTIDADE_ITEM_MAX, campo: 'quantidade' });
}

async function getBau(tipo) {
  exigirTipoBau(tipo);
  const db = getDb();
  const doc = await db.collection('bau').doc(tipo).get();
  return doc.exists ? doc.data() : {};
}

async function adicionarAoBau(tipo, categoriaId, itemId, quantidade, nomeItem, nomeCategoria) {
  exigirTipoBau(tipo);
  exigirTexto(categoriaId, 'id da categoria');
  exigirTexto(itemId, 'id do item');
  exigirQuantidadeItem(quantidade);

  const db = getDb();
  const ref = db.collection('bau').doc(tipo);
  const key = `${categoriaId}__${itemId}`;
  return await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const bau = doc.exists ? doc.data() : {};
    if (!bau[key]) {
      exigirTexto(nomeItem, 'nome do item');
      exigirTexto(nomeCategoria, 'nome da categoria');
      bau[key] = { nome: nomeItem, categoria: nomeCategoria, categoriaId, quantidade: 0 };
    }
    const novaQtd = bau[key].quantidade + quantidade;
    if (!Number.isSafeInteger(novaQtd)) throw new ErroValidacao('O estoque excede o limite suportado.');
    bau[key].quantidade = novaQtd;
    tx.set(ref, bau);
    return novaQtd;
  });
}

async function removerDoBau(tipo, categoriaId, itemId, quantidade) {
  exigirTipoBau(tipo);
  exigirTexto(categoriaId, 'id da categoria');
  exigirTexto(itemId, 'id do item');
  exigirQuantidadeItem(quantidade);

  const db = getDb();
  const ref = db.collection('bau').doc(tipo);
  const key = `${categoriaId}__${itemId}`;
  return await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const bau = doc.exists ? doc.data() : {};
    if (!bau[key]) return { sucesso: false, motivo: 'Item não encontrado no baú.' };
    if (bau[key].quantidade < quantidade) {
      return { sucesso: false, motivo: `Estoque insuficiente. Disponível: **${bau[key].quantidade}**` };
    }
    const novaQtd = bau[key].quantidade - quantidade;
    if (novaQtd === 0) delete bau[key];
    else bau[key].quantidade = novaQtd;
    tx.set(ref, bau);
    return { sucesso: true, novaQtd };
  });
}

async function zerarBau(tipo) {
  const db = getDb();
  await db.collection('bau').doc(tipo).set({});
}

// ─── CATÁLOGO ─────────────────────────────────────────────────────────────────

async function getCatalogo() {
  const db = getDb();
  const doc = await db.collection('catalogo').doc('items').get();
  if (!doc.exists) {
    await db.collection('catalogo').doc('items').set(CATALOGO_PADRAO);
    return CATALOGO_PADRAO;
  }
  return doc.data();
}

async function getCategorias() {
  const catalogo = await getCatalogo();
  return Object.entries(catalogo).map(([id, cat]) => ({ id, nome: cat.nome, emoji: cat.emoji }));
}

async function getItensDaCategoria(categoriaId) {
  const catalogo = await getCatalogo();
  return catalogo[categoriaId] ? catalogo[categoriaId].items : [];
}

async function adicionarItemAoCatalogo(categoriaId, itemId, nomeItem) {
  const db = getDb();
  const catalogo = await getCatalogo();
  if (!catalogo[categoriaId]) return { sucesso: false, motivo: 'Categoria não encontrada.' };
  const jaExiste = catalogo[categoriaId].items.find(i => i.id === itemId);
  if (jaExiste) return { sucesso: false, motivo: 'Item já existe nessa categoria.' };
  catalogo[categoriaId].items.push({ id: itemId, nome: nomeItem });
  await db.collection('catalogo').doc('items').set(catalogo);
  return { sucesso: true };
}

async function removerItemDoCatalogo(categoriaId, itemId) {
  const db = getDb();
  const catalogo = await getCatalogo();
  if (!catalogo[categoriaId]) return { sucesso: false, motivo: 'Categoria não encontrada.' };
  const idx = catalogo[categoriaId].items.findIndex(i => i.id === itemId);
  if (idx === -1) return { sucesso: false, motivo: 'Item não encontrado no catálogo.' };
  catalogo[categoriaId].items.splice(idx, 1);
  await db.collection('catalogo').doc('items').set(catalogo);
  return { sucesso: true };
}

// ─── LOGS ─────────────────────────────────────────────────────────────────────

async function addLog(tipo, entrada) {
  const db = getDb();
  await db.collection('logs').doc(tipo).collection('entradas').add({
    ...entrada,
    timestamp: new Date().toISOString()
  });
}

async function getLogs(tipo) {
  const db = getDb();
  const snap = await db.collection('logs').doc(tipo).collection('entradas')
    .orderBy('timestamp', 'desc').limit(10).get();
  return snap.docs.map(d => d.data());
}

module.exports = {
  getBau, adicionarAoBau, removerDoBau, zerarBau,
  getCatalogo, getCategorias, getItensDaCategoria,
  adicionarItemAoCatalogo, removerItemDoCatalogo,
  addLog, getLogs
};