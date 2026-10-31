require('dotenv').config();
const { REST, Routes } = require('discord.js');

const setupCommand = require('./commands/setup');
const gameCommand = require('./commands/game');
const updatesCommand = require('./commands/updates');

const commands = [
  setupCommand.data.toJSON(),
  gameCommand.data.toJSON(),
  updatesCommand.data.toJSON()
];

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || token === 'your_discord_bot_token_here') {
  console.error('❌ Please set DISCORD_TOKEN and DISCORD_CLIENT_ID in your .env file before running deploy-commands.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`🔄 Registering ${commands.length} application (/) commands...`);

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands
      });
      console.log(`✅ Successfully registered slash commands to Guild ID: ${guildId} (Instant update!)`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), {
        body: commands
      });
      console.log('✅ Successfully registered global slash commands!');
    }
  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
    process.exit(1);
  }
})();
