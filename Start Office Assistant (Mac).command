#!/bin/bash
cd "$(dirname "$0")/office-assistant"
echo ""
echo "  ==== Office Assistant ===="
echo ""
if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js is not installed yet. Opening the download page..."
  echo "  Install the \"LTS\" version, then double-click this file again."
  open "https://nodejs.org/en/download"
  read -p "  Press Enter to close."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "  First time: installing office files. This takes a minute..."
  npm install
fi
echo "  Opening your office in Chrome in a few seconds."
echo "  Keep this window open while you work. Close it to shut the office."
(
  sleep 3
  open -a "Google Chrome" "http://localhost:4100" 2>/dev/null || open "http://localhost:4100"
) &
npm start
