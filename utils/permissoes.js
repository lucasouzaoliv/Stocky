const { MessageFlags } = require('discord.js');
const { getConfig } = require('./config');

const NIVEIS = Object.freeze({ membro: 1, gerente: 2, dono: 3 });

const MENSAGENS = Object.freeze({
  dm: '❌ Use este comando dentro do servidor.',
  sem_cargo: '❌ Você não tem permissão para isso.',
  config_ausente: '❌ Cargos do bot não configurados. Avise a administração.'
});

function lerCargos() {
  try {
    return getConfig().roles || {};
  } catch {
    return {};
  }
}

function possuiCargo(member, idCargo) {
  if (typeof idCargo !== 'string' || idCargo.trim() === '') return false;
  const roles = member.roles;
  if (Array.isArray(roles)) return roles.includes(idCargo);
  if (roles && roles.cache && typeof roles.cache.has === 'function') return roles.cache.has(idCargo);
  return false;
}

function getNivel(member) {
  if (!member) return 0;
  const cargos = lerCargos();
  if (possuiCargo(member, cargos.dono)) return NIVEIS.dono;
  if (possuiCargo(member, cargos.gerente)) return NIVEIS.gerente;
  if (possuiCargo(member, cargos.membro)) return NIVEIS.membro;
  return 0;
}

function negado(motivo) {
  return { permitido: false, motivo, mensagem: MENSAGENS[motivo] };
}

function verificarPermissao(interaction, nivel) {
  if (!Object.prototype.hasOwnProperty.call(NIVEIS, nivel)) return negado('sem_cargo');
  if (!interaction.inGuild()) return negado('dm');
  const cargos = lerCargos();
  if (typeof cargos[nivel] !== 'string' || cargos[nivel].trim() === '') return negado('config_ausente');
  if (getNivel(interaction.member) < NIVEIS[nivel]) return negado('sem_cargo');
  return { permitido: true };
}

async function negarAcesso(interaction, resultado) {
  const payload = { content: resultado.mensagem, flags: MessageFlags.Ephemeral };
  try {
    if (!interaction.replied && !interaction.deferred) await interaction.reply(payload);
    else await interaction.followUp(payload);
  } catch (erro) {
    console.error('Falha ao responder negação de acesso:', erro);
  }
}

async function exigirNivel(interaction, nivel) {
  const resultado = verificarPermissao(interaction, nivel);
  if (resultado.permitido) return true;
  await negarAcesso(interaction, resultado);
  return false;
}

function podeUsarBau(member) {
  return getNivel(member) >= NIVEIS.membro;
}

function podeUsarBauGerencia(member) {
  return getNivel(member) >= NIVEIS.gerente;
}

function podeVerLogs(member) {
  return getNivel(member) >= NIVEIS.gerente;
}

function podeGerenciarCatalogo(member) {
  return getNivel(member) >= NIVEIS.gerente;
}

function podeZerarBau(member) {
  return getNivel(member) >= NIVEIS.gerente;
}

function getNomeNivel(member) {
  const n = getNivel(member);
  if (n === NIVEIS.dono) return '👑 El Diablo';
  if (n === NIVEIS.gerente) return '⭐ Consejero';
  if (n === NIVEIS.membro) return '🔵 Membro';
  return '❌ Sem acesso';
}

module.exports = {
  NIVEIS,
  MENSAGENS,
  getNivel,
  verificarPermissao,
  negarAcesso,
  exigirNivel,
  podeUsarBau,
  podeUsarBauGerencia,
  podeVerLogs,
  podeGerenciarCatalogo,
  podeZerarBau,
  getNomeNivel
};
