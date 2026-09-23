# Trading every market — the fleet

Mr. Cash was built around one market at a time. Rather than rewrite the whole
validated engine (strategies, fusion, risk, validation) to juggle many symbols
in one process — which would touch the frozen, tested trading code — the fleet
runs the **exact same engine once per market**, each fully isolated.

## What "every market" means here

The bot's only live data feed is the crypto exchange, so it can trade every
**crypto pair the feed serves**: BTCUSDT, ETHUSDT, SOLUSDT, and hundreds more.
Stocks, forex and futures need a paid broker data feed the bot does not have;
until one is connected, those markets are out of reach. Nothing about this is
real money — every lane is PAPER, exactly like `npm start`.

## Run it

```bash
npm run fleet                                   # default majors watchlist
MRCASH_SYMBOLS=BTCUSDT,ETHUSDT,SOLUSDT,ADAUSDT npm run fleet
MRCASH_DATA_DIR=./data-soak MRCASH_PORT=4173 npm run fleet
```

Each market gets:
- its own **full engine** — watch loop, paper record, research, learning, ops;
- its own **data-dir lane** (`<MRCASH_DATA_DIR>/<SYMBOL>`), so records never
  collide and the one-process-per-directory lock holds per market;
- its own **web app** on its own port (printed on start).

The default watchlist is five majors. Running literally hundreds of pairs at
once is not practical on one machine — each engine keeps its own streams and
schedulers — so pick the markets you want in `MRCASH_SYMBOLS`.

## How it stays honest

- `config.symbol` reads `MRCASH_SYMBOL`; the default is still `BTCUSDT`, so the
  frozen single-symbol validation profile is unchanged. A market only changes
  when a process opts in through the env.
- Every lane is a separate, honest record. A market with no trades still says
  NOT ENOUGH REAL PAPER DATA. No number is shared or invented across markets.
- No live-trading path is added or touched. The fleet is PAPER only.

## Not built yet (candidates)

- One aggregated "all markets" dashboard on a single screen. Today each market
  is its own URL; a combined desk that ranks markets by the fused score and
  the paper record is the natural next step.
- Non-crypto markets (equities, forex, futures), which require connecting a
  broker/data provider first.
