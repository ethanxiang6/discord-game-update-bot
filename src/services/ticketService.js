const { EmbedBuilder, OverwriteType } = require('discord.js');
const {
  getGuildSettings,
  addOrUpdateTrackedGame,
  getTrackedGame,
  getTrackedGamesByGuild,
  getSuggestionTicket,
  upsertSuggestionTicket,
  incrementTicketMessageCount,
  recordGameAddedToTicket,
  markTicketNoGameNotified,
  scheduleTicketClose,
  getDueTicketCloses,
  removeSuggestionTicket
} = require('../database/db');
const {
  seedInitialUpdatesForGame,
  initializeGameForumOnTrack
} = require('./updateTracker');
const { detectGameFromMessage, normalizeCoreGameTitle } = require('./gameDetector');
const { formatLauncherBadges, formatConsoleBadges } = require('../data/platformsAndGames');

// Known Tickety Bot ID + case-insensitive name matcher
const TICKETY_BOT_ID = '718493970652594217';
const SUGGESTION_KEYWORD_REGEX = /\bsuggestions?\b/i;
const MAX_CREATOR_MESSAGES_TO_SCAN = 10;
const TICKET_AUTO_CLOSE_DELAY_SECONDS = 24 * 60 * 60;

// Channels younger than this are treated as possible tickets even if their name doesn't say "ticket"
const RECENT_CHANNEL_WINDOW_MS = 6 * 60 * 60 * 1000;
const UNKNOWN_CHANNEL_RECHECK_MS = 60 * 1000;
const lastUnknownChannelCheck = new Map();

// Per-channel lock to avoid race conditions when rapid messages arrive
const channelProcessingLocks = new Map();

/**
 * Check if a Discord user/author is Tickety (or a ticket bot).
 */
function isTicketyBot(user) {
  if (!user) return false;
  if (user.id === TICKETY_BOT_ID) return true;
  const uname = (user.username || user.tag || '').toLowerCase();
  return uname.includes('tickety') || uname.includes('ticket');
}

/**
 * Check if a channel looks like a ticket channel (by name, parent category, or topic).
 */
function isCandidateTicketChannel(channel) {
  if (!channel) return false;
  const name = (channel.name || '').toLowerCase();
  const topic = (channel.topic || '').toLowerCase();
  const parentName = (channel.parent?.name || '').toLowerCase();

  if (
    name.includes('ticket') ||
    name.includes('suggest') ||
    parentName.includes('ticket') ||
    parentName.includes('suggest') ||
    topic.includes('ticket') ||
    topic.includes('tickety')
  ) {
    return true;
  }
  return false;
}

/**
 * Tickety lets admins name ticket channels anything, so also consider recently created text channels
 * (rate-limited per channel) as possible tickets.
 */
function isPossibleTicketChannel(channel) {
  if (isCandidateTicketChannel(channel)) return true;
  if (!channel?.createdTimestamp || Date.now() - channel.createdTimestamp > RECENT_CHANNEL_WINDOW_MS) return false;
  const last = lastUnknownChannelCheck.get(channel.id) || 0;
  if (Date.now() - last < UNKNOWN_CHANNEL_RECHECK_MS) return false;
  lastUnknownChannelCheck.set(channel.id, Date.now());
  return true;
}

/**
 * Extract all searchable text from a message (content, embeds, components) to check for "Suggestions" option.
 */
function extractAllMessageText(msg) {
  if (!msg) return '';
  const parts = [];

  if (msg.content) parts.push(msg.content);

  if (Array.isArray(msg.embeds)) {
    for (const emb of msg.embeds) {
      if (emb.title) parts.push(emb.title);
      if (emb.description) parts.push(emb.description);
      if (emb.author?.name) parts.push(emb.author.name);
      if (emb.footer?.text) parts.push(emb.footer.text);
      if (Array.isArray(emb.fields)) {
        for (const f of emb.fields) {
          if (f.name) parts.push(f.name);
          if (f.value) parts.push(f.value);
        }
      }
    }
  }

  if (Array.isArray(msg.components)) {
    for (const row of msg.components) {
      const comps = row.components || [];
      for (const c of comps) {
        if (c.label) parts.push(c.label);
        if (c.placeholder) parts.push(c.placeholder);
      }
    }
  }

  return parts.join('\n');
}

/**
 * Identify the user ID of the person who created the ticket from:
 * 1. Mentions or <@userId> inside Tickety's initial message / embeds
 * 2. Member-specific permission overwrites on the ticket channel (Tickety grants ViewChannel to the creator)
 * 3. User ID inside the channel topic
 */
function extractTicketCreatorId(channel, botMessages = [], clientUserId = null) {
  // 1. Check Tickety's messages for mentioned human users or <@id> in embeds/content
  for (const msg of botMessages) {
    if (msg.mentions?.users?.size > 0) {
      for (const [uid, user] of msg.mentions.users) {
        if (!user.bot && uid !== clientUserId) {
          return uid;
        }
      }
    }

    const fullText = extractAllMessageText(msg);
    const mentionMatches = [...fullText.matchAll(/<@!?(\d{17,20})>/g)];
    for (const m of mentionMatches) {
      const uid = m[1];
      if (uid && uid !== TICKETY_BOT_ID && uid !== clientUserId) {
        return uid;
      }
    }
  }

  // 2. Check channel Member permission overwrites (type === OverwriteType.Member / 1)
  if (channel?.permissionOverwrites?.cache) {
    for (const [id, overwrite] of channel.permissionOverwrites.cache) {
      if (overwrite.type === OverwriteType.Member || overwrite.type === 1) {
        if (id !== TICKETY_BOT_ID && id !== clientUserId) {
          const member = channel.guild?.members?.cache?.get(id);
          if (!member || !member.user?.bot) {
            return id;
          }
        }
      }
    }
  }

  // 3. Check channel topic for a 17-20 digit snowflake ID
  if (channel?.topic) {
    const topicMatch = channel.topic.match(/\b(\d{17,20})\b/);
    if (topicMatch && topicMatch[1] !== TICKETY_BOT_ID && topicMatch[1] !== clientUserId) {
      return topicMatch[1];
    }
  }

  return null;
}

/**
 * Inspect a channel and its opening messages to determine if it is a Tickety ticket
 * created with the "Suggestions" option selected in the form.
 */
async function inspectAndRegisterTicketChannel(channel, incomingMessage = null) {
  if (!channel || !channel.guildId) return null;

  const existing = getSuggestionTicket(channel.id);

  // Check channel name and topic first
  const chanName = (channel.name || '').toLowerCase();
  const chanTopic = (channel.topic || '').toLowerCase();
  let hasSuggestionMarker =
    SUGGESTION_KEYWORD_REGEX.test(chanName) ||
    chanName.startsWith('suggest') ||
    SUGGESTION_KEYWORD_REGEX.test(chanTopic);

  const botMessages = [];

  // If the incoming message is from Tickety/bot, inspect it directly
  if (incomingMessage && incomingMessage.author?.bot) {
    let msgToInspect = incomingMessage;
    if (!msgToInspect.content && (!msgToInspect.embeds || msgToInspect.embeds.length === 0)) {
      msgToInspect = await channel.messages.fetch(incomingMessage.id, { force: true }).catch(() => incomingMessage);
    }
    botMessages.push(msgToInspect);
  }

  // Fetch recent messages in the ticket channel (up to 15) to inspect Tickety's opening embed(s)
  try {
    const fetched = await channel.messages.fetch({ limit: 15 });
    for (const [, m] of fetched) {
      if (m.author?.bot) {
        botMessages.push(m);
      }
    }
  } catch {
    // Ignore fetch error if permissions are restricted
  }

  for (const bMsg of botMessages) {
    const text = extractAllMessageText(bMsg);
    if (SUGGESTION_KEYWORD_REGEX.test(text)) {
      hasSuggestionMarker = true;
      break;
    }
  }

  const creatorId =
    existing?.creator_id ||
    extractTicketCreatorId(channel, botMessages, channel.client?.user?.id) ||
    (!incomingMessage?.author?.bot ? incomingMessage?.author?.id : null);

  if (hasSuggestionMarker || existing?.is_suggestion_ticket) {
    return upsertSuggestionTicket(channel.id, {
      guildId: channel.guildId,
      creatorId,
      isSuggestionTicket: true,
      messagesProcessed: existing?.messages_processed || 0,
      gamesAdded: existing?.games_added || []
    });
  }

  return existing || null;
}

/**
 * Tickety edits its opening message after posting it (adds the mentions / form answers),
 * so re-inspect the channel when a bot message is edited.
 */
async function handleTicketMessageUpdate(_oldMessage, newMessage) {
  let msg = newMessage;
  if (msg.partial) msg = await msg.fetch().catch(() => null);
  if (!msg || !msg.guildId || !msg.author?.bot) return;
  await handleTicketMessageCreate(msg);
}

function scheduleCloseIfUnset(channelId) {
  const t = getSuggestionTicket(channelId);
  if (t && !t.close_at) {
    scheduleTicketClose(channelId, Math.floor(Date.now() / 1000) + TICKET_AUTO_CLOSE_DELAY_SECONDS);
  }
}

/**
 * Close (delete) every ticket the bot handled more than 24 hours ago.
 */
async function closeDueTickets(client) {
  const due = getDueTicketCloses(Math.floor(Date.now() / 1000));
  for (const { channel_id: channelId } of due) {
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel) {
        await channel.send('🔒 This suggestion has been handled, so this ticket is being closed automatically. Thanks for the suggestion!').catch(() => {});
        await channel.delete('Suggestions ticket auto-closed 24h after the game was handled');
      }
      removeSuggestionTicket(channelId);
    } catch (err) {
      console.error(`[TicketService] Could not auto-close ticket ${channelId}:`, err.message);
    }
  }
}

/**
 * Main handler for Events.MessageCreate across guild channels.
 * Watches Tickety "Suggestions" tickets and reads the first 10 messages of the ticket creator.
 */
async function handleTicketMessageCreate(message) {
  if (!message || !message.guildId || !message.channel) return;

  // Ignore messages inside the Gaming Updates Forum itself
  const settings = getGuildSettings(message.guildId);
  if (
    message.channelId === settings.default_channel_id ||
    message.channel.parentId === settings.default_channel_id
  ) {
    return;
  }

  // 1. If the message is from Tickety (or another bot in a ticket channel), check if it's the opening "Suggestions" embed
  if (message.author?.bot) {
    if (isTicketyBot(message.author) || isPossibleTicketChannel(message.channel)) {
      const ticket = await inspectAndRegisterTicketChannel(message.channel, message);
      if (ticket?.is_suggestion_ticket) {
        console.log(
          `🎫 [Tickety Suggestions] Registered Suggestions ticket in #${message.channel.name} (${message.channel.id}), creator: ${
            ticket.creator_id || 'pending first message'
          }`
        );
      } else {
        console.log(`🎫 [Tickety] Bot message in #${message.channel.name}: no Suggestions marker found (yet)`);
      }
    }
    return;
  }

  // 2. Human message: check if this channel is a registered Suggestions ticket or a candidate ticket channel
  let ticket = getSuggestionTicket(message.channel.id);

  if (!ticket && isPossibleTicketChannel(message.channel)) {
    ticket = await inspectAndRegisterTicketChannel(message.channel, message);
  } else if (ticket && !ticket.is_suggestion_ticket && isPossibleTicketChannel(message.channel)) {
    // Re-check in case Tickety posted the form embed slightly after the channel opened
    ticket = await inspectAndRegisterTicketChannel(message.channel, message);
  }

  if (!ticket || !ticket.is_suggestion_ticket) {
    return;
  }

  // Ensure we know who created the ticket. If creator_id wasn't in Tickety's mention/overwrite, lock onto the first human who speaks in the ticket.
  if (!ticket.creator_id) {
    ticket = upsertSuggestionTicket(message.channel.id, {
      guildId: message.guildId,
      creatorId: message.author.id,
      isSuggestionTicket: true
    });
  }

  // Only read messages sent by the person who created the ticket
  if (message.author.id !== ticket.creator_id) {
    return;
  }

  // Only process the first 10 messages from the ticket creator
  if (ticket.messages_processed >= MAX_CREATOR_MESSAGES_TO_SCAN) {
    return;
  }

  // Serialize processing per channel so rapid messages increment cleanly
  const prevLock = channelProcessingLocks.get(message.channel.id) || Promise.resolve();
  const currentTask = prevLock
    .then(async () => {
      const freshTicket = getSuggestionTicket(message.channel.id);
      if (!freshTicket || freshTicket.messages_processed >= MAX_CREATOR_MESSAGES_TO_SCAN) {
        return;
      }

      // Fetch full message content if empty on gateway payload
      let content = message.content || '';
      if (!content.trim()) {
        const fetchedMsg = await message.channel.messages.fetch(message.id, { force: true }).catch(() => null);
        if (fetchedMsg?.content) {
          content = fetchedMsg.content;
        }
      }

      if (!content.trim()) return;

      // Increment the creator's message counter (1..10)
      const updatedTicket = incrementTicketMessageCount(message.channel.id, message.author.id);
      const msgNumber = updatedTicket?.messages_processed || 1;
      console.log(
        `🎫 [Tickety Suggestions] Scanning message #${msgNumber}/${MAX_CREATOR_MESSAGES_TO_SCAN} from creator ${message.author.tag} in #${message.channel.name}: "${content}"`
      );

      // Detect if the message contains a game name (tolerant of typos, missing colons, lowercase)
      const detectedGame = await detectGameFromMessage(content);
      if (!detectedGame) {
        // Ping the configured moderator roles + server owner once per ticket
        if (!updatedTicket?.no_game_notified && !updatedTicket?.games_added?.length) {
          markTicketNoGameNotified(message.channel.id);
          const roleMentions = (settings.ping_role_ids || []).map((id) => `<@&${id}>`);
          const ownerMention = message.guild?.ownerId ? `<@${message.guild.ownerId}>` : null;
          const pings = [...roleMentions, ownerMention].filter(Boolean).join(' ');
          await message.channel.send({
            content:
              `<@${message.author.id}> ❓ I couldn't detect a game in your message, so nothing was added to Game Updates. ` +
              `Please send the game's name (e.g. \`Hollow Knight: Silksong\`), or a moderator will add it manually.` +
              (pings ? `
${pings} — a suggestion needs manual review.` : ''),
            allowedMentions: {
              users: [message.author.id, ...(message.guild?.ownerId ? [message.guild.ownerId] : [])],
              roles: settings.ping_role_ids || []
            }
          });
        }
        return;
      }

      // Check if we already added this exact game in this ticket
      if (updatedTicket?.games_added?.includes(String(detectedGame.id))) {
        return;
      }

      // Also check if another tracked game in this guild already matches the same normalized core name
      const guildTracked = getTrackedGamesByGuild(message.guildId);
      const existingMatch =
        getTrackedGame(message.guildId, detectedGame.id) ||
        guildTracked.find(
          (g) => normalizeCoreGameTitle(g.game_name) === normalizeCoreGameTitle(detectedGame.name)
        );

      const gameToTrack = existingMatch
        ? {
            id: existingMatch.game_id,
            name: existingMatch.game_name,
            steamAppId: existingMatch.steam_app_id || detectedGame.steamAppId,
            launchers: existingMatch.launchers?.length ? existingMatch.launchers : detectedGame.launchers,
            consoles: existingMatch.consoles?.length ? existingMatch.consoles : detectedGame.consoles,
            genres: existingMatch.genres?.length ? existingMatch.genres : detectedGame.genres,
            developer: existingMatch.developer || detectedGame.developer,
            coverImage: existingMatch.cover_image || detectedGame.coverImage,
            feedUrl: existingMatch.feed_url || detectedGame.feedUrl,
            officialUrl: existingMatch.official_url || detectedGame.officialUrl
          }
        : detectedGame;

      const wasAlreadyTracked = Boolean(existingMatch);

      if (wasAlreadyTracked) {
        recordGameAddedToTicket(message.channel.id, existingMatch.game_id);
        const existingDestination =
          (existingMatch.thread_id ? `<#${existingMatch.thread_id}>` : null) ||
          (settings.default_channel_id ? `<#${settings.default_channel_id}>` : 'the Game Updates channel');
        await message.channel.send({
          content: `<@${message.author.id}> ℹ️ **${existingMatch.game_name}** is already being tracked in Game Updates, so there's nothing to add! You can find it in ${existingDestination}.`,
          allowedMentions: { users: [message.author.id] }
        });
        scheduleCloseIfUnset(message.channel.id);
        return;
      }

      // Add/update the game in tracked_games, seed updates, and create/verify its dedicated forum post!
      const tracked = addOrUpdateTrackedGame(message.guildId, gameToTrack, {
        addedBy: message.author.id
      });
      const latestUpdate = await seedInitialUpdatesForGame(message.guildId, tracked);
      const forumResult = await initializeGameForumOnTrack(message.client, tracked, latestUpdate);

      recordGameAddedToTicket(message.channel.id, tracked.game_id);

      const destinationMention =
        forumResult.destinationMention ||
        (tracked.thread_id ? `<#${tracked.thread_id}>` : null) ||
        (settings.default_channel_id ? `<#${settings.default_channel_id}>` : 'the Game Updates channel');

      const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle(
          wasAlreadyTracked
            ? `✅ ${tracked.game_name} is in Game Updates!`
            : `✅ Auto-Added to Game Updates: ${tracked.game_name}`
        )
        .setDescription(
          wasAlreadyTracked
            ? `We detected **${tracked.game_name}** from your suggestion! It is actively tracked in ${destinationMention}.`
            : `We detected **${tracked.game_name}** from your suggestion and automatically added it to Game Updates! Its dedicated updates forum has been created at ${destinationMention}.`
        )
        .addFields(
          {
            name: '🗂️ Updates Forum',
            value: destinationMention,
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
          }
        )
        .setFooter({
          text: `Suggestions Ticket Auto-Tracker • Message ${msgNumber}/${MAX_CREATOR_MESSAGES_TO_SCAN}`
        });

      if (tracked.cover_image && tracked.cover_image.startsWith('http')) {
        embed.setThumbnail(tracked.cover_image);
      }

      await message.channel.send({
        content: `<@${message.author.id}> ✅ **${tracked.game_name}** has been added to ${destinationMention}! This ticket will be closed automatically in 24 hours.`,
        embeds: [embed]
      });
      scheduleCloseIfUnset(message.channel.id);
    })
    .catch((err) => {
      console.error('[TicketService] Error processing ticket message:', err.message);
    });

  channelProcessingLocks.set(message.channel.id, currentTask);
}

module.exports = {
  handleTicketMessageCreate,
  handleTicketMessageUpdate,
  inspectAndRegisterTicketChannel,
  isCandidateTicketChannel,
  closeDueTickets
};
