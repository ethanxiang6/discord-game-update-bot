const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { searchGames, resolveGame, CONSOLES, LAUNCHERS } = require('../services/catalogService');
const { getTrackedGame, getTrackedGamesByGuild, getGuildSettings } = require('../database/db');
const {
  fetchGameUpdates,
  checkAndPostGameUpdates,
  pollGuildTrackedGames,
  resendAllUpdates
} = require('../services/updateTracker');
const { buildUpdateNotificationPayload } = require('../utils/formatter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updates')
    .setDescription('View latest patch notes, force an update check, or test channel notifications')
    .addSubcommand((sub) =>
      sub
        .setName('latest')
        .setDescription('Fetch and display the latest formatted update / patch notes for any game')
        .addStringOption((opt) =>
          opt
            .setName('game')
            .setDescription('Game name or ID (supports autocomplete across all launchers and consoles!)')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Force an immediate check for new updates across all tracked games in this server')
    )
    .addSubcommand((sub) =>
      sub
        .setName('resend')
        .setDescription('Delete all update posts the bot made and re-send every past update in English (Manage Server)')
        .addBooleanOption((opt) =>
          opt
            .setName('confirm')
            .setDescription('Set to True to confirm: this DELETES the bot\'s existing update posts first')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('game')
            .setDescription('Only redo this tracked game (leave empty for all tracked games)')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Post the latest update for a tracked game into your updates channel right now')
        .addStringOption((opt) =>
          opt
            .setName('game')
            .setDescription('Select a tracked game to test')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused() || '';

    if (sub === 'test' || sub === 'resend') {
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

    const results = await searchGames(focused, { limit: 15, timeoutMs: 1400 });
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

    if (sub === 'resend') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '❌ You need the **Manage Server** permission to use this.',
          flags: MessageFlags.Ephemeral
        });
      }
      if (!interaction.options.getBoolean('confirm', true)) {
        return interaction.reply({
          content: 'Nothing was changed. Run it again with `confirm: True` to delete the bot\'s update posts and re-send them in English.',
          flags: MessageFlags.Ephemeral
        });
      }

      const gameId = interaction.options.getString('game');
      if (gameId && !getTrackedGame(guildId, gameId)) {
        return interaction.reply({
          content: '❌ That game isn\'t tracked in this server.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const lines = [];
      const summary = await resendAllUpdates(interaction.client, guildId, {
        gameId,
        onProgress: async (line) => {
          lines.push(line);
          await interaction
            .editReply({ content: `🔄 Re-sending updates...\n${lines.slice(-15).join('\n')}`.slice(0, 1900) })
            .catch(() => null);
        }
      });

      return interaction
        .editReply({
          content: [
            `✅ Done. Redid **${summary.games}** game(s): deleted **${summary.deleted}** old post(s) and re-sent **${summary.resent}** update(s) in English.`,
            summary.skipped.length ? `Skipped (nothing available from the feed, or an error): ${summary.skipped.join(', ')}` : '',
            'Note: only updates still available in each game\'s feed can be re-sent.'
          ]
            .filter(Boolean)
            .join('\n')
            .slice(0, 1900)
        })
        .catch(() => null);
    }

    if (sub === 'latest') {
      await interaction.deferReply();
      const gameQuery = interaction.options.getString('game', true);
      const tracked = getTrackedGame(guildId, gameQuery);
      const game = tracked || (await resolveGame(gameQuery));

      if (!game) {
        return interaction.editReply({
          content: `❌ Could not find a game matching \`${gameQuery}\`.`
        });
      }

      const updates = await fetchGameUpdates(game, 1);
      if (updates.length === 0) {
        return interaction.editReply({
          content: `📭 No recent update or patch note entries were found for **${game.game_name || game.name}**.`
        });
      }

      const payload = buildUpdateNotificationPayload(game, updates[0]);
      return interaction.editReply({
        embeds: payload.embeds,
        components: payload.components
      });
    }

    if (sub === 'check') {
      await interaction.deferReply();
      const tracked = getTrackedGamesByGuild(guildId);
      if (tracked.length === 0) {
        return interaction.editReply({
          content: '📭 No games are currently tracked in this server. Use `/game track` or `/game browse` first!'
        });
      }

      const { checked, posted } = await pollGuildTrackedGames(interaction.client, guildId);
      return interaction.editReply({
        content: `✅ **Update check complete!** Checked **${checked}** tracked game(s) and posted **${posted}** new update(s).`
      });
    }

    if (sub === 'test') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const gameId = interaction.options.getString('game', true);
      const tracked = getTrackedGame(guildId, gameId);
      if (!tracked) {
        return interaction.editReply({
          content: `❌ Game \`${gameId}\` is not currently tracked in this server. Track it first with \`/game track\`!`
        });
      }

      const settings = getGuildSettings(guildId);
      const targetCh = tracked.created_forum_channel_id || tracked.thread_id || tracked.target_channel_id || settings.default_channel_id;
      if (!targetCh) {
        return interaction.editReply({
          content: '⚠️ No updates channel is configured! Run `/setup channel` first.'
        });
      }

      const { postedCount, latestUpdate } = await checkAndPostGameUpdates(
        interaction.client,
        tracked,
        { forcePostLatest: true }
      );

      if (postedCount > 0 && latestUpdate) {
        return interaction.editReply({
          content: `✅ Successfully posted the latest update (**${latestUpdate.title}**) for **${tracked.game_name}** into <#${targetCh}>!`
        });
      }

      return interaction.editReply({
        content: `⚠️ Could not post update for **${tracked.game_name}** to <#${targetCh}>. Make sure the bot has \`View Channel\`, \`Send Messages\`, and \`Embed Links\` permissions in that channel.`
      });
    }
  }
};
