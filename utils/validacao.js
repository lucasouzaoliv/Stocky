const LIMITES = Object.freeze({
  QUANTIDADE_ITEM_MAX: 100000,
  VALOR_CAIXA_MAX: 1000000000,
  NOME_ITEM_MAX: 50,
  ID_ITEM_MAX: 50,
  ITENS_POR_CATEGORIA_MAX: 25,
  ANOTACAO_MAX: 100,
  AJUSTE_LINHAS_MAX: 200
});

const TIPOS_BAU = Object.freeze(['membros', 'gerencia']);
const TIPOS_CAIXA = Object.freeze(['sujo', 'limpo']);

const MAX_DIGITOS = 15;
const ERRO_FORMATO = 'Digite apenas números inteiros, sem pontos, vírgulas ou sinais.';

class ErroValidacao extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroValidacao';
  }
}

function formatarNumero(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function erroLimite(max) {
  return `Valor acima do limite (máx. ${formatarNumero(max)}).`;
}

function parseInteiro(texto, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof texto !== 'string') return { ok: false, erro: ERRO_FORMATO };
  const limpo = texto.trim();
  if (!/^\d+$/.test(limpo)) return { ok: false, erro: ERRO_FORMATO };
  if (limpo.length > MAX_DIGITOS) return { ok: false, erro: erroLimite(max) };

  const valor = Number(limpo);
  if (valor < min) return { ok: false, erro: `O valor mínimo é ${formatarNumero(min)}.` };
  if (valor > max) return { ok: false, erro: erroLimite(max) };
  return { ok: true, valor };
}

function parseInteiroPositivo(texto, { max } = {}) {
  return parseInteiro(texto, { min: 1, max });
}

function exigirInteiro(valor, { min = 1, max = Number.MAX_SAFE_INTEGER, campo = 'valor' } = {}) {
  if (!Number.isSafeInteger(valor)) {
    throw new ErroValidacao(`O ${campo} precisa ser um número inteiro.`);
  }
  if (valor < min) throw new ErroValidacao(`O ${campo} mínimo é ${formatarNumero(min)}.`);
  if (valor > max) throw new ErroValidacao(`O ${campo} está acima do limite (máx. ${formatarNumero(max)}).`);
  return valor;
}

function gerarIdItem(nome) {
  return String(nome ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, LIMITES.ID_ITEM_MAX)
    .replace(/_$/, '');
}

function validarNomeItem(nome) {
  if (typeof nome !== 'string') return { ok: false, erro: 'Informe o nome do item.' };
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (!limpo) return { ok: false, erro: 'Informe o nome do item.' };
  if (limpo.length > LIMITES.NOME_ITEM_MAX) {
    return { ok: false, erro: `O nome do item pode ter no máximo ${LIMITES.NOME_ITEM_MAX} caracteres.` };
  }
  const id = gerarIdItem(limpo);
  if (!id) return { ok: false, erro: 'O nome do item precisa ter ao menos uma letra ou número.' };
  return { ok: true, nome: limpo, id };
}

module.exports = {
  LIMITES,
  TIPOS_BAU,
  TIPOS_CAIXA,
  ErroValidacao,
  parseInteiro,
  parseInteiroPositivo,
  exigirInteiro,
  gerarIdItem,
  validarNomeItem
};
