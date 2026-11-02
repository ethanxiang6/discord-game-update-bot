require('dotenv').config();
const http = require('node:http');
const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  ChannelType,
  MessageFlags,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const setupCommand = require('./commands/setup');
const gameCommand = require('./commands/game');
const updatesCommand = require('./commands/updates');

const { resolveGame } = require('./services/catalogService');
const {
  checkpointDatabase,
  getGuildSettings,
  setGuildSettings,
  addOrUpdateTrackedGame,
  getTrackedGame
} = require('./database/db');
const {
  fetchGameUpdates,
  seedInitialUpdatesForGame,
  initializeGameForumOnTrack,
  checkAndPostGameUpdates,
  pollAllTrackedGames
} = require('./services/updateTracker');
const {
  buildGameCatalogEmbed,
  buildUpdateNotificationPayload
} = require('./utils/formatter');
const {
  handleTicketMessageCreate,
  handleTicketMessageUpdate,
  inspectAndRegisterTicketChannel,
  isCandidateTicketChannel,
  closeDueTickets
} = require('./services/ticketService');

let client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Prevent unhandled client or promise errors from crashing the bot process
client.on('error', (err) => {
  console.error('[Discord Client Error]', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err?.message || err);
});

client.commands = new Collection();
const commandPayloads = [];
for (const cmd of [setupCommand, gameCommand, updatesCommand]) {
  client.commands.set(cmd.data.name, cmd);
  commandPayloads.push(cmd.data.toJSON());
}

/**
 * Sync slash commands directly to a Guild so updates appear in Discord instantaneously (0-second cache delay).
 */
async function syncCommandsToGuild(guildId) {
  const clientId = process.env.DISCORD_CLIENT_ID || client.user?.id;
  if (!clientId) return;
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commandPayloads
    });
    console.log(`✅ Instant-synced slash commands to server ID: ${guildId}`);
  } catch (err) {
    console.warn(`⚠️ Could not sync guild commands to ${guildId}:`, err.message);
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log('============================================================');
  console.log(`🤖 Logged in as ${readyClient.user.tag}`);
  console.log(`📡 Serving ${readyClient.guilds.cache.size} Discord server(s)`);
  console.log('============================================================');

  // Automatically instant-sync slash commands to all joined servers on startup!
  for (const [guildId] of readyClient.guilds.cache) {
    await syncCommandsToGuild(guildId);
  }

  const intervalMinutes = Math.max(1, Number(process.env.UPDATE_CHECK_INTERVAL_MINUTES) || 10);
  console.log(`⏱️  Automatic game update polling scheduled every ${intervalMinutes} minute(s).`);

  // Initial check 15 seconds after startup
  setTimeout(() => {
    pollAllTrackedGames(client)
      .then(({ checked, posted }) => {
        if (checked > 0) {
          console.log(`[Startup Poll] Checked ${checked} tracked game(s), posted ${posted} new update(s).`);
        }
      })
      .catch((err) => console.error('[Startup Poll Error]', err));
  }, 15_000);

  // Recurring background poll
  setInterval(() => {
    pollAllTrackedGames(client)
      .then(({ checked, posted }) => {
        checkpointDatabase();
        if (posted > 0) {
          console.log(`[Scheduled Poll] Checked ${checked} game(s), posted ${posted} new update(s).`);
        }
      })
      .catch((err) => console.error('[Scheduled Poll Error]', err));
  }, intervalMinutes * 60 * 1000);

  // Auto-close Suggestions tickets 24h after the bot handled them
  setInterval(() => {
    closeDueTickets(client).catch((err) => console.error('[Ticket Auto-Close Error]', err));
  }, 5 * 60 * 1000);
  closeDueTickets(client).catch((err) => console.error('[Ticket Auto-Close Error]', err));

  // If running inside a 24/7 Cloud Workflow Runner (e.g. GitHub Actions),
  // exit gracefully after CLOUD_MAX_RUNTIME_MINUTES so the runner can persist SQLite and spawn the next cycle.
  const maxRuntimeMinutes = Number(process.env.CLOUD_MAX_RUNTIME_MINUTES) || 0;
  if (maxRuntimeMinutes > 0) {
    console.log(`☁️  Cloud Runner Mode: will checkpoint DB and cycle after ${maxRuntimeMinutes} minutes.`);
    setTimeout(async () => {
      console.log('☁️  Reached Cloud Runner cycle time. Checkpointing SQLite database and cycling...');
      checkpointDatabase();
      await client.destroy();
      process.exit(0);
    }, maxRuntimeMinutes * 60 * 1000);
  }
});

// Flush the SQLite write-ahead log when the process is stopped (e.g. a cancelled cloud run)
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    checkpointDatabase();
    process.exit(0);
  });
}

client.on(Events.GuildCreate, async (guild) => {
  await syncCommandsToGuild(guild.id);
});

// Tickety "Suggestions" tickets: scan the creator's first 10 messages for game names and auto-track them
client.on(Events.MessageCreate, async (message) => {
  try {
    await handleTicketMessageCreate(message);
  } catch (err) {
    console.error('[MessageCreate Error]', err.message);
  }
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  try {
    await handleTicketMessageUpdate(oldMessage, newMessage);
  } catch (err) {
    console.error('[MessageUpdate Error]', err.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // 1. Handle Autocomplete
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command && typeof command.autocomplete === 'function') {
        await command.autocomplete(interaction);
      }
      return;
    }

    // 2. Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    // 3. Handle Select Menu from /setup channel (Interactive Forum Picker)
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('setup_select_channel:')) {
      const [, requestedMode] = interaction.customId.split(':');
      const selectedChannelId = interaction.values[0];
      const channel = await interaction.guild.channels.fetch(selectedChannelId).catch(() => null);

      const effectiveMode =
        requestedMode && requestedMode !== 'auto'
          ? requestedMode
          : channel?.type === ChannelType.GuildCategory
            ? 'channel_per_game'
            : 'post_per_game';

      setGuildSettings(interaction.guildId, {
        defaultChannelId: selectedChannelId,
        useForumThreads: true,
        forumMode: effectiveMode
      });

      return interaction.reply({
        content: `✅ **Gaming Updates Forum Configured!**\nSelected <#${selectedChannelId}> (${
          effectiveMode === 'channel_per_game'
            ? 'Creates a new Forum Channel for every game you add'
            : 'Creates a dedicated Forum Post inside the Forum Channel for every game you add'
        }).\nNow run \`/game track\` or \`/game browse\` to add games!`,
        flags: MessageFlags.Ephemeral
      });
    }

    // 4. Handle Select Menu from /game browse
    if (interaction.isStringSelectMenu() && interaction.customId === 'browse_select_game') {
      await interaction.deferReply();
      const selectedGameId = interaction.values[0];
      const game = await resolveGame(selectedGameId);
      if (!game) {
        return interaction.editReply({ content: '❌ Could not load details for that game.' });
      }

      const isTracked = Boolean(getTrackedGame(interaction.guildId, game.id));
      const embed = buildGameCatalogEmbed(game, isTracked);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`track_game:${game.id}`)
          .setLabel(isTracked ? 'Already Tracked' : 'Add Game & Create Updates Forum')
          .setStyle(isTracked ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setEmoji(isTracked ? '✅' : '➕'),
        new ButtonBuilder()
          .setCustomId(`preview_update:${game.id}`)
          .setLabel('Preview Latest Patch Notes')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📜')
      );

      return interaction.editReply({ embeds: [embed], components: [row] });
    }

    // 5. Handle Interactive Buttons
    if (interaction.isButton()) {
      // Button to auto-create a new #gaming-updates Forum Channel for the server
      if (interaction.customId === 'setup_create_forum_channel') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const createdForum = await interaction.guild.channels.create({
            name: 'gaming-updates',
            type: ChannelType.GuildForum,
            topic: '🎮 Official Game Updates, Patch Notes & Changelogs across all Launchers and Consoles',
            availableTags: [
              { name: 'Patch Notes', emoji: { name: '🛠️' } },
              { name: 'Major Update', emoji: { name: '🚀' } },
              { name: 'PC', emoji: { name: '💻' } },
              { name: 'PS5', emoji: { name: '💙' } },
              { name: 'Xbox Series X|S', emoji: { name: '💚' } },
              { name: 'Switch', emoji: { name: '❤️' } }
            ],
            reason: 'Created Gaming Updates Forum Channel via /setup channel'
          });

          setGuildSettings(interaction.guildId, {
            defaultChannelId: createdForum.id,
            useForumThreads: true,
            forumMode: 'post_per_game'
          });

          return interaction.editReply({
            content: `✅ Created <#${createdForum.id}> and set it as your **Gaming Updates Forum**! Every game you add with \`/game track\` will automatically create its own forum inside <#${createdForum.id}>.`
          });
        } catch (err) {
          return interaction.editReply({
            content: `❌ Could not create the Forum Channel (${err.message}). Make sure your server has **Community** enabled in Discord Server Settings (required by Discord for Forum Channels) and the bot has the **Manage Channels** permission.`
          });
        }
      }

      const [action, gameId] = interaction.customId.split(':');
      if (!action || !gameId) return;

      if (action === 'track_game') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const settings = getGuildSettings(interaction.guildId);
        if (!settings.default_channel_id) {
          return interaction.editReply({
            content: '⚠️ **No default updates forum/channel set yet!** Please run `/setup channel` first, or use `/game track` and choose a channel.'
          });
        }

        const game = await resolveGame(gameId);
        if (!game) {
          return interaction.editReply({ content: '❌ Could not find metadata for that game.' });
        }

        const tracked = addOrUpdateTrackedGame(interaction.guildId, game, {
          addedBy: interaction.user.id
        });
        const latestUpdate = await seedInitialUpdatesForGame(interaction.guildId, tracked);
        const forumResult = await initializeGameForumOnTrack(interaction.client, tracked, latestUpdate);
        const destMention = forumResult.destinationMention || `<#${settings.default_channel_id}>`;

        return interaction.editReply({
          content: `✅ **${tracked.game_name}** is now tracked! Created its dedicated forum at ${destMention} and posted its initial info & latest update.`
        });
      }

      if (action === 'preview_update') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const tracked = getTrackedGame(interaction.guildId, gameId);
        const game = tracked || (await resolveGame(gameId));
        if (!game) {
          return interaction.editReply({ content: '❌ Could not find that game.' });
        }

        const updates = await fetchGameUpdates(game, 1);
        if (updates.length === 0) {
          return interaction.editReply({
            content: `📭 No recent patch notes or updates found for **${game.game_name || game.name}**.`
          });
        }

        const payload = buildUpdateNotificationPayload(game, updates[0]);
        return interaction.editReply({
          embeds: payload.embeds,
          components: payload.components
        });
      }

      if (action === 'post_test_update') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const tracked = getTrackedGame(interaction.guildId, gameId);
        if (!tracked) {
          return interaction.editReply({
            content: '⚠️ Track this game first before posting to the updates forum.'
          });
        }

        const settings = getGuildSettings(interaction.guildId);
        const targetCh = tracked.created_forum_channel_id || tracked.thread_id || tracked.target_channel_id || settings.default_channel_id;
        if (!targetCh) {
          return interaction.editReply({
            content: '⚠️ No updates forum is configured! Run `/setup channel` first.'
          });
        }

        const { postedCount, latestUpdate } = await checkAndPostGameUpdates(
          interaction.client,
          tracked,
          { forcePostLatest: true }
        );

        if (postedCount > 0 && latestUpdate) {
          return interaction.editReply({
            content: `✅ Posted **${latestUpdate.title}** for **${tracked.game_name}** to <#${targetCh}>!`
          });
        }

        return interaction.editReply({
          content: `⚠️ Could not post update to <#${targetCh}>. Check bot permissions (\`Manage Channels\`, \`Create Public Threads\`, \`Send Messages in Threads\`, \`Embed Links\`).`
        });
      }
    }
  } catch (err) {
    console.error('[Interaction Error]', err.message || err);
    const errorMsg = {
      content: '❌ An unexpected error occurred while processing that action.',
      flags: MessageFlags.Ephemeral
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(errorMsg).catch(() => null);
    } else if (interaction.isRepliable()) {
      await interaction.reply(errorMsg).catch(() => null);
    }
  }
});

// Optional HTTP Healthcheck Server for Free Cloud Web Hosts (Render.com, Koyeb, Fly.io)
if (process.env.PORT) {
  const port = Number(process.env.PORT) || 3000;
  http
    .createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          bot: client.user ? client.user.tag : 'starting',
          guilds: client.guilds ? client.guilds.cache.size : 0,
          uptimeSeconds: Math.floor(process.uptime())
        })
      );
    })
    .listen(port, '0.0.0.0', () => {
      console.log(`🌐 Cloud Healthcheck Server listening on port ${port}`);
    });
}

// Start the bot if DISCORD_TOKEN is provided
if (!process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN === 'your_discord_bot_token_here') {
  console.error('❌ Missing DISCORD_TOKEN in .env! Copy .env.example to .env and add your Discord Bot Token.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
