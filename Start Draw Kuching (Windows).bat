@echo off
title Draw Kuching
cd /d "%~dp0"
echo.
echo   ==== Draw Kuching ====
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed yet. Opening the download page...
  echo   Install the "LTS" version, then double-click this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b
)
if not exist node_modules (
  echo   First time: installing game files. This takes a minute...
  call npm install
)
echo   Starting the game. Chrome will open in a few seconds.
echo   Keep this window open while you play. Close it to stop the game.
echo.
start "" cmd /c "timeout /t 4 >nul & start chrome http://localhost:3000/display & timeout /t 3 >nul & start chrome http://localhost:3000/play"
call npm start
pause
