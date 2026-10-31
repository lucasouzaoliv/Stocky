const { REST, Routes } = require('discord.js');
const { getConfig } = require('./utils/config');
const fs = require('fs');
const path = require('path');

const { token, clientId, guildId } = getConfig();
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`📡 Registrando ${commands.length} comando(s)...`);
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('✅ Comandos registrados com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao registrar comandos:', err);
  }
})();