# 🎮 Discord Universal Game Update & Patch Notes Bot

A multi-platform Discord bot built with **Node.js (`discord.js` v14)** and **SQLite (`node:sqlite`)** that lists and searches games across **all game portals/launchers** and **all consoles**, tracks their updates and patch notes automatically, and posts richly formatted update embeds into your designated Discord channel (or per-game Forum threads).

---

## ✨ Features

### 🚀 All Portals, Launchers & Consoles Covered
- **PC Launchers & Portals**:
  - 🎮 **Steam** (Live search across 100,000+ games + Official Steam News API)
  - ⚡ **Epic Games Store** (Fortnite, Alan Wake 2, Rocket League, etc.)
  - ❄️ **Battle.net** (World of Warcraft, Overwatch 2, Diablo IV, Call of Duty)
  - 👊 **Riot Client** (VALORANT, League of Legends, Teamfight Tactics)
  - 🟠 **EA App / Origin** (Apex Legends, EA SPORTS FC, Battlefield, The Sims)
  - 🌀 **Ubisoft Connect** (Rainbow Six Siege, Assassin's Creed, The Division)
  - 🟣 **GOG Galaxy** (Cyberpunk 2077, Baldur's Gate 3, The Witcher)
  - 🟢 **Xbox PC / Game Pass** (Minecraft, Halo Infinite, Forza Horizon 5)
  - ✨ **HoYoPlay** (Genshin Impact, Honkai: Star Rail, Zenless Zone Zero)
  - 🕹️ **Itch.io & Standalone Launchers** (Escape from Tarkov, Roblox, Path of Exile 2)
- **Consoles & Platforms**:
  - 💙 **PlayStation 5 & PlayStation 4** (Astro Bot, Gran Turismo 7, Marvel's Spider-Man 2, HELLDIVERS 2)
  - 💚 **Xbox Series X|S & Xbox One** (Halo Infinite, Forza Horizon 5, Gears)
  - ❤️ **Nintendo Switch / Switch 2** (Zelda: Tears of the Kingdom, Mario Kart 8 Deluxe, Super Smash Bros. Ultimate, Splatoon 3, Pokémon Scarlet & Violet)
  - 💻 **PC (Windows / macOS / Linux)** & 📱 **Mobile (iOS / Android)**
- **Optional Extended APIs**: Works out-of-the-box with **zero paid API keys** using Steam's public APIs + Wikidata Console Search + Official RSS feeds. Optionally add a free `RAWG_API_KEY` or `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` (IGDB) in `.env` to expand catalog search to 500,000+ historical console games.

### 📜 Smart Patch Notes Formatting & Classification
- Converts **Steam BBCode** (`[h1]`, `[h2]`, `[list]`, `[*]`, `[b]`, `[url]`, `[code]`, `[quote]`) and **HTML** into clean **Discord Markdown**.
- Automatically classifies updates with color-coded badges and extracts version numbers (`v1.2.4`, `Patch 14.2`, `Ver. 3.0`):
  - 🛠️ **Patch Notes / Hotfix** (Emerald Green)
  - 🚀 **Major Content Update / Season** (Purple)
  - 📢 **Official Game Update / Dev News** (Platform Brand Color)
- Supports **Single Updates Channel**, **Per-Game Channel Overrides**, **Announcement Channel Auto-Crossposting**, **Forum Channel Per-Game Threads**, and **Role Pings (`@Role`)**.

---

## 🛠️ Setup & Installation

### 1. Install Dependencies
Open a terminal in `c:\Random AI shit\discord-game-update-bot` and run:
```powershell
npm.cmd install
```

### 2. Configure `.env`
Copy `.env.example` to `.env` and fill in your Discord Bot Token and Client ID from the [Discord Developer Portal](https://discord.com/developers/applications):
```env
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_application_client_id_here
DISCORD_GUILD_ID=optional_server_id_for_instant_command_sync
UPDATE_CHECK_INTERVAL_MINUTES=10
```

### 3. Register Slash Commands
```powershell
npm.cmd run deploy-commands
```

### 4. Start the Bot
```powershell
npm.cmd start
```

---

## 💬 Slash Commands Reference

| Command | Description |
| :--- | :--- |
| `/setup channel <#channel>` | Set the server's default updates channel (supports Text, Announcement, and Forum channels). |
| `/setup status` | View current server settings, connected catalog portals, and polling status. |
| `/game browse [launcher] [console]` | Browse games filtered by Portal/Launcher or Console with an interactive dropdown & 1-click Track button. |
| `/game search <query> [launcher] [console]` | Search across all portals and consoles with live autocomplete, cover art, and 1-click tracking. |
| `/game track <game> [channel] [ping_role] [patches_only]` | Track updates for any game, with optional per-game channel override, `@Role` ping, and patch-only filter. |
| `/game untrack <game>` | Stop tracking a game in the server. |
| `/game list` | View all tracked games in the server, their target channels, role pings, and last update timestamps. |
| `/updates latest <game>` | Immediately fetch and preview the latest formatted patch notes for any game. |
| `/updates check` | Force an immediate poll for new updates across all tracked games in your server. |
| `/updates test <game>` | Post the latest update of a tracked game directly into your updates channel to test formatting. |
