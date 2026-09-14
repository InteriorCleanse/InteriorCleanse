# Mr. Cash — Technical Audit

**Audited version:** commit `69b01f8` on branch `claude/new-session-31dwy7`, tagged locally as `v0-rough-draft` (Mr. Cash v2.3).
**Audit date:** 2026-09-14.
**Method:** every file in `trading-bot/` was read; `npm run selftest` (72 checks) and `npx tsc --noEmit` were run on the frozen tree and both pass. Nothing in this document is inferred from documentation alone — where a claim could not be verified from code or a run, it says so.
**Rule followed:** no production functionality was changed during the audit. The only new file is this one. In-progress, unverified work from earlier today (BOS/CHoCH labels, order blocks, a multi-strategy engine) was moved to a local branch `claude/wip-v3-playbook` and a patch file, and is **not** part of the audited system.

---

## 1. Current architecture

**Shape.** A single Node process, no framework, no build step. Node 22.22 runs the TypeScript directly (`erasableSyntaxOnly`, `.ts` imports). Zero runtime dependencies; `@anthropic-ai/sdk` is an *optional* dependency and the code loads it lazily.

**Two entry styles.**

| Entry | File | What it does |
| --- | --- | --- |
| `npm start` | `src/server.ts` (472 lines) | HTTP server on 127.0.0.1:4173, serves `web/index.html`, JSON API, starts the watch loop |
| `npm run <cmd>` | `src/index.ts` (525 lines) | 14 terminal commands: scan, brief, news, flow, state, paper, replay:raw/memory, compare, memory:show/reset, plan:clear, help |
| `npm run talk` | `src/talk.ts` | A REPL with ~25 commands incl. arm/sitout/risk/whatif/skill |
| `npm run watch` | `src/watch.ts` | The same loop the server runs, printed to a terminal |
| `npm run mcp` | `src/mcp.ts` | Hand-written JSON-RPC-over-stdio MCP server, 9 tools |
| `npm run doctor`, `picture`, `selftest`, `tradingview` | respective files | Diagnostics, image analysis, offline checks, Pine instructions |

**Data flow for one decision.**
`market.ts` (REST klines) → `IctEngine.step(i)` for every candle in a ~4-day warm-up (`bot.ts:warmupCandles` = 4 × 288 candles at 5m) → `SessionTracker` / `SwingTracker` / `StructureTracker` / `FvgTracker` / `detectSweeps` → `IctEngine.decide` (11-step checklist) → `risk.ts` → optional `adaptiveFilter.ts` (memory) → paper order / paper position. `regime.ts` votes on trend using the same candles plus order flow and news. `brief.ts` renders it as text.

**Persistence.** Flat files in `trading-bot/data/`: `ledger.csv`, `learnings.md`, `positions.json`, `equity.csv`, `events.jsonl`, `journal.jsonl`, `goals.json`, `plan.json`, `news-cache.json`, `orderflow.csv`, `tv-alerts.csv`. No database. No file locking.

**Background work.** One `setInterval` in `watch.ts` (default every 5 minutes) that re-downloads candles, order book and news, raises events, and manages paper positions. No queue, no worker threads, no cron.

**Frontend.** One 877-line `web/index.html` with all CSS and JS inline; canvas chart drawn by hand; PWA manifest + service worker; TradingView embed widget; Web Speech API for voice. No framework, no bundler.

**Sockets.** None. Everything is HTTP polling (dashboard polls `/api/events` every 30 s; watch loop polls exchange REST every 5 min). No WebSocket to the exchange or to the browser.

**Authentication.** None on localhost (any request from 127.0.0.1 is trusted). If `app.allowPhone` is true, other devices pass a PIN once and receive a 30-day cookie.

---

## 2. Existing features (verified working)

- Real BTCUSDT 5m candles from Binance public endpoints, with the still-forming candle dropped (`market.ts:dropUnclosedCandle`). Three hosts tried in order; failure is loud, never faked.
- ICT session engine: Asia/London/NY AM/NY PM ranges in New York time (DST handled via `Intl`), trading day rolling at 18:00 ET, previous-day high/low, equal highs/lows from swings.
- Liquidity sweeps vs breaks, displacement (body ≥ 1 ATR), fair value gaps with a fresh → mitigated → inverted → retested lifecycle, market structure shifts (close beyond last swing).
- The composite ICT strategy with an 11-step evidence checklist and a 0–100 quality score.
- Risk sizing from the stop distance, capped by position value and account size, 3 % max stop, min RR, fees on both sides.
- Look-back replay over 30 days (raw and with memory), with expectancy, drawdown, profit factor, streaks, six breakdown tables, and a "was refusing worth it?" score.
- Memory: ledger + lessons; refuses setups that lost ≥ 3 times with < 40 % win rate. Lessons are written only from measured outcomes.
- News: ForexFactory weekly calendar + 3 RSS feeds, scoring, blackout windows, cached with staleness warnings.
- Order flow: REST order-book snapshot (up to 1000 levels per side), wall detection, aggregated-trade tape with taker side, big-print detection, CSV log.
- Market state: a 7-vote regime call (structure, hourly EMAs, momentum, sweeps, tape) with strength, continuation score, and watch-outs.
- Daily brief, proposed plan, armed plan (`data/plan.json`) that the engine obeys.
- 24/7 paper trader: opens paper positions when the checklist, risk and memory all agree; manages them candle by candle; writes ledger, equity curve, lessons and a journal entry on close.
- Trading journal with process-vs-outcome scoring, leak detection, goals, streaks, prompts.
- Dashboard: 9 tabs, alerts bell, browser notifications, PWA install, PIN gate for LAN, TradingView widget and inbound webhook, share card, chart screenshot analysis, six assistant "skills", voice in/out, ⌘K palette, welcome tour.
- Optional Claude assistant with streaming, cost display, refusal handling, vision.
- MCP server exposing brief/checklist/state/flow/news/paper/journal/arm_plan/doctor.
- Pine v5 indicator + two strategies for TradingView.
- Self-test: 72 offline checks on hand-written candles (logic only, no performance claims).

---

## 3. Existing strategies

| Strategy | File | Status |
| --- | --- | --- |
| ICT session sweep → displacement → inversion FVG → retest (`requireInversion: true`) | `ictStrategy.ts` | Main model; replayable; paper-traded |
| Same with a plain FVG retest (`requireInversion: false`) | same file, config flag | Replayable |
| 9/21 SMA crossover, fixed hold | `strategy.ts` | Teaching baseline; replayable |

There is **one** engine and one story. Order blocks, breaker blocks, BOS-vs-CHoCH labelling, Silver Bullet, Unicorn and Turtle Soup are **not** in the audited code (they exist only in the parked WIP branch).

---

## 4. Existing indicators and detectors

ATR (`structure.ts`), swing highs/lows with a 3-candle confirmation lag, displacement, structure shift (unlabelled — no BOS/CHoCH distinction), FVG + IFVG, session ranges, PDH/PDL, equal highs/lows, liquidity sweeps, SMA (crossover), EMA 20/50 on resampled hourly closes and a momentum reading (`regime.ts`), order-book walls and imbalance, tape delta and big prints.

Not present: order blocks, premium/discount, higher-timeframe bias, volume profile, VWAP, any oscillator.

---

## 5. Data sources

| Data | Source | Real? | Notes |
| --- | --- | --- | --- |
| Candles | `data-api.binance.vision`, `api.binance.com`, `api.binance.us` `/api/v3/klines` | Yes | Public, unauthenticated, REST, paged 1000 per call |
| Order book | same hosts, `/api/v3/depth` limit ≤ 5000 | Yes | Aggregated price levels, a snapshot every 5 min. **Not** true L2 streaming, not per-order (L3) |
| Trades | `/api/v3/aggTrades` limit ≤ 1000 | Yes | Aggregated trades with `isBuyerMaker` → taker side. Real order-flow direction, but only the last ~1000 prints |
| Economic calendar | `nfs.faireconomy.media/ff_calendar_thisweek.json` | Yes | ForexFactory's weekly feed; times parsed with offset |
| Headlines | CoinDesk RSS, CoinTelegraph RSS, Google News RSS | Yes | Ranked by keyword topic and freshness |
| TradingView | Embedded widget + inbound webhook | Partly | The widget is display-only; nothing is read back from TradingView |

**Verified in this environment:** none of these hosts are reachable from the audit sandbox (network policy), so live feeds were exercised only through the stand-in mock server used for QA. The code paths, parsers and error handling were verified; the feeds themselves were not hit from here.

**Is true bid/ask/order-flow data available?** Best bid/ask and aggregated depth: yes, as REST snapshots. Streaming depth deltas, queue position, individual orders, or exchange-side liquidation feeds: no.

---

## 6. Broker / exchange integrations

**None.** There is no exchange client, no API-key handling for an exchange, no signed request anywhere in the tree. `execution.ts` writes a "PRETEND ORDER" string and throws if `LIVE_TRADING_ENABLED` is ever not `false`. The self-test asserts the constant is `false`. `.env.example` deliberately lists no exchange keys. A secret scan of the tree found no keys.

**Could anything accidentally send a live order?** No. There is no code path that reaches an exchange with write intent. All outbound calls are unauthenticated GETs to public market-data endpoints and public news feeds, plus the optional Anthropic API.

**Can the current system safely paper trade?** Yes, with the caveats in §10 (fills are idealised).

---

## 7. Current UI

- `web/index.html`: 137 lines of CSS, ~615 lines of inline JS, one file, no components. Tabs: Today, Chart, Flow, News, Journal, TradingView, Test, Memory, Ask.
- Chart: hand-drawn canvas with sessions, levels, FVG/IFVG boxes, sweep triangles, "MSS" labels, entry/stop/target lines, hover tooltip. No zoom/pan, no timeframe switch, no order blocks, no structure labels beyond "MSS".
- Mobile: bottom nav under 720 px, safe-area padding, PWA manifest, service worker that caches only the shell.
- Verified with Playwright screenshots at 1180 px and 400 px: no console errors, no horizontal scroll.
- Weak points: everything re-renders via `innerHTML` strings; no state management; no error boundaries; `alert()`/`confirm()` used for dialogs; the chart cannot be scrolled; the page is a single 877-line file that is hard to change safely.

---

## 8. Current testing

- `src/selftest.ts`: 72 checks, offline, covering the session clock, DST, ATR, swings, FVG lifecycle, sweeps, risk sizing, news parsing, one full hand-built setup day, order-book/tape maths, regime, journal stats, paper-trader exits, and the safety lock. Passes.
- Type check: `tsc --noEmit` passes.
- **No** unit-test framework, **no** tests for `server.ts` routes, `replay.ts`, `memory.ts` CSV round-trips, `news.ts` fetching, `watch.ts` event logic, `journal.ts` persistence, or `mcp.ts`.
- **No** CI for `trading-bot/`. The repo's `.github/workflows/ci.yml` lints and builds the Next.js site only, and both the root `tsconfig.json` and `.eslintrc.json` explicitly exclude `trading-bot/`.
- QA was done manually with a mock server and Playwright scripts that live outside the repo (scratch space); they are not committed.

---

## 9. Security issues

Ordered by severity. All verified in `src/server.ts` unless noted.

1. **No CSRF / origin check on 11 POST endpoints** (`/api/plan`, `/api/plan/clear`, `/api/memory/reset`, `/api/paper/close`, `/api/journal*`, `/api/chat`, `/api/picture`). Localhost requests are trusted by IP. A malicious web page open in the same browser can submit a cross-origin form POST to `http://127.0.0.1:4173/api/memory/reset` and it will execute (the browser cannot read the reply, but the side effect happens). Impact today: wipe memory, change the plan, close a paper position, spend Anthropic credit. Impact if live trading is ever added without fixing this: real orders.
2. **PIN lockout is global, not per client** (`pinAttempts` is one counter). Anyone on the LAN can lock everyone out with 20 bad guesses; a restart is the only reset.
3. **Session cookie is long-lived (30 days) and never rotated**; the token is regenerated on restart, which is the only expiry. No `Secure` flag (the app is plain HTTP, so this is consistent, but phone access over Wi-Fi is unencrypted).
4. **`allowPhone: true` binds to `0.0.0.0`** and relies on the LAN being trusted. Documented, but there is no allow-list.
5. **Webhook secret is shown in the dashboard** on localhost (`/api/config` → `app.webhook.secret`). Reasonable for a single user; would need to change for any shared deployment.
6. **Request body limits** are set (12 MB for pictures, 256 KB chat/journal, 64 KB webhook) — fine. Malformed JSON returns a 500 with the error text; acceptable.
7. **No rate limiting** on `/api/chat` and `/api/picture` (paid API calls) beyond the assistant being off without a key.
8. **Dependency surface is minimal** (one optional package) — this is a strength.
9. Secrets: only `ANTHROPIC_API_KEY` from a git-ignored `.env`; none found in source or history.

---

## 10. Trading-risk issues

These matter more than the security list because they decide whether the paper results mean anything.

1. **Idealised fills.** Paper and replay entries fill at the signal candle's close; exits fill exactly at the stop or target price. No slippage, no spread, no partial fills. Real stops on a fast 5-minute BTC candle fill worse. Results are therefore **optimistic** by at least the spread plus slippage per side.
2. **Entry timing in the 24/7 paper trader.** `watchOnce` runs every 5 minutes and opens a position at `plan.entry`, which is the close of the last *closed* candle — a price that is already up to several minutes old when the position is recorded. A live order would fill at the next candle, not that close.
3. **Intrabar ambiguity is handled pessimistically** (stop wins if a candle touches both). Good. But the time-stop exit uses the candle close, which is fine.
4. **No walk-forward or out-of-sample discipline.** One 30-day window, tunable parameters in `config.ts`, and a "tune" skill that invites changing settings and re-running the same window. This is the exact recipe for overfitting; nothing in the tool warns beyond the "fewer than 20 setups" note.
5. **Sample size.** The main model is picky by design; 30 days typically yields well under 20 setups, and the code itself says the numbers are not evidence below that. The memory filter then acts on 3 losses — it can "learn" from noise.
6. **Position size vs exchange minimums.** With a $25 account and a 1 % risk rule, sizes are $0.25 of risk and ~$20 of notional. Binance spot minimum notional is typically $5–10 per order; fine on paper, but fees at 0.1 % per side are 0.2 % round trip, which is a large fraction of the expected move on a tight stop. Not modelled beyond the flat fee.
7. **Daily limits survive restarts only partially.** `bot.ts:todaysStats` rebuilds counts from `positions.json` and scan ledger rows, which is good, but the in-memory `announced` set in `watch.ts` does not persist: after a restart, the same sweep/setup alerts fire again.
8. **Events are not reloaded at startup.** `EventLog` appends to `events.jsonl` but never reads it, so the bell is empty after every restart.
9. **News blackout is not applied in replay** (stated honestly in the notes). Live scans and replays therefore trade under different rules.
10. **The regime module and the strategy do not talk.** Market state is displayed and spoken but never gates an entry; a long can fire in a strong downtrend.
11. **No higher-timeframe bias.** Everything is 5-minute; the "bias" is today's last sweep. The ICT model as usually taught wants a daily/4h draw on liquidity first.
12. **Memory keys are very specific** (`symbol|interval|ICT|session|direction|level|entry`), so a lesson rarely triggers and, when it does, it is on tiny samples.
13. **`stopPct > 3` guard** exists; there is no minimum stop, so a 2-tick stop after a shallow sweep passes and is then wiped by spread in reality.

---

## 11. Missing capabilities (relative to a "professional-grade platform")

- Exchange execution of any kind (spot testnet, spot real, futures), key management, order state machine, fill reconciliation, OCO/bracket orders, kill switch.
- Streaming market data (WebSocket klines/depth/trades) and a live price ticker.
- Multi-symbol and multi-timeframe analysis; higher-timeframe bias.
- Additional ICT concepts the user asked for: order blocks, breaker blocks, BOS vs CHoCH labelling, premium/discount, Silver Bullet / Unicorn / Turtle Soup models, automatic chart annotation of all of them, a narrative "what is happening" explainer.
- A strategy registry with per-strategy replay and side-by-side comparison.
- Walk-forward / out-of-sample testing, parameter-stability reports, Monte-Carlo on the trade list, slippage and spread models.
- A database (or at least an append-only event store with locking); the flat files are fine for one process but not for two.
- Real logging (levels, rotation, request logs). Today: `console.log` plus `events.jsonl`.
- Tests for the server, replay, persistence; CI for the bot folder.
- Deployment story beyond "double-click the launcher": no Docker, no VPS guide, no process supervisor (the 24/7 script is a bash `while true`), no HTTPS.
- Accounts/roles (single-user by design today).
- Portfolio view across strategies/symbols; per-strategy equity curves.

---

## 12. Technical debt

- `web/index.html` (877 lines, inline JS, string-templated HTML) and `server.ts` (one 230-line request handler) are the two files that will fight every future change.
- `config.ts` is executable TypeScript, imported by everything, so a runtime setting change (e.g. switching strategy from the app) is not possible without a second settings mechanism.
- Duplicate trade-management logic: `replay.ts:manage` and `paperTrader.ts:evaluateExit/closeMetrics` compute the same R/fee maths twice.
- Version drift: `package.json` says 2.0.0, `mcp.ts` says 2.2.0, README says v2.3.
- `data/ledger.csv` is tracked in git (header only). Runtime data files are only partly git-ignored (`news-cache.json`, `plan.json`); `positions.json`, `journal.jsonl`, `events.jsonl` etc. would be committed by a careless `git add -A`.
- No file locking: the server, `npm run replay:*` and `npm run talk` can all append to `ledger.csv` at once.
- `once()` dedupe set is in-memory and clears at 5000 entries; `positions.json` truncates closed history at 500.
- `getCandlesSince` has a 200-page guard; `warmupCandles` caps at 4000 — fine for 5m, wrong for 1m over 4 days (would silently shorten).
- Error handling in the dashboard is per-call `try/catch {}` that swallows errors (e.g. `pollEvents`).
- The Pine strategy is a separate re-implementation of the model and can drift from the TypeScript engine (already differs: no inversion requirement in Pine).
- Docs are long and partly duplicated across `README.md`, `trading_bot_instructions.md`, and the five `.claude/skills`.

---

## 13. What should be preserved

- The **honesty rules**: real data or a loud stop, no fabricated candles, pessimistic both-hit rule, fees included, lessons only from measured outcomes, explicit sample-size warnings. These are the best thing in the codebase and are unusual.
- The **evidence-list decision format** (`EvidenceStep[]`). It makes every strategy explainable and testable, and it should be the contract every future strategy implements.
- The **incremental trackers** (`SessionTracker`, `SwingTracker`, `FvgTracker`, `StructureTracker`, `detectSweeps`) — they never look ahead and are already unit-tested.
- The **risk module's shape** (size from the stop, caps, readable refusals).
- The **memory + replay + "was refusing worth it"** loop, which keeps the learning honest.
- The **zero-dependency, no-build** philosophy for the core. It is what makes the bot installable by a beginner.
- The **beginner-facing writing** in code comments, briefs and README.
- The self-test as an install check.
- The PWA/PIN/voice/palette layer — it works and is cheap to keep.

---

## 14. What should be replaced

- `web/index.html` as a monolith → split into modules (chart, tabs, api client, state) even without a framework; a small build step or ES modules served directly would do.
- `server.ts` routing → a table of routes with per-route body limits and an origin check.
- Flat-file persistence for anything written by more than one process → SQLite (Node 22 has `node:sqlite` built in) or at minimum an append-only log with a lock file.
- `config.ts` as the only settings source → `config.ts` for defaults plus a runtime `settings.json` (strategy, mode, limits) editable from the app.
- The `LIVE_TRADING_ENABLED` constant → a proper mode state machine (`paper` → `testnet` → `live`) with gates, once execution exists. The constant is a good lock for a paper-only tool but the wrong abstraction for a platform.
- The duplicated trade-management maths → one `trades.ts` used by replay, paper and (later) live.
- The bash `while true` supervisor → a process manager (pm2 or a systemd/launchd unit) with log rotation.

---

## 15. What should be added

In the order that reduces risk fastest:

1. Tests and CI for the bot (route tests, replay determinism on fixture candles, CSV/JSONL round-trips) so every later change is caught.
2. Origin check + per-client PIN throttling (small, closes the biggest security hole before any execution exists).
3. Runtime settings file and a strategy registry; make the engine strategy-parametric while keeping the evidence-list contract.
4. Order blocks, breakers, BOS/CHoCH, premium/discount, and the additional models (the parked WIP is a starting point, but it must be re-based on top of tests, not ahead of them).
5. Chart annotations for all of the above and a narrative panel.
6. Realism in replay: spread + slippage model, next-open entry, walk-forward split, per-strategy comparison, Monte-Carlo of the trade list.
7. WebSocket market data (klines + aggTrades + depth) with REST fallback, so the paper trader reacts at candle close instead of on a 5-minute poll.
8. Exchange adapter on **Binance Spot Testnet first** (same API shape as production and Binance.US), with signed requests, filter rounding (tick/step/min-notional), OCO brackets, reconciliation, a kill switch, and a doctor check that refuses keys with withdrawal permission.
9. Live mode gated by: testnet track record, explicit config, explicit env phrase, typed confirmation, hard dollar caps, and the origin check from step 2 already in place.
10. Deployment: Docker image, VPS guide, HTTPS via a tunnel or reverse proxy, process manager.
11. UI rework on top of the modular frontend.

---

## 16. Recommended implementation order

| Phase | Scope | Exit criterion |
| --- | --- | --- |
| 0 | Freeze `v0-rough-draft` (done: local tag on `69b01f8`; tag push was rejected by the remote twice — the commit itself is on `origin/claude/new-session-31dwy7`) | Fallback exists |
| 1 | Test harness + CI for `trading-bot/`; origin check; per-client PIN throttle; version alignment; git-ignore runtime data | CI green on every push |
| 2 | Persistence and settings: `settings.json`, single trade-maths module, locked append log or SQLite | Two processes cannot corrupt data |
| 3 | Strategy registry + engine refactor (evidence contract kept), order blocks / BOS-CHoCH / premium-discount, new models, per-strategy replay + comparison | Each model has fixture tests and a replay that runs |
| 4 | Chart annotations + narrative + UI modularisation | Screenshots pass at 1180/400 px, no console errors |
| 5 | Replay realism (slippage, next-open fills, walk-forward, Monte-Carlo) | Reports show in-sample vs out-of-sample separately |
| 6 | WebSocket data + event-driven paper trader | Entries recorded at candle close, not on poll |
| 7 | Exchange adapter on testnet, OCO, reconciliation, kill switch, doctor checks | 20+ testnet trades reconciled with zero mismatches |
| 8 | Live gate + tiny real-money mode with hard caps | Every gate has a test; kill switch tested live |
| 9 | Deployment (Docker, VPS, HTTPS, supervisor) | Runs 7 days unattended with logs |

---

## Prioritised list

### CRITICAL
- **C1 — No CSRF/origin protection on state-changing endpoints.** Harmless-ish today (paper), catastrophic the day an order endpoint exists. Fix before any execution work.
- **C2 — No automated tests for the server, replay, or persistence, and no CI for the bot.** Every later phase depends on this.
- **C3 — Paper results are optimistic** (close-fills, no slippage/spread, single in-sample window). Anyone judging "profitability" from the Test tab today is being misled by the fill model, not lied to, but the effect is the same. Must be fixed before a live gate can honestly cite a track record.

### HIGH
- **H1 — No exchange integration at all** (requested: real money, 24/7). Build testnet-first with the gate chain in §15 step 9.
- **H2 — Flat files with no locking, runtime data not fully git-ignored.**
- **H3 — Watch loop is poll-based (5 min) with in-memory dedupe; alerts and state do not survive restarts.**
- **H4 — Regime/HTF bias never gates entries; single timeframe, single symbol.**
- **H5 — Strategy engine is single-story; requested models (OB, BOS/CHoCH, Silver Bullet, Unicorn, Turtle Soup) are absent from the verified code.**
- **H6 — Global PIN lockout (LAN denial of service).**

### MEDIUM
- **M1 — Monolithic `index.html` and `server.ts`.**
- **M2 — Duplicate trade maths in replay vs paper trader.**
- **M3 — Version numbers disagree across package.json / mcp.ts / README.**
- **M4 — No process supervisor, logging levels, or HTTPS for phone access.**
- **M5 — Pine scripts can drift from the TypeScript engine.**
- **M6 — No rate limit on paid assistant endpoints.**

### LOW
- **L1 — `positions.json` truncation and `once()` set clearing are silent.**
- **L2 — Warm-up candle cap is wrong for 1-minute candles.**
- **L3 — Dashboard swallows fetch errors in `pollEvents`.**
- **L4 — Docs are long and duplicated in three places.**
- **L5 — `alert()`/`confirm()` dialogs and `innerHTML` rendering.**

---

## Readiness against the 16-phase roadmap

Mapped from the code, not from the docs. "Available" means the code already produces it from real data; "not available" means the current data pipeline cannot produce it honestly and it must not be approximated from candles.

| Phase | What exists today | What is missing | Hard blockers |
| --- | --- | --- | --- |
| 3 Foundation | Explicit error paths for data failures; PIN gate; paper-only lock; self-test | Tests for server/replay/persistence, CI, origin check, per-client throttle, file locking, event persistence across restarts, logging levels, runtime settings | None — all buildable now |
| 4 Market data | See tiers below | Streaming (WebSocket), a normalisation layer that stamps every reading with source, age and completeness, a feature engine separate from the strategy | Continuous trade stream needed for the order-flow tier |
| 5 Intelligence | Swings, structure shifts (unlabelled), EQH/EQL, session levels, sweeps, delta/tape speed/big trades/imbalance from snapshots, a 7-vote regime | VWAP, volume profile, BOS/CHoCH labels, cumulative delta, absorption, footprint, breakout/transition regime states | Footprint and absorption need per-trade data at the price level, continuously |
| 6 Strategy engine | One engine, one story, evidence-list contract | Registry, per-strategy signals, signal fusion with a confidence score | None |
| 7 Risk engine | Per-trade risk, position cap, 3 % max stop, min RR, daily trade/loss limits, plan veto, news blackout | Max exposure/correlation/leverage, drawdown cap, stale-data protection, spread protection, execution protection, emergency shutdown, a kill switch | None — but it must exist before Phase 15 |
| 8 Backtester | 30-day replay with fees, pessimistic both-hit, R metrics, breakdowns | Spread, slippage, latency, next-open fills, partial fills, per-strategy runs on the same data, long histories (needs paging beyond 200 pages or local candle storage) | None |
| 9 Walk-forward | Nothing | Train/validate/out-of-sample splits, walk-forward, Monte-Carlo, a research log | Needs a local candle store (months of 5m data) |
| 10 AI copilot | Assistant with market context, skills, vision, streaming | The structured "market read / confirms / invalidates / decision / why not yet" format is not enforced; the assistant cannot read live feature values beyond the brief text | None |
| 11 UI | Working 9-tab dashboard, PWA, voice, palette | Command-center layout, modular code, chart interactivity, structure/OB annotations | None |
| 12 Replay player | Replay engine runs candle by candle already (`IctEngine.step`) | A UI that steps through it with the evidence list at each candle | None — the engine design makes this cheap |
| 13 Paper trade | 24/7 paper trader with ledger, equity, lessons, journal | Records of hypothetical fills vs actual spread, slippage, missed/false signals, latency | Needs the market-data layer (Phase 4) for real spreads |
| 14 Shadow mode | Nothing distinct from paper | A mode that logs the exact order it *would* send, with the exchange's actual book at that moment | Needs the exchange adapter (read-only) |
| 15 Live | Nothing; no exchange write path | Exchange adapter, OCO, reconciliation, gates, kill switch, doctor checks | Everything above |
| 16 Improvement loop | Memory + lessons + "was refusing worth it" | Per-strategy performance tracking, a research engine | None |

**Data tiers (Phase 4), as the code stands:**

| Tier | Item | Available from real data today? | How |
| --- | --- | --- | --- |
| Basic | OHLC, volume | Yes | REST klines |
| Basic | Trades | Yes, last ~1000 aggregated trades per poll | REST aggTrades |
| Better | Bid, ask, spread | Yes, as a snapshot every poll | REST depth (best levels) |
| Better | Trade size | Yes | aggTrades quantity × price |
| Advanced | Level 2 / order book / depth / bid-ask volume | Partly — aggregated price levels up to 5000 per side, snapshot only, no deltas | REST depth |
| Advanced | Individual trades | No — aggTrades merges fills at the same price/time | Would need the raw `trades` stream |
| Order flow | Delta, imbalance, tape speed, large trades | Yes, over the polled window only | computed in `orderflow.ts` from aggTrades and depth |
| Order flow | Cumulative delta | **No** — gaps between polls make it wrong | needs a continuous WebSocket trade stream |
| Order flow | Footprint | **No** | needs per-trade data bucketed by price and candle, continuously |
| Order flow | Absorption | **No** | needs footprint + book deltas |

Nothing in the current code fakes the bottom rows from candles. The risk is that a future change does; the normalisation layer in Phase 4 should carry an explicit `available: false` for them until a streaming source exists.

---

## Verification log

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` on `69b01f8` | pass |
| `npm run selftest` on `69b01f8` | 72/72 pass |
| Secret scan (`sk-ant`, `api_secret=`) over the tree | nothing found |
| Tracked runtime data | `data/ledger.csv` (header only) |
| Exchange write paths (`POST` to any exchange host) | none |
| WebSocket usage | none |
| Database | none |
| CI coverage of `trading-bot/` | none |
