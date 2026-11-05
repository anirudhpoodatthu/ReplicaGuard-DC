@echo off
setlocal EnableExtensions
cd /d "%~dp0"
rem First account on a fresh install is the admin account.
set "BOOTSTRAP_FIRST_USER_ADMIN=true"
title ReplicaGuard-DC - One Click Setup

echo ================================================
echo ReplicaGuard-DC - ONE-CLICK SETUP AND START
echo ================================================
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not on PATH.
  echo Install Node.js LTS once from https://nodejs.org/ then restart Windows Terminal.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js LTS and ensure npm is selected.
  pause
  exit /b 1
)

echo Checking dependencies automatically...
if not exist "node_modules\.bin\tsc.cmd" goto INSTALL_DEPS
if not exist "node_modules\vite\bin\vite.js" goto INSTALL_DEPS
if not exist "node_modules\concurrently\dist\bin\concurrently.js" goto INSTALL_DEPS
goto BUILD

:INSTALL_DEPS
echo.
echo Some dependencies are missing. Repairing them automatically now...
if exist package-lock.json (
  call npm ci --include=dev
  if errorlevel 1 (
    echo npm ci could not complete. Trying npm install to repair dependencies...
    call npm install --include=dev
    if errorlevel 1 goto FAILED
  )
) else (
  call npm install --include=dev
  if errorlevel 1 goto FAILED
)

:BUILD
echo.
echo Building project automatically...
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed. Attempting one automatic dependency repair...
  call npm install --include=dev
  if errorlevel 1 goto FAILED
  call npm run build
  if errorlevel 1 goto FAILED
)
if not exist storage\server1 mkdir storage\server1
if not exist storage\server2 mkdir storage\server2
if not exist storage\server3 mkdir storage\server3

echo.
echo Starting coordinator, three storage nodes, and website...
start "ReplicaGuard Cluster" cmd /k "cd /d ""%~dp0"" && npm run dev"
echo.
echo Done. Keep the ReplicaGuard Cluster terminal open while using the app.
echo Open the Vite Local URL shown in that terminal, usually http://localhost:5173.
echo You should not need to run npm commands manually.
timeout /t 5 >nul
exit /b 0

:FAILED
echo.
echo [ERROR] Automatic setup/build failed.
echo Please take a screenshot of the error above and send it to ChatGPT.
echo Do not delete the storage folder; it may contain your uploaded replicas.
pause
exit /b 1
