const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'bot.sqlite');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency and performance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    default_channel_id TEXT,
    use_forum_threads INTEGER DEFAULT 1,
    forum_mode TEXT DEFAULT 'post_per_game',
    patches_only_default INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS tracked_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    game_name TEXT NOT NULL,
    steam_app_id INTEGER,
    launchers_json TEXT DEFAULT '[]',
    consoles_json TEXT DEFAULT '[]',
    genres_json TEXT DEFAULT '[]',
    developer TEXT DEFAULT '',
    cover_image TEXT DEFAULT '',
    feed_url TEXT DEFAULT '',
    official_url TEXT DEFAULT '',
    target_channel_id TEXT,
    thread_id TEXT,
    created_forum_channel_id TEXT,
    ping_role_id TEXT,
    patches_only INTEGER DEFAULT 0,
    last_checked_at INTEGER,
    last_update_title TEXT,
    last_update_at INTEGER,
    added_by TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(guild_id, game_id)
  );

  CREATE TABLE IF NOT EXISTS seen_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    update_uid TEXT NOT NULL,
    title TEXT,
    url TEXT,
    published_at INTEGER,
    posted_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(guild_id, game_id, update_uid)
  );

  CREATE TABLE IF NOT EXISTS catalog_cache (
    game_id TEXT PRIMARY KEY,
    game_json TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
  );
`);

// Safe migrations for existing databases
try {
  db.exec(`ALTER TABLE guild_settings ADD COLUMN forum_mode TEXT DEFAULT 'post_per_game';`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE tracked_games ADD COLUMN created_forum_channel_id TEXT;`);
} catch {
  // Column already exists
}

// --- Guild Settings Helpers ---

function getGuildSettings(guildId) {
  const stmt = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?');
  const row = stmt.get(guildId);
  if (!row) {
    return {
      guild_id: guildId,
      default_channel_id: null,
      use_forum_threads: true,
      forum_mode: 'post_per_game',
      patches_only_default: false
    };
  }
  return {
    ...row,
    use_forum_threads: Boolean(row.use_forum_threads),
    forum_mode: row.forum_mode || 'post_per_game',
    patches_only_default: Boolean(row.patches_only_default)
  };
}

function setGuildSettings(guildId, { defaultChannelId, useForumThreads, forumMode, patchesOnlyDefault }) {
  const current = getGuildSettings(guildId);
  const nextChannel = defaultChannelId !== undefined ? defaultChannelId : current.default_channel_id;
  const nextForum = useForumThreads !== undefined ? (useForumThreads ? 1 : 0) : (current.use_forum_threads ? 1 : 0);
  const nextForumMode = forumMode !== undefined ? forumMode : (current.forum_mode || 'post_per_game');
  const nextPatches = patchesOnlyDefault !== undefined ? (patchesOnlyDefault ? 1 : 0) : (current.patches_only_default ? 1 : 0);

  const stmt = db.prepare(`
    INSERT INTO guild_settings (guild_id, default_channel_id, use_forum_threads, forum_mode, patches_only_default, updated_at)
    VALUES (?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(guild_id) DO UPDATE SET
      default_channel_id = excluded.default_channel_id,
      use_forum_threads = excluded.use_forum_threads,
      forum_mode = excluded.forum_mode,
      patches_only_default = excluded.patches_only_default,
      updated_at = unixepoch()
  `);
  stmt.run(guildId, nextChannel, nextForum, nextForumMode, nextPatches);
  checkpointDatabase();
  return getGuildSettings(guildId);
}

// --- Tracked Games Helpers ---

function deserializeTrackedGame(row) {
  if (!row) return null;
  return {
    ...row,
    launchers: safeJsonParse(row.launchers_json, []),
    consoles: safeJsonParse(row.consoles_json, []),
    genres: safeJsonParse(row.genres_json, []),
    patches_only: Boolean(row.patches_only)
  };
}

function addOrUpdateTrackedGame(guildId, game, options = {}) {
  const existing = getTrackedGame(guildId, game.id);
  const targetChannelId = options.targetChannelId !== undefined ? options.targetChannelId : (existing?.target_channel_id || null);
  const threadId = options.threadId !== undefined ? options.threadId : (existing?.thread_id || null);
  const createdForumChannelId =
    options.createdForumChannelId !== undefined
      ? options.createdForumChannelId
      : (existing?.created_forum_channel_id || null);
  const pingRoleId = options.pingRoleId !== undefined ? options.pingRoleId : (existing?.ping_role_id || null);
  const patchesOnly = options.patchesOnly !== undefined ? (options.patchesOnly ? 1 : 0) : (existing ? (existing.patches_only ? 1 : 0) : 0);
  const customFeedUrl = options.feedUrl || game.feedUrl || existing?.feed_url || '';

  const stmt = db.prepare(`
    INSERT INTO tracked_games (
      guild_id, game_id, game_name, steam_app_id,
      launchers_json, consoles_json, genres_json,
      developer, cover_image, feed_url, official_url,
      target_channel_id, thread_id, created_forum_channel_id, ping_role_id, patches_only, added_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, game_id) DO UPDATE SET
      game_name = excluded.game_name,
      steam_app_id = COALESCE(excluded.steam_app_id, tracked_games.steam_app_id),
      launchers_json = excluded.launchers_json,
      consoles_json = excluded.consoles_json,
      genres_json = excluded.genres_json,
      developer = excluded.developer,
      cover_image = excluded.cover_image,
      feed_url = CASE WHEN excluded.feed_url != '' THEN excluded.feed_url ELSE tracked_games.feed_url END,
      official_url = excluded.official_url,
      target_channel_id = excluded.target_channel_id,
      thread_id = excluded.thread_id,
      created_forum_channel_id = excluded.created_forum_channel_id,
      ping_role_id = excluded.ping_role_id,
      patches_only = excluded.patches_only
  `);

  stmt.run(
    guildId,
    String(game.id),
    game.name,
    game.steamAppId ? Number(game.steamAppId) : null,
    JSON.stringify(game.launchers || []),
    JSON.stringify(game.consoles || []),
    JSON.stringify(game.genres || []),
    game.developer || '',
    game.coverImage || '',
    customFeedUrl,
    game.officialUrl || '',
    targetChannelId,
    threadId,
    createdForumChannelId,
    pingRoleId,
    patchesOnly,
    options.addedBy || null
  );

  checkpointDatabase();
  return getTrackedGame(guildId, String(game.id));
}

function getTrackedGame(guildId, gameId) {
  const stmt = db.prepare('SELECT * FROM tracked_games WHERE guild_id = ? AND game_id = ?');
  return deserializeTrackedGame(stmt.get(guildId, String(gameId)));
}

function getTrackedGamesByGuild(guildId) {
  const stmt = db.prepare('SELECT * FROM tracked_games WHERE guild_id = ? ORDER BY game_name ASC');
  return stmt.all(guildId).map(deserializeTrackedGame);
}

function getAllTrackedGames() {
  const stmt = db.prepare('SELECT * FROM tracked_games ORDER BY id ASC');
  return stmt.all().map(deserializeTrackedGame);
}

function removeTrackedGame(guildId, queryOrId) {
  const byId = db.prepare('DELETE FROM tracked_games WHERE guild_id = ? AND game_id = ?');
  const res1 = byId.run(guildId, String(queryOrId));
  if (res1.changes > 0) return true;

  const byName = db.prepare('DELETE FROM tracked_games WHERE guild_id = ? AND LOWER(game_name) = LOWER(?)');
  const res2 = byName.run(guildId, String(queryOrId));
  return res2.changes > 0;
}

function updateTrackedGameThread(guildId, gameId, threadId) {
  const stmt = db.prepare('UPDATE tracked_games SET thread_id = ? WHERE guild_id = ? AND game_id = ?');
  stmt.run(threadId, guildId, String(gameId));
}

function updateTrackedGameForumChannel(guildId, gameId, forumChannelId) {
  const stmt = db.prepare('UPDATE tracked_games SET created_forum_channel_id = ? WHERE guild_id = ? AND game_id = ?');
  stmt.run(forumChannelId, guildId, String(gameId));
}

function recordLastUpdateStats(guildId, gameId, title, publishedAt) {
  const stmt = db.prepare(`
    UPDATE tracked_games
    SET last_checked_at = unixepoch(),
        last_update_title = COALESCE(?, last_update_title),
        last_update_at = COALESCE(?, last_update_at)
    WHERE guild_id = ? AND game_id = ?
  `);
  stmt.run(title || null, publishedAt || null, guildId, String(gameId));
}

// --- Seen Updates Deduplication ---

function isUpdateSeen(guildId, gameId, updateUid) {
  const stmt = db.prepare('SELECT 1 FROM seen_updates WHERE guild_id = ? AND game_id = ? AND update_uid = ?');
  return Boolean(stmt.get(guildId, String(gameId), String(updateUid)));
}

function markUpdateSeen(guildId, gameId, updateUid, title = '', url = '', publishedAt = null) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO seen_updates (guild_id, game_id, update_uid, title, url, published_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(guildId, String(gameId), String(updateUid), title, url, publishedAt);
}

function hasAnySeenUpdates(guildId, gameId) {
  const stmt = db.prepare('SELECT COUNT(*) as cnt FROM seen_updates WHERE guild_id = ? AND game_id = ?');
  const row = stmt.get(guildId, String(gameId));
  return (row?.cnt || 0) > 0;
}

// --- Catalog Cache ---

function cacheGameMetadata(game) {
  if (!game || !game.id) return;
  const stmt = db.prepare(`
    INSERT INTO catalog_cache (game_id, game_json, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(game_id) DO UPDATE SET
      game_json = excluded.game_json,
      updated_at = unixepoch()
  `);
  stmt.run(String(game.id), JSON.stringify(game));
}

function getCachedGameMetadata(gameId) {
  const stmt = db.prepare('SELECT game_json FROM catalog_cache WHERE game_id = ?');
  const row = stmt.get(String(gameId));
  if (!row) return null;
  return safeJsonParse(row.game_json, null);
}

function checkpointDatabase() {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    // ignore
  }
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

module.exports = {
  db,
  checkpointDatabase,
  getGuildSettings,
  setGuildSettings,
  addOrUpdateTrackedGame,
  getTrackedGame,
  getTrackedGamesByGuild,
  getAllTrackedGames,
  removeTrackedGame,
  updateTrackedGameThread,
  updateTrackedGameForumChannel,
  recordLastUpdateStats,
  isUpdateSeen,
  markUpdateSeen,
  hasAnySeenUpdates,
  cacheGameMetadata,
  getCachedGameMetadata
};
