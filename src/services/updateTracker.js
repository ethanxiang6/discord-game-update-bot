const Parser = require('rss-parser');
const { ChannelType } = require('discord.js');
const {
  getGuildSettings,
  getAllTrackedGames,
  getTrackedGamesByGuild,
  isUpdateSeen,
  markUpdateSeen,
  hasAnySeenUpdates,
  updateTrackedGameThread,
  updateTrackedGameForumChannel,
  recordLastUpdateStats
} = require('../database/db');
const { buildGoogleNewsUpdateFeedUrl, CONSOLES, LAUNCHERS } = require('./catalogService');
const {
  sanitizeUrl,
  buildUpdateNotificationPayload,
  buildGameCatalogEmbed,
  classifyUpdate
} = require('../utils/formatter');
const { translateUpdatesToEnglish } = require('./updateTranslator');
const { formatLauncherBadges, formatConsoleBadges } = require('../data/platformsAndGames');

const rssParser = new Parser({
  timeout: 8000,
  headers: {
    'User-Agent': 'DiscordGameUpdateTracker/1.0 (+https://discord.com)'
  }
});

/**
 * Fetch the latest updates/patch notes for a game across Steam News API and/or RSS/Atom Feeds.
 * Returns normalized update objects sorted newest first.
 */
async function fetchGameUpdates(game, limit = 5) {
  const steamAppId = game.steam_app_id || game.steamAppId;
  const customFeedUrl = game.feed_url || game.feedUrl;
  const gameName = game.game_name || game.name;

  const updates = [];

  // 1. Try Steam News API if steamAppId is available
  if (steamAppId) {
    try {
      const steamUpdates = await fetchSteamNewsUpdates(steamAppId, Math.max(10, limit));
      updates.push(...steamUpdates);
    } catch (err) {
      console.warn(`[UpdateTracker] Steam News fetch failed for ${gameName} (${steamAppId}):`, err.message);
    }
  }

  // 2. Try Custom / Curated RSS Feed if configured or if Steam returned nothing
  const feedToFetch = customFeedUrl || (!steamAppId ? buildGoogleNewsUpdateFeedUrl(gameName) : null);
  if (feedToFetch) {
    try {
      const rssUpdates = await fetchRssFeedUpdates(feedToFetch, gameName, Math.max(8, limit));
      updates.push(...rssUpdates);
    } catch (err) {
      console.warn(`[UpdateTracker] RSS fetch failed for ${gameName} (${feedToFetch}):`, err.message);
    }
  }

  // Deduplicate by UID or URL and sort newest first
  const seenUids = new Set();
  const unique = [];
  for (const item of updates) {
    if (!item || !item.uid || seenUids.has(item.uid)) continue;
    seenUids.add(item.uid);
    unique.push(item);
  }

  unique.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  // Non-English announcements are translated (and cached per update) before anything is classified or shown
  return translateUpdatesToEnglish(unique.slice(0, limit));
}

/**
 * Fetch updates from Steam's keyless ISteamNews API.
 * Prioritizes official Steam Community Announcements (feed_type === 1) when available.
 */
async function fetchSteamNewsUpdates(appId, count = 10) {
  const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${encodeURIComponent(appId)}&count=${count}&maxlength=0&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DiscordGameUpdateTracker/1.0' },
    signal: AbortSignal.timeout(7000)
  });

  if (!res.ok) return [];
  const data = await res.json();
  const newsItems = data?.appnews?.newsitems;
  if (!Array.isArray(newsItems) || newsItems.length === 0) return [];

  // Prefer official community announcements (feed_type === 1) if present
  const officialItems = newsItems.filter((item) => item.feed_type === 1);
  const pool = officialItems.length > 0 ? officialItems : newsItems;

  return pool.map((item) => {
    const canonicalSteamUrl = `https://store.steampowered.com/news/app/${appId}/view/${item.gid}`;
    const rawUrl = item.url ? item.url.replace(/^http:\/\//i, 'https://') : canonicalSteamUrl;
    const cleanUrl =
      rawUrl.includes('externalpost') || /\s/.test(rawUrl)
        ? canonicalSteamUrl
        : (sanitizeUrl(rawUrl) || canonicalSteamUrl);

    return {
      uid: `steam-${appId}-${item.gid}`,
      title: item.title || 'Game Update',
      rawContent: item.contents || '',
      url: cleanUrl,
      author: item.author || 'Official Developer',
      sourceName: item.feedlabel || 'Steam Official Announcements',
      publishedAt: item.date ? item.date * 1000 : Date.now(),
      imageUrl: null
    };
  });
}

/**
 * Fetch updates from an RSS or Atom feed (official publisher blogs, PlayStation/Xbox/Switch feeds, or Google News RSS).
 */
async function fetchRssFeedUpdates(feedUrl, gameName, count = 8) {
  const feed = await rssParser.parseURL(feedUrl);
  if (!feed || !Array.isArray(feed.items)) return [];

  return feed.items.slice(0, count).map((item) => {
    const pubDate = item.isoDate || item.pubDate;
    const timestamp = pubDate ? new Date(pubDate).getTime() : Date.now();
    const uidSource = item.guid || item.id || item.link || `${gameName}-${item.title}`;

    // Extract enclosure or media thumbnail if available
    let imageUrl = null;
    if (item.enclosure?.url && /\.(jpg|jpeg|png|webp|gif)/i.test(item.enclosure.url)) {
      imageUrl = item.enclosure.url;
    }

    return {
      uid: `rss-${Buffer.from(String(uidSource)).toString('base64url').slice(0, 48)}`,
      title: item.title || `${gameName} Update`,
      rawContent: item['content:encoded'] || item.content || item.contentSnippet || item.summary || '',
      url: item.link || '',
      author: item.creator || item.author || feed.title || 'Official Feed',
      sourceName: feed.title ? feed.title.slice(0, 60) : 'Official Game Update Feed',
      publishedAt: Number.isNaN(timestamp) ? Date.now() : timestamp,
      imageUrl
    };
  });
}

/**
 * Seed seen updates when a game is newly tracked so we don't flood the channel with historical posts.
 * Returns the latest update item if found.
 */
async function seedInitialUpdatesForGame(guildId, trackedGame) {
  const updates = await fetchGameUpdates(trackedGame, 6);
  for (const u of updates) {
    markUpdateSeen(guildId, trackedGame.game_id, u.uid, u.title, u.url, Math.floor(u.publishedAt / 1000));
  }
  if (updates.length > 0) {
    recordLastUpdateStats(
      guildId,
      trackedGame.game_id,
      updates[0].title,
      Math.floor(updates[0].publishedAt / 1000)
    );
  }
  return updates[0] || null;
}

/**
 * Immediately create the dedicated Forum Post (inside a Forum Channel) OR a dedicated new Forum Channel
 * for a game as soon as it is added/tracked, and optionally post its latest update inside it!
 */
async function initializeGameForumOnTrack(client, trackedGame, latestUpdate = null) {
  const settings = getGuildSettings(trackedGame.guild_id);
  let baseChannelId = trackedGame.target_channel_id || settings.default_channel_id;

  // Auto-discover the server's #gaming-updates Forum channel if default_channel_id is not set yet
  if (!baseChannelId && trackedGame.guild_id) {
    try {
      const guild = await client.guilds.fetch(trackedGame.guild_id).catch(() => null);
      if (guild) {
        const channels = await guild.channels.fetch().catch(() => null);
        if (channels) {
          const forumMatch = channels.find(
            (ch) =>
              ch &&
              ch.type === ChannelType.GuildForum &&
              /gaming-updates|game-updates|updates/i.test(ch.name)
          );
          if (forumMatch) {
            baseChannelId = forumMatch.id;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (!baseChannelId) {
    return { destinationMention: null, mode: 'none' };
  }

  try {
    const baseChannel = await client.channels.fetch(baseChannelId).catch(() => null);
    if (!baseChannel) {
      return { destinationMention: null, mode: 'none' };
    }

    const wantDedicatedForumChannel =
      settings.forum_mode === 'channel_per_game' || baseChannel.type === ChannelType.GuildCategory;

    // MODE A: Create a brand-new Discord Forum Channel (ChannelType.GuildForum) for this game!
    if (wantDedicatedForumChannel) {
      const forumChannel = await ensureDedicatedForumChannelForGame(client, baseChannel, trackedGame);
      if (forumChannel) {
        if (latestUpdate) {
          await postUpdateIntoGameForumChannel(forumChannel, trackedGame, latestUpdate);
        }
        return {
          destinationMention: `<#${forumChannel.id}>`,
          destinationId: forumChannel.id,
          mode: 'forum_channel_per_game'
        };
      }
    }

    // MODE B: Base channel is a Forum Channel (ChannelType.GuildForum) ->
    // Create a dedicated Forum Post for this game inside the Forum Channel right now!
    if (baseChannel.type === ChannelType.GuildForum) {
      const thread = await ensureGameForumPostInForumChannel(baseChannel, trackedGame, latestUpdate);
      if (thread) {
        return {
          destinationMention: `<#${thread.id}>`,
          destinationId: thread.id,
          mode: 'forum_post_per_game'
        };
      }
    }

    // MODE C: Standard Text/Announcement channel
    return {
      destinationMention: `<#${baseChannel.id}>`,
      destinationId: baseChannel.id,
      mode: 'text_channel'
    };
  } catch (err) {
    console.error(`[UpdateTracker] Failed to initialize forum for ${trackedGame.game_name}:`, err.message);
    return { destinationMention: `<#${baseChannelId}>`, mode: 'error' };
  }
}

/**
 * Ensure a dedicated Forum Channel (ChannelType.GuildForum) exists for a tracked game.
 * Creates one automatically inside the category if it doesn't exist yet.
 */
async function ensureDedicatedForumChannelForGame(client, baseChannel, trackedGame) {
  const guild = baseChannel.guild;
  if (!guild) return null;

  // Check if we already created a Forum Channel for this game
  if (trackedGame.created_forum_channel_id) {
    const existing = await guild.channels.fetch(trackedGame.created_forum_channel_id).catch(() => null);
    if (existing && existing.type === ChannelType.GuildForum) {
      return existing;
    }
  }

  const parentCategoryId =
    baseChannel.type === ChannelType.GuildCategory ? baseChannel.id : (baseChannel.parentId || null);

  const channelSlug = `${trackedGame.game_name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'game';

  const channelName = `${channelSlug}-updates`;

  const topic = [
    `📡 Official Game Updates & Patch Notes for ${trackedGame.game_name}`,
    `🚀 Launchers: ${formatLauncherBadges(trackedGame.launchers)}`,
    `🎮 Consoles: ${formatConsoleBadges(trackedGame.consoles)}`
  ].join(' • ');

  const forumChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildForum,
    parent: parentCategoryId || undefined,
    topic: topic.slice(0, 1024),
    availableTags: [
      { name: 'Patch Notes', emoji: { name: '🛠️' } },
      { name: 'Major Update', emoji: { name: '🚀' } },
      { name: 'News & Announcements', emoji: { name: '📢' } }
    ],
    reason: `Dedicated Game Updates Forum Channel for ${trackedGame.game_name}`
  });

  updateTrackedGameForumChannel(trackedGame.guild_id, trackedGame.game_id, forumChannel.id);
  trackedGame.created_forum_channel_id = forumChannel.id;

  // Also create a pinned Overview Post inside the newly created Forum Channel
  const catalogEmbed = buildGameCatalogEmbed(
    {
      id: trackedGame.game_id,
      name: trackedGame.game_name,
      steamAppId: trackedGame.steam_app_id,
      launchers: trackedGame.launchers,
      consoles: trackedGame.consoles,
      genres: trackedGame.genres,
      developer: trackedGame.developer,
      coverImage: trackedGame.cover_image,
      officialUrl: trackedGame.official_url
    },
    true
  );

  await forumChannel.threads
    .create({
      name: `📌 ${trackedGame.game_name} — Tracker Overview & Info`.slice(0, 95),
      message: {
        embeds: [catalogEmbed]
      },
      reason: `Overview post for ${trackedGame.game_name}`
    })
    .catch(() => null);

  return forumChannel;
}

/**
 * Post an update as a Forum Post inside a game's dedicated Forum Channel.
 */
async function postUpdateIntoGameForumChannel(forumChannel, trackedGame, updateItem) {
  const payload = buildUpdateNotificationPayload(trackedGame, updateItem);
  const appliedTags = matchForumTagsForUpdate(forumChannel, trackedGame, payload.classification);

  const postTitle = `${
    payload.classification.versionTag ? `[${payload.classification.versionTag}] ` : ''
  }${updateItem.title || `${trackedGame.game_name} Update`}`.slice(0, 95);

  const createdThread = await forumChannel.threads.create({
    name: postTitle,
    message: {
      content: payload.content,
      embeds: payload.embeds,
      components: payload.components
    },
    appliedTags: appliedTags.slice(0, 5),
    reason: `New update for ${trackedGame.game_name}: ${postTitle}`
  });

  return createdThread;
}

/**
 * Ensure a dedicated Forum Post (thread) for a tracked game exists inside a shared Forum Channel,
 * creating it immediately if missing, and optionally posting the initial update inside it.
 */
async function ensureGameForumPostInForumChannel(forumChannel, trackedGame, initialUpdate = null) {
  let thread = null;
  if (trackedGame.thread_id) {
    thread = await forumChannel.threads.fetch(trackedGame.thread_id).catch(() => null);
  }

  // Also check if an active thread in this Forum Channel already exists for this game name
  if (!thread) {
    const active = await forumChannel.threads.fetchActive().catch(() => null);
    if (active && active.threads) {
      const targetLower = trackedGame.game_name.toLowerCase();
      const found = active.threads.find((t) => {
        const cleanThreadName = t.name.replace(/^🎮\s*/, '').split('—')[0].trim().toLowerCase();
        return cleanThreadName === targetLower;
      });
      if (found) {
        thread = found;
        updateTrackedGameThread(trackedGame.guild_id, trackedGame.game_id, thread.id);
        trackedGame.thread_id = thread.id;
        return thread;
      }
    }
  }

  if (!thread) {
    const catalogEmbed = buildGameCatalogEmbed(
      {
        id: trackedGame.game_id,
        name: trackedGame.game_name,
        steamAppId: trackedGame.steam_app_id,
        launchers: trackedGame.launchers,
        consoles: trackedGame.consoles,
        genres: trackedGame.genres,
        developer: trackedGame.developer,
        coverImage: trackedGame.cover_image,
        officialUrl: trackedGame.official_url
      },
      true
    );

    const starterEmbeds = [catalogEmbed];
    let starterComponents = [];
    let starterContent = `📡 **Dedicated Update Feed for ${trackedGame.game_name}** — All official patch notes, hotfixes, and updates will be posted in this forum channel!`;

    if (initialUpdate) {
      const updatePayload = buildUpdateNotificationPayload(trackedGame, initialUpdate);
      if (updatePayload.content) {
        starterContent = `${starterContent}\n${updatePayload.content}`;
      }
      starterEmbeds.push(...updatePayload.embeds);
      starterComponents = updatePayload.components;
    }

    const appliedTags = await ensureAndMatchPlatformForumTags(forumChannel, trackedGame);

    thread = await forumChannel.threads.create({
      name: `🎮 ${trackedGame.game_name} — Updates & Patch Notes`.slice(0, 95),
      message: {
        content: starterContent,
        embeds: starterEmbeds,
        components: starterComponents
      },
      appliedTags: appliedTags.slice(0, 5),
      reason: `Automated game update forum post for ${trackedGame.game_name}`
    });

    updateTrackedGameThread(trackedGame.guild_id, trackedGame.game_id, thread.id);
    trackedGame.thread_id = thread.id;
    return thread;
  }

  // Unarchive thread if archived
  if (thread.archived) {
    await thread.setArchived(false).catch(() => null);
  }

  if (initialUpdate) {
    const payload = buildUpdateNotificationPayload(trackedGame, initialUpdate);
    await thread.send(payload);
  }

  return thread;
}

/**
 * Match or create platform/launcher tags on a shared Forum Channel so each game's forum post is tagged nicely.
 */
async function ensureAndMatchPlatformForumTags(forumChannel, trackedGame) {
  const existingTags = forumChannel.availableTags || [];
  const desiredNames = new Set();

  for (const cId of (trackedGame.consoles || []).slice(0, 2)) {
    if (CONSOLES[cId]?.shortName) desiredNames.add(CONSOLES[cId].shortName);
  }
  for (const lId of (trackedGame.launchers || []).slice(0, 2)) {
    if (LAUNCHERS[lId]?.name) desiredNames.add(LAUNCHERS[lId].name);
  }

  const matchedIds = [];
  for (const tag of existingTags) {
    for (const desired of desiredNames) {
      if (tag.name.toLowerCase() === desired.toLowerCase()) {
        matchedIds.push(tag.id);
      }
    }
  }

  return matchedIds.slice(0, 5);
}

/**
 * Match update category tags on a per-game Forum Channel.
 */
function matchForumTagsForUpdate(forumChannel, trackedGame, classification) {
  const existingTags = forumChannel.availableTags || [];
  const matched = [];

  for (const tag of existingTags) {
    const tName = tag.name.toLowerCase();
    if (classification.category === 'patch' && tName.includes('patch')) {
      matched.push(tag.id);
    } else if (classification.category === 'major' && tName.includes('major')) {
      matched.push(tag.id);
    } else if (classification.category === 'news' && tName.includes('news')) {
      matched.push(tag.id);
    }
  }
  return matched.slice(0, 5);
}

/**
 * Check a single tracked game for a guild and post any unseen updates to the configured Discord forum/channel.
 */
async function checkAndPostGameUpdates(client, trackedGame, { forcePostLatest = false } = {}) {
  const guildId = trackedGame.guild_id;
  const gameId = trackedGame.game_id;
  const settings = getGuildSettings(guildId);

  // Don't post new updates into a game's feed while it is being wiped and re-sent
  if (resendLocks.has(`${guildId}:${gameId}`)) {
    return { postedCount: 0, latestUpdate: null };
  }

  const updates = await fetchGameUpdates(trackedGame, 5);
  if (updates.length === 0) {
    recordLastUpdateStats(guildId, gameId, null, null);
    return { postedCount: 0, latestUpdate: null };
  }

  const hasHistory = hasAnySeenUpdates(guildId, gameId);
  if (!hasHistory && !forcePostLatest) {
    for (let i = 1; i < updates.length; i++) {
      markUpdateSeen(guildId, gameId, updates[i].uid, updates[i].title, updates[i].url, Math.floor(updates[i].publishedAt / 1000));
    }
    const newest = updates[0];
    const ageHours = (Date.now() - newest.publishedAt) / (1000 * 60 * 60);
    if (ageHours > 24) {
      markUpdateSeen(guildId, gameId, newest.uid, newest.title, newest.url, Math.floor(newest.publishedAt / 1000));
      recordLastUpdateStats(guildId, gameId, newest.title, Math.floor(newest.publishedAt / 1000));
      return { postedCount: 0, latestUpdate: newest };
    }
  }

  const toPost = [];
  if (forcePostLatest) {
    toPost.push(updates[0]);
  } else {
    for (const item of [...updates].reverse()) {
      if (!isUpdateSeen(guildId, gameId, item.uid)) {
        const classification = classifyUpdate(item.title, item.rawContent, item.sourceName);
        const requirePatchesOnly = trackedGame.patches_only || settings.patches_only_default;
        if (requirePatchesOnly && !classification.isPatchOrMajor) {
          markUpdateSeen(guildId, gameId, item.uid, item.title, item.url, Math.floor(item.publishedAt / 1000));
          continue;
        }
        toPost.push(item);
      }
    }
  }

  let postedCount = 0;
  for (const updateItem of toPost) {
    const sent = await deliverUpdateToDiscord(client, trackedGame, settings, updateItem);
    if (sent) {
      postedCount++;
      markUpdateSeen(
        guildId,
        gameId,
        updateItem.uid,
        updateItem.title,
        updateItem.url,
        Math.floor(updateItem.publishedAt / 1000)
      );
      recordLastUpdateStats(
        guildId,
        gameId,
        updateItem.title,
        Math.floor(updateItem.publishedAt / 1000)
      );
    }
  }

  if (postedCount === 0 && updates[0]) {
    recordLastUpdateStats(guildId, gameId, updates[0].title, Math.floor(updates[0].publishedAt / 1000));
  }

  return { postedCount, latestUpdate: updates[0] };
}

/**
 * Deliver the formatted update embed to the game's dedicated Forum Channel, Forum Post, or Text Channel.
 */
async function deliverUpdateToDiscord(client, trackedGame, settings, updateItem) {
  const targetChannelId = trackedGame.target_channel_id || settings.default_channel_id;
  if (!targetChannelId && !trackedGame.created_forum_channel_id) {
    return false;
  }

  try {
    // 1. Check if this game has its own dedicated Forum Channel (channel_per_game mode)
    if (trackedGame.created_forum_channel_id || settings.forum_mode === 'channel_per_game') {
      const baseChannel = targetChannelId
        ? await client.channels.fetch(targetChannelId).catch(() => null)
        : null;

      let gameForumChannel = trackedGame.created_forum_channel_id
        ? await client.channels.fetch(trackedGame.created_forum_channel_id).catch(() => null)
        : null;

      if (!gameForumChannel && baseChannel) {
        gameForumChannel = await ensureDedicatedForumChannelForGame(client, baseChannel, trackedGame);
      }

      if (gameForumChannel && gameForumChannel.type === ChannelType.GuildForum) {
        await postUpdateIntoGameForumChannel(gameForumChannel, trackedGame, updateItem);
        return true;
      }
    }

    const channel = await client.channels.fetch(targetChannelId).catch(() => null);
    if (!channel) return false;

    // 2. If the target channel is a Category, create a dedicated Forum Channel for the game inside that Category!
    if (channel.type === ChannelType.GuildCategory) {
      const gameForumChannel = await ensureDedicatedForumChannelForGame(client, channel, trackedGame);
      if (gameForumChannel) {
        await postUpdateIntoGameForumChannel(gameForumChannel, trackedGame, updateItem);
        return true;
      }
      return false;
    }

    // 3. If the target channel is a Discord Forum Channel (post_per_game mode),
    // ensure the game has its own Forum Post inside that Forum Channel and post the update there!
    if (channel.type === ChannelType.GuildForum) {
      let thread = null;
      if (trackedGame.thread_id) {
        thread = await channel.threads.fetch(trackedGame.thread_id).catch(() => null);
      }
      if (!thread) {
        await ensureGameForumPostInForumChannel(channel, trackedGame, updateItem);
        return true;
      }
      if (thread.archived) {
        await thread.setArchived(false).catch(() => null);
      }
      const payload = buildUpdateNotificationPayload(trackedGame, updateItem);
      await thread.send(payload);
      return true;
    }

    const payload = buildUpdateNotificationPayload(trackedGame, updateItem);

    // 4. Guild opted into auto-threads on a standard text channel
    if (settings.use_forum_threads && channel.threads && typeof channel.threads.create === 'function') {
      let thread = null;
      if (trackedGame.thread_id) {
        thread = await channel.threads.fetch(trackedGame.thread_id).catch(() => null);
      }
      if (!thread) {
        const starterMsg = await channel.send(payload);
        thread = await starterMsg
          .startThread({
            name: `${trackedGame.game_name} Updates`.slice(0, 95),
            autoArchiveDuration: 10080
          })
          .catch(() => null);
        if (thread) {
          updateTrackedGameThread(trackedGame.guild_id, trackedGame.game_id, thread.id);
        }
        return true;
      }
      if (thread.archived) {
        await thread.setArchived(false).catch(() => null);
      }
      await thread.send(payload);
      return true;
    }

    // 5. Standard Text / Announcement Channel
    const sentMsg = await channel.send(payload);
    if (channel.type === ChannelType.GuildAnnouncement && sentMsg.crosspostable) {
      await sentMsg.crosspost().catch(() => null);
    }

    return true;
  } catch (err) {
    console.error(`[UpdateTracker] Error delivering update for ${trackedGame.game_name}:`, err.message);
    return false;
  }
}

/**
 * Poll all tracked games across all guilds.
 */
async function pollAllTrackedGames(client) {
  const allTracked = getAllTrackedGames();
  if (allTracked.length === 0) return { checked: 0, posted: 0 };

  let postedTotal = 0;
  for (const trackedGame of allTracked) {
    try {
      const { postedCount } = await checkAndPostGameUpdates(client, trackedGame);
      postedTotal += postedCount;
    } catch (err) {
      console.error(`[UpdateTracker] Error checking ${trackedGame.game_name}:`, err.message);
    }
  }

  return { checked: allTracked.length, posted: postedTotal };
}

/**
 * Poll all tracked games for a specific guild.
 */
async function pollGuildTrackedGames(client, guildId) {
  const games = getTrackedGamesByGuild(guildId);
  let postedTotal = 0;
  for (const trackedGame of games) {
    const { postedCount } = await checkAndPostGameUpdates(client, trackedGame);
    postedTotal += postedCount;
  }
  return { checked: games.length, posted: postedTotal };
}

const resendLocks = new Set();
const MAX_RESEND_UPDATES_PER_GAME = 50;
const RESEND_POST_DELAY_MS = 1500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Delete every message/post the bot previously made for one game, depending on how its updates were delivered.
 * Returns the number of Discord objects (forum posts or messages) deleted.
 */
async function deleteGameUpdateMessages(client, trackedGame, settings) {
  let deleted = 0;
  const errors = [];
  const tryDelete = async (target) => {
    try {
      await target.delete(reason);
      deleted++;
      return true;
    } catch (err) {
      errors.push(err.message);
      console.error(`[UpdateTracker] Could not delete ${target.id} for ${trackedGame.game_name}:`, err.message);
      return false;
    }
  };
  const botId = client.user.id;
  const reason = `Re-sending all ${trackedGame.game_name} updates in English`;

  // Dedicated Forum Channel per game: every bot-created post in it is an update post
  if (trackedGame.created_forum_channel_id) {
    const forum = await client.channels.fetch(trackedGame.created_forum_channel_id).catch(() => null);
    if (forum && forum.type === ChannelType.GuildForum) {
      const threads = [];
      const active = await forum.threads.fetchActive().catch(() => null);
      if (active) threads.push(...active.threads.values());
      let before;
      for (let page = 0; page < 10; page++) {
        const archived = await forum.threads.fetchArchived({ limit: 100, before }).catch(() => null);
        if (!archived || archived.threads.size === 0) break;
        threads.push(...archived.threads.values());
        if (!archived.hasMore) break;
        before = [...archived.threads.values()].pop().id;
      }
      for (const thread of threads) {
        if (thread.ownerId !== botId) continue;
        await tryDelete(thread);
      }
    }
    return { deleted, errors };
  }

  const baseChannelId = trackedGame.target_channel_id || settings.default_channel_id;
  const baseChannel = baseChannelId ? await client.channels.fetch(baseChannelId).catch(() => null) : null;

  // The game's own Forum Post / auto-thread
  let thread = trackedGame.thread_id ? await client.channels.fetch(trackedGame.thread_id).catch(() => null) : null;
  if (!thread && baseChannel?.type === ChannelType.GuildForum) {
    const active = await baseChannel.threads.fetchActive().catch(() => null);
    const targetLower = trackedGame.game_name.toLowerCase();
    thread =
      active?.threads.find(
        (t) => t.name.replace(/^🎮\s*/, '').split('—')[0].trim().toLowerCase() === targetLower
      ) || null;
  }
  if (thread) {
    if (thread.ownerId !== botId) {
      errors.push("the game's forum post was not created by this bot");
    } else if (await tryDelete(thread)) {
      updateTrackedGameThread(trackedGame.guild_id, trackedGame.game_id, null);
      trackedGame.thread_id = null;
    }
    return { deleted, errors };
  }

  // Plain text / announcement channel: delete this game's update embeds posted by the bot
  if (baseChannel?.messages) {
    const prefix = `${trackedGame.game_name} • `;
    let before;
    for (let page = 0; page < 5; page++) {
      const batch = await baseChannel.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!batch || batch.size === 0) break;
      for (const msg of batch.values()) {
        if (msg.author?.id === botId && msg.embeds.some((e) => e.author?.name?.startsWith(prefix))) {
          await tryDelete(msg);
        }
      }
      before = batch.last().id;
    }
  }
  return { deleted, errors };
}

/**
 * Delete all of the bot's update posts for the guild's tracked games (or one game) and re-send every
 * update it had already handled, oldest first, translated to English.
 * `onProgress(text)` is called as each game finishes.
 */
async function resendAllUpdates(client, guildId, { gameId = null, onProgress = () => {} } = {}) {
  const settings = getGuildSettings(guildId);
  const games = getTrackedGamesByGuild(guildId).filter((g) => !gameId || g.game_id === String(gameId));
  const summary = { games: 0, deleted: 0, resent: 0, skipped: [] };

  for (const trackedGame of games) {
    const lockKey = `${guildId}:${trackedGame.game_id}`;
    resendLocks.add(lockKey);
    try {
      // Fetch + translate first; if nothing can be re-sent we leave the existing posts untouched
      const fetched = await fetchGameUpdates(trackedGame, MAX_RESEND_UPDATES_PER_GAME);
      const toResend = fetched
        .filter((u) => isUpdateSeen(guildId, trackedGame.game_id, u.uid))
        .sort((a, b) => (a.publishedAt || 0) - (b.publishedAt || 0));

      if (toResend.length === 0) {
        summary.skipped.push(trackedGame.game_name);
        await onProgress(`⏭️ ${trackedGame.game_name}: no updates available from its feed, left as is.`);
        continue;
      }

      const { deleted, errors } = await deleteGameUpdateMessages(client, trackedGame, settings);
      summary.deleted += deleted;

      // If anything couldn't be deleted, stop here so we never post duplicates next to the old (e.g. Russian) posts
      if (errors.length > 0) {
        summary.skipped.push(trackedGame.game_name);
        await onProgress(
          `❌ ${trackedGame.game_name}: couldn't delete the old posts (${errors[0]}). Give the bot **Manage Threads** and **Manage Messages** in the updates channel, then run this again. Nothing was re-sent.`
        );
        continue;
      }

      let resent = 0;
      for (const update of toResend) {
        if (await deliverUpdateToDiscord(client, trackedGame, settings, update)) resent++;
        await sleep(RESEND_POST_DELAY_MS);
      }
      summary.games++;
      summary.resent += resent;
      await onProgress(`✅ ${trackedGame.game_name}: deleted ${deleted}, re-sent ${resent} update(s).`);
    } catch (err) {
      console.error(`[UpdateTracker] Resend failed for ${trackedGame.game_name}:`, err.message);
      summary.skipped.push(trackedGame.game_name);
      await onProgress(`❌ ${trackedGame.game_name}: ${err.message}`);
    } finally {
      resendLocks.delete(lockKey);
    }
  }

  return summary;
}

module.exports = {
  resendAllUpdates,
  fetchGameUpdates,
  seedInitialUpdatesForGame,
  initializeGameForumOnTrack,
  checkAndPostGameUpdates,
  pollAllTrackedGames,
  pollGuildTrackedGames
};
