/**
 * Comprehensive definitions for all Game Portals/Launchers, Consoles,
 * Official Platform Feeds, and Curated Cross-Platform / Exclusive Titles.
 */

const LAUNCHERS = {
  steam: {
    id: 'steam',
    name: 'Steam',
    emoji: '🎮',
    color: 0x1b2838,
    url: 'https://store.steampowered.com'
  },
  epic: {
    id: 'epic',
    name: 'Epic Games Store',
    emoji: '⚡',
    color: 0x2a2a2a,
    url: 'https://store.epicgames.com'
  },
  battlenet: {
    id: 'battlenet',
    name: 'Battle.net',
    emoji: '❄️',
    color: 0x009ae4,
    url: 'https://battle.net'
  },
  riot: {
    id: 'riot',
    name: 'Riot Client',
    emoji: '👊',
    color: 0xd13639,
    url: 'https://www.riotgames.com'
  },
  ea: {
    id: 'ea',
    name: 'EA App / Origin',
    emoji: '🟠',
    color: 0xff4747,
    url: 'https://www.ea.com'
  },
  ubisoft: {
    id: 'ubisoft',
    name: 'Ubisoft Connect',
    emoji: '🌀',
    color: 0x0070ff,
    url: 'https://ubisoftconnect.com'
  },
  gog: {
    id: 'gog',
    name: 'GOG Galaxy',
    emoji: '🟣',
    color: 0x86328a,
    url: 'https://www.gog.com'
  },
  xboxpc: {
    id: 'xboxpc',
    name: 'Xbox PC / Game Pass',
    emoji: '🟢',
    color: 0x107c10,
    url: 'https://www.xbox.com/pc-gaming'
  },
  hoyoplay: {
    id: 'hoyoplay',
    name: 'HoYoPlay',
    emoji: '✨',
    color: 0x3b82f6,
    url: 'https://hoyoplay.hoyoverse.com'
  },
  itch: {
    id: 'itch',
    name: 'Itch.io',
    emoji: '🕹️',
    color: 0xfa5c5c,
    url: 'https://itch.io'
  },
  standalone: {
    id: 'standalone',
    name: 'Official Standalone Launcher',
    emoji: '🖥️',
    color: 0x5865f2,
    url: ''
  }
};

const CONSOLES = {
  pc: {
    id: 'pc',
    name: 'PC (Windows / Linux / macOS)',
    shortName: 'PC',
    emoji: '💻',
    color: 0x5865f2
  },
  ps5: {
    id: 'ps5',
    name: 'PlayStation 5',
    shortName: 'PS5',
    emoji: '💙',
    color: 0x00439c,
    defaultFeed: 'https://blog.playstation.com/feed/'
  },
  ps4: {
    id: 'ps4',
    name: 'PlayStation 4',
    shortName: 'PS4',
    emoji: '🟦',
    color: 0x003791,
    defaultFeed: 'https://blog.playstation.com/feed/'
  },
  xbox_series: {
    id: 'xbox_series',
    name: 'Xbox Series X|S',
    shortName: 'Xbox Series X|S',
    emoji: '💚',
    color: 0x107c10,
    defaultFeed: 'https://news.xbox.com/en-us/feed/'
  },
  xbox_one: {
    id: 'xbox_one',
    name: 'Xbox One',
    shortName: 'Xbox One',
    emoji: '🟩',
    color: 0x107c10,
    defaultFeed: 'https://news.xbox.com/en-us/feed/'
  },
  switch: {
    id: 'switch',
    name: 'Nintendo Switch / Switch 2',
    shortName: 'Switch',
    emoji: '❤️',
    color: 0xe60012,
    defaultFeed: 'https://www.nintendolife.com/feeds/latest'
  },
  mobile: {
    id: 'mobile',
    name: 'Mobile (iOS / Android)',
    shortName: 'Mobile',
    emoji: '📱',
    color: 0x10b981
  }
};

/**
 * Curated Cross-Platform, Launcher-Exclusive, and Console-Exclusive Catalog.
 * Supplements dynamic API searches (Steam, RAWG, IGDB, CheapShark, Wikidata)
 * so that non-Steam launchers (Riot, Battle.net, Epic, HoYoPlay, Minecraft)
 * and console exclusives (Nintendo Switch, PlayStation, Xbox) have rich metadata
 * and verified update/patch feeds immediately available.
 */
const CURATED_GAMES = [
  // --- Riot Client & Epic Games Store Titles ---
  {
    id: 'curated-valorant',
    name: 'VALORANT',
    steamAppId: null,
    launchers: ['riot', 'epic'],
    consoles: ['pc', 'ps5', 'xbox_series'],
    genres: ['Tactical Shooter', 'FPS'],
    developer: 'Riot Games',
    releaseYear: 2020,
    coverImage: 'https://images.contentstack.io/v3/assets/bltb6530b271fddd0b1/blt3f072336e3f3ade4/63096d7be4a8c30e088e7720/Valorant_2022_E5A2_PlayVALORANT_ContentStackThumbnail_1200x625_MB01.png',
    feedUrl: 'https://news.google.com/rss/search?q=%22VALORANT%22+(%22patch+notes%22+OR+%22update%22)+site:playvalorant.com+OR+site:riotgames.com&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://playvalorant.com/en-us/news/game-updates/'
  },
  {
    id: 'curated-lol',
    name: 'League of Legends',
    steamAppId: null,
    launchers: ['riot', 'epic'],
    consoles: ['pc'],
    genres: ['MOBA', 'Strategy'],
    developer: 'Riot Games',
    releaseYear: 2009,
    coverImage: 'https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/8722223c1b3f1907eb08972b7a98d12d75df874b-1920x1080.jpg',
    feedUrl: 'https://news.google.com/rss/search?q=%22League+of+Legends%22+%22patch%22+notes+site:leagueoflegends.com&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://www.leagueoflegends.com/en-us/news/tags/patch-notes/'
  },
  {
    id: 'curated-tft',
    name: 'Teamfight Tactics',
    steamAppId: null,
    launchers: ['riot'],
    consoles: ['pc', 'mobile'],
    genres: ['Auto Battler', 'Strategy'],
    developer: 'Riot Games',
    releaseYear: 2019,
    coverImage: 'https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/e25690f7e67d1b68eb7e1e6c25b1908bf5f78c5d-1920x1080.jpg',
    feedUrl: 'https://news.google.com/rss/search?q=%22Teamfight+Tactics%22+%22patch%22+notes&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://teamfighttactics.leagueoflegends.com/en-us/news/'
  },
  {
    id: 'curated-fortnite',
    name: 'Fortnite',
    steamAppId: null,
    launchers: ['epic', 'xboxpc'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one', 'switch', 'mobile'],
    genres: ['Battle Royale', 'Action', 'Sandbox'],
    developer: 'Epic Games',
    releaseYear: 2017,
    coverImage: 'https://cdn2.unrealengine.com/social-image-chapter4-s3-3840x2160-d35912cc25ad.jpg',
    feedUrl: 'https://news.google.com/rss/search?q=%22Fortnite%22+(%22update%22+OR+%22patch+notes%22+OR+%22hotfix%22)+site:fortnite.com+OR+site:epicgames.com&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://www.fortnite.com/news'
  },
  {
    id: 'curated-rocket-league',
    name: 'Rocket League',
    steamAppId: 252950,
    launchers: ['epic', 'steam'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one', 'switch'],
    genres: ['Sports', 'Action', 'Racing'],
    developer: 'Psyonix',
    releaseYear: 2015,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/252950/header.jpg',
    feedUrl: 'https://news.google.com/rss/search?q=%22Rocket+League%22+%22Patch+Notes%22+site:rocketleague.com&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://www.rocketleague.com/en/news'
  },
  {
    id: 'curated-alan-wake-2',
    name: 'Alan Wake 2',
    steamAppId: null,
    launchers: ['epic'],
    consoles: ['pc', 'ps5', 'xbox_series'],
    genres: ['Survival Horror', 'Action-Adventure'],
    developer: 'Remedy Entertainment',
    releaseYear: 2023,
    coverImage: 'https://cdn1.epicgames.com/offer/c4763f236d08423eb47b4c3008779c84/EGS_AlanWake2_RemedyEntertainment_S1_2560x1440-ec44404c0b41bc457cb94cd72cf8f872',
    feedUrl: 'https://news.google.com/rss/search?q=%22Alan+Wake+2%22+(%22update%22+OR+%22patch+notes%22)&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://www.alanwake.com/story/news/'
  },

  // --- Battle.net & Activision Blizzard ---
  {
    id: 'curated-wow',
    name: 'World of Warcraft',
    steamAppId: null,
    launchers: ['battlenet'],
    consoles: ['pc'],
    genres: ['MMORPG', 'Fantasy'],
    developer: 'Blizzard Entertainment',
    releaseYear: 2004,
    coverImage: 'https://bnetcmsus-a.akamaihd.net/cms/blog_header/2g/2G4VZH5TIWJF1602720144046.jpg',
    feedUrl: 'https://news.google.com/rss/search?q=%22World+of+Warcraft%22+(%22Hotfixes%22+OR+%22Patch+Notes%22+OR+%22Update%22)+site:worldofwarcraft.blizzard.com+OR+site:wowhead.com&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://worldofwarcraft.blizzard.com/en-us/news'
  },
  {
    id: 'curated-ow2',
    name: 'Overwatch 2',
    steamAppId: 2357570,
    launchers: ['battlenet', 'steam'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one', 'switch'],
    genres: ['Hero Shooter', 'FPS'],
    developer: 'Blizzard Entertainment',
    releaseYear: 2022,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2357570/header.jpg',
    feedUrl: null, // Uses Steam News API via steamAppId 2357570 + fallback
    officialUrl: 'https://overwatch.blizzard.com/en-us/news/patch-notes/'
  },
  {
    id: 'curated-diablo4',
    name: 'Diablo IV',
    steamAppId: 2344520,
    launchers: ['battlenet', 'steam', 'xboxpc'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one'],
    genres: ['Action RPG', 'Hack and Slash'],
    developer: 'Blizzard Entertainment',
    releaseYear: 2023,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2344520/header.jpg',
    feedUrl: null,
    officialUrl: 'https://news.blizzard.com/en-us/diablo4'
  },
  {
    id: 'curated-cod',
    name: 'Call of Duty: Black Ops 6 / Warzone',
    steamAppId: 1938090,
    launchers: ['battlenet', 'steam', 'xboxpc'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one'],
    genres: ['FPS', 'Battle Royale', 'Action'],
    developer: 'Treyarch / Raven Software',
    releaseYear: 2024,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1938090/header.jpg',
    feedUrl: null,
    officialUrl: 'https://www.callofduty.com/patchnotes'
  },

  // --- HoYoPlay / Standalone / Cross-Platform Giants ---
  {
    id: 'curated-minecraft',
    name: 'Minecraft (Java & Bedrock Edition)',
    steamAppId: null,
    launchers: ['xboxpc', 'standalone'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one', 'switch', 'mobile'],
    genres: ['Sandbox', 'Survival', 'Adventure'],
    developer: 'Mojang Studios',
    releaseYear: 2011,
    coverImage: 'https://www.minecraft.net/content/dam/games/minecraft/key-art/Games_Subnav_Minecraft-300x465.jpg',
    feedUrl: 'https://news.google.com/rss/search?q=%22Minecraft%22+(%22Snapshot%22+OR+%22Java+Edition%22+OR+%22Bedrock%22+OR+%22Changelog%22+OR+%22Update%22)+site:minecraft.net+OR+site:feedback.minecraft.net&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://feedback.minecraft.net/hc/en-us/sections/360001186971-Release-Changelogs'
  },
  {
    id: 'curated-genshin',
    name: 'Genshin Impact',
    steamAppId: null,
    launchers: ['hoyoplay', 'epic'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'mobile'],
    genres: ['Action RPG', 'Open World', 'Gacha'],
    developer: 'HoYoverse',
    releaseYear: 2020,
    coverImage: 'https://fastcdn.hoyoverse.com/mi18n/hk4e_global/m20240816hy38729f2x/upload/5247228571981600249.jpg',
    feedUrl: 'https://news.google.com/rss/search?q=%22Genshin+Impact%22+(%22Version%22+OR+%22Update+Details%22+OR+%22Patch+Notes%22)&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://genshin.hoyoverse.com/en/news'
  },
  {
    id: 'curated-hsr',
    name: 'Honkai: Star Rail',
    steamAppId: null,
    launchers: ['hoyoplay', 'epic'],
    consoles: ['pc', 'ps5', 'mobile'],
    genres: ['Turn-Based RPG', 'Sci-Fi'],
    developer: 'HoYoverse',
    releaseYear: 2023,
    coverImage: 'https://fastcdn.hoyoverse.com/mi18n/hkrpg_global/m20230412hy8g45e88i/upload/6180a957ca9d93a17609200e06f6b5a5_4710726845238451107.png',
    feedUrl: 'https://news.google.com/rss/search?q=%22Honkai:+Star+Rail%22+(%22Version%22+OR+%22Update%22+OR+%22Patch+Notes%22)&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://hsr.hoyoverse.com/en-us/news'
  },
  {
    id: 'curated-zzz',
    name: 'Zenless Zone Zero',
    steamAppId: null,
    launchers: ['hoyoplay', 'epic'],
    consoles: ['pc', 'ps5', 'mobile'],
    genres: ['Action RPG', 'Hack and Slash'],
    developer: 'HoYoverse',
    releaseYear: 2024,
    coverImage: 'https://fastcdn.hoyoverse.com/mi18n/nap_global/m20240528hy3z0w8b9n/upload/5c0c7e4e8f778d99a014e877e97a368f_7221383179761977199.jpg',
    feedUrl: 'https://news.google.com/rss/search?q=%22Zenless+Zone+Zero%22+(%22Version%22+OR+%22Update%22+OR+%22Patch%22)&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://zenless.hoyoverse.com/en-us/news'
  },
  {
    id: 'curated-tarkov',
    name: 'Escape from Tarkov',
    steamAppId: null,
    launchers: ['standalone'],
    consoles: ['pc'],
    genres: ['Extraction Shooter', 'Hardcore FPS'],
    developer: 'Battlestate Games',
    releaseYear: 2017,
    coverImage: 'https://www.escapefromtarkov.com/themes/eft/images/og_image.jpg',
    feedUrl: 'https://news.google.com/rss/search?q=%22Escape+from+Tarkov%22+(%22Patch+Notes%22+OR+%22Update%22+OR+%22Technical+Update%22)&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://www.escapefromtarkov.com/news'
  },
  {
    id: 'curated-roblox',
    name: 'Roblox',
    steamAppId: null,
    launchers: ['standalone', 'xboxpc'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one', 'mobile'],
    genres: ['Sandbox', 'Platform', 'MMO'],
    developer: 'Roblox Corporation',
    releaseYear: 2006,
    coverImage: 'https://images.rbxcdn.com/d66ae37d46e00a1ecacfe9531986690a.jpg',
    feedUrl: 'https://news.google.com/rss/search?q=%22Roblox%22+(%22Release+Notes%22+OR+%22Update%22)&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://create.roblox.com/docs/release-notes/release-notes-600'
  },

  // --- Nintendo Switch Exclusives & First-Party ---
  {
    id: 'curated-totk',
    name: 'The Legend of Zelda: Tears of the Kingdom',
    steamAppId: null,
    launchers: [],
    consoles: ['switch'],
    genres: ['Action-Adventure', 'Open World'],
    developer: 'Nintendo EPD',
    releaseYear: 2023,
    coverImage: 'https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/ncom/software/switch/70010000063714/276a412988e07c4d55a2996c6d38abb408b464413b2dfeb44d2aa460b9f622e1',
    feedUrl: 'https://news.google.com/rss/search?q=%22Tears+of+the+Kingdom%22+(%22Ver.%22+OR+%22update%22+OR+%22patch+notes%22)&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://en-americas-support.nintendo.com/app/answers/detail/a_id/61937'
  },
  {
    id: 'curated-mk8d',
    name: 'Mario Kart 8 Deluxe',
    steamAppId: null,
    launchers: [],
    consoles: ['switch'],
    genres: ['Kart Racing', 'Party'],
    developer: 'Nintendo EPD',
    releaseYear: 2017,
    coverImage: 'https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/ncom/software/switch/70010000000153/de697f487a36d802dd9a5ff0341f717c8486221f2f1219b675af37aca63bc453',
    feedUrl: 'https://news.google.com/rss/search?q=%22Mario+Kart+8+Deluxe%22+(%22Ver.%22+OR+%22update%22+OR+%22patch%22)&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://en-americas-support.nintendo.com/app/answers/detail/a_id/26098'
  },
  {
    id: 'curated-ssbu',
    name: 'Super Smash Bros. Ultimate',
    steamAppId: null,
    launchers: [],
    consoles: ['switch'],
    genres: ['Fighting', 'Platform Fighter'],
    developer: 'Bandai Namco / Sora Ltd.',
    releaseYear: 2018,
    coverImage: 'https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/ncom/software/switch/70010000012332/ac4d1fc9824876ce756406f0525d50c57ded4b2a666f6dfe40a6ac5c3563fad9',
    feedUrl: 'https://news.google.com/rss/search?q=%22Super+Smash+Bros.+Ultimate%22+(%22Ver.%22+OR+%22update%22+OR+%22patch%22)&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://en-americas-support.nintendo.com/app/answers/detail/a_id/42809'
  },
  {
    id: 'curated-splatoon3',
    name: 'Splatoon 3',
    steamAppId: null,
    launchers: [],
    consoles: ['switch'],
    genres: ['Third-Person Shooter', 'Multiplayer'],
    developer: 'Nintendo EPD',
    releaseYear: 2022,
    coverImage: 'https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/ncom/software/switch/70010000046395/9574c1ddce3d8b8c0dd459b997223e39551e4309d3d64d4e08c6f3339f9a1c19',
    feedUrl: 'https://news.google.com/rss/search?q=%22Splatoon+3%22+(%22Ver.%22+OR+%22update%22+OR+%22patch+notes%22)&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461'
  },
  {
    id: 'curated-pokemon-sv',
    name: 'Pokémon Scarlet and Violet',
    steamAppId: null,
    launchers: [],
    consoles: ['switch'],
    genres: ['RPG', 'Adventure'],
    developer: 'Game Freak',
    releaseYear: 2022,
    coverImage: 'https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/ncom/software/switch/70010000053971/e7e182e29612708f417c56e8c7615299b44cf1f720f9b11111e02f36d4537f4c',
    feedUrl: 'https://news.google.com/rss/search?q=%22Pokemon+Scarlet%22+(%22Ver.%22+OR+%22update%22+OR+%22patch%22)&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://en-americas-support.nintendo.com/app/answers/detail/a_id/60277'
  },

  // --- PlayStation Exclusives & First-Party ---
  {
    id: 'curated-astro-bot',
    name: 'Astro Bot',
    steamAppId: null,
    launchers: [],
    consoles: ['ps5'],
    genres: ['Platformer', 'Action-Adventure'],
    developer: 'Team Asobi',
    releaseYear: 2024,
    coverImage: 'https://image.api.playstation.com/vulcan/ap/rnd/202405/2907/dae7de8f65378bf4bf22d37c721f45cd5b3400a285d1a774.png',
    feedUrl: 'https://news.google.com/rss/search?q=%22Astro+Bot%22+(%22update%22+OR+%22patch%22+OR+%22level%22+OR+%22PS5%22)&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://www.playstation.com/en-us/games/astro-bot/'
  },
  {
    id: 'curated-gt7',
    name: 'Gran Turismo 7',
    steamAppId: null,
    launchers: [],
    consoles: ['ps5', 'ps4'],
    genres: ['Racing Simulation', 'Sports'],
    developer: 'Polyphony Digital',
    releaseYear: 2022,
    coverImage: 'https://image.api.playstation.com/vulcan/ap/rnd/202109/1321/yZ7dpmjtHr1olhutHT57IFRh.png',
    feedUrl: 'https://news.google.com/rss/search?q=%22Gran+Turismo+7%22+(%22Update%22+OR+%22Patch%22)+site:gran-turismo.com+OR+site:blog.playstation.com&hl=en-US&gl=US&ceid=US:en',
    officialUrl: 'https://www.gran-turismo.com/us/gt7/news/'
  },
  {
    id: 'curated-spiderman2',
    name: "Marvel's Spider-Man 2",
    steamAppId: 2651280,
    launchers: ['steam', 'epic'],
    consoles: ['ps5', 'pc'],
    genres: ['Action-Adventure', 'Superhero'],
    developer: 'Insomniac Games',
    releaseYear: 2023,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2651280/header.jpg',
    feedUrl: null,
    officialUrl: 'https://insomniac.games/news/'
  },

  // --- Popular Multi-Platform & Steam Blockbusters ---
  {
    id: 'curated-helldivers2',
    name: 'HELLDIVERS 2',
    steamAppId: 553850,
    launchers: ['steam'],
    consoles: ['pc', 'ps5'],
    genres: ['Co-op Shooter', 'Action'],
    developer: 'Arrowhead Game Studios',
    releaseYear: 2024,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/553850/header.jpg',
    feedUrl: null,
    officialUrl: 'https://store.steampowered.com/news/app/553850'
  },
  {
    id: 'curated-cs2',
    name: 'Counter-Strike 2',
    steamAppId: 730,
    launchers: ['steam'],
    consoles: ['pc'],
    genres: ['Tactical Shooter', 'FPS'],
    developer: 'Valve',
    releaseYear: 2023,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/730/header.jpg',
    feedUrl: null,
    officialUrl: 'https://www.counter-strike.net/news/updates'
  },
  {
    id: 'curated-dota2',
    name: 'Dota 2',
    steamAppId: 570,
    launchers: ['steam'],
    consoles: ['pc'],
    genres: ['MOBA', 'Strategy'],
    developer: 'Valve',
    releaseYear: 2013,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/570/header.jpg',
    feedUrl: null,
    officialUrl: 'https://www.dota2.com/patches'
  },
  {
    id: 'curated-apex',
    name: 'Apex Legends',
    steamAppId: 1172470,
    launchers: ['steam', 'ea', 'epic'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one', 'switch'],
    genres: ['Battle Royale', 'Hero Shooter'],
    developer: 'Respawn Entertainment',
    releaseYear: 2019,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1172470/header.jpg',
    feedUrl: null,
    officialUrl: 'https://www.ea.com/games/apex-legends/news'
  },
  {
    id: 'curated-r6s',
    name: "Tom Clancy's Rainbow Six Siege",
    steamAppId: 359550,
    launchers: ['steam', 'ubisoft', 'epic', 'xboxpc'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one'],
    genres: ['Tactical Shooter', 'FPS'],
    developer: 'Ubisoft Montreal',
    releaseYear: 2015,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/359550/header.jpg',
    feedUrl: null,
    officialUrl: 'https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates'
  },
  {
    id: 'curated-cyberpunk',
    name: 'Cyberpunk 2077',
    steamAppId: 1091500,
    launchers: ['steam', 'gog', 'epic'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one'],
    genres: ['Action RPG', 'Open World', 'Sci-Fi'],
    developer: 'CD PROJEKT RED',
    releaseYear: 2020,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg',
    feedUrl: null,
    officialUrl: 'https://www.cyberpunk.net/en/news/'
  },
  {
    id: 'curated-bg3',
    name: "Baldur's Gate 3",
    steamAppId: 1086940,
    launchers: ['steam', 'gog'],
    consoles: ['pc', 'ps5', 'xbox_series'],
    genres: ['CRPG', 'Fantasy', 'Strategy'],
    developer: 'Larian Studios',
    releaseYear: 2023,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/header.jpg',
    feedUrl: null,
    officialUrl: 'https://baldursgate3.game/news/'
  },
  {
    id: 'curated-elden-ring',
    name: 'ELDEN RING',
    steamAppId: 1245620,
    launchers: ['steam'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one'],
    genres: ['Action RPG', 'Souls-like', 'Open World'],
    developer: 'FromSoftware',
    releaseYear: 2022,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/header.jpg',
    feedUrl: null,
    officialUrl: 'https://en.bandainamcoent.eu/elden-ring/elden-ring'
  },
  {
    id: 'curated-halo-infinite',
    name: 'Halo Infinite',
    steamAppId: 1240440,
    launchers: ['steam', 'xboxpc'],
    consoles: ['pc', 'xbox_series', 'xbox_one'],
    genres: ['FPS', 'Arena Shooter', 'Sci-Fi'],
    developer: 'Halo Studios (343 Industries)',
    releaseYear: 2021,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1240440/header.jpg',
    feedUrl: null,
    officialUrl: 'https://www.halowaypoint.com/news'
  },
  {
    id: 'curated-forza-horizon-5',
    name: 'Forza Horizon 5',
    steamAppId: 1551360,
    launchers: ['steam', 'xboxpc'],
    consoles: ['pc', 'xbox_series', 'xbox_one', 'ps5'],
    genres: ['Open World Racing', 'Sports'],
    developer: 'Playground Games',
    releaseYear: 2021,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1551360/header.jpg',
    feedUrl: null,
    officialUrl: 'https://forza.net/news'
  },
  {
    id: 'curated-marvel-rivals',
    name: 'Marvel Rivals',
    steamAppId: 2767030,
    launchers: ['steam', 'epic'],
    consoles: ['pc', 'ps5', 'xbox_series'],
    genres: ['Hero Shooter', 'Action'],
    developer: 'NetEase Games',
    releaseYear: 2024,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2767030/header.jpg',
    feedUrl: null,
    officialUrl: 'https://www.marvelrivals.com/news/'
  },
  {
    id: 'curated-poe2',
    name: 'Path of Exile 2',
    steamAppId: 2694490,
    launchers: ['steam', 'epic', 'standalone'],
    consoles: ['pc', 'ps5', 'xbox_series'],
    genres: ['Action RPG', 'Hack and Slash'],
    developer: 'Grinding Gear Games',
    releaseYear: 2024,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2694490/header.jpg',
    feedUrl: null,
    officialUrl: 'https://www.pathofexile.com/forum/view-forum/patch-notes'
  },
  {
    id: 'curated-eafc25',
    name: 'EA SPORTS FC 25',
    steamAppId: 2669320,
    launchers: ['ea', 'steam', 'epic'],
    consoles: ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one', 'switch'],
    genres: ['Sports', 'Football / Soccer'],
    developer: 'EA Canada',
    releaseYear: 2024,
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2669320/header.jpg',
    feedUrl: null,
    officialUrl: 'https://www.ea.com/games/ea-sports-fc/fc-25/news'
  }
];

function formatLauncherBadges(launcherIds = []) {
  if (!launcherIds || launcherIds.length === 0) return '—';
  return launcherIds
    .map((id) => {
      const l = LAUNCHERS[id];
      return l ? `${l.emoji} ${l.name}` : id;
    })
    .join(' • ');
}

function formatConsoleBadges(consoleIds = []) {
  if (!consoleIds || consoleIds.length === 0) return '—';
  return consoleIds
    .map((id) => {
      const c = CONSOLES[id];
      return c ? `${c.emoji} ${c.shortName}` : id;
    })
    .join(' • ');
}

function getPrimaryColor(consoles = [], launchers = []) {
  for (const cId of consoles) {
    if (cId !== 'pc' && CONSOLES[cId]?.color) {
      return CONSOLES[cId].color;
    }
  }
  for (const lId of launchers) {
    if (LAUNCHERS[lId]?.color) {
      return LAUNCHERS[lId].color;
    }
  }
  return 0x5865f2;
}

module.exports = {
  LAUNCHERS,
  CONSOLES,
  CURATED_GAMES,
  formatLauncherBadges,
  formatConsoleBadges,
  getPrimaryColor
};
