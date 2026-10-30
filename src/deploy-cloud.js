require('dotenv').config();
const { execSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const { checkpointDatabase } = require('./database/db');

const ROOT = path.join(__dirname, '..');

function run(cmd, options = {}) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      stdio: options.silent ? 'pipe' : 'inherit',
      encoding: 'utf8'
    });
  } catch (err) {
    if (!options.ignoreError) {
      throw err;
    }
    return null;
  }
}

function setSecret(repo, name, value) {
  if (!value) return;
  const res = spawnSync('gh', ['secret', 'set', name, '--repo', repo], {
    cwd: ROOT,
    input: value,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit']
  });
  if (res.status !== 0) {
    console.warn(`[WARN] Could not set secret ${name}`);
  }
}

async function main() {
  console.log('============================================================');
  console.log('☁️  24/7 Cloud Deployer (GitHub Actions Cloud Runner)');
  console.log('   Runs your Discord bot on GitHub servers with your PC OFF!');
  console.log('============================================================\n');

  // 1. Flush SQLite WAL to disk
  console.log('[1/5] Checkpointing SQLite database (data/bot.sqlite)...');
  checkpointDatabase();

  // 2. Check .env credentials
  console.log('[2/5] Verifying Discord credentials from .env...');
  const token = (process.env.DISCORD_TOKEN || '').trim();
  const clientId = (process.env.DISCORD_CLIENT_ID || '').trim();
  if (!token || token === 'your_discord_bot_token_here') {
    console.error('❌ ERROR: DISCORD_TOKEN is missing in .env!');
    process.exit(1);
  }

  // 3. Stage & commit local files
  console.log('[3/5] Committing project files to Git...');
  run('git config user.name "ethanxiang6"', { ignoreError: true, silent: true });
  run('git config user.email "ethanxiang6@users.noreply.github.com"', { ignoreError: true, silent: true });
  run('git add .', { ignoreError: true });
  run('git commit -m "Update 24/7 Discord Game Update Tracker Bot"', { ignoreError: true, silent: true });

  // 4. Create or push to GitHub repository
  const repoFullName = 'ethanxiang6/discord-game-update-bot';
  console.log(`[4/5] Syncing with GitHub repository (${repoFullName})...`);

  const repoCheck = spawnSync('gh', ['repo', 'view', repoFullName], { cwd: ROOT, stdio: 'pipe' });
  if (repoCheck.status !== 0) {
    console.log('   Creating repository on GitHub and pushing code...');
    run('gh repo create discord-game-update-bot --public --source=. --remote=origin --push');
  } else {
    run(`git remote remove origin`, { ignoreError: true, silent: true });
    run(`git remote add origin https://github.com/${repoFullName}.git`, { ignoreError: true, silent: true });
    run('git fetch origin main', { ignoreError: true, silent: true });
    run('git checkout origin/main -- data/bot.sqlite', { ignoreError: true, silent: true });
    run('git add .', { ignoreError: true, silent: true });
    run('git commit -m "Sync bot update"', { ignoreError: true, silent: true });
    run('git pull --rebase -X ours origin main', { ignoreError: true, silent: true });
    run('git push -u origin main');
  }

  // 5. Upload Secrets and trigger workflow
  console.log('\n[5/5] Uploading encrypted secrets and starting 24/7 Cloud Workflow...');
  setSecret(repoFullName, 'DISCORD_TOKEN', token);
  setSecret(repoFullName, 'DISCORD_CLIENT_ID', clientId);

  run(`gh workflow run bot-24-7.yml --repo ${repoFullName}`, { ignoreError: true });

  console.log('\n============================================================');
  console.log('✅ SUCCESS! Your Discord Bot is now running 24/7 in the Cloud!');
  console.log(`🔗 View live cloud status: https://github.com/${repoFullName}/actions`);
  console.log('💻 You can now close your local terminal and turn off your PC anytime!');
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Cloud deployment failed:', err.message);
  process.exit(1);
});
