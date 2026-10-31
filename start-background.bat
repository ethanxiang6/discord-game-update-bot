@echo off
cd /d "%~dp0"
echo Starting Discord Game Update Tracker Bot in the background...
wscript.exe "%~dp0start-background.vbs"
