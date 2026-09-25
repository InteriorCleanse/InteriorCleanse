#!/bin/bash
# Double-click to paper-trade more markets around the clock, one full engine
# per market. Run it NEXT TO start-24-7.command: that window keeps trading BTC
# on its own record; this one adds the others on ports 4174 and up. A market
# that stops restarts itself; if this whole window stops, it restarts too.
# Pretend money only. Close this window to stop it.
cd "$(dirname "$0")" || exit 1
export MRCASH_SYMBOLS="${MRCASH_SYMBOLS:-ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT}"
export MRCASH_PORT="${MRCASH_PORT:-4174}"
export MRCASH_DATA_DIR="${MRCASH_DATA_DIR:-data-fleet}"
# The BTC window already runs the all-markets scan.
export MRCASH_MARKETS=0
echo ""
echo "  Mr. Cash fleet — 24/7 paper trading on $MRCASH_SYMBOLS (Ctrl+C or close this window to stop)"
echo ""
while true; do
  node scripts/fleet.mjs
  echo ""
  echo "  The fleet stopped — restarting in 10 seconds..."
  sleep 10
done
