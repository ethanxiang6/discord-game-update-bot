const { CURATED_GAMES, LAUNCHERS, CONSOLES } = require('../data/platformsAndGames');
const { cacheGameMetadata, getCachedGameMetadata } = require('../database/db');

// Cache Curated Games on startup
for (const game of CURATED_GAMES) {
  cacheGameMetadata(game);
}

let igdbAccessToken = null;
let igdbTokenExpiresAt = 0;
const searchQueryCache = new Map();

/**
 * Search across all portals, launchers, and consoles.
 * Combines Curated Catalog + Steam Store API + RAWG (if configured) + IGDB (if configured) + Wikidata Console Search.
 */
async function searchGames(query, options = {}) {
  const cleanQuery = (query || '').trim();
  const filterLauncher = options.launcher || null;
  const filterConsole = options.console || null;
  const limit = options.limit || 15;
  const timeoutMs = options.timeoutMs || 4500;

  if (!cleanQuery) {
    return browseGames({ launcher: filterLauncher, console: filterConsole, limit });
  }

  const cacheKey = `${cleanQuery.toLowerCase()}|${filterLauncher || ''}|${filterConsole || ''}`;
  const cachedHit = searchQueryCache.get(cacheKey);
  if (cachedHit && Date.now() - cachedHit.ts < 5 * 60 * 1000) {
    return cachedHit.results.slice(0, limit);
  }

  const lowerQuery = cleanQuery.toLowerCase();

  // 1. Search Curated Multi-Platform & Console-Exclusive Catalog
  const curatedMatches = CURATED_GAMES.filter((g) => {
    const matchesName =
      g.name.toLowerCase().includes(lowerQuery) ||
      (g.developer && g.developer.toLowerCase().includes(lowerQuery)) ||
      (g.id && g.id.replace('curated-', '').includes(lowerQuery));
    if (!matchesName) return false;
    if (filterLauncher && !g.launchers.includes(filterLauncher)) return false;
    if (filterConsole && !g.consoles.includes(filterConsole)) return false;
    return true;
  });

  // 2. Run external catalog queries in parallel with a strict upper bound timeout so autocomplete never expires
  const withTimeout = (promise) =>
    Promise.race([
      promise.catch(() => []),
      new Promise((resolve) => setTimeout(() => resolve([]), timeoutMs))
    ]);

  const tasks = [
    withTimeout(searchSteamStore(cleanQuery)),
    withTimeout(searchRawgCatalog(cleanQuery)),
    withTimeout(searchIgdbCatalog(cleanQuery)),
    withTimeout(searchWikidataGames(cleanQuery))
  ];

  const [steamResults, rawgResults, igdbResults, wikidataResults] = await Promise.all(tasks);

  // Merge and deduplicate by normalized name or Steam AppID
  const merged = [];
  const seenNames = new Set();
  const seenSteamIds = new Set();

  const addGame = (game) => {
    if (!game || !game.name) return;
    if (filterLauncher && (!game.launchers || !game.launchers.includes(filterLauncher))) return;
    if (filterConsole && (!game.consoles || !game.consoles.includes(filterConsole))) return;

    const normName = normalizeTitle(game.name);
    if (game.steamAppId && seenSteamIds.has(Number(game.steamAppId))) {
      return;
    }
    if (seenNames.has(normName)) {
      // Enrich existing entry if new one has a steamAppId or extra consoles/launchers
      const existing = merged.find((m) => normalizeTitle(m.name) === normName);
      if (existing) {
        if (!existing.steamAppId && game.steamAppId) {
          existing.steamAppId = Number(game.steamAppId);
          seenSteamIds.add(Number(game.steamAppId));
        }
        if (!existing.coverImage && game.coverImage) {
          existing.coverImage = game.coverImage;
        }
        existing.launchers = Array.from(new Set([...(existing.launchers || []), ...(game.launchers || [])]));
        existing.consoles = Array.from(new Set([...(existing.consoles || []), ...(game.consoles || [])]));
        cacheGameMetadata(existing);
      }
      return;
    }

    seenNames.add(normName);
    if (game.steamAppId) {
      seenSteamIds.add(Number(game.steamAppId));
    }
    cacheGameMetadata(game);
    merged.push(game);
  };

  for (const g of curatedMatches) addGame({ ...g });
  for (const g of rawgResults) addGame(g);
  for (const g of igdbResults) addGame(g);
  for (const g of steamResults) addGame(g);
  for (const g of wikidataResults) addGame(g);

  searchQueryCache.set(cacheKey, { ts: Date.now(), results: merged });
  return merged.slice(0, limit);
}

/**
 * Browse games filtered by Launcher/Portal or Console.
 */
function browseGames({ launcher = null, console = null, limit = 25 } = {}) {
  let list = [...CURATED_GAMES];
  if (launcher) {
    list = list.filter((g) => g.launchers && g.launchers.includes(launcher));
  }
  if (console) {
    list = list.filter((g) => g.consoles && g.consoles.includes(console));
  }
  return list.slice(0, limit);
}

/**
 * Resolve a single game by ID, Steam AppID, or Name.
 */
async function resolveGame(idOrQuery) {
  if (!idOrQuery) return null;
  const raw = String(idOrQuery).trim();

  // 1. Check Curated
  const curated = CURATED_GAMES.find(
    (g) => g.id === raw || g.name.toLowerCase() === raw.toLowerCase() || (g.steamAppId && String(g.steamAppId) === raw)
  );
  if (curated) return curated;

  // 2. Check SQLite Cache
  const cached = getCachedGameMetadata(raw);
  if (cached) return cached;

  // 3. Check if steam-<appId> or pure numeric Steam AppID
  const steamMatch = raw.match(/^(?:steam-)?(\d{2,10})$/i);
  if (steamMatch) {
    const appId = Number(steamMatch[1]);
    const details = await fetchSteamAppDetails(appId);
    if (details) {
      cacheGameMetadata(details);
      return details;
    }
  }

  // 4. Perform live search and pick best match
  const results = await searchGames(raw, { limit: 5 });
  if (results.length > 0) {
    return results[0];
  }

  // 5. Fallback: create a custom tracked game entry so any game on earth can be tracked
  const fallbackGame = {
    id: `custom-${slugify(raw)}`,
    name: raw,
    steamAppId: null,
    launchers: ['standalone'],
    consoles: ['pc', 'ps5', 'xbox_series', 'switch'],
    genres: ['Game'],
    developer: 'Official Publisher',
    releaseYear: null,
    coverImage: '',
    feedUrl: buildGoogleNewsUpdateFeedUrl(raw),
    officialUrl: ''
  };
  cacheGameMetadata(fallbackGame);
  return fallbackGame;
}

/**
 * Keyless Steam Store Search API (100,000+ games)
 */
async function searchSteamStore(query) {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DiscordGameUpdateTracker/1.0' },
    signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!data || !Array.isArray(data.items)) return [];

  return data.items.slice(0, 10).map((item) => {
    const consoles = ['pc'];
    return {
      id: `steam-${item.id}`,
      name: item.name,
      steamAppId: Number(item.id),
      launchers: ['steam'],
      consoles,
      genres: [],
      developer: '',
      releaseYear: null,
      coverImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/header.jpg`,
      feedUrl: null,
      officialUrl: `https://store.steampowered.com/app/${item.id}`
    };
  });
}

/**
 * Fetch detailed Steam App info by AppID
 */
async function fetchSteamAppDetails(appId) {
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DiscordGameUpdateTracker/1.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data?.[String(appId)];
    if (!entry || !entry.success || !entry.data) return null;
    const info = entry.data;
    return {
      id: `steam-${appId}`,
      name: info.name,
      steamAppId: Number(appId),
      launchers: ['steam'],
      consoles: ['pc'],
      genres: (info.genres || []).map((g) => g.description),
      developer: (info.developers || []).join(', '),
      releaseYear: info.release_date?.date ? Number((info.release_date.date.match(/\d{4}/) || [])[0]) || null : null,
      coverImage: info.header_image || `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
      feedUrl: null,
      officialUrl: info.website || `https://store.steampowered.com/app/${appId}`
    };
  } catch {
    return null;
  }
}

/**
 * RAWG API Search (500,000+ games across all consoles & launchers) - runs if RAWG_API_KEY is set
 */
async function searchRawgCatalog(query) {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) return [];

  const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(query)}&page_size=8`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DiscordGameUpdateTracker/1.0' },
    signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!data || !Array.isArray(data.results)) return [];

  return data.results.map((item) => {
    const consoles = new Set();
    const launchers = new Set();

    for (const p of item.platforms || []) {
      const slug = p.platform?.slug || '';
      if (slug.includes('pc') || slug.includes('macos') || slug.includes('linux')) consoles.add('pc');
      if (slug === 'playstation5') consoles.add('ps5');
      if (slug === 'playstation4') consoles.add('ps4');
      if (slug === 'xbox-series-x') consoles.add('xbox_series');
      if (slug === 'xbox-one') consoles.add('xbox_one');
      if (slug === 'nintendo-switch') consoles.add('switch');
      if (slug === 'ios' || slug === 'android') consoles.add('mobile');
    }

    for (const s of item.stores || []) {
      const slug = s.store?.slug || '';
      if (slug === 'steam') launchers.add('steam');
      if (slug === 'epic-games') launchers.add('epic');
      if (slug === 'gog') launchers.add('gog');
      if (slug === 'itch') launchers.add('itch');
      if (slug === 'xbox-store' || slug === 'xbox360') launchers.add('xboxpc');
    }

    return {
      id: `rawg-${item.id}`,
      name: item.name,
      steamAppId: null,
      launchers: Array.from(launchers),
      consoles: consoles.size > 0 ? Array.from(consoles) : ['pc'],
      genres: (item.genres || []).map((g) => g.name),
      developer: '',
      releaseYear: item.released ? Number(item.released.slice(0, 4)) : null,
      coverImage: item.background_image || '',
      feedUrl: buildGoogleNewsUpdateFeedUrl(item.name),
      officialUrl: `https://rawg.io/games/${item.slug}`
    };
  });
}

/**
 * IGDB / Twitch API Search (if TWITCH_CLIENT_ID & TWITCH_CLIENT_SECRET are set)
 */
async function searchIgdbCatalog(query) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  if (!igdbAccessToken || Date.now() >= igdbTokenExpiresAt) {
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
      { method: 'POST', signal: AbortSignal.timeout(5000) }
    );
    if (!tokenRes.ok) return [];
    const tokenData = await tokenRes.json();
    igdbAccessToken = tokenData.access_token;
    igdbTokenExpiresAt = Date.now() + (tokenData.expires_in - 60) * 1000;
  }

  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${igdbAccessToken}`,
      'Content-Type': 'text/plain'
    },
    body: `search "${query.replace(/"/g, '')}"; fields name,cover.url,platforms.name,first_release_date,genres.name,url; limit 8;`,
    signal: AbortSignal.timeout(6000)
  });

  if (!res.ok) return [];
  const items = await res.json();
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const consoles = new Set();
    for (const p of item.platforms || []) {
      const pname = (p.name || '').toLowerCase();
      if (pname.includes('pc') || pname.includes('windows')) consoles.add('pc');
      if (pname.includes('playstation 5')) consoles.add('ps5');
      if (pname.includes('playstation 4')) consoles.add('ps4');
      if (pname.includes('xbox series')) consoles.add('xbox_series');
      if (pname.includes('xbox one')) consoles.add('xbox_one');
      if (pname.includes('switch')) consoles.add('switch');
      if (pname.includes('ios') || pname.includes('android')) consoles.add('mobile');
    }

    const coverUrl = item.cover?.url
      ? item.cover.url.replace(/^\/\//, 'https://').replace('t_thumb', 't_720p')
      : '';

    return {
      id: `igdb-${item.id}`,
      name: item.name,
      steamAppId: null,
      launchers: [],
      consoles: consoles.size > 0 ? Array.from(consoles) : ['pc'],
      genres: (item.genres || []).map((g) => g.name),
      developer: '',
      releaseYear: item.first_release_date ? new Date(item.first_release_date * 1000).getUTCFullYear() : null,
      coverImage: coverUrl,
      feedUrl: buildGoogleNewsUpdateFeedUrl(item.name),
      officialUrl: item.url || ''
    };
  });
}

/**
 * Keyless Wikidata Video Game Search Fallback
 * Finds console exclusives (Nintendo Switch, PS5, PS4, Xbox, Retro, Upcoming like GTA VI, Bloodborne, etc.)
 * without requiring any API keys.
 */
async function searchWikidataGames(query) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&limit=6&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DiscordGameUpdateTracker/1.0 (https://github.com/discord-game-update-bot)' },
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!data || !Array.isArray(data.search)) return [];

  const games = [];
  for (const item of data.search) {
    const desc = (item.description || '').toLowerCase();
    if (!desc.includes('video game') && !desc.includes('expansion pack') && !desc.includes('esports')) {
      continue;
    }

    const consoles = new Set();
    if (desc.includes('nintendo') || desc.includes('switch')) consoles.add('switch');
    if (desc.includes('playstation') || desc.includes('ps5') || desc.includes('ps4')) consoles.add('ps5');
    if (desc.includes('xbox')) consoles.add('xbox_series');
    if (consoles.size === 0) {
      consoles.add('pc');
      consoles.add('ps5');
      consoles.add('xbox_series');
      consoles.add('switch');
    }

    const yearMatch = desc.match(/\b(19\d\d|20\d\d)\b/);
    games.push({
      id: `wiki-${item.id}`,
      name: item.label,
      steamAppId: null,
      launchers: [],
      consoles: Array.from(consoles),
      genres: [item.description || 'Video Game'],
      developer: '',
      releaseYear: yearMatch ? Number(yearMatch[1]) : null,
      coverImage: '',
      feedUrl: buildGoogleNewsUpdateFeedUrl(item.label),
      officialUrl: `https://www.wikidata.org/wiki/${item.id}`
    });
  }
  return games;
}

function buildGoogleNewsUpdateFeedUrl(gameName) {
  const q = `"${gameName}" ("patch notes" OR "update" OR "hotfix" OR "changelog" OR "version")`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

module.exports = {
  searchGames,
  browseGames,
  resolveGame,
  fetchSteamAppDetails,
  buildGoogleNewsUpdateFeedUrl,
  LAUNCHERS,
  CONSOLES
};
