const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const {
  searchGames,
  browseGames,
  resolveGame,
  LAUNCHERS,
  CONSOLES
} = require('../services/catalogService');
const {
  getGuildSettings,
  addOrUpdateTrackedGame,
  getTrackedGame,
  getTrackedGamesByGuild,
  removeTrackedGame
} = require('../database/db');
const {
  seedInitialUpdatesForGame,
  initializeGameForumOnTrack
} = require('../services/updateTracker');
const { buildGameCatalogEmbed } = require('../utils/formatter');
const { formatLauncherBadges, formatConsoleBadges } = require('../data/platformsAndGames');

const launcherChoices = Object.values(LAUNCHERS).map((l) => ({
  name: `${l.emoji} ${l.name}`,
  value: l.id
}));

const consoleChoices = Object.values(CONSOLES).map((c) => ({
  name: `${c.emoji} ${c.name}`,
  value: c.id
}));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('game')
    .setDescription('Search, browse, and track games across all portals, launchers, and consoles')
    .addSubcommand((sub) =>
      sub
        .setName('search')
        .setDescription('Search the universal catalog across all launchers (Steam, Epic, Riot, Battle.net) and consoles')
        .addStringOption((opt) =>
          opt
            .setName('query')
            .setDescription('Game name to search for (supports autocomplete!)')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('launcher')
            .setDescription('Optional: Filter by game portal / launcher')
            .addChoices(...launcherChoices)
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('console')
            .setDescription('Optional: Filter by console / platform')
            .addChoices(...consoleChoices)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('browse')
        .setDescription('Browse popular games by Portal/Launcher or Console with 1-click tracking')
        .addStringOption((opt) =>
          opt
            .setName('launcher')
            .setDescription('Filter by Portal / Launcher (Steam, Epic, Battle.net, Riot, EA, Ubisoft, GOG, HoYoPlay)')
            .addChoices(...launcherChoices)
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('console')
            .setDescription('Filter by Console (PS5, PS4, Xbox Series X|S, Xbox One, Nintendo Switch, PC, Mobile)')
            .addChoices(...consoleChoices)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('track')
        .setDescription('Add a game to create its dedicated forum & track all updates and patch notes')
        .addStringOption((opt) =>
          opt
            .setName('game')
            .setDescription('Game name or Steam AppID (type to autocomplete from all platforms!)')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Optional: Specific Forum/Category/Channel for this game (defaults to server updates forum)')
            .setRequired(false)
        )
        .addRoleOption((opt) =>
          opt
            .setName('ping_role')
            .setDescription('Optional: Role to @mention when a new update drops for this game')
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('patches_only')
            .setDescription('Optional: Only post actual patch notes, hotfixes, and major updates?')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('custom_feed_url')
            .setDescription('Optional: Custom RSS/Atom feed URL for this game')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('untrack')
        .setDescription('Stop tracking updates for a game in this server')
        .addStringOption((opt) =>
          opt
            .setName('game')
            .setDescription('Select the tracked game to remove')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List all games currently tracked for updates and their dedicated forums')
    ),

  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused() || '';

    if (sub === 'untrack') {
      const tracked = getTrackedGamesByGuild(interaction.guildId);
      const filtered = tracked
        .filter((g) => g.game_name.toLowerCase().includes(focused.toLowerCase()))
        .slice(0, 25);

      return interaction
        .respond(
          filtered.map((g) => ({
            name: `${g.game_name} (${g.game_id})`.slice(0, 100),
            value: g.game_id
          }))
        )
        .catch(() => null);
    }

    const launcherFilter = interaction.options.getString('launcher');
    const consoleFilter = interaction.options.getString('console');

    const results = await searchGames(focused, {
      launcher: launcherFilter,
      console: consoleFilter,
      limit: 15,
      timeoutMs: 1400
    });

    return interaction
      .respond(
        results.slice(0, 25).map((g) => {
          const platLabels = (g.consoles || [])
            .slice(0, 3)
            .map((c) => CONSOLES[c]?.shortName || c)
            .join('/');
          const launchLabels = (g.launchers || [])
            .slice(0, 2)
            .map((l) => LAUNCHERS[l]?.name || l)
            .join(', ');
          const suffix = [launchLabels, platLabels].filter(Boolean).join(' • ');
          const display = suffix ? `${g.name} [${suffix}]` : g.name;
          return {
            name: display.slice(0, 100),
            value: String(g.id).slice(0, 100)
          };
        })
      )
      .catch(() => null);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'search') {
      await interaction.deferReply();
      const query = interaction.options.getString('query', true);
      const launcher = interaction.options.getString('launcher');
      const consolePlatform = interaction.options.getString('console');

      let game = await resolveGame(query);
      if (!game) {
        const list = await searchGames(query, { launcher, console: consolePlatform, limit: 5 });
        game = list[0] || null;
      }

      if (!game) {
        return interaction.editReply({
          content: `❌ No games matched \`${query}\`. Try a broader search or use \`/game track\` with a custom game name.`
        });
      }

      const trackedRecord = getTrackedGame(guildId, game.id);
      const embed = buildGameCatalogEmbed(game, Boolean(trackedRecord));

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`track_game:${game.id}`)
          .setLabel(trackedRecord ? 'Already Tracked (Open Forum)' : 'Add Game & Create Updates Forum')
          .setStyle(trackedRecord ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setEmoji(trackedRecord ? '✅' : '➕'),
        new ButtonBuilder()
          .setCustomId(`preview_update:${game.id}`)
          .setLabel('Preview Latest Patch Notes')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📜')
      );

      return interaction.editReply({
        embeds: [embed],
        components: [row]
      });
    }

    if (sub === 'browse') {
      const launcher = interaction.options.getString('launcher');
      const consolePlatform = interaction.options.getString('console');

      const games = browseGames({ launcher, console: consolePlatform, limit: 25 });
      if (games.length === 0) {
        return interaction.reply({
          content: 'No curated games matched that exact filter combination. Try `/game search` to search 500,000+ titles across all platforms!',
          flags: MessageFlags.Ephemeral
        });
      }

      const filterTitleParts = [];
      if (launcher && LAUNCHERS[launcher]) {
        filterTitleParts.push(`${LAUNCHERS[launcher].emoji} ${LAUNCHERS[launcher].name}`);
      }
      if (consolePlatform && CONSOLES[consolePlatform]) {
        filterTitleParts.push(`${CONSOLES[consolePlatform].emoji} ${CONSOLES[consolePlatform].name}`);
      }
      const filterTitle = filterTitleParts.length > 0 ? filterTitleParts.join(' + ') : 'All Portals, Launchers & Consoles';

      const lines = games.slice(0, 15).map((g, idx) => {
        const lBadges = (g.launchers || []).map((id) => LAUNCHERS[id]?.emoji || '').join('');
        const cBadges = (g.consoles || []).map((id) => CONSOLES[id]?.emoji || '').join('');
        return `**${idx + 1}. ${g.name}** ${lBadges} ${cBadges}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🗂️ Game Catalog Browser — ${filterTitle}`)
        .setDescription(
          `Select any game from the menu below to inspect its platforms, preview its latest patch notes, or create its dedicated forum in your updates channel!\n\n${lines.join('\n')}`
        )
        .setFooter({
          text: 'Looking for another title? Use /game search <name> to search 100,000+ Steam, Console & Launcher games!'
        });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('browse_select_game')
        .setPlaceholder('🎮 Choose a game to inspect or track...')
        .addOptions(
          games.slice(0, 25).map((g) => ({
            label: g.name.slice(0, 100),
            description: `${(g.genres || []).slice(0, 2).join(', ') || 'Game'} • ${(g.consoles || []).map((c) => CONSOLES[c]?.shortName || c).join(', ')}`.slice(0, 100),
            value: g.id
          }))
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);
      return interaction.reply({ embeds: [embed], components: [row] });
    }

    if (sub === 'track') {
      await interaction.deferReply();
      const gameQuery = interaction.options.getString('game', true);
      const overrideChannel = interaction.options.getChannel('channel');
      const pingRole = interaction.options.getRole('ping_role');
      const patchesOnly = interaction.options.getBoolean('patches_only');
      const customFeedUrl = interaction.options.getString('custom_feed_url');

      const settings = getGuildSettings(guildId);
      const effectiveChannelId = overrideChannel?.id || settings.default_channel_id;

      if (!effectiveChannelId) {
        return interaction.editReply({
          content: '⚠️ **No updates forum/channel configured yet!** Please either run `/setup channel #your-updates-forum` first, or specify the `channel:` option when running `/game track`.'
        });
      }

      const game = await resolveGame(gameQuery);
      if (!game) {
        return interaction.editReply({
          content: `❌ Could not resolve a game matching \`${gameQuery}\`.`
        });
      }

      const tracked = addOrUpdateTrackedGame(guildId, game, {
        targetChannelId: overrideChannel ? overrideChannel.id : undefined,
        pingRoleId: pingRole ? pingRole.id : undefined,
        patchesOnly: patchesOnly !== null ? patchesOnly : undefined,
        feedUrl: customFeedUrl || undefined,
        addedBy: interaction.user.id
      });

      // Seed existing updates and get the latest update to include in the newly created forum!
      const latestUpdate = await seedInitialUpdatesForGame(guildId, tracked);

      // Immediately create the dedicated Forum Post (inside the Forum Channel) OR dedicated Forum Channel for this game!
      const forumResult = await initializeGameForumOnTrack(interaction.client, tracked, latestUpdate);
      const destinationMention = forumResult.destinationMention || `<#${effectiveChannelId}>`;

      const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle(`✅ Forum Created & Tracking Active: ${tracked.game_name}`)
        .setDescription(
          `Created dedicated updates forum ${destinationMention} for **${tracked.game_name}**! All updates and patch notes for this game will be posted there automatically.`
        )
        .addFields(
          {
            name: '🗂️ Dedicated Game Forum',
            value: destinationMention,
            inline: true
          },
          {
            name: '🔔 Role Mention',
            value: tracked.ping_role_id ? `<@&${tracked.ping_role_id}>` : 'None',
            inline: true
          },
          {
            name: '🛠️ Filter Mode',
            value: tracked.patches_only ? 'Patch Notes & Major Updates Only' : 'All Official Game Updates',
            inline: true
          },
          {
            name: '🚀 Portals / Launchers',
            value: formatLauncherBadges(tracked.launchers),
            inline: true
          },
          {
            name: '🎮 Consoles / Platforms',
            value: formatConsoleBadges(tracked.consoles),
            inline: true
          },
          {
            name: '📰 Latest Update Posted to Forum',
            value: latestUpdate
              ? `[${latestUpdate.title.slice(0, 90)}](${latestUpdate.url})`
              : 'Monitoring feed for upcoming updates...',
            inline: false
          }
        )
        .setFooter({ text: `Game ID: ${tracked.game_id}` });

      if (tracked.cover_image && tracked.cover_image.startsWith('http')) {
        embed.setThumbnail(tracked.cover_image);
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`preview_update:${tracked.game_id}`)
          .setLabel('Preview Latest Update Here')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📜'),
        new ButtonBuilder()
          .setCustomId(`post_test_update:${tracked.game_id}`)
          .setLabel('Post Latest Update to Forum Again')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📤')
      );

      return interaction.editReply({ embeds: [embed], components: [row] });
    }

    if (sub === 'untrack') {
      const gameQuery = interaction.options.getString('game', true);
      const removed = removeTrackedGame(guildId, gameQuery);

      if (!removed) {
        return interaction.reply({
          content: `⚠️ Could not find a tracked game matching \`${gameQuery}\` in this server. Use \`/game list\` to see active games.`,
          flags: MessageFlags.Ephemeral
        });
      }

      return interaction.reply({
        content: `🗑️ Stopped tracking updates for \`${gameQuery}\` in this server.`
      });
    }

    if (sub === 'list') {
      const tracked = getTrackedGamesByGuild(guildId);
      const settings = getGuildSettings(guildId);

      if (tracked.length === 0) {
        return interaction.reply({
          content: '📭 **No games are currently tracked in this server.**\nUse `/game track`, `/game search`, or `/game browse` to add games and create their dedicated update forums!'
        });
      }

      const lines = tracked.map((g, i) => {
        const forumOrThreadId = g.created_forum_channel_id || g.thread_id || g.target_channel_id || settings.default_channel_id;
        const chMention = forumOrThreadId ? `<#${forumOrThreadId}>` : '*(No forum set)*';
        const roleMention = g.ping_role_id ? ` • 🔔 <@&${g.ping_role_id}>` : '';
        const filterTag = g.patches_only ? ' • `Patches Only`' : '';
        const lastUp = g.last_update_at ? ` • Last update: <t:${g.last_update_at}:R>` : '';
        return `**${i + 1}. ${g.game_name}** (\`${g.game_id}\`)\n   ↳ 🗂️ Forum: ${chMention}${roleMention}${filterTag}${lastUp}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📋 Tracked Games & Forums in ${interaction.guild?.name || 'Server'} (${tracked.length})`)
        .setDescription(lines.join('\n\n').slice(0, 4000))
        .setFooter({
          text: 'Use /updates check to poll now, or /game untrack <game> to remove a game.'
        });

      return interaction.reply({ embeds: [embed] });
    }
  }
};
