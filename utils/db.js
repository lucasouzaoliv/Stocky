const { getDb } = require('./firebase');
const { LIMITES, TIPOS_BAU, ErroValidacao, exigirInteiro, gerarIdItem, validarNomeItem } = require('./validacao');

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

function exigirUsuario(usuario) {
  if (!usuario || typeof usuario.id !== 'string' || usuario.id.trim() === '') {
    throw new ErroValidacao('O usuário responsável pela operação é obrigatório.');
  }
}

function registrarAuditoria(db, tx, { acao, usuario, alvo, antes, depois }) {
  tx.set(db.collection('auditoria').doc(), {
    acao,
    usuarioId: usuario.id,
    usuarioTag: typeof usuario.tag === 'string' ? usuario.tag : '',
    timestamp: new Date().toISOString(),
    alvo,
    antes,
    depois
  });
}

function quantidades(bau) {
  return Object.fromEntries(Object.entries(bau).map(([chave, item]) => [chave, item.quantidade]));
}

async function zerarBau(tipo, usuario) {
  const tipos = tipo === 'ambos' ? [...TIPOS_BAU] : [tipo];
  if (tipo !== 'ambos') exigirTipoBau(tipo);
  exigirUsuario(usuario);

  const db = getDb();
  return await db.runTransaction(async (tx) => {
    const refs = tipos.map((t) => db.collection('bau').doc(t));
    const docs = await Promise.all(refs.map((ref) => tx.get(ref)));
    const antes = {};
    const depois = {};
    tipos.forEach((t, i) => {
      antes[t] = quantidades(docs[i].exists ? docs[i].data() : {});
      depois[t] = {};
      tx.set(refs[i], {});
    });
    registrarAuditoria(db, tx, { acao: 'bau.zerar', usuario, alvo: { tipos }, antes, depois });
    return { sucesso: true, tipos };
  });
}

async function ajustarBauEmMassa(tipo, mudancas, usuario) {
  exigirTipoBau(tipo);
  exigirUsuario(usuario);
  if (!Array.isArray(mudancas) || mudancas.length === 0) {
    return { sucesso: false, motivo: 'Nenhuma mudança informada.', invalidos: [] };
  }
  if (mudancas.length > LIMITES.AJUSTE_LINHAS_MAX) {
    return { sucesso: false, motivo: `Máximo de ${LIMITES.AJUSTE_LINHAS_MAX} linhas por ajuste.`, invalidos: [] };
  }

  const db = getDb();
  const refBau = db.collection('bau').doc(tipo);
  return await db.runTransaction(async (tx) => {
    const [docBau, catalogo] = await Promise.all([tx.get(refBau), lerCatalogoNaTransacao(db, tx)]);
    const bau = docBau.exists ? docBau.data() : {};
    const invalidos = [];
    const vistas = new Set();
    const aplicaveis = [];

    for (const mudanca of mudancas) {
      const { categoriaId, itemId, quantidade } = mudanca || {};
      const recusar = (motivo) => invalidos.push({ categoriaId, itemId, motivo });
      const item = catalogo.dados[categoriaId] && catalogo.dados[categoriaId].items.find((i) => i.id === itemId);
      const chave = `${categoriaId}__${itemId}`;
      if (!item) recusar('Item não encontrado no catálogo.');
      else if (vistas.has(chave)) recusar('Item repetido no ajuste.');
      else if (!Number.isSafeInteger(quantidade) || quantidade < 0 || quantidade > LIMITES.QUANTIDADE_ITEM_MAX) {
        recusar(`Quantidade inválida (0 a ${LIMITES.QUANTIDADE_ITEM_MAX}).`);
      } else aplicaveis.push({ chave, item, categoriaId, quantidade });
      vistas.add(chave);
    }
    if (invalidos.length > 0) {
      return { sucesso: false, motivo: 'Há itens inválidos no ajuste. Nada foi alterado.', invalidos };
    }

    const antes = {};
    const depois = {};
    for (const { chave, item, categoriaId, quantidade } of aplicaveis) {
      const atual = bau[chave] ? bau[chave].quantidade : 0;
      if (atual === quantidade) continue;
      antes[chave] = atual;
      depois[chave] = quantidade;
      if (quantidade === 0) delete bau[chave];
      else if (bau[chave]) bau[chave].quantidade = quantidade;
      else bau[chave] = { nome: item.nome, categoria: catalogo.dados[categoriaId].nome, categoriaId, quantidade };
    }
    const alterados = Object.keys(depois).length;
    if (alterados > 0) {
      tx.set(refBau, bau);
      registrarAuditoria(db, tx, { acao: 'bau.ajuste_massa', usuario, alvo: { tipo }, antes, depois });
    }
    return { sucesso: true, alterados };
  });
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

async function lerCatalogoNaTransacao(db, tx) {
  const ref = db.collection('catalogo').doc('items');
  const doc = await tx.get(ref);
  return { ref, existe: doc.exists, dados: doc.exists ? doc.data() : structuredClone(CATALOGO_PADRAO) };
}

function normalizarNome(nome) {
  return String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function adicionarItemAoCatalogo(categoriaId, nomeItem) {
  exigirTexto(categoriaId, 'id da categoria');
  const validado = validarNomeItem(nomeItem);
  if (!validado.ok) return { sucesso: false, motivo: validado.erro };
  const { nome, id } = validado;

  const db = getDb();
  return await db.runTransaction(async (tx) => {
    const catalogo = await lerCatalogoNaTransacao(db, tx);
    const categoria = catalogo.dados[categoriaId];
    if (!categoria) return { sucesso: false, motivo: 'Categoria não encontrada.' };
    const duplicado = categoria.items.some((i) => (
      i.id === id || gerarIdItem(i.nome) === id || normalizarNome(i.nome) === normalizarNome(nome)
    ));
    if (duplicado) return { sucesso: false, motivo: 'Item já existe nessa categoria.' };
    if (categoria.items.length >= LIMITES.ITENS_POR_CATEGORIA_MAX) {
      return { sucesso: false, motivo: `A categoria já tem o máximo de ${LIMITES.ITENS_POR_CATEGORIA_MAX} itens.` };
    }
    categoria.items.push({ id, nome });
    tx.set(catalogo.ref, catalogo.dados);
    return { sucesso: true, item: { id, nome } };
  });
}

async function removerItemDoCatalogo(categoriaId, itemId, usuario) {
  exigirTexto(categoriaId, 'id da categoria');
  exigirTexto(itemId, 'id do item');
  exigirUsuario(usuario);

  const db = getDb();
  const chave = `${categoriaId}__${itemId}`;
  return await db.runTransaction(async (tx) => {
    const refs = TIPOS_BAU.map((t) => db.collection('bau').doc(t));
    const [catalogo, ...docs] = await Promise.all([lerCatalogoNaTransacao(db, tx), ...refs.map((ref) => tx.get(ref))]);
    const categoria = catalogo.dados[categoriaId];
    if (!categoria) return { sucesso: false, motivo: 'Categoria não encontrada.' };
    const idx = categoria.items.findIndex((i) => i.id === itemId);
    if (idx === -1) return { sucesso: false, motivo: 'Item não encontrado no catálogo.' };

    const [removido] = categoria.items.splice(idx, 1);
    const removidoDe = {};
    TIPOS_BAU.forEach((tipo, i) => {
      const bau = docs[i].exists ? docs[i].data() : {};
      removidoDe[tipo] = bau[chave] ? bau[chave].quantidade : 0;
      if (bau[chave]) {
        delete bau[chave];
        tx.set(refs[i], bau);
      }
    });
    tx.set(catalogo.ref, catalogo.dados);
    registrarAuditoria(db, tx, {
      acao: 'catalogo.remover_item',
      usuario,
      alvo: { categoriaId, itemId, nomeItem: removido.nome },
      antes: { catalogo: { id: removido.id, nome: removido.nome }, ...removidoDe },
      depois: null
    });
    return { sucesso: true, removidoDe };
  });
}

// ─── AUDITORIA ────────────────────────────────────────────────────────────────

async function getAuditoria({ limite = 10 } = {}) {
  exigirInteiro(limite, { min: 1, max: 100, campo: 'limite' });
  const db = getDb();
  const snap = await db.collection('auditoria').orderBy('timestamp', 'desc').limit(limite).get();
  return snap.docs.map((d) => d.data());
}

// ─── PAINÉIS ──────────────────────────────────────────────────────────────────

const CHAVES_PAINEL = Object.freeze({
  INVENTARIO_MEMBROS: 'inventario_membros',
  INVENTARIO_GERENCIA: 'inventario_gerencia',
  SALDO_CAIXA: 'saldo_caixa'
});

function exigirChavePainel(chave) {
  if (!Object.values(CHAVES_PAINEL).includes(chave)) throw new ErroValidacao('Chave de painel inválida.');
}

async function salvarMensagemPainel(chave, canalId, mensagemId) {
  exigirChavePainel(chave);
  exigirTexto(canalId, 'id do canal');
  exigirTexto(mensagemId, 'id da mensagem');
  await getDb().collection('paineis').doc(chave).set({
    canalId, mensagemId, atualizadoEm: new Date().toISOString()
  });
}

async function obterMensagemPainel(chave) {
  exigirChavePainel(chave);
  const doc = await getDb().collection('paineis').doc(chave).get();
  if (!doc.exists) return null;
  const { canalId, mensagemId } = doc.data();
  return { canalId, mensagemId };
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
  adicionarItemAoCatalogo, removerItemDoCatalogo, ajustarBauEmMassa,
  getAuditoria, CHAVES_PAINEL, salvarMensagemPainel, obterMensagemPainel,
  addLog, getLogs
};