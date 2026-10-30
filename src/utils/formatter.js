const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatLauncherBadges, formatConsoleBadges, getPrimaryColor } = require('../data/platformsAndGames');

const PATCH_KEYWORDS = /\b(patch|hotfix|changelog|release notes|balance|bug ?fix|fixes|ver\.?\s*\d|v\d+\.\d+|update\s+\d|maintenance|snapshot|build\s+\d)\b/i;
const MAJOR_UPDATE_KEYWORDS = /\b(season\s+\d|major update|expansion|dlc|new chapter|anniversary|launch|act\s+[ivx\d]+|operation)\b/i;
const VERSION_REGEX = /\b((?:v|ver\.?|version|patch|update|hotfix)\s*#?\d+(?:\.\d+)+(?:[a-z0-9.-]*)?|\b(?:v\d+\.\d+(?:\.\d+)?)|\b(?:patch|update)\s+\d+(?:\.\d+)+)\b/i;

/**
 * Strictly sanitize and encode any URL before passing to Discord embeds or buttons.
 * Fixes unencoded spaces, commas, or malformed paths (e.g. Steam externalpost URLs like ".../Rock, Paper, Shotgun/...").
 */
function sanitizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    // Encode spaces and unsafe characters while preserving valid URL structure
    const encoded = encodeURI(decodeURI(trimmed))
      .replace(/\s+/g, '%20')
      .replace(/,/g, '%2C');
    const parsed = new URL(encoded);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const href = parsed.href;
    // Discord rejects URLs containing spaces or longer than 2048 chars
    if (/\s/.test(href) || href.length > 2000) return null;
    return href;
  } catch {
    try {
      const fallbackEncoded = trimmed.replace(/\s+/g, '%20').replace(/,/g, '%2C');
      const parsed = new URL(fallbackEncoded);
      return parsed.href;
    } catch {
      return null;
    }
  }
}

/**
 * Classify an update item based on its title, tags, and content.
 */
function classifyUpdate(title = '', content = '', feedName = '') {
  const combined = `${title} ${feedName} ${content.slice(0, 500)}`;
  const versionMatch = title.match(VERSION_REGEX) || content.slice(0, 300).match(VERSION_REGEX);
  const versionTag = versionMatch ? versionMatch[1].trim() : null;

  const isPatch = PATCH_KEYWORDS.test(combined);
  const isMajor = MAJOR_UPDATE_KEYWORDS.test(title);

  if (isPatch) {
    return {
      category: 'patch',
      badge: '🛠️ PATCH NOTES / CHANGELOG',
      color: 0x22c55e,
      versionTag,
      isPatchOrMajor: true
    };
  }

  if (isMajor) {
    return {
      category: 'major',
      badge: '🚀 MAJOR CONTENT UPDATE',
      color: 0x8b5cf6,
      versionTag,
      isPatchOrMajor: true
    };
  }

  return {
    category: 'news',
    badge: '📢 GAME UPDATE & NEWS',
    color: null,
    versionTag,
    isPatchOrMajor: false
  };
}

/**
 * Convert Steam BBCode and HTML into clean, readable Discord Markdown.
 */
function cleanToDiscordMarkdown(rawText = '', maxLength = 1500) {
  if (!rawText) return '_No detailed patch summary provided. Click the link below to read the full update._';

  let text = String(rawText);

  text = text.replace(/\{STEAM_CLAN_IMAGE\}\/[^\s[\]<]+/gi, '');
  text = text.replace(/\{STEAM_CLAN_LOC_IMAGE\}\/[^\s[\]<]+/gi, '');
  text = text.replace(/\[img\][\s\S]*?\[\/img\]/gi, '');
  text = text.replace(/\[previewyoutube=[^\]]*\][\s\S]*?\[\/previewyoutube\]/gi, '');

  text = text.replace(/\[h1\]([\s\S]*?)\[\/h1\]/gi, '\n\n### 📌 $1\n');
  text = text.replace(/\[h2\]([\s\S]*?)\[\/h2\]/gi, '\n\n**🔹 $1**\n');
  text = text.replace(/\[h3\]([\s\S]*?)\[\/h3\]/gi, '\n\n**• $1**\n');
  text = text.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '**$1**');
  text = text.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '*$1*');
  text = text.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '__$1__');
  text = text.replace(/\[strike\]([\s\S]*?)\[\/strike\]/gi, '~~$1~~');
  text = text.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '```\n$1\n```');
  text = text.replace(/\[quote(?:=[^\]]*)?\]([\s\S]*?)\[\/quote\]/gi, '\n> $1\n');

  text = text.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, url, label) => {
    const cleanUrl = sanitizeUrl(url.replace(/^["']|["']$/g, '').trim());
    const cleanLabel = label.trim() || 'Link';
    if (cleanUrl) {
      return `[${cleanLabel}](${cleanUrl})`;
    }
    return cleanLabel;
  });

  text = text.replace(/\[\/?(?:list|olist|ul|ol)\]/gi, '\n');
  text = text.replace(/\[\*\]([^\n[]*)/gi, (_, item) => `\n• ${item.trim()}`);
  text = text.replace(/\[\/\*\]/gi, '');

  text = text.replace(/\[hr\]\[\/hr\]|\[hr\]/gi, '\n───────────────\n');
  text = text.replace(/\[\/?(?:table|tr|td|th|noparse|spoiler|expand|p)[^\]]*\]/gi, ' ');

  text = text.replace(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi, '\n\n### 📌 $1\n');
  text = text.replace(/<h[3456][^>]*>([\s\S]*?)<\/h[3456]>/gi, '\n\n**🔹 $1**\n');
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n• $1');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi, '**$1**');
  text = text.replace(/<(?:i|em)[^>]*>([\s\S]*?)<\/(?:i|em)>/gi, '*$1*');
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, label) => {
    const cleanLabel = label.replace(/<[^>]+>/g, '').trim();
    const safeLink = sanitizeUrl(url);
    if (safeLink && cleanLabel) {
      return `[${cleanLabel}](${safeLink})`;
    }
    return cleanLabel || url;
  });

  text = text.replace(/<[^>]+>/g, '');
  text = decodeHtmlEntities(text);

  text = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) {
    return '_Click the button below to view the full patch notes and changelog._';
  }

  if (text.length > maxLength) {
    const sliced = text.slice(0, maxLength);
    const lastNewline = sliced.lastIndexOf('\n');
    const cutoff = lastNewline > maxLength * 0.6 ? sliced.slice(0, lastNewline) : sliced;
    return `${cutoff.trim()}\n\n*... [Patch notes truncated — read full changelog ↗]*`;
  }

  return text;
}

/**
 * Extract an image URL from Steam BBCode or HTML content if available.
 */
function extractUpdateImage(rawContent = '') {
  if (!rawContent) return null;

  const clanMatch = rawContent.match(/\{STEAM_CLAN_IMAGE\}\/([^\s[\]"'<>]+\.(?:png|jpg|jpeg|gif|webp))/i);
  if (clanMatch) {
    return sanitizeUrl(`https://clan.akamai.steamstatic.com/images/${clanMatch[1]}`);
  }

  const bbImgMatch = rawContent.match(/\[img\](https?:\/\/[^\s[\]"'<>]+\.(?:png|jpg|jpeg|gif|webp)[^\s[\]"'<>]*)\[\/img\]/i);
  if (bbImgMatch) {
    return sanitizeUrl(bbImgMatch[1]);
  }

  const htmlImgMatch = rawContent.match(/<img[^>]+src=["'](https?:\/\/[^"'>\s]+)["']/i);
  if (htmlImgMatch && !htmlImgMatch[1].includes('1x1') && !htmlImgMatch[1].includes('pixel')) {
    return sanitizeUrl(htmlImgMatch[1]);
  }

  return null;
}

/**
 * Build a richly formatted Discord Embed + ActionRow for a game update.
 */
function buildUpdateNotificationPayload(game, updateItem, options = {}) {
  const gameName = game.game_name || game.name;
  const launchers = game.launchers || [];
  const consoles = game.consoles || [];
  const coverImage = sanitizeUrl(game.cover_image || game.coverImage || '');
  const officialUrl = sanitizeUrl(game.official_url || game.officialUrl || '');
  const safeUpdateUrl = sanitizeUrl(updateItem.url) || officialUrl;

  const classification = classifyUpdate(updateItem.title, updateItem.rawContent || updateItem.summary || '', updateItem.sourceName || '');
  const embedColor = classification.color || getPrimaryColor(consoles, launchers);

  const markdownBody = cleanToDiscordMarkdown(updateItem.rawContent || updateItem.summary || '', 1550);
  const extractedBanner = sanitizeUrl(updateItem.imageUrl) || extractUpdateImage(updateItem.rawContent || '') || coverImage;

  const publishedUnix = updateItem.publishedAt
    ? Math.floor(new Date(updateItem.publishedAt).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  const authorOptions = {
    name: `${gameName} • ${classification.badge}`.slice(0, 250)
  };
  if (safeUpdateUrl) {
    authorOptions.url = safeUpdateUrl;
  }

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setAuthor(authorOptions)
    .setTitle(truncateString(updateItem.title || `${gameName} Update`, 250))
    .setDescription(markdownBody)
    .addFields(
      {
        name: '📌 Update Classification',
        value: classification.versionTag
          ? `\`${classification.versionTag}\` (${classification.category.toUpperCase()})`
          : `\`${classification.category.toUpperCase()}\``,
        inline: true
      },
      {
        name: '🕒 Released',
        value: `<t:${publishedUnix}:R> (<t:${publishedUnix}:d>)`,
        inline: true
      },
      {
        name: '📡 Source Feed',
        value: (updateItem.sourceName || 'Official Update Feed').slice(0, 100),
        inline: true
      },
      {
        name: '🚀 Portals / Launchers',
        value: formatLauncherBadges(launchers),
        inline: true
      },
      {
        name: '🎮 Consoles / Platforms',
        value: formatConsoleBadges(consoles),
        inline: true
      }
    )
    .setTimestamp(publishedUnix * 1000)
    .setFooter({
      text: `Game Update Tracker • ID: ${game.game_id || game.id}`
    });

  if (safeUpdateUrl) {
    embed.setURL(safeUpdateUrl);
  }

  if (coverImage) {
    embed.setThumbnail(coverImage);
  }

  if (extractedBanner && extractedBanner !== coverImage) {
    embed.setImage(extractedBanner);
  } else if (coverImage) {
    embed.setImage(coverImage);
  }

  const components = [];
  const row = new ActionRowBuilder();

  if (safeUpdateUrl) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel('Read Full Patch Notes & Changelog')
        .setStyle(ButtonStyle.Link)
        .setURL(safeUpdateUrl)
        .setEmoji('📜')
    );
  }

  if (officialUrl && officialUrl !== safeUpdateUrl) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel('Official Game Portal')
        .setStyle(ButtonStyle.Link)
        .setURL(officialUrl)
        .setEmoji('🌐')
    );
  }

  if (row.components.length > 0) {
    components.push(row);
  }

  let content = undefined;
  const pingRoleId = options.pingRoleId || game.ping_role_id;
  if (pingRoleId) {
    content = `🔔 <@&${pingRoleId}> New update published for **${gameName}**!`;
  }

  return {
    content,
    embeds: [embed],
    components,
    classification
  };
}

/**
 * Build a rich Game Catalog Card Embed for `/game search` and `/game browse`.
 */
function buildGameCatalogEmbed(game, isTracked = false) {
  const consoles = game.consoles || [];
  const launchers = game.launchers || [];
  const color = getPrimaryColor(consoles, launchers);
  const safeOfficialUrl = sanitizeUrl(game.officialUrl || game.official_url);
  const safeCoverImage = sanitizeUrl(game.coverImage || game.cover_image);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${game.name}${game.releaseYear ? ` (${game.releaseYear})` : ''}`.slice(0, 250))
    .setDescription(
      isTracked
        ? '✅ **Currently tracked in this server!** Updates and patch notes will be posted automatically.'
        : '📡 Available for real-time update & patch note tracking across portals and consoles.'
    )
    .addFields(
      {
        name: '🚀 Portals & Launchers',
        value: formatLauncherBadges(launchers),
        inline: false
      },
      {
        name: '🎮 Consoles & Platforms',
        value: formatConsoleBadges(consoles),
        inline: false
      },
      {
        name: '🏷️ Genres',
        value: game.genres && game.genres.length > 0 ? game.genres.join(', ') : 'Video Game',
        inline: true
      },
      {
        name: '🏢 Developer / Publisher',
        value: game.developer || 'Official Publisher',
        inline: true
      },
      {
        name: '🔗 Update Tracking Source',
        value: game.steamAppId
          ? `Steam Official News API (AppID \`${game.steamAppId}\`) + Cross-Platform Feeds`
          : 'Official Publisher / Multi-Platform Update RSS Feed',
        inline: false
      }
    )
    .setFooter({ text: `Catalog ID: ${game.id}` });

  if (safeOfficialUrl) {
    embed.setURL(safeOfficialUrl);
  }
  if (safeCoverImage) {
    embed.setImage(safeCoverImage);
  }

  return embed;
}

function decodeHtmlEntities(str) {
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&ndash;': '–',
    '&mdash;': '—',
    '&bull;': '•',
    '&hellip;': '…',
    '&trade;': '™',
    '&reg;': '®',
    '&copy;': '©'
  };
  return str
    .replace(/&[a-zA-Z0-9#]+;/g, (match) => {
      if (entities[match]) return entities[match];
      const decMatch = match.match(/^&#(\d+);$/);
      if (decMatch) return String.fromCharCode(Number(decMatch[1]));
      const hexMatch = match.match(/^&#x([0-9a-fA-F]+);$/);
      if (hexMatch) return String.fromCharCode(parseInt(hexMatch[1], 16));
      return match;
    });
}

function truncateString(str, max) {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

module.exports = {
  sanitizeUrl,
  classifyUpdate,
  cleanToDiscordMarkdown,
  extractUpdateImage,
  buildUpdateNotificationPayload,
  buildGameCatalogEmbed
};
