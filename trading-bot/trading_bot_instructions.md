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
- **The risk engine** (`src/riskEngine.ts`, `src/risk/rules/*`,
  `src/risk/filters.ts`) has veto power over every candidate order, paper
  included: `assess(candidate, state) → RiskVerdict`. Rules run in order
  (kill switch first): kill switch, stale data, spread, per-trade sizing (the
  existing checkRisk, so an approved candidate is sized identically to the
  frozen baseline), execution protection, exposure, daily trades, daily loss,
  drawdown. The first failure is the veto. Sizing then passes the exchange
  filters (config.risk.filters, 0 = off). The 24/7 paper trader in watch.ts
  routes every order through it; nothing opens without `approved`. Limits are
  in config.risk and surfaced on `/api/risk`, `/api/system` and the Today
  tab. The engine's own News/Daily-limits/Plan checklist steps are left where
  they are for now (so the baseline evidence text is unchanged); consolidating
  them into the risk engine is a later refactor.
- **The playbook** (`src/strategies/`): one interface,
  `Strategy { meta, evaluate(ctx) → StrategyVote }`. Each strategy reads the
  shared feature snapshot (and, for the session model, the full analysis) and
  returns one vote — BUY/SELL/HOLD, a confidence, the ordered evidence list,
  and a plan when it wants a trade. The registry runs every enabled strategy
  per candle; `analyzeNow` carries the votes on `Snapshot.strategyVotes`.
  Nothing is combined (fusion is Phase 11) and only the ICT session model
  opens paper trades — the others are read-only opinions. `session-ifvg`
  delegates to the IctEngine signal, so its vote is byte-identical to the
  session model. Per-strategy replay is `runStrategyReplay(id)` and
  `npm run replay:raw -- --strategy <id>`; `compareStrategies` and
  `npm run strategies` show them side by side. Strategies are enabled/disabled
  via `settings.enabledStrategies` and the `/api/strategies` routes; the
  Playbook tab shows each one's live vote.
- **Backtesting** (`src/backtest/`) is the honest scoreboard, and it is pure
  over a trade list so it is deterministic and testable. `metrics.ts` is the
  one place every figure (win rate, total/avg R, expectancy, profit factor,
  max drawdown in R, Sharpe-like, losing streak, enoughData) is defined;
  memory-blocked trades are never counted. `splits.ts` cuts the time range
  into contiguous, non-overlapping train/validation/oos windows (upper bound
  exclusive, so no trade is scored twice). `walkForward.ts` rolls a
  [train | test] pair forward by a step and aggregates the test windows into
  the combined out-of-sample result. `monteCarlo.ts` resamples the R list
  with replacement under a seeded RNG — reproducible, and the mean of the
  simulated totals lands on the real total, so the spread is the point.
  `report.ts` puts in-sample next to out-of-sample and says, in plain words,
  which number to trust, labelling any window under `replay.minSetupsForConfidence`
  and calling out the curve-fit pattern (good in-sample, dead out-of-sample).
  `runner.ts` feeds it from `runStrategyReplay(id)` or `runFusedReplay()` over
  whatever candles the store has. Surfaced as `npm run backtest -- --strategy <id|fused>`,
  the `/api/backtest` route, and the *Backtest* button on the Test tab.
  Order-flow strategies are only backtestable inside recorded tape windows;
  outside them the report says "not backtestable" rather than falling back to
  candle approximations. The out-of-sample number is the only one worth acting on.
- **The factory** (`src/factory/`) breeds strategy variants and keeps only the
  ones that hold up out-of-sample, with multiple-testing discipline. A *genome*
  is a strategy id plus a parameter vector; a strategy declares its tunable
  knobs in `meta.parameters` (only knobs that actually change its behaviour —
  the crossover exposes stop and target; the structural-stop strategies expose
  target only; the frozen session model and mean-reversion expose none, and
  order flow is not backtestable). `paramOverrides.ts` is the leaf primitive
  that puts a genome's vector in force for one backtest (so a normal run, with
  no overrides, is byte-identical to before). `genome.ts` gives each genome a
  stable id and computes its grid neighbours; `generate.ts` proposes genomes by
  grid, seeded random, or evolutionary breeding (crossover + mutation);
  `evaluate.ts` scores one with the Phase 13 backtester (the backtest function
  is injectable, so the factory's logic is tested without a month of candles);
  `stats.ts` holds the normal helpers and the deflated Sharpe; `select.ts` is
  the four survival gates — enough OOS trades, a real OOS edge, parameter
  stability across neighbours (a plateau, not a spike), and a deflated Sharpe
  that beats the best-of-N-trials chance benchmark (the trial count is recorded
  and raises the bar); `campaign.ts` runs a seeded, resumable, persisted
  campaign that generates, evaluates (skipping anything already scored), probes
  the neighbours of promising genomes so stability is real, then selects.
  Surfaced as `npm run factory -- --strategy <id> --method grid|random|evolve`,
  the `/api/factory/*` routes, and a minimal *Factory* tab. It **enables
  nothing** — a survivor is a candidate for a passport (Phase 15), never an
  automatic decision — and it does no parameter search that ignores the
  out-of-sample split.
- **The vault** (`src/vault/`) is the lifecycle a factory survivor enters
  before it can trade. A *passport* (`passport.ts`) records the genome, the
  out-of-sample evidence and the decay floor at minting, and is **immutable in
  its identity**: everything after is appended (results, events), and the
  status and decay are re-derived, but the founding evidence is never rewritten.
  The lifecycle is candidate → paper → shadow → live. `decay.ts` watches for an
  edge fading: it flags decay only when the rolling expectancy falls below the
  out-of-sample lower bound (`oosLowerBound`) AND a one-sided lower CUSUM
  confirms a sustained downward shift — with a minimum trade count first, so a
  rough patch is not mistaken for decay; a decaying passport is auto-demoted to
  *watch*. `promotion.ts` is champion-challenger: one champion per strategy
  family, and a challenger is promoted only when it beats the champion
  out-of-sample AND on paper (with enough paper trades) while healthy — and
  automatic promotion never reaches *live* (`nextStage` caps at shadow; the step
  to live is a human decision). `store.ts` persists passports (JSON per
  passport plus an index, so the UI matches disk) and exposes champion/promotion
  lookups; `mint` turns a survivor into a passport, idempotent by genome.
  Surfaced as `npm run vault` (and `-- --mint <campaignId> --genome <id>`), the
  `/api/vault/*` routes, and a *Vault* tab. It **trades nothing and promotes
  nothing to live automatically.**
- **The AI layer** (`src/ai/`) explains the engine; it never forms or places a
  decision. `context.ts` assembles a `NarrationContext` from the feature
  snapshot, the fused decision and the risk verdict — the only facts the model
  may speak about — and collects every number it may quote. `narrator.ts` pins
  the fixed five-section format (market read → what confirms → what invalidates
  → current decision → why not yet), builds the prompt, and ships a
  `deterministicNarration` that always satisfies the format and cites only
  context numbers, so the feature works with no AI key and offline; a
  `validateNarration` rejects a missing section or a number outside the context,
  and `narrate` falls back to the deterministic text when the AI is unavailable
  or off-format (the refusal path in `ai.ts` is unchanged). `cio.ts` defines the
  reported decision as **exactly the fused decision after risk** (an actionable
  side risk vetoes becomes NO TRADE; a WATCH/NO TRADE passes through) — the one
  definition the narrator, the API and the MCP all use, so the CIO can never
  drift from what the engine would do. `researcher.ts` proposes factory
  campaign specs (as data, ordered by priority) but **never runs one** — a spec
  runs only on an explicit click. Surfaced as `GET /api/narrate`, a *Market
  read* button on the Today tab, three new hats in `skills.ts` (CIO, Narrator,
  Researcher), and three read-only MCP tools (`market_read`, `decision`,
  `vault`). **No AI-generated orders, ever.**
- **The command-center UI** (`web/`) is moving to modules, one panel at a time
  so working UI is never thrown away. The styles live in `web/css/app.css`
  (served at `/css/app.css`); `web/js/api.js` and `web/js/state.js` are the
  shared foundation; the server serves `/js/*.js` and `/css/*.css` as read-only
  static files (path-constrained to `web/`). The flagship new panel is the
  **replay player** (`web/js/replay.js`, a *Replay* tab): it ▶plays or steps
  through the last stored candles and shows, for each one, the candlestick view
  with the current candle marked, the fused decision, and every strategy's vote
  **and its evidence** at that candle — backed by `replaySteps()` in `replay.ts`
  and `GET /api/replay/steps` (read-only; it takes no trades). Panels carry a
  loading and an error state. A Playwright smoke (`test/ui/smoke.mjs`, run with
  `npm run ui:smoke`, not in the unit-test glob) opens every tab at 1180px and
  400px and fails on any page or console error. **No live-order controls in the
  UI (Phase 20).**
- **Measured paper trading** (`src/paperTrader.ts` + `src/paper/metrics.ts`) is
  the first end-to-end proof: the full stack on real data with fake money,
  recorded honestly. Every paper order now stores the book at decision time —
  observed bid/ask and the spread it implied — the strategy that produced it,
  the assumed slippage, and the fill latency. A real setup the system could not
  act on (kill switch, stale data) is recorded as a **missed** signal with its
  reason (`recordMissedSignal`), so the record shows the whole edge, not just the
  trades that ran. `paper/metrics.ts` is pure over the closed positions:
  per-strategy realised expectancy, win rate, average observed spread and
  latency, missed counts bucketed by reason, and `comparePaperToOos` which lines
  realised paper expectancy up against each strategy's out-of-sample passport —
  with a sample-sufficiency gate (≥ `minSetupsForConfidence` trades AND ≥ 4
  weeks; the exit criterion is a sample size, never a date). Closed paper trades
  flow into the vault (`recordPaperResult`), so decay and champion-challenger see
  live results (a no-op for the frozen session model, which has no passport).
  Surfaced on `/api/paper` and the Memory tab's measured-paper table. Still
  paper only — **no exchange keys.**
- **Shadow trading** (`src/exchange/`, `src/shadow/`) is the bridge between paper
  and live, and it is strictly read-only. `exchange/sign.ts` signs the venue's
  SIGNED endpoints (HMAC-SHA256, verified against Binance's known vector);
  `exchange/binanceRest.ts` is a read-only client (injectable fetch, server-time
  offset applied to every timestamp) exposing ONLY `exchangeInfo`, `account`,
  `openOrders`, `myTrades` — it has no order-placing method, and there is no
  `POST /api/v3/order` code anywhere in the tree. `assessKeyPermissions` refuses
  a key that can withdraw (the doctor runs this when a key is set).
  `exchange/filters.ts` reads the live LOT_SIZE / tick / min-notional into the
  Phase 12 `Filters` shape. `shadow/recorder.ts` builds the exact order it WOULD
  send — side, quantity rounded to the filters, price, OCO legs — logs it, and
  never sends (a short is built for the record but marked un-placeable, spot
  being long-only). `shadow/scorer.ts` scores an order from the real trades that
  printed after it (which OCO leg hit → R), and `slippageComparison` puts the
  observed spread next to the assumed slippage — the number Phase 4 gets updated
  from. Gated by `config.shadow.enabled` + a read-only `EXCHANGE_API_KEY`
  (`mode.shadowEnabled()`); off by default, `runtimeMode` stays paper. Surfaced
  on `/api/shadow`. **No order is ever sent; no exchange write code exists.**
- **Live execution** (`src/live/`, `src/exchange/binanceTrade.ts`) exists but is
  **dormant**. `binanceTrade.ts` is the only file with order-placing methods
  (marketBuy/marketSell/ocoSell/cancelAll, with a global-vs-US OCO flavour
  switch); it is constructed and called ONLY by `live/trader.ts`, which refuses
  unless `live/gates.ts` reports every gate open. That chain ships CLOSED —
  `LIVE_TRADING_ENABLED` is false, `config.live.enabled` is false — so
  `liveArmed()` is always false in this tree and no order-placing code runs;
  `runtimeMode()` stays paper and the paper `execution.ts` guard is untouched.
  `live/orders.ts` is the order state machine (legal transitions only; a rejected
  order carries zero exposure — no phantom position); `live/reconcile.ts` rebuilds
  the true position from the venue's own `myTrades` after a restart; `trader.ts`
  opens with a market BUY, brackets with an OCO SELL, drives the state machine
  from the fills, and enforces hard caps (notional / trades-per-day / open) on
  top of the risk engine. Surfaced read-only on `/api/live/status`, in the
  doctor, and via `node scripts/live-arm.ts` (reports the chain; never sends).
  The whole path is tested against a MOCK exchange — fills, partial fills, an OCO
  leg fill, rejects, a mid-order disconnect, reconciliation, the kill switch —
  with no keys and no network. **Nothing here can place a real order in this
  build; real money needs a human to open every gate, testnet first.**
- **Production hardening / 24-7** (`src/log.ts`, `src/recovery.ts`, deploy/):
  the paper (and later shadow) process is meant to run unattended for weeks.
  `log.ts` writes structured JSON lines with levels and size-based rotation, and
  never throws (a logging failure can't take the loop down). `recovery.ts`
  re-adopts any paper position that was open when the process stopped, on startup,
  so a restart never orphans a trade (the store is durable; the watch loop prints
  the recovery summary and manages recovered positions from the next candle).
  `/api/health` is a deep check — store integrity, data-dir writability, the feed
  and the kill switch — with an overall `healthy` flag the container health check
  watches. `scripts/backup.ts` (`npm run backup`) copies the store to
  `data/backups/` after an integrity check and prunes to the most recent 14;
  restore by copying a backup over `data/mrcash.db`. Deployment is documented in
  `docs/DEPLOY.md` with a Dockerfile, docker-compose, a PM2 config and a systemd
  unit; TLS is a reverse proxy or tunnel, never the plain port on the internet.
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
`replay:raw`, `replay:memory`, `compare`, `backtest`, `factory`, `vault`,
`memory:show`, `memory:reset`, `plan:clear`, `tradingview`.

Every run prints the settings in force, the data used, and each decision with
its evidence. If prices cannot be fetched the bot stops and says so; it never
substitutes generated data. Performance numbers come only from real candles;
the self-test checks logic and never reports a win rate or a profit figure.
