@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$target=Join-Path (Get-Location) 'START-REPLICAGUARD-DESKTOP.bat'; $desktop=[Environment]::GetFolderPath('Desktop'); $shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'ReplicaGuard.lnk')); $shortcut.TargetPath=$target; $shortcut.WorkingDirectory=(Get-Location).Path; $shortcut.Description='Launch ReplicaGuard distributed storage'; $shortcut.Save()"
if errorlevel 1 (echo Could not create shortcut. You can use START-REPLICAGUARD-DESKTOP.bat directly.) else echo Desktop shortcut created: ReplicaGuard
pause
