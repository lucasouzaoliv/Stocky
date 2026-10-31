const { setConfig } = require('../../utils/config');

const CONFIG_TESTE = Object.freeze({
  token: 'token-falso-de-teste',
  clientId: 'client-teste',
  guildId: 'guild-teste',
  channels: Object.freeze({
    bauMembros: 'c-bau-membros',
    bauGerencia: 'c-bau-gerencia',
    logMembros: 'c-log-membros',
    logGerencia: 'c-log-gerencia',
    inventarioMembros: 'c-inv-membros',
    inventarioGerencia: 'c-inv-gerencia',
    painelGerencia: 'c-painel-gerencia',
    caixaGangue: 'c-caixa',
    logCaixa: 'c-log-caixa',
    saldoCaixa: 'c-saldo-caixa'
  }),
  roles: Object.freeze({
    membro: 'r-membro',
    gerente: 'r-gerente',
    dono: 'r-dono'
  }),
  cor: 3447003
});

function usarConfigTeste() {
  setConfig(CONFIG_TESTE);
  return CONFIG_TESTE;
}

module.exports = { CONFIG_TESTE, usarConfigTeste };
