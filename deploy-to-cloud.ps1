$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   24/7 Cloud Deployer (GitHub Actions Cloud Runner)" -ForegroundColor Cyan
Write-Host "   Runs your Discord bot on GitHub's servers with your PC OFF!" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Stop any local running bot instance so it doesn't conflict with the Cloud instance
Write-Host "`n[1/6] Stopping local Node.js bot processes (if running) and flushing SQLite database..." -ForegroundColor Yellow
node -e "const { checkpointDatabase } = require('./src/database/db'); checkpointDatabase();" 2>$null
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*src*index.js*' } | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Host "   Stopped local bot process ID: $($_.ProcessId)"
}

# 2. Read .env for DISCORD_TOKEN and DISCORD_CLIENT_ID
Write-Host "`n[2/6] Reading credentials from .env..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
  Write-Host "[ERROR] .env file not found!" -ForegroundColor Red
  pause
  exit 1
}

$envLines = Get-Content ".env"
$discordToken = ""
$discordClientId = ""

foreach ($line in $envLines) {
  if ($line -match "^DISCORD_TOKEN=(.+)$") { $discordToken = $Matches[1].Trim() }
  if ($line -match "^DISCORD_CLIENT_ID=(.+)$") { $discordClientId = $Matches[1].Trim() }
}

if (-not $discordToken -or $discordToken -eq "your_discord_bot_token_here") {
  Write-Host "[ERROR] Valid DISCORD_TOKEN not found in .env!" -ForegroundColor Red
  pause
  exit 1
}

# 3. Initialize Git repository and create initial commit locally
Write-Host "`n[3/6] Preparing local Git repository..." -ForegroundColor Yellow
if (-not (Test-Path ".git")) {
  git init
  git branch -M main
}

$gitName = git config user.name
if (-not $gitName) {
  git config user.name "ethanxiang6"
  git config user.email "ethanxiang6@users.noreply.github.com"
}

git add .
git commit -m "Deploy 24/7 Discord Game Update Tracker Bot" 2>$null

# 4. Create or sync with GitHub repository
Write-Host "`n[4/6] Syncing with GitHub repository..." -ForegroundColor Yellow
$ghUser = (gh api user --jq .login 2>$null)
if ($ghUser) { $ghUser = $ghUser.Trim() }
if (-not $ghUser) {
  $ghUser = "ethanxiang6"
}

$repoFullName = "$ghUser/discord-game-update-bot"
Write-Host "   Target Repository: https://github.com/$repoFullName"

gh repo view $repoFullName >$null 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "   Creating new repository $repoFullName on GitHub..."
  gh repo create discord-game-update-bot --public --source=. --remote=origin --push
} else {
  git remote remove origin 2>$null
  git remote add origin "https://github.com/$repoFullName.git"

  # Cancel any currently running cloud workflow first so it saves its DB & makes way for the update
  $activeRuns = gh run list --repo $repoFullName --workflow "bot-24-7.yml" --status in_progress --json databaseId --jq ".[].databaseId" 2>$null
  foreach ($runId in $activeRuns) {
    if ($runId) {
      Write-Host "   Stopping previous cloud instance ($runId) to apply update..."
      gh run cancel $runId --repo $repoFullName 2>$null
    }
  }

  git fetch origin main 2>$null
  git checkout origin/main -- data/bot.sqlite 2>$null
  git add .
  git commit -m "Update Discord Game Update Tracker Bot" 2>$null
  git pull --rebase -X ours origin main 2>$null
  git push -u origin main
}

# 5. Upload encrypted Secrets to GitHub Actions
Write-Host "`n[5/6] Uploading encrypted DISCORD_TOKEN and DISCORD_CLIENT_ID to GitHub Secrets..." -ForegroundColor Yellow
$discordToken | gh secret set DISCORD_TOKEN --repo $repoFullName
$discordClientId | gh secret set DISCORD_CLIENT_ID --repo $repoFullName

# 6. Trigger the 24/7 Cloud Runner workflow!
Write-Host "`n[6/6] Starting 24/7 Cloud Bot on GitHub Actions..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
gh workflow run bot-24-7.yml --repo $repoFullName

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "[SUCCESS] Your Discord Bot is now deployed to the Cloud!" -ForegroundColor Green
Write-Host "Live Cloud Status: https://github.com/$repoFullName/actions" -ForegroundColor Green
Write-Host "You can now turn off your PC anytime and the bot will stay online!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
pause
