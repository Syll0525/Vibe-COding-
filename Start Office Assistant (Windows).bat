@echo off
cd /d "%~dp0office-assistant"
echo.
echo   ==== Office Assistant ====
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed yet. Opening the download page...
  echo   Install the "LTS" version, then double-click this file again.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)
if not exist node_modules (
  echo   First time: installing office files. This takes a minute...
  call npm install
)
echo   Opening your office in Chrome in a few seconds.
echo   Keep this window open while you work. Close it to shut the office.
start "" cmd /c "timeout /t 3 >nul & start chrome http://localhost:4100 || start http://localhost:4100"
npm start
