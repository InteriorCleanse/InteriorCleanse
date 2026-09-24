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

## Watching every market on one screen

The Markets page (More → Markets) and the four cards on Home watch crypto,
stocks, forex and indexes together, around the clock, in the app you already
run. This is the "watch → scan → alert" half of the loop; it is READ-ONLY and
separate from the engine.

| Market | Feed | Key |
|---|---|---|
| Crypto | Binance public candles (the engine's own source list) | none |
| Forex | Kraken's public OHLC — a crypto venue's FX book, not the interbank rate | none |
| Stocks | Alpaca market data, free IEX feed — one exchange's prints | your read-only Alpaca keys (`MRCASH_ALPACA_KEY` / `_SECRET`) |
| Indexes | the ETFs that track them (SPY, QQQ, DIA) through Alpaca, labelled "via SPY" etc. — an ETF is not the index | the same keys |

Every five minutes it pulls hourly candles for each market and scans them with
the engine's own readers: the price and the move over 24 hours, the market-state
vote (trend and strength), a raid on or close through the previous day's high
or low, a fresh gap, an outsized candle. Each new observation lands in the bell
once. The page shows where every number came from (LIVE DATA, DELAYED FEED,
OVERRIDE, NOT CONNECTED, UNAVAILABLE); a feed with no keys or no answer says so
instead of showing a price, and a stock market that is shut shows its last
close marked as such.

```bash
MRCASH_WATCHLIST="crypto:BTCUSDT,crypto:ETHUSDT,forex:EURUSD,stock:AAPL,index:SPY" npm start
MRCASH_MARKETS=0 npm start      # no background scan; the page still loads on demand
```

It cannot trade: `src/markets` has no order path and does not reach the paper
book, the risk engine or the live gate (a test pins this). Paper-trading a
crypto pair is still the fleet's job, one isolated engine per market.

## Real money

Mr. Cash places real orders nowhere by default. The one live path — Binance
spot, built in Phase 20 — is dormant behind every gate in `src/live/gates.ts`
at once: the hard flag `LIVE_TRADING_ENABLED` (ships false), `config.live.enabled`,
the `MRCASH_LIVE` phrase, a typed confirmation, a reconciled testnet track
record, the app guard, a clear kill switch and a healthy feed
(`docs/LIVE_READINESS.md`; `npm run live:check` reports the chain and changes
nothing). Only the owner can flip those, by hand. Nothing in the app, the
fleet or the market watch can. Placing real orders on other venues (stocks,
forex, other exchanges) would mean new execution paths, and none is built.

## Not built yet (candidates)

- Ranking the fleet's lanes by fused score and paper record on the Markets
  page. The page watches every market today; the fleet's per-market paper
  records still live on their own URLs.
- Paper-trading non-crypto markets. They are watched now, but the engine's
  sessions, fees and fill model are crypto ones; trading them on paper needs
  its own validation, not a switch.
- Futures, which need a data provider the bot does not have.
