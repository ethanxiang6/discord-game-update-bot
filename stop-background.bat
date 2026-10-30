@echo off
echo Stopping background Discord Game Update Tracker Bot...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*src*index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Stopped Bot Process ID:' $_.ProcessId }"
echo Done.
pause
