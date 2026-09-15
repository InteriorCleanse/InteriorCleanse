# Mr. Cash — Trading Bot Instructions

The rules this bot was built to. If you ask Claude (or anyone) to change or
extend the bot, hand over this file first — it is the contract the code keeps.

---

## 1. Project Goal

A paper-trading bot for a beginner with a $25 account, built on the ICT
session model: it marks the Asia, London and New York session highs and lows,
waits for a liquidity sweep of one of them inside a killzone, requires
displacement and an inversion fair value gap, and enters on the retest with a
defined stop and target. It reads the economic calendar and headlines, writes
a daily brief, proposes a plan, and only acts within the plan the owner arms.

- **Market:** BTCUSDT · **Timeframe:** 5m · **Clock:** New York time
- **Every decision explains itself.** A list of evidence steps, each with a
  pass/fail and a plain-English detail, so "why?" and "why not?" are always
  answerable.
- Paper mode comes first because the point is to learn how a strategy is tested
  honestly before real money is ever involved.

---

## 2. Safety Rules

- **Paper only. There is no live-trading code path.** Not disabled — absent.
  `LIVE_TRADING_ENABLED` is `false` in `config.ts`, `src/mode.ts` reports
  `paper` as the only reachable mode, and `execution.ts` throws if either is
  ever otherwise.
- **Every state-changing request must prove it came from the app.** `src/guard.ts`
  requires the token issued by `/api/config` on every `POST /api/*` and refuses
  cross-site requests (Sec-Fetch-Site / Origin). A web page open in the same
  browser cannot forge a request to reset memory, change the plan or close a
  position. The TradingView webhook keeps its own secret instead.
- **PIN guessing is throttled per device** (`PinThrottle`): ten wrong PINs lock
  that device for fifteen minutes; other devices are unaffected.
- **One source of truth.** Everything the bot remembers lives in
  `data/mrcash.db` (SQLite via `node:sqlite`, WAL mode, busy timeout). The
  CSV/JSON/Markdown files next to it are readable exports, written after
  every change, never read back. Two processes may write at once.
- **There is a kill switch.** The file `data/STOP` (via `npm run stop`,
  `npm run resume`, the ⏹ button, or `/api/stop`) prevents any new position,
  paper included, until released. Open paper positions are still managed to
  their stop or target. `/api/health` and `npm run status` report it.
- **No secrets in source.** The only optional secret is `ANTHROPIC_API_KEY`,
  read from a gitignored `.env`. No exchange keys exist or are asked for.
- **The dashboard binds to 127.0.0.1 only** and serves no secrets.
- **The AI assistant is boxed in:** it receives the analysis text only, cannot
  call tools, place orders or change settings, and is instructed never to
  claim profitability or give real-money advice.
- **Fills are simulated, never assumed.** `src/sim/fills.ts` is the only
  fill model: next-candle-open entries with spread and slippage, stops filled
  worse than the stop (at the open on a gap), targets only when traded
  through, taker/maker fees, a drift limit that turns a chased entry into a
  MISSED one. `src/sim/trades.ts` is the only R/fee/P&L maths. Replay and the
  paper trader both use them; nothing may fill at the signal price except the
  `ideal` comparison model, which is labelled as such.
- **No action unless risk passes.** Every signal goes through `risk.ts`;
  failures become SKIP with a readable reason.

---

## 3. Strategy Rules (the checklist, in order)

1. **Trading day** — skip weekends (configurable).
2. **Killzone** — only London 02:00–05:00 or New York 08:30–11:00 ET (configurable).
3. **Asia range** — must be complete and at least `minAsiaRangeAtr` ATRs tall.
4. **Liquidity sweep** — within the last `setupWindowCandles`, a wick past a
   finished session high/low, yesterday's high/low, or equal highs/lows, with
   the close back inside. A close *through* is a break, not a sweep. Each sweep
   can produce at most one entry.
5. **Displacement** — after the sweep, a candle in the reversal direction with
   a body ≥ `displacementBodyAtr` ATRs that leaves a fair value gap ≥
   `fvgMinSizeAtr` ATRs.
6. **Inversion FVG** (when `requireInversion`) — an opposite-direction gap
   closed through after the sweep, now acting as support/resistance.
7. **Retest** — the current candle trades into the zone and closes on the
   correct side of it. Entry at that close. No chasing.
8. **Stop & target** — stop `stopBufferAtr` ATRs beyond the sweep wick; target
   the nearest intact opposing liquidity giving ≥ `minRR`, else a fixed R.
9. **News** — no entry within `newsBlackoutMinutes` of a high-impact event.
10. **Daily limits** — `maxTradesPerDay` and `dailyLossLimitR`.
11. **The armed plan** — direction and trade cap the owner agreed to.

Quality score (informational): +MSS, +sweep depth, +bias alignment,
+inversion entry, +gap size.

**Never act on an unclosed candle.** **Never look ahead** — swings are confirmed
`swingLookback` candles later and used only after that.

---

## 4. Risk Rules

- Size from the stop: `quantity = riskUsd / |entry − stop|`, capped by
  `maxPositionValueUsd` and the account; when the cap binds, say so and state
  the real risk.
- Refuse stops wider than 3% of price and reward:risk below `minRR`.
- Fees are charged on both sides in every result, including R-multiples.
- In replay, a candle that hits both stop and target counts as the stop.

---

## 5. Broker / MCP Rules

- **No broker adapter exists.** Prices come from free public read-only
  endpoints. If an adapter is ever added it must be paper/testnet only, verified
  (account, balances, positions, orders, market data) before any build step
  relies on it, and never submit, preview or cancel an order during a check.

---

## 6. Memory Rules

- `data/ledger.csv` (header
  `timestamp,symbol,action,price,quantity,reason,mode,outcome,pnl`) and
  `data/learnings.md`, both human-readable.
- The setup key is precise: `symbol|interval|ICT|session|direction|level|entryType`.
  Memory refuses a setup only when that exact key has lost ≥ `skipAfterLosses`
  times AND wins < `skipIfWinRateBelow`.
- **Only real measured outcomes** are written. No seeding, no invented candles,
  no forced failures. Empty memory means "run the look-back test first", never
  an invented reason to skip.
- Refused trades are still measured, so the "was skipping worth it" table can
  report honestly when memory *hurt*.
- An existing lesson is reported as already-known, never as nothing-to-learn.

---

## 7. News Rules

- Calendar from the public ForexFactory weekly JSON; headlines from public RSS
  feeds. Scored by topic weight and freshness. Ranks attention, never direction.
- Blackouts derive from High-impact events for the configured currencies.
- If a feed fails, say which; if all fail, use the cache and label it stale;
  if there's no cache, run without a blackout and say so in the evidence.

---

## 8. Order Flow, Market State, Alerts

- **Order flow** (`orderflow.ts`) reads the public order book and recent
  trades. Walls are buckets ≥ `wallMultiple` × the median bucket; the tape
  separates buyer- from seller-initiated trades and flags prints ≥
  `bigTradeUsd`. Every reading is logged to `data/orderflow.csv`. The book is
  always described as intent (can be pulled); the tape as fact.
- **Features** (`src/features/`) are the shared readings, computed once per
  closed candle by the ICT engine and carried on every analysis as a
  `FeatureSnapshot`: ATR, the 20/50-hour averages, three-hour momentum,
  volatility, day and session VWAP with bands, and the day's volume profile
  (POC, VAH, VAL). Every feature carries `available`, `source` and `asOf`.
  VWAP and the profile are `source: 'trades'` and exact only when the live
  tape covered the whole anchor without a gap; otherwise they are built from
  candles and flagged `approximate: true`. Features are inputs only — no
  trade rule may live in that folder — and the same code produces them in a
  replay and live.
- **Order flow** (`src/features/` delta, cvd, footprint, tape, largeTrades,
  imbalance, absorption; the `flow` block on the snapshot) is built ONLY from
  the trade and book streams, never from candles. Delta and the footprint are
  per candle; CVD is cumulative from `features.cvdAnchor` (day or session);
  tape speed and large prints are rolling windows; book imbalance comes from
  the live stitched book; absorption is a labelled heuristic whose rule lives
  in `absorption.ts` and is pinned by its test. Every reading is
  `available:false` with a reason the moment the stream drops or reports a
  gap — CVD restarts from the trusted point (`cvdSinceGap`) rather than
  silently carrying a wrong total. The Flow tab shows a "live stream — exact"
  badge when the tape is trusted and "windowed snapshot only" (CVD and
  footprint hidden) when it is not.
- **Market structure** (`structure.ts`, `orderblocks.ts`,
  `features/dealingRange.ts`): swings are confirmed `swingLookback` candles
  after the fact and labelled HH/HL/LH/LL against the previous swing of the
  same kind. A close beyond the latest swing is a break; it is a BOS when it
  goes with the direction of the previous break and a CHoCH when it is the
  first break against it (the very first break is a BOS). An order block is
  the last opposite-coloured candle within `structure.orderBlockLookback`
  candles before a displacement, wick to wick; touched = mitigated, closed
  through = broken, and a broken block is a breaker with the opposite role
  until it is closed through again. The dealing range runs from the last
  swing low to the last swing high; above `premiumAbovePercent` is premium,
  below `discountBelowPercent` is discount. Raids on swing points are
  recorded as swing sweeps in a list of their own — the session checklist
  reads only session-level sweeps, and a regression test pins the baseline
  day's evidence word for word. All of this is drawn on the chart with a
  hover explanation and carried on the analysis; none of it trades yet.
- **Regime** (`src/features/regime.ts`) is a shared reading on every
  `FeatureSnapshot`: one of `trending-up`, `trending-down`, `ranging`,
  `breakout`, `transition`, plus volatility `low/normal/high`, from five
  inputs (structure, hourly averages, momentum, volatility, and cumulative
  delta when the tape is trusted — order flow only ever adds a vote, it is
  never required). `transition` is a fresh CHoCH the averages have not
  confirmed; `breakout` is compressed volatility expanding on a fresh BOS.
  It carries its reasons and is available whenever the structure trackers
  ran. It is surfaced on `MarketState.regime` (the Today card shows it as a
  chip) but nothing trades on it yet — gating comes later.
- **Market state** (`regime.ts`) is a vote: swing structure, hourly EMAs,
  3-hour momentum, today's sweeps, and the tape. Trend needs a 2:1 majority
  with ≥ 3 votes; otherwise "range". Continuation is a 0–100 score with every
  penalty named; watch-outs list nearby liquidity, walls, stretch, news,
  volatility and weekends. It is described as "now", never as a forecast.
- **Market data** (`src/data/`) arrives over one public live stream (trades,
  best bid/ask, order book, forming candle) and is published on an in-process
  bus. Every closed candle is written to the store and announced exactly once,
  whichever path delivered it. If the stream is off, connecting or down, a
  REST heartbeat every `app.watchEveryMinutes` is the feed — the same code
  path, never a fake reading — and the app says which one is in use. The
  stream reconnects by itself with backoff across `data.streamHosts`; a quiet
  stream (`data.staleAfterMs`) counts as down; gaps the exchange cannot fill
  are remembered, not re-requested.
- **Alerts** (`watch.ts`) re-read the market on every candle close (with a
  safety poll every `app.watchEveryMinutes` in case a close is missed) and
  raise events (killzone heads-up/open, sweep, setup, news, trend change,
  big print, TradingView alert). Each is announced once, persisted to the
  store (mirrored to `data/events.jsonl`), shown in the app's bell and
  optionally as a system notification. Two triggers arriving at once run one
  cycle, with one queued. The watcher never acts.

## 9. The App, Phone Access, TradingView, Journal, Pictures

- **PWA**: `web/manifest.json`, `web/sw.js`, icons. The service worker caches
  the shell only — never `/api/`.
- **Phone access** is off by default. When on, the server binds the LAN and
  every non-loopback request needs the PIN once (HttpOnly cookie for the
  run). Secrets (PIN, session token, webhook secret) are generated per start
  unless set in config and are never written to disk.
- **TradingView**: the app embeds TradingView's free widget and accepts
  alerts at `POST /api/tv-alert` guarded by the secret; alerts are logged to
  `data/tv-alerts.csv` and raised as events. Nothing reads TradingView back;
  the docs say so.
- **Journal** (`journal.ts`): entries separate outcome from execution (1–5),
  record plan adherence, emotions and tags; R is computed; the review finds
  leaks by plan/emotion/session/tag with n ≥ 3, names one thing to fix,
  tracks goals and a streak. Stored as JSONL; nothing is inferred beyond the
  data.
- **Pictures**: a chart screenshot may be sent to the assistant, which must
  follow a fixed structure and say "I can't read this" rather than guess.

## 10. Definition of Done

These must work: `selftest` (offline, ≥ 45 checks including a hand-built day
that yields exactly one BUY), `start`, `talk`, `brief`, `news`, `scan`,
`replay:raw`, `replay:memory`, `compare`, `memory:show`, `memory:reset`,
`plan:clear`, `tradingview`.

Every run prints the settings in force, the data used, and each decision with
its evidence. If prices cannot be fetched the bot stops and says so; it never
substitutes generated data. Performance numbers come only from real candles;
the self-test checks logic and never reports a win rate or a profit figure.
