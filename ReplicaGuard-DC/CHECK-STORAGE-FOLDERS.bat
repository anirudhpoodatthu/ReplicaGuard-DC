@echo off
setlocal
cd /d "%~dp0"
echo ReplicaGuard storage folder check
echo Project root: %CD%
echo.
for %%D in (server1 server2 server3) do (
  if exist "storage\%%D" (
    echo [OK] storage\%%D exists
    dir /a-d /b "storage\%%D" 2>nul
  ) else (
    echo [MISSING] storage\%%D
  )
)
echo.
echo Replica files are stored under generated UUID filenames, not original upload names.
pause
