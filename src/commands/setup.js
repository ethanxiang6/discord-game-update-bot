const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { getGuildSettings, setGuildSettings, getTrackedGamesByGuild } = require('../database/db');
const { LAUNCHERS, CONSOLES } = require('../data/platformsAndGames');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the Game Update Tracker Forum Channel and server preferences')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set the Forum Channel (or Category) where game updates are organized')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Select your Gaming Updates Forum Channel or Category (or leave blank to pick from a list!)')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('forum_mode')
            .setDescription('How should the bot create a forum for each tracked game?')
            .addChoices(
              {
                name: '🗂️ Create a dedicated Forum Post inside the Forum Channel for each game (Recommended)',
                value: 'post_per_game'
              },
              {
                name: '📁 Create a separate Forum Channel (#game-updates) per game in the category',
                value: 'channel_per_game'
              }
            )
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('patches_only_default')
            .setDescription('By default, only post actual patch notes / major updates (skip general fluff)?')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) => {
      sub
        .setName('pingroles')
        .setDescription('Set the roles pinged when a Game Suggestions ticket has no detectable game');
      for (let i = 1; i <= 5; i++) {
        sub.addRoleOption((opt) =>
          opt.setName(`role${i}`).setDescription(`Moderator role #${i} to ping`).setRequired(false)
        );
      }
      sub.addBooleanOption((opt) =>
        opt.setName('clear').setDescription('Remove all ping roles').setRequired(false)
      );
      return sub;
    })
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('View the current server configuration, catalog portals, and tracker status')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel', false);
      const chosenForumMode = interaction.options.getString('forum_mode');
      const patchesOnly = interaction.options.getBoolean('patches_only_default');

      // If the user didn't pass a channel (or couldn't see it in the slash option),
      // scan the server's channels and show an interactive selector + "Create Forum Channel" button!
      if (!channel) {
        const allChannels = await interaction.guild.channels.fetch().catch(() => null);
        const candidates = [];

        if (allChannels) {
          for (const [, ch] of allChannels) {
            if (!ch) continue;
            if (
              ch.type === ChannelType.GuildForum ||
              ch.type === ChannelType.GuildCategory ||
              ch.type === ChannelType.GuildText ||
              ch.type === ChannelType.GuildAnnouncement
            ) {
              candidates.push(ch);
            }
          }
        }

        // Prioritize Forum channels and channels with "game" or "update" in their name
        candidates.sort((a, b) => {
          const aScore =
            (a.type === ChannelType.GuildForum ? 10 : a.type === ChannelType.GuildCategory ? 5 : 1) +
            (/game|gaming|update|patch/i.test(a.name) ? 8 : 0);
          const bScore =
            (b.type === ChannelType.GuildForum ? 10 : b.type === ChannelType.GuildCategory ? 5 : 1) +
            (/game|gaming|update|patch/i.test(b.name) ? 8 : 0);
          return bScore - aScore;
        });

        const components = [];
        if (candidates.length > 0) {
          const select = new StringSelectMenuBuilder()
            .setCustomId(`setup_select_channel:${chosenForumMode || 'auto'}`)
            .setPlaceholder('🗂️ Select your Gaming Updates Forum or Category...')
            .addOptions(
              candidates.slice(0, 25).map((ch) => {
                const typeLabel =
                  ch.type === ChannelType.GuildForum
                    ? '🗂️ Forum Channel'
                    : ch.type === ChannelType.GuildCategory
                      ? '📁 Category (Creates Forum per game)'
                      : '💬 Text Channel';
                return {
                  label: `${ch.name}`.slice(0, 100),
                  description: `${typeLabel} (ID: ${ch.id})`.slice(0, 100),
                  value: ch.id
                };
              })
            );
          components.push(new ActionRowBuilder().addComponents(select));
        }

        const btnRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('setup_create_forum_channel')
            .setLabel('Create a New #gaming-updates Forum Channel For Me')
            .setStyle(ButtonStyle.Success)
            .setEmoji('➕')
        );
        components.push(btnRow);

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🗂️ Select or Create Your Gaming Updates Forum')
          .setDescription(
            [
              'Choose your **Forum Channel** or **Category** from the dropdown below, OR click the green button to have the bot create one for you!',
              '',
              '> 💡 **Why didn\'t my Forum Channel show up?**',
              '> If your Forum Channel is **Private** (restricted to specific roles), Discord hides it from the bot until you either:',
              '> 1. Edit the Forum Channel → **Permissions** → Add the Bot (or its Role) with **View Channel**, **Manage Channels**, **Create Posts**, and **Send Messages in Posts**, OR',
              '> 2. Give the Bot role **Administrator** permission in Server Settings → Roles.'
            ].join('\n')
          );

        return interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
      }

      const effectiveForumMode =
        chosenForumMode ||
        (channel.type === ChannelType.GuildCategory ? 'channel_per_game' : 'post_per_game');

      const updated = setGuildSettings(guildId, {
        defaultChannelId: channel.id,
        useForumThreads: true,
        forumMode: effectiveForumMode,
        patchesOnlyDefault: patchesOnly ?? undefined
      });

      const modeDescription =
        updated.forum_mode === 'channel_per_game'
          ? '📁 **Dedicated Forum Channel Per Game** — Every game you add will create its own `<game>-updates` Forum Channel, and all updates for that game will be posted in that forum!'
          : '🗂️ **Dedicated Forum Post Per Game** — Every game you add will immediately create a dedicated Forum Post inside <#' +
            updated.default_channel_id +
            '> and put all of that game\'s updates inside it!';

      const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('✅ Game Updates Forum Configured')
        .setDescription(modeDescription)
        .addFields(
          {
            name: '📺 Target Forum / Category',
            value: `<#${updated.default_channel_id}>`,
            inline: true
          },
          {
            name: '🗂️ Forum Organization Mode',
            value:
              updated.forum_mode === 'channel_per_game'
                ? 'Separate Forum Channel per Game'
                : 'Forum Post per Game inside Forum Channel',
            inline: true
          },
          {
            name: '🛠️ Filter Mode',
            value: updated.patches_only_default ? 'Patch Notes & Major Updates Only' : 'All Official Game Updates',
            inline: true
          }
        )
        .setFooter({ text: 'Tip: Use /game track or /game browse to add a game and automatically create its forum!' });

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'pingroles') {
      const clear = interaction.options.getBoolean('clear');
      const roleIds = [];
      for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role && !roleIds.includes(role.id)) roleIds.push(role.id);
      }

      if (!clear && roleIds.length === 0) {
        const current = getGuildSettings(guildId).ping_role_ids;
        return interaction.reply({
          content: current.length
            ? `Current ping roles: ${current.map((id) => `<@&${id}>`).join(' ')}
Pick \`role1\`–\`role5\` to replace them, or set \`clear\` to remove them.`
            : 'No ping roles set. Pick `role1`–`role5` to set them.',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] }
        });
      }

      const updated = setGuildSettings(guildId, { pingRoleIds: clear ? [] : roleIds });
      return interaction.reply({
        content: updated.ping_role_ids.length
          ? `✅ Ping roles set: ${updated.ping_role_ids.map((id) => `<@&${id}>`).join(' ')}. They're pinged when a Game Suggestions ticket has no detectable game.`
          : '✅ Ping roles cleared. No one will be pinged.',
        allowedMentions: { parse: [] }
      });
    }

    if (sub === 'status') {
      const settings = getGuildSettings(guildId);
      const tracked = getTrackedGamesByGuild(guildId);
      const interval = process.env.UPDATE_CHECK_INTERVAL_MINUTES || 10;

      const launcherList = Object.values(LAUNCHERS)
        .map((l) => `${l.emoji} ${l.name}`)
        .join(' • ');
      const consoleList = Object.values(CONSOLES)
        .map((c) => `${c.emoji} ${c.shortName}`)
        .join(' • ');

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📡 Game Update Tracker — Server Status')
        .addFields(
          {
            name: '📺 Configured Updates Forum / Channel',
            value: settings.default_channel_id
              ? `<#${settings.default_channel_id}>`
              : '⚠️ Not configured yet — run `/setup channel`!',
            inline: true
          },
          {
            name: '🎮 Tracked Games',
            value: `**${tracked.length}** active game(s)`,
            inline: true
          },
          {
            name: '🔔 Ticket Ping Roles',
            value: settings.ping_role_ids.length
              ? settings.ping_role_ids.map((id) => `<@&${id}>`).join(' ')
              : 'None — run `/setup pingroles`',
            inline: true
          },
          {
            name: '⏱️ Polling Interval',
            value: `Every **${interval} minutes**`,
            inline: true
          },
          {
            name: '🗂️ Forum Mode',
            value:
              settings.forum_mode === 'channel_per_game'
                ? 'Separate Forum Channel per Game'
                : 'Dedicated Forum Post per Game',
            inline: true
          },
          {
            name: '🛠️ Default Filter',
            value: settings.patches_only_default ? 'Patches & Major Updates Only' : 'All Official Updates',
            inline: true
          },
          {
            name: '🔌 Connected Catalog Sources',
            value: [
              '✅ Steam Store & Steam News API',
              '✅ Curated Cross-Platform & Console Exclusive Registry',
              '✅ Wikidata Multi-Console Fallback',
              process.env.RAWG_API_KEY ? '✅ RAWG Database API (Active)' : '⚪ RAWG API (Optional key in `.env`)',
              process.env.TWITCH_CLIENT_ID ? '✅ IGDB / Twitch API (Active)' : '⚪ IGDB API (Optional key in `.env`)'
            ].join('\n'),
            inline: false
          },
          {
            name: '🚀 Supported Portals & Launchers',
            value: launcherList,
            inline: false
          },
          {
            name: '🕹️ Supported Consoles & Platforms',
            value: consoleList,
            inline: false
          }
        );

      return interaction.reply({ embeds: [embed] });
    }
  }
};
