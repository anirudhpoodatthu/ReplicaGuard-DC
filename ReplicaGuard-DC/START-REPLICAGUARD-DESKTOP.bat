@echo off
setlocal EnableExtensions
cd /d "%~dp0"
rem Bootstrap the first registered account as admin on a fresh install.
rem Once data/users.json exists, subsequent signups are regular users.
set "BOOTSTRAP_FIRST_USER_ADMIN=true"
title ReplicaGuard Desktop - Setup and Diagnostics
if not exist logs mkdir logs
set "LOG=%CD%\logs\desktop-launch.log"
echo ==== ReplicaGuard launch %DATE% %TIME% ==== > "%LOG%"
where node >> "%LOG%" 2>&1
if errorlevel 1 (
 echo Node.js LTS is required. Install it from https://nodejs.org/ then reopen this launcher.
 echo Node.js missing. See %LOG% >> "%LOG%"
 pause
 exit /b 1
)
where npm >> "%LOG%" 2>&1
if errorlevel 1 (
 echo npm was not found. Repair your Node.js LTS installation.
 pause
 exit /b 1
)
if not exist "node_modules\.bin\electron.cmd" goto INSTALL
if not exist "node_modules\.bin\tsc.cmd" goto INSTALL
if not exist "node_modules\concurrently\dist\bin\concurrently.js" goto INSTALL
goto BUILD
:INSTALL
echo First-time setup: installing dependencies. This can take several minutes...
echo Installing npm dependencies... >> "%LOG%"
call npm install --include=dev >> "%LOG%" 2>&1
if errorlevel 1 goto FAILED
:BUILD
echo Checking/building project automatically...
echo Building workspaces... >> "%LOG%"
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 (
 echo First build attempt failed. Retrying dependency installation once...
 echo Build failed; retrying npm install... >> "%LOG%"
 call npm install --include=dev >> "%LOG%" 2>&1
 if errorlevel 1 goto FAILED
 call npm run build >> "%LOG%" 2>&1
 if errorlevel 1 goto FAILED
)
if not exist storage\server1 mkdir storage\server1
if not exist storage\server2 mkdir storage\server2
if not exist storage\server3 mkdir storage\server3
echo Starting ReplicaGuard desktop window. Keep this window open.
echo Starting Electron... >> "%LOG%"
call npm run desktop >> "%LOG%" 2>&1
if errorlevel 1 goto FAILED
echo ReplicaGuard closed.
pause
exit /b 0
:FAILED
echo.
echo ReplicaGuard could not start. The detailed log is here:
echo %LOG%
echo Please send that file or a screenshot of its last lines.
echo Startup failed. >> "%LOG%"
pause
exit /b 1
