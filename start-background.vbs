Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
WshShell.Run "cmd.exe /c node --watch src\index.js >> bot.log 2>&1", 0, False
MsgBox "Discord Game Update Tracker Bot is now running silently in the background!" & vbCrLf & vbCrLf & "Logs are saved to: " & scriptDir & "\bot.log" & vbCrLf & "Run stop-background.bat anytime to stop it.", vbInformation, "Bot Started in Background"
