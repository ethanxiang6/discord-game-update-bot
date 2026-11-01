const { CURATED_GAMES } = require('../data/platformsAndGames');
const { getAllCachedGames, getAllTrackedGames, cacheGameMetadata } = require('../database/db');
const { searchGames, resolveGame } = require('./catalogService');

/**
 * Common game aliases, shorthands, and popular titles for instant & fuzzy matching.
 * Maps normalized alias -> canonical search query or curated ID.
 */
const GAME_ALIASES = {
  // Shorthands & Abbreviations
  'cs2': 'Counter-Strike 2',
  'counter strike 2': 'Counter-Strike 2',
  'counterstrike 2': 'Counter-Strike 2',
  'val': 'VALORANT',
  'valorant': 'VALORANT',
  'lol': 'League of Legends',
  'league': 'League of Legends',
  'league of legends': 'League of Legends',
  'tft': 'Teamfight Tactics',
  'ow2': 'Overwatch 2',
  'overwatch': 'Overwatch 2',
  'overwatch 2': 'Overwatch 2',
  'bg3': "Baldur's Gate 3",
  'baldurs gate 3': "Baldur's Gate 3",
  'gta 6': 'Grand Theft Auto VI',
  'gta vi': 'Grand Theft Auto VI',
  'grand theft auto 6': 'Grand Theft Auto VI',
  'grand theft auto vi': 'Grand Theft Auto VI',
  'gta 5': 'Grand Theft Auto V',
  'gta v': 'Grand Theft Auto V',
  'grand theft auto 5': 'Grand Theft Auto V',
  'rdr2': 'Red Dead Redemption 2',
  'red dead 2': 'Red Dead Redemption 2',
  'red dead redemption 2': 'Red Dead Redemption 2',
  'bo6': 'Call of Duty: Black Ops 6 / Warzone',
  'black ops 6': 'Call of Duty: Black Ops 6 / Warzone',
  'cod': 'Call of Duty: Black Ops 6 / Warzone',
  'cod bo6': 'Call of Duty: Black Ops 6 / Warzone',
  'warzone': 'Call of Duty: Black Ops 6 / Warzone',
  'r6': "Tom Clancy's Rainbow Six Siege",
  'r6s': "Tom Clancy's Rainbow Six Siege",
  'r6 siege': "Tom Clancy's Rainbow Six Siege",
  'rainbow six siege': "Tom Clancy's Rainbow Six Siege",
  'rainbow 6 siege': "Tom Clancy's Rainbow Six Siege",
  'mc': 'Minecraft (Java & Bedrock Edition)',
  'minecraft': 'Minecraft (Java & Bedrock Edition)',
  'mine craft': 'Minecraft (Java & Bedrock Edition)',
  'genshin': 'Genshin Impact',
  'genshin impact': 'Genshin Impact',
  'hsr': 'Honkai: Star Rail',
  'honkai star rail': 'Honkai: Star Rail',
  'zzz': 'Zenless Zone Zero',
  'zenless zone zero': 'Zenless Zone Zero',
  'wuwa': 'Wuthering Waves',
  'wuthering waves': 'Wuthering Waves',
  'apex': 'Apex Legends',
  'apex legends': 'Apex Legends',
  'rl': 'Rocket League',
  'rocket league': 'Rocket League',
  'dbd': 'Dead by Daylight',
  'dead by daylight': 'Dead by Daylight',
  'poe 2': 'Path of Exile 2',
  'poe2': 'Path of Exile 2',
  'path of exile 2': 'Path of Exile 2',
  'poe': 'Path of Exile',
  'tf2': 'Team Fortress 2',
  'team fortress 2': 'Team Fortress 2',
  'totk': 'The Legend of Zelda: Tears of the Kingdom',
  'zelda tears of the kingdom': 'The Legend of Zelda: Tears of the Kingdom',
  'tears of the kingdom': 'The Legend of Zelda: Tears of the Kingdom',
  'botw': 'The Legend of Zelda: Breath of the Wild',
  'breath of the wild': 'The Legend of Zelda: Breath of the Wild',
  'ssbu': 'Super Smash Bros. Ultimate',
  'smash bros': 'Super Smash Bros. Ultimate',
  'smash ultimate': 'Super Smash Bros. Ultimate',
  'super smash bros ultimate': 'Super Smash Bros. Ultimate',
  'mk8': 'Mario Kart 8 Deluxe',
  'mario kart 8': 'Mario Kart 8 Deluxe',
  'mario kart 8 deluxe': 'Mario Kart 8 Deluxe',
  'spiderman 2': "Marvel's Spider-Man 2",
  'spider man 2': "Marvel's Spider-Man 2",
  'marvels spider man 2': "Marvel's Spider-Man 2",
  'marvels spiderman 2': "Marvel's Spider-Man 2",
  'black myth wukong': 'Black Myth: Wukong',
  'wukong': 'Black Myth: Wukong',
  'silksong': 'Hollow Knight: Silksong',
  'hollow knight silksong': 'Hollow Knight: Silksong',
  'hollow knight': 'Hollow Knight',
  'the finals': 'THE FINALS',
  'finals': 'THE FINALS',
  'subnautica 2': 'Subnautica 2',
  'forza horizon 6': 'Forza Horizon 6',
  'forza horizon 5': 'Forza Horizon 5',
  'crimson desert': 'Crimson Desert',
  'phantom blade zero': 'Phantom Blade Zero',
  'elden ring': 'ELDEN RING',
  'helldivers 2': 'HELLDIVERS 2',
  'marvel rivals': 'Marvel Rivals',
  'diablo 4': 'Diablo IV',
  'diablo iv': 'Diablo IV',
  'wow': 'World of Warcraft',
  'world of warcraft': 'World of Warcraft',
  'tarkov': 'Escape from Tarkov',
  'escape from tarkov': 'Escape from Tarkov',
  'fc 25': 'EA SPORTS FC 25',
  'ea fc 25': 'EA SPORTS FC 25',
  'fifa 25': 'EA SPORTS FC 25',
  'monster hunter wilds': 'Monster Hunter Wilds',
  'mh wilds': 'Monster Hunter Wilds',
  'ghost of tsushima': "Ghost of Tsushima DIRECTOR'S CUT",
  'ghost of yotei': 'Ghost of Yōtei',
  'god of war ragnarok': 'God of War Ragnarök',
  'terraria': 'Terraria',
  'stardew valley': 'Stardew Valley',
  'phasmophobia': 'Phasmophobia',
  'lethal company': 'Lethal Company',
  'palworld': 'Palworld',
  'rust': 'Rust',
  'dayz': 'DayZ',
  'destiny 2': 'Destiny 2',
  'warframe': 'Warframe',
  'sea of thieves': 'Sea of Thieves',
  'no mans sky': "No Man's Sky",
  'geometry dash': 'Geometry Dash',
  'brawl stars': 'Brawl Stars',
  'clash royale': 'Clash Royale',
  'clash of clans': 'Clash of Clans',
  'among us': 'Among Us',
  'fall guys': 'Fall Guys',
  'deadlock': 'Deadlock'
};

/**
 * Known popular video games list for fast local typo correction even before hitting external APIs.
 */
const KNOWN_POPULAR_TITLES = [
  'Black Myth: Wukong',
  'Hollow Knight: Silksong',
  'Hollow Knight',
  'Subnautica 2',
  'Subnautica',
  'Forza Horizon 6',
  'Forza Horizon 5',
  'THE FINALS',
  'Crimson Desert',
  'Phantom Blade Zero',
  'Counter-Strike 2',
  'ELDEN RING',
  'Minecraft (Java & Bedrock Edition)',
  'Roblox',
  'Fortnite',
  'VALORANT',
  'League of Legends',
  'Teamfight Tactics',
  'Overwatch 2',
  "Baldur's Gate 3",
  'Cyberpunk 2077',
  "Marvel's Spider-Man 2",
  'Marvel Rivals',
  'HELLDIVERS 2',
  'Apex Legends',
  "Tom Clancy's Rainbow Six Siege",
  'Call of Duty: Black Ops 6 / Warzone',
  'Grand Theft Auto VI',
  'Grand Theft Auto V',
  'Red Dead Redemption 2',
  'Terraria',
  'Stardew Valley',
  'Phasmophobia',
  'Lethal Company',
  'Palworld',
  'Rust',
  'DayZ',
  'Destiny 2',
  'Warframe',
  'Sea of Thieves',
  "No Man's Sky",
  'Monster Hunter Wilds',
  'Monster Hunter: World',
  'Ghost of Tsushima',
  'Ghost of Yotei',
  'God of War Ragnarok',
  'Genshin Impact',
  'Honkai: Star Rail',
  'Zenless Zone Zero',
  'Wuthering Waves',
  'Dead by Daylight',
  'Path of Exile 2',
  'Diablo IV',
  'World of Warcraft',
  'Escape from Tarkov',
  'Rocket League',
  'Dota 2',
  'Team Fortress 2',
  'Geometry Dash',
  'Brawl Stars',
  'Clash Royale',
  'Clash of Clans',
  'The Legend of Zelda: Tears of the Kingdom',
  'Super Smash Bros. Ultimate',
  'Mario Kart 8 Deluxe',
  'Splatoon 3',
  'Pokemon Scarlet and Violet',
  'Astro Bot',
  'Gran Turismo 7',
  'Halo Infinite',
  'EA SPORTS FC 25',
  'NBA 2K25',
  'Deadlock',
  'Delta Force',
  'ARK: Survival Ascended',
  'Satisfactory',
  'Factorio',
  'Hades II',
  'Hades',
  'Sekiro: Shadows Die Twice',
  'Bloodborne',
  'Dark Souls III',
  'Armored Core VI: Fires of Rubicon',
  'Persona 5 Royal',
  'Final Fantasy XIV',
  'Final Fantasy VII Rebirth',
  'Black Desert',
  'The Sims 4',
  'Left 4 Dead 2',
  'Garrys Mod',
  'VRChat',
  'Project Zomboid',
  'RimWorld',
  'Valheim',
  'Deep Rock Galactic',
  'Risk of Rain 2',
  'Ultrakill',
  'Celeste',
  'Cuphead',
  'Undertale',
  'Deltarune'
];

/**
 * Words that indicate normal conversation rather than a game title when a message consists ONLY of these words.
 */
const CONVERSATIONAL_STOPWORDS = new Set([
  'hi', 'hello', 'hey', 'yo', 'sup', 'good', 'morning', 'afternoon', 'evening', 'night',
  'thanks', 'thank', 'you', 'ty', 'thx', 'tysm', 'appreciate', 'it', 'so', 'much', 'a', 'lot',
  'ok', 'okay', 'k', 'kk', 'alright', 'cool', 'nice', 'awesome', 'great', 'sweet', 'bet', 'sick',
  'yes', 'yeah', 'yep', 'yup', 'no', 'nah', 'nope', 'sure', 'maybe', 'idk', 'idek', 'idc',
  'what', 'when', 'where', 'why', 'how', 'who', 'which', 'is', 'are', 'was', 'were', 'will', 'would',
  'can', 'could', 'should', 'do', 'does', 'did', 'have', 'has', 'had', 'the', 'this', 'that', 'these', 'those',
  'my', 'your', 'our', 'their', 'me', 'we', 'us', 'they', 'them', 'he', 'she', 'him', 'her',
  'ticket', 'suggestion', 'suggestions', 'suggest', 'channel', 'forum', 'server', 'bot', 'admin', 'mod', 'staff',
  'help', 'please', 'pls', 'plz', 'bro', 'man', 'dude', 'guys', 'everyone', 'someone', 'anyone',
  'close', 'closed', 'done', 'all', 'nothing', 'else', 'more', 'right', 'now', 'rn', 'wait', 'waiting',
  'test', 'testing', 'work', 'working', 'works', 'added', 'add', 'game', 'games', 'update', 'updates',
  'for', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'of', 'and', 'or', 'but', 'if', 'just', 'like',
  'also', 'too', 'very', 'really', 'actually', 'probably', 'think', 'want', 'need', 'know', 'see', 'look'
]);

/**
 * Normalize any game title or query:
 * - Lowercases
 * - Removes colons, hyphens, apostrophes, trademarks, and special punctuation
 * - Converts Roman numerals (II..X) to Arabic digits so "GTA VI" == "gta 6"
 * - Normalizes compound words ("spiderman" -> "spider man", "minecraft" -> "minecraft")
 */
function normalizeForFuzzy(text) {
  if (!text) return '';
  let s = String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip accents (Pokémon -> pokemon, Ragnarök -> ragnarok)
    .replace(/[™®©]/g, '')
    .replace(/['’`]/g, '') // baldur's -> baldurs
    .replace(/[:\-–—/|\\+.,!?()[\]{}"~*_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize common joined words
  s = s
    .replace(/\bspider\s+man\b/g, 'spiderman')
    .replace(/\bcounter\s+strike\b/g, 'counterstrike')
    .replace(/\bmine\s+craft\b/g, 'minecraft')
    .replace(/\bover\s+watch\b/g, 'overwatch')
    .replace(/\bbattle\s+field\b/g, 'battlefield')
    .replace(/\bstar\s+craft\b/g, 'starcraft')
    .replace(/\bwar\s+craft\b/g, 'warcraft');

  // Convert standalone Roman numerals at end or middle of game titles to numbers
  const romanMap = {
    ii: '2',
    iii: '3',
    iv: '4',
    v: '5',
    vi: '6',
    vii: '7',
    viii: '8',
    ix: '9',
    x: '10',
    xiv: '14',
    xv: '15',
    xvi: '16'
  };

  s = s
    .split(' ')
    .map((word, idx, arr) => {
      // Only convert Roman numeral if it's not the first word
      if (idx > 0 && romanMap[word]) {
        return romanMap[word];
      }
      return word;
    })
    .join(' ');

  return s.trim();
}

/**
 * Strip publisher prefixes and edition suffixes for cleaner core title comparison
 * (e.g., "Marvel's Spider-Man 2" -> "spiderman 2", "Minecraft (Java & Bedrock Edition)" -> "minecraft").
 */
function normalizeCoreGameTitle(title) {
  let clean = String(title || '')
    .replace(/\((?:java|bedrock|pc|console|edition|remastered|director|deluxe|ultimate|complete|goty|official|early access)[^)]*\)/gi, '')
    .replace(/\b(?:director'?s\s+cut|game\s+of\s+the\s+year\s+edition|goty\s+edition|deluxe\s+edition|ultimate\s+edition|complete\s+edition|definitive\s+edition|anniversary\s+edition|enhanced\s+edition|remastered)\b/gi, '')
    .replace(/^(?:marvel'?s|tom\s+clancy'?s|sid\s+meier'?s|garry'?s|disney'?s)\s+/i, '');

  return normalizeForFuzzy(clean);
}

/**
 * Compute optimal string alignment / Damerau-Levenshtein distance (handles adjacent transpositions like "balck" -> "black", "rign" -> "ring").
 */
function damerauLevenshtein(a, b) {
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const dp = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1); // transposition
      }
    }
  }
  return dp[lenA][lenB];
}

/**
 * Compute fuzzy similarity score (0.0 to 1.0) between a user candidate string and a target game title.
 */
function computeGameSimilarity(userQuery, targetGameTitle) {
  const qNorm = normalizeForFuzzy(userQuery);
  const tFullNorm = normalizeForFuzzy(targetGameTitle);
  const tCoreNorm = normalizeCoreGameTitle(targetGameTitle);

  if (!qNorm || !tFullNorm) return 0;

  // 1. Exact match after normalization (handles missing colons, hyphens, caps, Roman numerals)
  if (qNorm === tFullNorm || qNorm === tCoreNorm) {
    return 1.0;
  }

  // Also check if target has a slash/subtitle like "Call of Duty: Black Ops 6 / Warzone"
  const subtitleParts = String(targetGameTitle)
    .split(/[:/–—-]/)
    .map((p) => normalizeCoreGameTitle(p))
    .filter((p) => p.length >= 4);

  for (const part of subtitleParts) {
    if (qNorm === part) return 0.97;
  }

  // 2. Full string Damerau-Levenshtein similarity against full and core normalized titles
  const distFull = damerauLevenshtein(qNorm, tFullNorm);
  const simFull = 1 - distFull / Math.max(qNorm.length, tFullNorm.length);

  const distCore = damerauLevenshtein(qNorm, tCoreNorm);
  const simCore = 1 - distCore / Math.max(qNorm.length, tCoreNorm.length);

  let bestSim = Math.max(simFull, simCore);

  // Check subtitle part similarity too (e.g. "black ops 6" or "tears of the kingdom")
  for (const part of subtitleParts) {
    const distPart = damerauLevenshtein(qNorm, part);
    const simPart = 1 - distPart / Math.max(qNorm.length, part.length);
    if (simPart > bestSim) {
      bestSim = simPart * 0.96;
    }
  }

  // 3. Word-by-word fuzzy alignment (handles multi-word titles where 1 or 2 words have a typo)
  const qWords = qNorm.split(' ').filter(Boolean);
  const tWords = tCoreNorm.split(' ').filter(Boolean);

  if (qWords.length > 0 && tWords.length > 0 && Math.abs(qWords.length - tWords.length) <= 1) {
    let wordScoreSum = 0;
    const compareLen = Math.max(qWords.length, tWords.length);
    for (let i = 0; i < Math.min(qWords.length, tWords.length); i++) {
      const w1 = qWords[i];
      const w2 = tWords[i];
      const wDist = damerauLevenshtein(w1, w2);
      const wSim = 1 - wDist / Math.max(w1.length, w2.length);
      wordScoreSum += wSim;
    }
    const wordAvg = wordScoreSum / compareLen;
    if (wordAvg > bestSim) {
      bestSim = wordAvg;
    }
  }

  return bestSim;
}

/**
 * Extract candidate game name(s) from a user's ticket message.
 * Strips conversational wrapper text like "can you add ... to game updates please"
 * while preserving the core game name.
 */
function extractCandidateQueries(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') return [];

  // Remove Discord user/role/channel mentions and URLs
  let cleaned = rawMessage
    .replace(/<@!?\d+>|<@&\d+>|<#\d+>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\r\n/g, '\n')
    .trim();

  if (!cleaned || cleaned.length < 2 || cleaned.length > 300) return [];

  const candidates = [];
  const fallbackCandidates = [];

  // 1. If the user put quotes around a game name (e.g. Please add "Black Myth Wukong"), extract quoted text first
  const quoteMatches = [...cleaned.matchAll(/["“”]([^"“”]{2,80})["“”]/g)];
  for (const m of quoteMatches) {
    if (m[1]) candidates.push(m[1].trim());
  }

  // 2. Process line by line (in case user wrote multiple lines)
  const lines = cleaned
    .split('\n')
    .map((l) => l.replace(/^[\s•*\-\d.)]+/, '').trim())
    .filter(Boolean);

  for (const line of lines) {
    let phrase = line.replace(/^(?:(?:bot\s+)?test(?:ing)?\s+)*(?:bot\s+)?test(?:ing)?\s*[:,-]\s*/i, '').trim();

    // Strip common conversational prefixes iteratively
    const prefixRegex =
      /^(?:hey\s+there|hey|hi\s+there|hi|hello|yo|sup|um+|uh+|so|well|ok|okay|alright|please|pls|plz|can\s+(?:you|u|we|i)(?:\s+guys)?(?:\s+please|\s+pls|\s+plz)?|could\s+(?:you|u|we|i)(?:\s+guys)?(?:\s+please|\s+pls|\s+plz)?|would\s+(?:you|u)(?:\s+please|\s+pls)?|will\s+(?:you|u)|do\s+you\s+think\s+(?:you|u|we)\s+(?:can|could)|i\s+(?:want|would\s+like|wanna)(?:\s+you|\s+u)?(?:\s+to)?|(?:i\s+)?suggest(?:ing|ed)?(?:\s+adding|\s+putting)?|my\s+suggestion\s+is(?:\s+to\s+add)?|suggestion\s*:|game\s+suggestion\s*:|game\s+name\s*:|game\s*:|i\s+think\s+(?:you|u|we)\s+should(?:\s+add)?|we\s+should(?:\s+add|\s+have|\s+get)?|you\s+should(?:\s+add|\s+put)?|maybe(?:\s+add)?|how\s+about(?:\s+adding)?|what\s+about(?:\s+adding)?|let'?s\s+(?:add|have|get)|add(?:\s+the\s+game)?|put(?:\s+in)?|track|include|get|for\s+the\s+game|the\s+game)\b[\s,:-]*/i;

    for (let i = 0; i < 4; i++) {
      const next = phrase.replace(prefixRegex, '').trim();
      if (next === phrase) break;
      phrase = next;
    }

    // Strip common conversational suffixes iteratively
    const suffixRegex =
      /[\s,.!?:-]*(?:to\s+(?:the\s+)?(?:game\s+|gaming\s+)?updates?(?:\s+channel|\s+forum|\s+list|\s+bot)?|in\s+(?:the\s+)?(?:game\s+|gaming\s+)?updates?(?:\s+channel|\s+forum|\s+list|\s+bot)?|on\s+(?:the\s+)?(?:game\s+|gaming\s+)?updates?|for\s+(?:the\s+)?(?:game\s+|gaming\s+)?updates?|to\s+the\s+(?:server|bot|channel|forum|list|updates)|into\s+(?:the\s+)?(?:game\s+|gaming\s+)?updates?|please|pls|plz|thanks(?:\s+a\s+lot|\s+so\s+much|\s+in\s+advance)?|thank\s+you(?:\s+so\s+much|\s+very\s+much)?|ty|thx|tysm|if\s+possible|if\s+(?:you|u)\s+can|if\s+that'?s\s+(?:ok|okay|fine)|bro|man|dude|guys|everyone|rn|right\s+now)+[\s.!?]*$/i;

    for (let i = 0; i < 4; i++) {
      const next = phrase.replace(suffixRegex, '').trim();
      if (next === phrase) break;
      phrase = next;
    }

    phrase = phrase.replace(/^["'`]+|["'`.!?]+$/g, '').trim();
    if (!phrase || phrase.length < 2) continue;

    // Check if the remaining phrase is purely conversational stopwords
    const normWords = normalizeForFuzzy(phrase).split(' ').filter(Boolean);
    if (normWords.length === 0 || normWords.length > 9) continue;

    const hasNonStopword = normWords.some((w) => !CONVERSATIONAL_STOPWORDS.has(w));
    const normFull = normWords.join(' ');

    // Allow if it's in GAME_ALIASES (e.g. "it takes two", "among us", "rust") or has non-stopwords
    if (!GAME_ALIASES[normFull] && !hasNonStopword) {
      continue;
    }

    candidates.push(phrase);

    // Fallback variants: drop up to 2 leading/trailing filler words ("suggest X pls", "yo add X lol")
    if (normWords.length >= 3) {
      const words = phrase.split(/\s+/);
      for (let n = 1; n <= 2; n++) {
        if (words.length - n >= 2) {
          fallbackCandidates.push(words.slice(n).join(' '));
          fallbackCandidates.push(words.slice(0, words.length - n).join(' '));
        }
      }
    }
  }

  return Array.from(new Set([...candidates, ...fallbackCandidates]));
}

/**
 * Query Wikipedia's keyless search suggestion API to fix severe spelling mistakes
 * (e.g. "subnatica 2" -> "subnautica 2", "terreria" -> "terraria", "phasmaphobia" -> "phasmophobia").
 */
async function fetchSpellcheckSuggestion(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      `${query} video game`
    )}&srlimit=3&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DiscordGameUpdateTracker/1.0 (https://discord.com)' },
      signal: AbortSignal.timeout(3500)
    });
    if (!res.ok) return null;
    const data = await res.json();

    const suggestionRaw = data?.query?.searchinfo?.suggestion;
    if (suggestionRaw) {
      const cleanedSuggestion = suggestionRaw
        .replace(/<\/?[^>]+>/g, '')
        .replace(/\bvideo\s+games?\b/gi, '')
        .trim();
      if (cleanedSuggestion.length >= 2) {
        return cleanedSuggestion;
      }
    }

    const topHit = data?.query?.search?.[0]?.title;
    if (topHit) {
      return topHit.replace(/\s*\((?:video\s+game|series|franchise)[^)]*\)/gi, '').trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Titles that are one word repeated ("TEST TEST TEST") are almost always accidental matches on test/filler text.
 */
function isJunkTitle(name) {
  const words = normalizeForFuzzy(name).split(' ').filter(Boolean);
  return words.length >= 2 && words.every((w) => w === words[0]);
}

/**
 * Try adjacent-letter transpositions of the longest word in a query against the live catalog
 * and return the best sufficiently-similar game.
 */
async function searchTransposedVariants(candidate, normCandidate) {
  const words = normCandidate.split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 4) return null;
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  if (longest.length < 5 || longest.length > 18) return null;

  const variants = new Set();
  for (let i = 0; i < longest.length - 1; i++) {
    if (longest[i] === longest[i + 1]) continue;
    const swapped = longest.slice(0, i) + longest[i + 1] + longest[i] + longest.slice(i + 2);
    variants.add(words.map((w) => (w === longest ? swapped : w)).join(' '));
  }

  const results = await Promise.all(
    [...variants].map((v) => searchGames(v, { limit: 4, timeoutMs: 3500 }).catch(() => []))
  );

  let best = null;
  let bestScore = 0;
  for (const list of results) {
    for (const item of list) {
      if (isJunkTitle(item.name)) continue;
      const sim = computeGameSimilarity(normCandidate, item.name);
      if (sim > bestScore) {
        bestScore = sim;
        best = item;
      }
    }
  }
  return best && bestScore >= 0.8 ? best : null;
}

/**
 * Detect a game from a user's message text (tolerant of typos, missing colons/hyphens, and lowercase).
 * Returns the resolved game object if a valid game is detected, or null if the message does not contain a game.
 */
async function detectGameFromMessage(rawMessage) {
  const candidates = extractCandidateQueries(rawMessage);
  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    const normCandidate = normalizeForFuzzy(candidate);
    if (!normCandidate || normCandidate.length < 2) continue;

    // 1. Check Direct Alias / Shorthand Dictionary first
    if (GAME_ALIASES[normCandidate]) {
      const canonical = GAME_ALIASES[normCandidate];
      const resolved = await resolveGame(canonical);
      if (resolved && !isJunkTitle(resolved.name)) return resolved;
    }

    // 2. Fuzzy match against Alias Dictionary & Known Popular Titles (catches typos like "balck myth wukong", "elden rign", "valorent", "fortinte", "terreria")
    let bestKnownTitle = null;
    let bestKnownScore = 0;

    for (const [aliasKey, canonicalName] of Object.entries(GAME_ALIASES)) {
      if (aliasKey.length < 4 && normCandidate !== aliasKey) continue; // Avoid short abbreviation false positives
      const sim = computeGameSimilarity(normCandidate, aliasKey);
      if (sim > bestKnownScore) {
        bestKnownScore = sim;
        bestKnownTitle = canonicalName;
      }
    }

    for (const title of KNOWN_POPULAR_TITLES) {
      const sim = computeGameSimilarity(normCandidate, title);
      if (sim > bestKnownScore) {
        bestKnownScore = sim;
        bestKnownTitle = title;
      }
    }

    // Also check all Curated, Cached, and already Tracked games in the database
    const localPool = [
      ...CURATED_GAMES,
      ...getAllCachedGames(),
      ...getAllTrackedGames().map((t) => ({ id: t.game_id, name: t.game_name }))
    ];

    let bestLocalGame = null;
    let bestLocalScore = 0;
    for (const g of localPool) {
      if (!g || !g.name) continue;
      const sim = computeGameSimilarity(normCandidate, g.name);
      if (sim > bestLocalScore) {
        bestLocalScore = sim;
        bestLocalGame = g;
      }
    }

    if (bestLocalScore >= 0.78 && bestLocalScore >= bestKnownScore) {
      const fullGame = await resolveGame(bestLocalGame.id || bestLocalGame.name);
      if (fullGame && !isJunkTitle(fullGame.name)) return fullGame;
    }

    if (bestKnownScore >= 0.76 && bestKnownTitle) {
      const resolved = await resolveGame(bestKnownTitle);
      if (resolved && !isJunkTitle(resolved.name)) return resolved;
    }

    // 3. Live Multi-Source Catalog Search (Steam Store API + RAWG + IGDB + Wikidata)
    const liveResults = await searchGames(candidate, { limit: 8, timeoutMs: 4000 });
    let bestLiveGame = null;
    let bestLiveScore = 0;

    for (const item of liveResults) {
      const sim = computeGameSimilarity(normCandidate, item.name);
      if (sim > bestLiveScore) {
        bestLiveScore = sim;
        bestLiveGame = item;
      }
    }

    if (bestLiveGame && bestLiveScore >= 0.72 && !isJunkTitle(bestLiveGame.name)) {
      cacheGameMetadata(bestLiveGame);
      return bestLiveGame;
    }

    // 4. Typo / Spell-Correction Fallback via Wikipedia Suggestion API + Steam Token Search
    const corrected = await fetchSpellcheckSuggestion(candidate);
    if (corrected) {
      const corrSim = computeGameSimilarity(normCandidate, corrected);
      if (corrSim >= 0.64) {
        const correctedResults = await searchGames(corrected, { limit: 5, timeoutMs: 4000 });
        if (correctedResults.length > 0) {
          const topCorrected = correctedResults[0];
          const verifySim = Math.max(
            computeGameSimilarity(corrected, topCorrected.name),
            computeGameSimilarity(normCandidate, topCorrected.name)
          );
          if (verifySim >= 0.65 && !isJunkTitle(topCorrected.name)) {
            cacheGameMetadata(topCorrected);
            return topCorrected;
          }
        }
      }
    }

    // 4b. Adjacent-letter swap typos ("cinderai" -> "cinderia"): search each swapped variant of the longest word
    const typoGame = await searchTransposedVariants(candidate, normCandidate);
    if (typoGame) {
      cacheGameMetadata(typoGame);
      return typoGame;
    }

    // 5. Partial-word Steam fallback for multi-word queries where one word has a typo (e.g. "cyberpukn 2077" or "hollow night silksong")
    const words = normCandidate.split(' ').filter((w) => w.length >= 3);
    if (words.length >= 2) {
      const longestWord = [...words].sort((a, b) => b.length - a.length)[0];
      const lastWord = words[words.length - 1];
      const tokenQueries = Array.from(new Set([longestWord, lastWord]));

      for (const tq of tokenQueries) {
        const tokenResults = await searchGames(tq, { limit: 8, timeoutMs: 3500 });
        for (const item of tokenResults) {
          const sim = computeGameSimilarity(normCandidate, item.name);
          if (sim >= 0.74 && !isJunkTitle(item.name)) {
            cacheGameMetadata(item);
            return item;
          }
        }
      }
    }
  }

  return null;
}

module.exports = {
  normalizeForFuzzy,
  normalizeCoreGameTitle,
  computeGameSimilarity,
  extractCandidateQueries,
  detectGameFromMessage
};
