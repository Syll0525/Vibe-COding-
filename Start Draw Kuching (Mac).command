#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  ==== Draw Kuching ===="
echo ""
if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js is not installed yet. Opening the download page..."
  echo "  Install the \"LTS\" version, then double-click this file again."
  open "https://nodejs.org/en/download"
  read -p "  Press Enter to close."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "  First time: installing game files. This takes a minute..."
  npm install
fi
echo "  Starting the game. Chrome will open in a few seconds."
echo "  Keep this window open while you play. Close it to stop the game."
(
  sleep 4
  open -a "Google Chrome" "http://localhost:3000/display" 2>/dev/null || open "http://localhost:3000/display"
  sleep 3
  open -a "Google Chrome" "http://localhost:3000/play" 2>/dev/null || open "http://localhost:3000/play"
) &
npm start
