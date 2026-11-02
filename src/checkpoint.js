// Merges the SQLite write-ahead log into data/bot.sqlite so a plain `git add data/bot.sqlite` captures every recent change.
const { checkpointDatabase } = require('./database/db');

checkpointDatabase();
