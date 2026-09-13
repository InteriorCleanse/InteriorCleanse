#!/bin/bash
# Double-click this file to start Mr. Cash.
cd "$(dirname "$0")" || exit 1
echo ""
echo "  Starting Mr. Cash..."
echo "  (PAPER MODE - no real money, no exchange account)"
echo ""
if ! command -v node > /dev/null 2>&1; then
  echo "  Node is not installed yet."
  echo ""
  echo "  Get it free from https://nodejs.org - click the green LTS button,"
  echo "  run the installer, then double-click this file again."
  echo ""
  read -r -p "  Press Enter to close..."
  exit 1
fi
node src/server.ts
echo ""
read -r -p "  The bot has stopped. Press Enter to close..."
