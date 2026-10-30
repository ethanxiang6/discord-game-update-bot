const assert = require('node:assert');
const { LAUNCHERS, CONSOLES, CURATED_GAMES } = require('./data/platformsAndGames');
const { browseGames, resolveGame } = require('./services/catalogService');
const {
  getGuildSettings,
  setGuildSettings,
  addOrUpdateTrackedGame,
  getTrackedGamesByGuild,
  removeTrackedGame
} = require('./database/db');
const {
  classifyUpdate,
  cleanToDiscordMarkdown,
  buildUpdateNotificationPayload
} = require('./utils/formatter');

const setupCommand = require('./commands/setup');
const gameCommand = require('./commands/game');
const updatesCommand = require('./commands/updates');

async function runTests() {
  console.log('🧪 Running smoke tests for Discord Game Update Tracker Bot...');

  // 1. Verify Launchers & Consoles Registry
  assert.ok(Object.keys(LAUNCHERS).length >= 10, 'Should support at least 10 game portals/launchers');
  assert.ok(Object.keys(CONSOLES).length >= 7, 'Should support all major consoles & platforms');
  assert.ok(CURATED_GAMES.length >= 25, 'Should include curated cross-platform & console exclusive titles');
  console.log(`✅ Verified ${Object.keys(LAUNCHERS).length} launchers, ${Object.keys(CONSOLES).length} consoles, and ${CURATED_GAMES.length} curated titles.`);

  // 2. Verify Catalog Browse & Resolve
  const switchGames = browseGames({ console: 'switch' });
  assert.ok(switchGames.length > 0, 'Should return Nintendo Switch games');
  const riotGames = browseGames({ launcher: 'riot' });
  assert.ok(riotGames.length > 0, 'Should return Riot Client games');

  const resolved = await resolveGame('VALORANT');
  assert.strictEqual(resolved.name, 'VALORANT');
  console.log('✅ Verified Catalog Service browse and game resolution.');

  // 3. Verify SQLite Database Operations
  const testGuildId = 'test-guild-999';
  setGuildSettings(testGuildId, {
    defaultChannelId: '123456789012345678',
    useForumThreads: true,
    patchesOnlyDefault: true
  });
  const settings = getGuildSettings(testGuildId);
  assert.strictEqual(settings.default_channel_id, '123456789012345678');
  assert.strictEqual(settings.use_forum_threads, true);
  assert.strictEqual(settings.patches_only_default, true);

  const tracked = addOrUpdateTrackedGame(testGuildId, resolved, {
    pingRoleId: '987654321098765432',
    patchesOnly: true
  });
  assert.strictEqual(tracked.game_name, 'VALORANT');
  assert.strictEqual(tracked.ping_role_id, '987654321098765432');

  const guildGames = getTrackedGamesByGuild(testGuildId);
  assert.strictEqual(guildGames.length, 1);

  const removed = removeTrackedGame(testGuildId, resolved.id);
  assert.strictEqual(removed, true);
  console.log('✅ Verified SQLite Database (guild_settings, tracked_games, seen_updates).');

  // 4. Verify Patch Notes Formatter & BBCode/HTML Conversion
  const sampleBBCode = `[h1]Patch 9.08 Notes[/h1][b]Agent Updates[/b][list][*]Fixed a bug with Jett's Tailwind.[*]Updated map rotation.[/list][url=https://playvalorant.com]Official Patch Notes[/url]`;
  const markdown = cleanToDiscordMarkdown(sampleBBCode);
  assert.ok(markdown.includes('### 📌 Patch 9.08 Notes'), 'Should convert [h1] to markdown heading');
  assert.ok(markdown.includes('**Agent Updates**'), 'Should convert [b] to bold');
  assert.ok(markdown.includes('• Fixed a bug'), 'Should convert [*] to bullet list');

  const classification = classifyUpdate('VALORANT Patch Notes 9.08', sampleBBCode, 'Official Feed');
  assert.strictEqual(classification.category, 'patch');
  assert.ok(classification.versionTag, 'Should extract version tag');

  const payload = buildUpdateNotificationPayload(tracked, {
    uid: 'test-1',
    title: 'VALORANT Patch Notes 9.08',
    rawContent: sampleBBCode,
    url: 'https://playvalorant.com/en-us/news/game-updates/',
    sourceName: 'Riot Games Official',
    publishedAt: Date.now()
  });
  assert.strictEqual(payload.embeds.length, 1);
  assert.ok(payload.content.includes('<@&987654321098765432>'), 'Should include role mention');
  console.log('✅ Verified Update Classifier, BBCode/HTML-to-Discord Markdown Converter, and Embed Builder.');

  // 5. Verify Slash Command Builders serialize cleanly
  assert.ok(setupCommand.data.toJSON().name === 'setup');
  assert.ok(gameCommand.data.toJSON().name === 'game');
  assert.ok(updatesCommand.data.toJSON().name === 'updates');
  console.log('✅ Verified all Discord Slash Command definitions.');

  console.log('🎉 All smoke tests passed!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
