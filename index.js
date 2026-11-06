const path = require('path');
const { Client, Events, GatewayIntentBits } = require('discord.js');
const { getConfig } = require('./utils/config');
const { carregarHandlers, rotearInteracao, registrarHandlersDeProcesso } = require('./utils/roteador');

const INTENTS = [GatewayIntentBits.Guilds];

function criarCliente() {
  return new Client({ intents: INTENTS });
}

async function iniciar() {
  const config = getConfig();
  const registro = carregarHandlers({
    commandsDir: path.join(__dirname, 'commands'),
    interactionsDir: path.join(__dirname, 'interactions')
  });

  const client = criarCliente();
  client.handlers = registro;

  client.once(Events.ClientReady, () => {
    console.log(`✅ Stocky online como ${client.user.tag}`);
  });
  client.on(Events.InteractionCreate, (interaction) => rotearInteracao(interaction, registro, client));

  registrarHandlersDeProcesso();
  await client.login(config.token);
  return client;
}

if (require.main === module) {
  iniciar().catch((erro) => {
    console.error('❌ Falha ao iniciar o Stocky:', erro);
    process.exitCode = 1;
  });
}

module.exports = { INTENTS, criarCliente, iniciar };
