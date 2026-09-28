#!/bin/bash
# Double-click to run Trading Bot around the clock. If it ever stops, it
# restarts itself after 10 seconds. Close this window to stop it.
cd "$(dirname "$0")" || exit 1
echo ""
echo "  Trading Bot — 24/7 paper trading (Ctrl+C or close this window to stop)"
echo ""
first=1
while true; do
  if [ "$first" = "1" ]; then node src/server.ts; first=0; else NO_BROWSER=1 node src/server.ts; fi
  echo ""
  echo "  Trading Bot stopped — restarting in 10 seconds..."
  sleep 10
done
