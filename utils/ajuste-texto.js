'use strict';

// Texto do ajuste em massa do baú (contrato: docs/architecture.md §4.10). Funções puras, sem I/O.
// Formato: "# Categoria" abre uma seção; cada linha seguinte é "Item:quantidade".
// O nome e a quantidade são separados no ÚLTIMO ":" (assim "Pistola: .50:3" funciona).

const { parseInteiro, LIMITES } = require('./validacao');

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Texto editável do baú: um bloco "# Categoria" por categoria que tem itens no baú.
function gerarTextoAjuste(bau, categorias) {
  const itens = Object.entries(bau || {});
  const blocos = [];
  for (const cat of categorias || []) {
    const doBau = itens.filter(([chave]) => chave.startsWith(`${cat.id}__`));
    if (doBau.length === 0) continue;
    blocos.push([`# ${cat.nome}`, ...doBau.map(([, item]) => `${item.nome}:${item.quantidade}`)].join('\n'));
  }
  return blocos.join('\n\n');
}

function acharCategoria(catalogo, nomeCabecalho) {
  const alvo = normalizar(nomeCabecalho);
  if (!alvo) return null;
  for (const [id, cat] of Object.entries(catalogo || {})) {
    if (normalizar(cat.nome) === alvo || normalizar(id) === alvo) return { id, cat };
  }
  return null;
}

function interpretarAjuste(texto, catalogo) {
  const mudancas = [];
  const erros = [];
  const linhas = String(texto ?? '').split(/\r?\n/);
  const vistas = new Set();
  let atual = null; // { id, cat } | 'invalida' | null
  let uteis = 0;

  for (let idx = 0; idx < linhas.length; idx++) {
    const numero = idx + 1;
    const linha = linhas[idx].trim();
    if (!linha) continue;

    uteis += 1;
    if (uteis > LIMITES.AJUSTE_LINHAS_MAX) {
      erros.push({ numero, linha, motivo: `Máximo de ${LIMITES.AJUSTE_LINHAS_MAX} linhas por ajuste.` });
      return { mudancas: [], erros };
    }

    if (linha.startsWith('#')) {
      const achada = acharCategoria(catalogo, linha.slice(1));
      if (achada) {
        atual = achada;
      } else {
        atual = 'invalida';
        erros.push({ numero, linha, motivo: 'Categoria não encontrada.' });
      }
      continue;
    }
    if (atual === 'invalida') continue; // o erro do cabeçalho já foi registrado

    const corte = linha.lastIndexOf(':');
    if (corte === -1) {
      erros.push({ numero, linha, motivo: 'Use o formato Item:quantidade.' });
      continue;
    }
    const nome = linha.slice(0, corte).trim();
    if (!nome) {
      erros.push({ numero, linha, motivo: 'Nome do item ausente.' });
      continue;
    }
    const qtd = parseInteiro(linha.slice(corte + 1), { min: 0, max: LIMITES.QUANTIDADE_ITEM_MAX });
    if (!qtd.ok) {
      erros.push({ numero, linha, motivo: qtd.erro });
      continue;
    }

    const alvo = normalizar(nome);
    const candidatos = [];
    const categoriasBusca = atual ? [atual] : Object.entries(catalogo || {}).map(([id, cat]) => ({ id, cat }));
    for (const { id, cat } of categoriasBusca) {
      for (const item of cat.items || []) {
        if (normalizar(item.nome) === alvo) candidatos.push({ categoriaId: id, itemId: item.id, nome: item.nome });
      }
    }

    if (candidatos.length === 0) {
      erros.push({ numero, linha, motivo: 'Item não encontrado.' });
    } else if (candidatos.length > 1) {
      erros.push({ numero, linha, motivo: 'Item existe em mais de uma categoria. Coloque um cabeçalho "# Categoria" antes dele.' });
    } else {
      const [achado] = candidatos;
      const chave = `${achado.categoriaId}__${achado.itemId}`;
      if (vistas.has(chave)) {
        erros.push({ numero, linha, motivo: 'Item repetido no ajuste.' });
      } else {
        vistas.add(chave);
        mudancas.push({ ...achado, quantidade: qtd.valor });
      }
    }
  }

  return { mudancas, erros };
}

module.exports = { gerarTextoAjuste, interpretarAjuste, normalizar };
