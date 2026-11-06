const fs = require('fs');
const path = require('path');

const COR_PADRAO = 3447003;
const CAMINHO_CONFIG_JSON = path.join(__dirname, '..', 'config.json');

const MAPA_ENV = [
  ['TOKEN', ['token']],
  ['CLIENT_ID', ['clientId']],
  ['GUILD_ID', ['guildId']],
  ['ROLE_MEMBRO', ['roles', 'membro']],
  ['ROLE_GERENTE', ['roles', 'gerente']],
  ['ROLE_DONO', ['roles', 'dono']],
  ['CH_BAU_MEMBROS', ['channels', 'bauMembros']],
  ['CH_BAU_GERENCIA', ['channels', 'bauGerencia']],
  ['CH_LOG_MEMBROS', ['channels', 'logMembros']],
  ['CH_LOG_GERENCIA', ['channels', 'logGerencia']],
  ['CH_INV_MEMBROS', ['channels', 'inventarioMembros']],
  ['CH_INV_GERENCIA', ['channels', 'inventarioGerencia']],
  ['CH_PAINEL_GERENCIA', ['channels', 'painelGerencia']],
  ['CH_CAIXA', ['channels', 'caixaGangue']],
  ['CH_LOG_CAIXA', ['channels', 'logCaixa']],
  ['CH_SALDO_CAIXA', ['channels', 'saldoCaixa']]
];

const VARIAVEIS_OBRIGATORIAS = MAPA_ENV.map(([nome]) => nome);

class ErroConfig extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroConfig';
  }
}

let configAtual = null;

function valorPreenchido(valor) {
  return typeof valor === 'string' && valor.trim() !== '' && valor.trim() !== 'undefined';
}

function lerCaminho(objeto, caminho) {
  return caminho.reduce((atual, chave) => (atual === null || atual === undefined ? undefined : atual[chave]), objeto);
}

function interpretarCor(valor) {
  if (valor === undefined || valor === null || valor === '') return COR_PADRAO;
  if (typeof valor === 'number') return Number.isSafeInteger(valor) && valor >= 0 ? valor : null;
  const texto = String(valor).trim();
  if (/^\d+$/.test(texto)) return Number(texto);
  const hex = texto.match(/^(?:#|0x)([0-9a-f]{6})$/i);
  return hex ? parseInt(hex[1], 16) : null;
}

function montarConfig(origem) {
  const config = { token: '', clientId: '', guildId: '', channels: {}, roles: {} };
  MAPA_ENV.forEach(([, caminho]) => {
    const valor = lerCaminho(origem, caminho);
    const texto = valorPreenchido(valor) ? valor.trim() : '';
    if (caminho.length === 1) config[caminho[0]] = texto;
    else config[caminho[0]][caminho[1]] = texto;
  });
  return config;
}

function montarConfigDeEnv(env = process.env) {
  const origem = { token: env.TOKEN, clientId: env.CLIENT_ID, guildId: env.GUILD_ID, channels: {}, roles: {} };
  MAPA_ENV.forEach(([nome, caminho]) => {
    if (caminho.length === 2) origem[caminho[0]][caminho[1]] = env[nome];
  });

  const ausentes = MAPA_ENV.filter(([nome]) => !valorPreenchido(env[nome])).map(([nome]) => nome);
  if (ausentes.length > 0) {
    throw new ErroConfig(`Variáveis de ambiente ausentes: ${ausentes.join(', ')}`);
  }

  const cor = interpretarCor(env.COR);
  if (cor === null) throw new ErroConfig('Variável COR inválida: use um número inteiro ou um hexadecimal como #3498db.');

  const config = montarConfig(origem);
  config.cor = cor;
  return config;
}

function validarConfig(config) {
  if (config === null || typeof config !== 'object') {
    throw new ErroConfig('Configuração inválida: esperado um objeto.');
  }

  const ausentes = MAPA_ENV
    .filter(([, caminho]) => !valorPreenchido(lerCaminho(config, caminho)))
    .map(([, caminho]) => caminho.join('.'));
  if (ausentes.length > 0) {
    throw new ErroConfig(`Campos de configuração ausentes: ${ausentes.join(', ')}`);
  }

  const cor = interpretarCor(config.cor);
  if (cor === null) throw new ErroConfig('Campo de configuração inválido: cor');

  const normalizada = montarConfig(config);
  normalizada.cor = cor;
  return normalizada;
}

function lerConfigJson(caminho = CAMINHO_CONFIG_JSON) {
  if (!fs.existsSync(caminho)) return null;
  let bruto;
  try {
    bruto = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  } catch (erro) {
    throw new ErroConfig(`config.json inválido: ${erro.message}`);
  }
  return validarConfig(bruto);
}

function getConfig() {
  if (!configAtual) {
    configAtual = lerConfigJson() || montarConfigDeEnv(process.env);
  }
  return configAtual;
}

function setConfig(config) {
  configAtual = config;
}

function resetConfig() {
  configAtual = null;
}

module.exports = {
  VARIAVEIS_OBRIGATORIAS,
  ErroConfig,
  montarConfigDeEnv,
  validarConfig,
  lerConfigJson,
  getConfig,
  setConfig,
  resetConfig
};
