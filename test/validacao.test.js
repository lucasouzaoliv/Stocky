const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LIMITES,
  TIPOS_BAU,
  TIPOS_CAIXA,
  ErroValidacao,
  parseInteiro,
  parseInteiroPositivo,
  exigirInteiro,
  gerarIdItem,
  validarNomeItem
} = require('../utils/validacao');

const ERRO_FORMATO = 'Digite apenas números inteiros, sem pontos, vírgulas ou sinais.';

test('LIMITES tem os valores decididos e está congelado', () => {
  assert.deepEqual(LIMITES, {
    QUANTIDADE_ITEM_MAX: 100000,
    VALOR_CAIXA_MAX: 1000000000,
    NOME_ITEM_MAX: 50,
    ID_ITEM_MAX: 50,
    ITENS_POR_CATEGORIA_MAX: 25,
    ANOTACAO_MAX: 100,
    AJUSTE_LINHAS_MAX: 200
  });
  assert.ok(Object.isFrozen(LIMITES));
  assert.ok(Object.isFrozen(TIPOS_BAU));
  assert.ok(Object.isFrozen(TIPOS_CAIXA));
  assert.deepEqual([...TIPOS_BAU], ['membros', 'gerencia']);
  assert.deepEqual([...TIPOS_CAIXA], ['sujo', 'limpo']);
});

test('aceita números válidos, com espaços nas pontas e zeros à esquerda', () => {
  assert.deepEqual(parseInteiroPositivo('10'), { ok: true, valor: 10 });
  assert.deepEqual(parseInteiroPositivo(' 10 '), { ok: true, valor: 10 });
  assert.deepEqual(parseInteiroPositivo('\t42\n'), { ok: true, valor: 42 });
  assert.deepEqual(parseInteiroPositivo('007'), { ok: true, valor: 7 });
});

test('rejeita entradas mal formadas com a mensagem de formato', () => {
  const invalidos = ['10abc', '-50', '1.5', '1,5', '1.000,50', '', '   ', 'abc', '1e3', '+5', '10 0', '١٢', '１２', null, undefined, 10, {}, []];
  for (const entrada of invalidos) {
    assert.deepEqual(parseInteiroPositivo(entrada), { ok: false, erro: ERRO_FORMATO }, `entrada: ${String(entrada)}`);
  }
});

test('zero é recusado com mínimo 1 e aceito com min 0', () => {
  assert.deepEqual(parseInteiroPositivo('0'), { ok: false, erro: 'O valor mínimo é 1.' });
  assert.deepEqual(parseInteiro('0', { min: 0 }), { ok: true, valor: 0 });
  assert.deepEqual(parseInteiro('5', { min: 10 }), { ok: false, erro: 'O valor mínimo é 10.' });
  assert.deepEqual(parseInteiro('-0', { min: 0 }), { ok: false, erro: ERRO_FORMATO });
});

test('máximo exato é aceito e máximo + 1 é "acima do limite"', () => {
  const max = LIMITES.QUANTIDADE_ITEM_MAX;
  assert.deepEqual(parseInteiroPositivo('100000', { max }), { ok: true, valor: 100000 });
  assert.deepEqual(parseInteiroPositivo('100001', { max }), { ok: false, erro: 'Valor acima do limite (máx. 100.000).' });
  assert.deepEqual(parseInteiroPositivo('1000000001', { max: LIMITES.VALOR_CAIXA_MAX }), {
    ok: false,
    erro: 'Valor acima do limite (máx. 1.000.000.000).'
  });
  assert.deepEqual(parseInteiroPositivo('1000000000', { max: LIMITES.VALOR_CAIXA_MAX }), { ok: true, valor: 1000000000 });
});

test('valores acima de Number.MAX_SAFE_INTEGER são inválidos', () => {
  for (const texto of ['9007199254740992', '9999999999999999', '99999999999999999999', '0000000000000000001']) {
    const r = parseInteiroPositivo(texto);
    assert.equal(r.ok, false, texto);
    assert.match(r.erro, /acima do limite/);
  }
});

test('sem max informado, 15 dígitos ainda é aceito', () => {
  assert.deepEqual(parseInteiroPositivo('999999999999999'), { ok: true, valor: 999999999999999 });
});

test('exigirInteiro devolve o número ou lança ErroValidacao', () => {
  assert.equal(exigirInteiro(5, { campo: 'quantidade', max: 10 }), 5);
  assert.equal(exigirInteiro(0, { min: 0 }), 0);
  for (const invalido of [0, -1, 1.5, NaN, Infinity, '5', null, undefined, 100001, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => exigirInteiro(invalido, { max: LIMITES.QUANTIDADE_ITEM_MAX, campo: 'quantidade' }),
      (e) => e instanceof ErroValidacao && e.name === 'ErroValidacao' && e.message.includes('quantidade'),
      `valor: ${String(invalido)}`
    );
  }
});

test('ErroValidacao é um Error com name próprio', () => {
  const e = new ErroValidacao('texto');
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'ErroValidacao');
  assert.equal(e.message, 'texto');
});

test('gerarIdItem normaliza acentos, símbolos e tamanho', () => {
  assert.equal(gerarIdItem('Pistola 9mm'), 'pistola_9mm');
  assert.equal(gerarIdItem('pistola-9mm'), 'pistola_9mm');
  assert.equal(gerarIdItem('Munição Calibre .50'), 'municao_calibre_50');
  assert.equal(gerarIdItem('  Café / Água  '), 'cafe_agua');
  assert.equal(gerarIdItem('!!!'), '');
  assert.equal(gerarIdItem(''), '');
  assert.equal(gerarIdItem('a/b\\c'), 'a_b_c');
  assert.equal(gerarIdItem('x'.repeat(80)).length, LIMITES.ID_ITEM_MAX);
  assert.doesNotMatch(gerarIdItem('ab '.repeat(30)), /_$/);
});

test('validarNomeItem aceita nome válido e devolve nome limpo e id', () => {
  assert.deepEqual(validarNomeItem('  Pistola   9mm '), { ok: true, nome: 'Pistola 9mm', id: 'pistola_9mm' });
  assert.deepEqual(validarNomeItem('Água'), { ok: true, nome: 'Água', id: 'agua' });
  assert.equal(validarNomeItem('x'.repeat(50)).ok, true);
});

test('validarNomeItem recusa vazio, só símbolos, tipo errado e 51 caracteres', () => {
  for (const nome of ['', '   ', '!!!', '///', null, undefined, 5]) {
    assert.equal(validarNomeItem(nome).ok, false, `nome: ${String(nome)}`);
  }
  const longo = validarNomeItem('x'.repeat(51));
  assert.equal(longo.ok, false);
  assert.match(longo.erro, /50/);
  assert.match(validarNomeItem('!!!').erro, /letra ou número/);
});

test('id gerado nunca é vazio nem contém barra para nomes aceitos', () => {
  for (const nome of ['a/b', 'Item #1', 'ÁÉÍ', '9']) {
    const r = validarNomeItem(nome);
    assert.equal(r.ok, true, nome);
    assert.ok(r.id.length > 0);
    assert.doesNotMatch(r.id, /\//);
  }
});
