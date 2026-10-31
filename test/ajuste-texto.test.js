'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { gerarTextoAjuste, interpretarAjuste } = require('../utils/ajuste-texto');
const { LIMITES } = require('../utils/validacao');

const CATALOGO = {
  armas: { nome: 'Armas', emoji: '🔫', items: [{ id: 'colt', nome: 'Colt' }, { id: 'pistola_50', nome: 'Pistola: .50' }, { id: 'kit', nome: 'Kit' }] },
  medicamentos: { nome: 'Medicamentos', emoji: '💊', items: [{ id: 'gaze', nome: 'Gaze' }, { id: 'kit', nome: 'Kit' }] }
};

test('separa nome e quantidade no último ":" (nome com ":")', () => {
  const r = interpretarAjuste('# Armas\nPistola: .50:3', CATALOGO);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.mudancas, [{ categoriaId: 'armas', itemId: 'pistola_50', nome: 'Pistola: .50', quantidade: 3 }]);
});

test('mesmo nome em duas categorias: cada um vai para a sua, com cabeçalhos', () => {
  const r = interpretarAjuste('# Armas\nKit:1\n\n# medicamentos\nKit:2', CATALOGO);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.mudancas.map((m) => [m.categoriaId, m.itemId, m.quantidade]), [['armas', 'kit', 1], ['medicamentos', 'kit', 2]]);
});

test('cabeçalho casa nome ou id, sem caixa nem acento', () => {
  const catalogo = { armas_leves: { nome: 'Armás Léves', items: [{ id: 'a', nome: 'A' }] } };
  for (const cab of ['# armas leves', '#ARMÁS LÉVES', '# armas_leves']) {
    const r = interpretarAjuste(`${cab}\nA:1`, catalogo);
    assert.deepEqual(r.erros, [], cab);
    assert.equal(r.mudancas.length, 1);
  }
});

test('sem cabeçalho e nome ambíguo: erro pedindo o cabeçalho; nome único é achado em qualquer categoria', () => {
  const r = interpretarAjuste('Kit:1\nGaze:2', CATALOGO);
  assert.equal(r.erros.length, 1);
  assert.equal(r.erros[0].numero, 1);
  assert.match(r.erros[0].motivo, /cabeçalho/);
  assert.deepEqual(r.mudancas.map((m) => m.itemId), ['gaze']);
});

test('erros trazem número e texto da linha: quantidade inválida, sem ":", cabeçalho desconhecido', () => {
  const r = interpretarAjuste('# Armas\nColt:10abc\nColt\n# Inexistente\nGaze:1\n# Medicamentos\nGaze:-1', CATALOGO);
  assert.deepEqual(r.erros.map((e) => e.numero), [2, 3, 4, 7]);
  assert.equal(r.erros[0].linha, 'Colt:10abc');
  assert.match(r.erros[1].motivo, /Item:quantidade/);
  assert.match(r.erros[2].motivo, /Categoria não encontrada/);
  assert.deepEqual(r.mudancas, []);
});

test('linhas sob cabeçalho desconhecido não geram erros em cascata', () => {
  const r = interpretarAjuste('# Nada\nColt:1\nGaze:2', CATALOGO);
  assert.equal(r.erros.length, 1);
});

test('item que não existe na categoria corrente é erro mesmo existindo em outra', () => {
  const r = interpretarAjuste('# Armas\nGaze:1', CATALOGO);
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0].motivo, /Item não encontrado/);
});

test('quantidade 0 é aceita (remove); acima do limite e item repetido são erros', () => {
  const ok = interpretarAjuste('# Armas\nColt:0', CATALOGO);
  assert.equal(ok.mudancas[0].quantidade, 0);
  const alto = interpretarAjuste(`# Armas\nColt:${LIMITES.QUANTIDADE_ITEM_MAX + 1}`, CATALOGO);
  assert.match(alto.erros[0].motivo, /acima do limite/);
  const rep = interpretarAjuste('# Armas\nColt:1\ncolt:2', CATALOGO);
  assert.equal(rep.erros.length, 1);
  assert.match(rep.erros[0].motivo, /repetido/);
});

test('mais de AJUSTE_LINHAS_MAX linhas úteis: erro e nenhuma mudança', () => {
  const linhas = Array.from({ length: LIMITES.AJUSTE_LINHAS_MAX + 1 }, () => 'Colt:1');
  const r = interpretarAjuste(['# Armas', ...linhas].join('\n'), CATALOGO);
  assert.deepEqual(r.mudancas, []);
  assert.ok(r.erros.some((e) => /Máximo de 200/.test(e.motivo)));
});

test('aceita CRLF e linhas em branco; texto vazio não gera nada', () => {
  assert.deepEqual(interpretarAjuste('# Armas\r\n\r\nColt:2\r\n', CATALOGO).mudancas.length, 1);
  assert.deepEqual(interpretarAjuste('', CATALOGO), { mudancas: [], erros: [] });
});

test('gerarTextoAjuste: baú vazio é ""; ida e volta preserva itens e quantidades', () => {
  const categorias = [{ id: 'armas', nome: 'Armas' }, { id: 'medicamentos', nome: 'Medicamentos' }];
  assert.equal(gerarTextoAjuste({}, categorias), '');
  const bau = {
    armas__pistola_50: { nome: 'Pistola: .50', quantidade: 4 },
    armas__kit: { nome: 'Kit', quantidade: 1 },
    medicamentos__kit: { nome: 'Kit', quantidade: 7 }
  };
  const texto = gerarTextoAjuste(bau, categorias);
  assert.match(texto, /^# Armas\nPistola: \.50:4\nKit:1\n\n# Medicamentos\nKit:7$/);
  const r = interpretarAjuste(texto, CATALOGO);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(
    r.mudancas.map((m) => [`${m.categoriaId}__${m.itemId}`, m.quantidade]).sort(),
    [['armas__kit', 1], ['armas__pistola_50', 4], ['medicamentos__kit', 7]]
  );
});
