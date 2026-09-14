# TITAN Implementation Plan — from Mr. Cash v2.3 to a production trading platform

**Baseline:** Mr. Cash v2.3, commit `69b01f8` (`v0-rough-draft`), audited in `AUDIT.md`.
**Rule:** the baseline's behaviour is not changed unless a phase below says so, and every change lands behind a test.
**Parked work:** the unverified v3 patch (`claude/wip-v3-playbook`, 7 files, +996/−220) is **not** merged. §B says which parts may be reused, and when.
**Toolchain facts this plan relies on (verified on the machine):** Node 22.22 runs `.ts` directly; `node:test` is built in; a global `WebSocket` client is built in; `node:sqlite` (`DatabaseSync`) is built in but prints an experimental warning. None of these need a dependency, which keeps the zero-dependency install the audit said to preserve.

---

## A. Reading guide

Each phase has the same ten headings the brief asked for. "Files likely to change" and "files likely to be created" are named against the real tree under `trading-bot/`. Where a design choice is still open, the plan says which option is recommended and why, so the phase can start without another planning round.

Naming used below:

- **Baseline engine** = `src/ictStrategy.ts` `IctEngine` and the trackers it owns (`sessions.ts`, `structure.ts`, `fvg.ts`, `liquidity.ts`).
- **Evidence contract** = `EvidenceStep[]` on every `Signal` (`src/types.ts`). Every new strategy must keep it.
- **Store** = the persistence layer introduced in Phase 3.
- **Bus** = the market-data event bus introduced in Phase 5.
- **FeatureSnapshot** = the per-candle feature record introduced in Phase 6.

---

## B. The parked WIP patch — what may be reused, and when

Reviewed diff: `types.ts`, `structure.ts`, `orderblocks.ts` (new), `playbook.ts` (new), `ictStrategy.ts` (rewritten), `liquidity.ts`, `adaptiveFilter.ts`.

| Piece | Verdict | Reuse in | Conditions before reuse |
| --- | --- | --- | --- |
| `SwingTracker` HH/HL/LH/LL labels and `trend()` | Sound, small, self-contained | Phase 7 | Fixture test for label sequence; confirm `latest()` semantics unchanged for `regime.ts` callers |
| `StructureTracker` BOS/CHoCH classification, `latestChoch()`, `describeShift()` | Sound. First break labelled BOS is a defensible convention; must be documented | Phase 7 | Fixture tests: uptrend BOS, first counter-break CHoCH, alternating sequence |
| `orderblocks.ts` (`detectOrderBlock`, `OrderBlockTracker`, breaker role) | Reasonable first version. Open questions: zone = full candle vs body; requires displacement only, not FVG/BOS | Phase 7 | Decide zone definition in a test first; add `withStructureBreak`/`withFvg` fixture cases; expiry shares `fvgMaxAgeCandles` — make it its own setting |
| `types.ts` additions (`OrderBlock`, `LabelledSwing`, `DealingRange`, `swing-high/low` level kinds, `structure`/`live` event kinds) | Keep, but land per phase, not as one lump | Phases 7, 20 | `IctAnalysis` gains fields only when the producer exists |
| `playbook.ts` strategy definitions, glossary, Silver Bullet windows, `settings.json` override | The **metadata** (names, stories, steps, glossary) is reusable as documentation and UI copy. The runtime `settings.json` reader is superseded by the Phase 3 store | Phase 10 (definitions), Phase 17 (glossary copy) | Replace the file reader with the store's settings API |
| `ictStrategy.ts` rewrite (six stories behind one `decide`) | **Do not rebase as-is.** It couples six strategies into one class and one `decide()`. Phase 10 wants one module per strategy behind a shared interface. The individual story functions (`sessionModel`, `orderBlockModel`, `silverBulletModel`, `unicornModel`, `turtleSoupModel`) are good drafts of those modules | Phase 10 | Port each story into its own `src/strategies/<id>.ts` against fixture days; the shared seatbelt tail (`Stop & target`, `News`, `Daily limits`, `Your plan`) moves to the risk engine (Phase 12) |
| Swing sweeps (`swingSweep`) in the engine | Useful for Turtle Soup and liquidity features | Phase 7 | Test that a session sweep and a swing sweep on the same candle do not double-count |
| `adaptiveFilter.describeKey` generalisation | Trivial, safe | Phase 10 | Test old `ICT` keys still describe identically |

The known bug in the patch (session models re-called `sessions.add()` to find the day key, double-counting the candle) was fixed in the parked branch but is a reminder that nothing in it has been run.

---

## C. CRITICAL blockers for live trading

These must all be closed before Phase 20 starts. Each is tied to the phase that closes it.

| # | Blocker | Closed by |
| --- | --- | --- |
| B1 | No origin/CSRF protection on state-changing endpoints (`AUDIT §9.1`) | Phase 1 |
| B2 | No automated tests for server, replay or persistence; no CI | Phase 2 |
| B3 | Flat files without locking; state does not survive restarts (`AUDIT §10.7–10.8`, §12) | Phase 3 |
| B4 | Fill model is idealised; any "track record" is optimistic | Phase 4 |
| B5 | Five-minute polling; a live order cannot be managed on stale data | Phase 5 |
| B6 | No risk engine with veto power, stale-data or spread protection, no kill switch | Phase 12 |
| B7 | No out-of-sample evidence; single in-sample window | Phase 13 |
| B8 | No paper-vs-shadow-vs-live behavioural comparison | Phases 18–19 |
| B9 | No exchange adapter, reconciliation, or order state machine | Phase 20 |
| B10 | No supervised, recoverable 24/7 process | Phase 21 (must be in place *before* live capital, so 21 runs in parallel with 19–20 for the paper/shadow process) |

---

## D. The phases

### PHASE 1 — Security and safety

**Objective.** Make every state-changing action require proof that it came from the app, throttle authentication per client, formalise the paper/live mode boundary as code, and add an emergency stop — all before any execution code exists.

**Why now.** The audit's first CRITICAL item. Cheap to fix while there are only eleven POST routes; catastrophic to fix later.

**Files likely to change.** `src/server.ts` (route guard, per-client PIN throttle, cookie rotation, `/api/config` returns a CSRF token, new `/api/stop` and `/api/health`), `web/index.html` (`call()` sends the token header on POST), `src/execution.ts` (consults the mode module instead of only the constant), `src/watch.ts` (halts paper trading when the kill file exists), `src/mcp.ts` (`arm_plan` and any future writes go through the same guard function), `.env.example` (document `MRCASH_PORT`, `MRCASH_PIN`), `README.md`, `trading_bot_instructions.md` (§2 Safety Rules).

**Files likely to be created.** `src/guard.ts` (origin + CSRF check as one pure function taking headers and returning allow/deny with reason), `src/mode.ts` (`runtimeMode(): 'paper'` today; the state machine `paper → testnet → shadow → live` is declared here but only `paper` is reachable until Phase 20), `src/killswitch.ts` (`data/STOP` file semantics: exists ⇒ no new positions, paper included; `npm run stop` / `npm run resume`), `test/guard.test.ts`, `test/server.test.ts` (minimal harness, generalised in Phase 2).

**Dependencies.** None.

**Data requirements.** None.

**Tests required.** Guard: same-origin browser request with token passes; cross-origin form POST is rejected; missing token rejected; MCP/local CLI path with the header passes. PIN: 20 failures from one client lock that client only; another client still gets one attempt. Kill switch: with `data/STOP` present, `watchOnce` raises an event and opens nothing. Mode: `runtimeMode()` returns `paper` with a fresh checkout and `execution.ts` still throws if the constant is flipped.

**Acceptance criteria.** All eleven POST routes reject requests without a valid same-origin token; per-client throttle verified; `data/STOP` stops paper entries; `npm run selftest` still 72/72; type check clean; no change to any trading decision.

**Risks.** Breaking the phone flow (token must be delivered after the PIN cookie is set). Mitigation: the route test covers the PIN → config → POST sequence.

**What must NOT be done yet.** No exchange code, no keys, no new endpoints beyond `/api/stop` and `/api/health`. Do not touch the strategy.

---

### PHASE 2 — Testing and CI

**Objective.** A real test suite (`node:test`, zero dependencies) covering the server, replay determinism, persistence round-trips and the existing detectors, running in GitHub Actions on every push that touches `trading-bot/`.

**Why now.** Every later phase edits the engine, persistence and server. Without this, regressions in the baseline are invisible.

**Files likely to change.** `package.json` (`"test": "node --test test/"`, `"check": "tsc && selftest && test"`), `src/server.ts` (accept `MRCASH_PORT` env and `MRCASH_DATA_DIR` env so tests run on a random port and a temp data folder — `src/memory.ts` `DATA_DIR` becomes env-overridable), `src/selftest.ts` (unchanged in content; becomes one job in CI), `.github/workflows/bot.yml` (new), `README.md` (a Testing section).

**Files likely to be created.** `test/fixtures/` (hand-built candle days as JSON: the existing self-test day, a no-setup day, a both-hit candle, a DST-crossing day; plus a recorded calendar JSON and RSS sample), `test/helpers.ts` (start server on an ephemeral port with a temp data dir; a `MockFeeds` HTTP server derived from the QA mock so tests never touch the internet), `test/server.test.ts` (every route: status, shape, auth), `test/replay.test.ts` (same fixtures ⇒ identical trade list twice; both-hit ⇒ stop), `test/memory.test.ts` (CSV quoting round-trip, lesson idempotency), `test/journal.test.ts`, `test/news.test.ts`, `test/watch.test.ts` (event dedupe), `test/paperTrader.test.ts`.

**Dependencies.** Phase 1 (guard tests join the suite).

**Data requirements.** Fixture candles only. No real data in tests.

**Tests required.** This phase *is* tests. Coverage target: every exported function in `src/` except `talk.ts`/`picture.ts`/`tradingview.ts` (interactive) has at least one test; every route has one.

**Acceptance criteria.** `npm test` green locally and in CI; CI job runs `tsc`, `selftest`, `test` for `trading-bot/**` changes; a deliberately broken assertion fails CI.

**Risks.** Tests that depend on wall-clock time (sessions, killzones). Mitigation: engine functions already take timestamps; the watch loop's `Date.now()` calls get an injectable clock.

**What must NOT be done yet.** No refactors "while we are here". Tests describe current behaviour, including the idealised fills (those tests are rewritten in Phase 4).

---

### PHASE 3 — Data integrity and state persistence

**Objective.** One store, one writer, survives restarts, cannot be corrupted by two processes, and can answer "what is the current state of my system?" from disk.

**Why now.** Flat files with no locking are the audit's H2, and Phase 5 will write far more often (every trade, every candle).

**Files likely to change.** `src/memory.ts` (becomes a thin adapter over the store; CSV/MD stay as *exports*, not the source of truth), `src/paperTrader.ts` (positions/equity via store), `src/watch.ts` (`EventLog` loads recent events and the announced-set from the store at startup), `src/journal.ts`, `src/plan.ts`, `src/news.ts` (cache), `src/orderflow.ts` (flow log), `src/server.ts` (`/api/state` renamed to `/api/system` returning the system-state document), `src/doctor.ts` (store integrity check), `.gitignore` (all of `data/` except `.gitkeep`), `config.ts` (unchanged values; a comment pointing to runtime settings).

**Files likely to be created.** `src/store.ts` (recommended: `node:sqlite` `DatabaseSync`, WAL mode, one file `data/mrcash.db`; tables `ledger`, `lessons`, `positions`, `equity`, `events`, `announced`, `journal`, `goals`, `plan`, `settings`, `news_cache`, `flow_log`, `candles` (used from Phase 5); fallback option: append-only JSONL with a lock file if the experimental warning is unacceptable), `src/settings.ts` (runtime settings with defaults from `config.ts`: active strategy, mode, limits), `src/systemState.ts` (builds the "current state of my system" document: mode, kill switch, data freshness per feed, open positions, today's limits used, last error, versions), `scripts/migrate-flat-files.ts` (one-shot import of existing CSV/JSONL into the store, keeping the originals), `test/store.test.ts`, `test/systemState.test.ts`.

**Dependencies.** Phase 2.

**Data requirements.** Existing `data/*` files for the migration test.

**Tests required.** Two processes appending concurrently produce no lost rows; restart reloads events and dedupe keys; migration imports every row of a fixture ledger; `systemState()` reports `stale` when the last candle is older than two intervals.

**Acceptance criteria.** `npm run replay:raw` and the running server can write at the same time without corruption (test); after `kill -9` and restart, the bell shows the last 40 events and no duplicate alert fires; `/api/system` returns a complete document; version string comes from one place (`package.json`).

**Risks.** `node:sqlite` API changes between Node minors. Mitigation: the store interface is small and the JSONL fallback is designed in from the start.

**What must NOT be done yet.** No schema for live orders yet (Phase 20 adds it). Do not delete the CSV/MD exports; the README promises human-readable files.

---

### PHASE 4 — Realistic execution / fill model

**Objective.** Replace "entry at signal close, exit exactly at stop/target" with one simulator used by replay and the paper trader: next-candle-open entry, spread, slippage, latency, fee tiers, and a pessimistic intrabar rule that is explicit.

**Why now.** Audit CRITICAL C3. Every number the user sees afterwards must come from this model; building intelligence on top of optimistic fills would be wasted.

**Files likely to change.** `src/replay.ts` (`manage()` and entry logic delegate to the simulator), `src/paperTrader.ts` (`openPosition` records the *intended* entry and the *simulated* fill; `evaluateExit`/`closeMetrics` delegate), `src/risk.ts` (size from the simulated entry, not the signal price), `src/types.ts` (`Fill`, `ExecutionAssumptions`), `config.ts` (an `execution` block: `spreadBps`, `slippageBps`, `slippageAtrFraction`, `latencyCandles`, `takerFeePercent`, `makerFeePercent`), `web/index.html` (Test tab shows "ideal vs realistic" side by side for one release), `README.md` (`The honest part` section updated).

**Files likely to be created.** `src/sim/fills.ts` (pure: given an intended order, the next candles and assumptions, return the fill and the exit), `src/sim/trades.ts` (the single R/fee/PnL maths module replacing the duplicate in `replay.ts` and `paperTrader.ts`), `test/fills.test.ts`, `test/trades.test.ts`.

**Dependencies.** Phases 2–3.

**Data requirements.** Candles only. When Phase 5 exists, spread comes from the real book instead of `spreadBps`.

**Tests required.** Entry fills at next open plus half-spread plus slippage; a stop fills worse than the stop by the slippage rule; a target fills only when price trades *through* it by the configured margin; both-hit candle ⇒ stop; fee maths identical between replay and paper; the fixture day's R changes by a known amount versus the idealised model (documented in the test).

**Acceptance criteria.** Replay and paper share one code path; the Test tab shows the realistic numbers by default; the difference to the old model is logged in `AUDIT.md`'s successor (`CHANGELOG.md`).

**Risks.** Users see the strategy look worse. That is the point; the README says so.

**What must NOT be done yet.** No tuning of strategy parameters to recover the lost performance.

---

### PHASE 5 — Market-data architecture and WebSocket migration

**Objective.** A market-data bus fed by continuous streams (klines, aggregate trades, book ticker, depth) with REST backfill and gap detection, a normalisation layer that stamps every reading with source, age and completeness, and a candle store. The watch loop becomes event-driven.

**Why now.** Audit H3 and the prerequisite for every order-flow feature that must not be faked from candles.

**Files likely to change.** `src/market.ts` (REST becomes the backfill/fallback provider), `src/orderflow.ts` (snapshot analysis stays; continuous stats move to Phase 8), `src/watch.ts` (subscribes to `candle:closed` instead of `setInterval`; keeps a REST heartbeat), `src/bot.ts` (`analyzeNow` reads candles from the store), `src/server.ts` (`/api/system` includes per-stream health; optional Server-Sent Events endpoint `/api/stream` for the UI), `src/doctor.ts` (stream checks), `config.ts` (a `data` block: stream hosts, depth level, reconnect policy).

**Files likely to be created.** `src/data/bus.ts` (typed `EventEmitter`: `trade`, `book`, `bookTicker`, `candle:update`, `candle:closed`, `stream:up|down|gap`), `src/data/types.ts` (canonical `Trade`, `BookLevel`, `BookSnapshot`, `Candle` with `source`, `receivedAt`, `complete`), `src/data/binanceStream.ts` (global `WebSocket`; combined stream; reconnect with backoff; ping/pong; depth sync = REST snapshot + buffered deltas by `lastUpdateId` per Binance's documented procedure), `src/data/candleStore.ts` (store-backed, backfill on start, gap fill, `getCandles()` API identical to today's), `src/data/health.ts` (staleness per feed; feeds the risk engine later), `src/data/normalize.ts`, `test/binanceStream.test.ts` (against a local WebSocket server that replays recorded messages), `test/candleStore.test.ts` (gap detection and backfill), `test/bus.test.ts`.

**Dependencies.** Phase 3 (store), Phase 2 (mock feeds).

**Data requirements.** Recorded stream samples for tests (captured once on a machine with internet, checked in as fixtures). Live: `data-stream.binance.vision` / `stream.binance.com` or the US equivalent, chosen by config.

**Tests required.** Reconnect after socket close; depth resync when a delta's `U` is not `lastUpdateId+1`; candle built from trades matches the exchange kline within tolerance; gap ⇒ `stream:gap` event and `available:false` on downstream features; REST fallback keeps the paper trader alive when the socket is down.

**Acceptance criteria.** The dashboard price updates without polling; `candle:closed` fires within 2 s of the exchange close; after unplugging the network for 5 minutes the system recovers without restart and `/api/system` shows the gap; `npm run watch` output is unchanged in meaning.

**Risks.** Sandbox and some networks block the stream hosts (the audit environment did). Mitigation: REST fallback is mandatory, not optional; the doctor says which path is active.

**What must NOT be done yet.** No cumulative delta, footprint or absorption yet — the bus must first prove continuity. No exchange authentication.

---

### PHASE 6 — Feature engine

**Objective.** A `FeatureSnapshot` computed per closed candle (and, where meaningful, per tick) from the bus and the candle store, with every feature carrying `available`, `source` and `asOf`. Features are inputs; they contain no trade rules.

**Why now.** The strategies in Phases 10–11 must consume shared, tested features, not recompute their own.

**Files likely to change.** `src/regime.ts` (its EMA/momentum/volatility readings become features here; the vote moves to Phase 9), `src/bot.ts` (`Snapshot` gains `features`), `src/brief.ts` (reads VWAP/profile lines from features), `src/server.ts` (`/api/analysis` includes features), `web/index.html` (Chart draws VWAP and profile — minimal until Phase 17).

**Files likely to be created.** `src/features/engine.ts`, `src/features/types.ts`, `src/features/vwap.ts` (session-anchored and day-anchored; from trades when the stream is live, from candle typical price × volume otherwise, and the snapshot says which), `src/features/volumeProfile.ts` (from trades ⇒ exact; from candles ⇒ approximation flagged `approximate: true`; POC/VAH/VAL), `src/features/atr.ts`, `src/features/ema.ts`, `src/features/momentum.ts`, `src/features/volatility.ts`, `test/features/*.test.ts`.

**Dependencies.** Phases 3–5.

**Data requirements.** Candles with volume (available today); trades stream for exact VWAP/profile.

**Tests required.** VWAP on a fixture equals a hand computation; profile POC on a fixture; approximation flag set when computed from candles; `available:false` when the stream gap flag is set.

**Acceptance criteria.** `FeatureSnapshot` is produced for every closed candle in replay and live with identical code; each feature has a test; the snapshot is visible in `/api/analysis`.

**Risks.** Feature explosion. Mitigation: only the features a Phase 10 strategy consumes are built; the list is in this plan.

**What must NOT be done yet.** No strategy logic in `features/`.

---

### PHASE 7 — Market structure, BOS/CHoCH, liquidity

**Objective.** Rebase the reviewed parts of the parked patch: swing labels, BOS/CHoCH, order blocks and breakers, premium/discount, swing sweeps — as features with fixture tests, and draw them on the chart.

**Why now.** The user's explicit request, and the base for the liquidity strategies; it depends on the feature engine so that structure is computed once and shared.

**Files likely to change.** `src/structure.ts` (apply the patch's `SwingTracker` labels and `StructureTracker` BOS/CHoCH after review), `src/liquidity.ts` (`swing-high`/`swing-low` level kinds; swing sweeps move here from the patch's engine), `src/types.ts` (the patch's structure types), `src/ictStrategy.ts` (consumes labelled shifts; behaviour unchanged for the session model — a test proves the fixture day still produces exactly one BUY), `src/features/engine.ts` (structure and liquidity features), `web/index.html` (order blocks, breakers, BOS/CHoCH labels, swing labels, premium/discount band, with toggles), `pine/ict-sessions.pine` (optional parity for OB/BOS labels).

**Files likely to be created.** `src/orderblocks.ts` (from the patch, after the zone-definition decision), `src/features/structure.ts`, `src/features/liquidity.ts`, `src/features/dealingRange.ts`, `test/structure.test.ts`, `test/orderblocks.test.ts`, `test/liquidity.test.ts`, `test/fixtures/structure-days/*.json`.

**Dependencies.** Phase 6; Phase 2 fixtures.

**Data requirements.** Candles only.

**Tests required.** Label sequences (HH/HL ⇒ bullish; LH/LL ⇒ bearish); BOS vs CHoCH on an alternating fixture; order block detection with and without FVG/BOS; mitigation and breaker flip; premium/discount thresholds; the baseline self-test day still yields one BUY with identical evidence text.

**Acceptance criteria.** Chart shows every structure object with a tooltip explanation; `IctAnalysis` carries them; no change in baseline replay results (regression test).

**Risks.** Subtle changes to `SwingTracker.latest()` alter `regime.ts` and `equalLevels()`. Mitigation: regression tests on both.

**What must NOT be done yet.** No new strategies yet (Phase 10). No narrative panel (Phase 16/17).

---

### PHASE 8 — Order flow / tape reading

**Objective.** Continuous order-flow features from the trade and book streams only: per-candle delta, cumulative delta, tape speed, large-trade detection, book imbalance, a footprint (price-bucketed bid/ask volume per candle), and a clearly labelled absorption heuristic. Every one of them is `available:false` when the stream has a gap.

**Why now.** Only possible after Phase 5 proves continuity; the audit forbids faking these from candles.

**Files likely to change.** `src/orderflow.ts` (snapshot analysis kept for REST fallback; marked `windowed:true`), `src/features/engine.ts`, `src/watch.ts` (big-print events from the stream), `web/index.html` (Flow tab reads the new features), `src/doctor.ts`.

**Files likely to be created.** `src/features/delta.ts`, `src/features/cvd.ts`, `src/features/tape.ts` (speed, acceleration), `src/features/largeTrades.ts`, `src/features/imbalance.ts` (book), `src/features/footprint.ts`, `src/features/absorption.ts` (definition fixed in the test: high traded volume at a level with price failing to move more than X ticks — documented as a heuristic), `test/features/orderflow/*.test.ts` with recorded trade streams.

**Dependencies.** Phases 5–6.

**Data requirements.** Continuous `aggTrade` and depth streams; recorded samples for tests.

**Tests required.** Delta and CVD on a recorded stream match a hand computation; CVD resets at session start when configured; footprint buckets sum to candle volume; a gap sets `available:false` and CVD restarts with a marker rather than silently continuing.

**Acceptance criteria.** Flow tab shows CVD and footprint from real trades with a live "stream healthy" badge; when the stream is down the tab says "windowed snapshot only" and hides CVD.

**Risks.** Binance `aggTrade` merges fills; per-order granularity is not available. The plan accepts this and says so in the UI.

**What must NOT be done yet.** No strategy uses these until Phase 10; no "absorption" without its test-defined rule.

---

### PHASE 9 — Regime engine

**Objective.** Rebuild `regime.ts` as a regime *feature* with states `trending-up`, `trending-down`, `ranging`, `breakout`, `transition`, plus volatility `low/normal/high`, computed from the feature snapshot with a documented vote, and made available to strategies and the risk engine.

**Why now.** Fusion (Phase 11) and risk (Phase 12) need a regime input; the audit noted regime never gates entries today.

**Files likely to change.** `src/regime.ts` (rewritten over features; keeps the evidence lines and watch-outs), `src/features/engine.ts`, `src/brief.ts`, `web/index.html` (state card).

**Files likely to be created.** `src/features/regime.ts`, `test/regime.test.ts` with fixture series for each state.

**Dependencies.** Phases 6–8.

**Data requirements.** Candles; order-flow features when available (they add votes, never required).

**Tests required.** Each state on its fixture; transition detected when structure flips (CHoCH) while EMAs disagree; breakout when range width contracts then a BOS with expanding ATR.

**Acceptance criteria.** Regime is a `FeatureSnapshot` field with reasons; the Today tab still shows the same card; strategies can read it.

**Risks.** Over-engineering the vote. Mitigation: five inputs maximum, all named in tests.

**What must NOT be done yet.** No regime-based trading; gating happens in Phase 11/12.

---

### PHASE 10 — Multi-strategy engine

**Objective.** One interface, many strategies. Each strategy module takes the feature snapshot plus context and returns a vote with the evidence contract, a confidence and (optionally) a plan. The baseline ICT session model is the first port; the parked stories are rebased next; then VWAP, breakout, trend, mean-reversion and order-flow momentum.

**Why now.** All inputs exist; the stories no longer need to recompute anything.

**Files likely to change.** `src/ictStrategy.ts` (shrinks to the session story; the seatbelt tail moves to the risk engine in Phase 12 — until then it is called through a shared helper), `src/bot.ts` (runs every enabled strategy), `src/replay.ts` (per-strategy replay and a comparison run), `src/adaptiveFilter.ts` (`describeKey` from the patch; keys include the strategy id), `src/server.ts` (`/api/strategies`, `/api/strategies/enable`), `src/settings.ts` (enabled strategies), `web/index.html` (Playbook tab: the patch's definitions as copy), `src/talk.ts` and `src/mcp.ts` (`strategies` command/tool), `README.md`.

**Files likely to be created.** `src/strategies/types.ts` (`Strategy { id, meta, evaluate(features, ctx): StrategyVote }`), `src/strategies/registry.ts`, `src/strategies/sessionIfvg.ts`, `src/strategies/sessionFvg.ts`, `src/strategies/orderBlock.ts`, `src/strategies/silverBullet.ts`, `src/strategies/unicorn.ts`, `src/strategies/turtleSoup.ts`, `src/strategies/vwapReclaim.ts`, `src/strategies/breakout.ts`, `src/strategies/trendPullback.ts`, `src/strategies/meanReversion.ts`, `src/strategies/orderFlowMomentum.ts`, `src/strategies/crossover.ts` (moved from `strategy.ts`), `test/strategies/*.test.ts` with one fixture day per strategy that must fire exactly once and one that must not fire.

**Dependencies.** Phases 6–9; Phase 4 for replayable results.

**Data requirements.** Fixture days per strategy; order-flow strategies need recorded streams.

**Tests required.** Interface conformance for every module; fixture-day fires-once; no-fire day; evidence list non-empty and ordered; the session model's output on the baseline fixture is byte-identical to today's.

**Acceptance criteria.** `npm run replay:raw -- --strategy <id>` works for every id; a comparison table across strategies on the same window; the dashboard lets the user enable/disable strategies and shows each one's current vote.

**Risks.** Porting the parked stories without their tests first. Mitigation: tests before port, per §B.

**What must NOT be done yet.** No fusion; each strategy is still judged alone. No factory.

---

### PHASE 11 — Signal fusion

**Objective.** Combine strategy votes into one explainable decision: `LONG | SHORT | LONG WATCH | SHORT WATCH | NO TRADE` with a 0–100 agreement score, regime-aware weights, and the list of what confirms and what invalidates.

**Why now.** Multiple strategies now exist; the risk engine wants one candidate order, not six.

**Files likely to change.** `src/bot.ts`, `src/brief.ts` (the fusion table), `src/server.ts` (`/api/decision`), `web/index.html` (strategies panel), `src/watch.ts` (alerts on fused state changes rather than per-strategy).

**Files likely to be created.** `src/fusion.ts` (pure), `src/fusion/weights.ts` (per-regime weights, defaults in config, overridable in settings), `test/fusion.test.ts`.

**Dependencies.** Phase 10.

**Data requirements.** None beyond votes.

**Tests required.** Unanimous ⇒ high score; disagreement ⇒ WATCH; a regime-disallowed strategy carries zero weight; "why not enter yet" names the missing confirmation; deterministic for equal inputs.

**Acceptance criteria.** The Today tab shows the votes and the fused decision with score; the fused decision is what the paper trader acts on (still through risk).

**Risks.** Weights become a hidden tuning knob. Mitigation: weights are logged with every decision and covered by Phase 13's walk-forward.

**What must NOT be done yet.** No auto-tuning of weights.

---

### PHASE 12 — Risk and position sizing (veto engine)

**Objective.** A risk engine with veto power over every candidate order, paper or live: per-trade risk, daily loss, max position, max exposure, max correlated exposure (multi-symbol later), max leverage (spot ⇒ 1×), drawdown cap, stale-data protection, spread protection, execution protection (reject if the simulated/actual fill would breach the plan), emergency shutdown, kill switch — plus sizing that respects exchange filters even on paper.

**Why now.** Must exist before any shadow/live phase; CRITICAL blocker B6. It also absorbs the "seatbelt tail" now duplicated inside the engine.

**Files likely to change.** `src/risk.ts` (becomes the sizing module called by the engine), `src/ictStrategy.ts` and `src/strategies/*` (drop the News/Daily-limits/Plan steps; the risk engine appends those evidence steps so the checklist the user sees is unchanged), `src/paperTrader.ts`, `src/watch.ts`, `src/server.ts` (`/api/risk`), `web/index.html` (risk panel), `config.ts` (`risk` block), `src/killswitch.ts`.

**Files likely to be created.** `src/riskEngine.ts` (`assess(candidate, state): RiskVerdict` with every rule as a named check), `src/risk/rules/*.ts` (one file per rule), `src/risk/filters.ts` (tick/step/min-notional rounding, needed for Phase 20 and correct sizing today), `test/riskEngine.test.ts` (one test per rule), `test/filters.test.ts`.

**Dependencies.** Phases 3, 5 (staleness), 11.

**Data requirements.** Feed health from the bus; account state from the store.

**Tests required.** Every rule vetoes on its boundary; a candidate that passes every rule is approved with the same size the baseline `checkRisk` gives on the fixture; stale data vetoes; spread above threshold vetoes; kill switch vetoes everything including paper.

**Acceptance criteria.** No order (paper or otherwise) can be created without a `RiskVerdict.approved`; the dashboard shows limits used; `/api/system` shows risk state; `npm run stop` is honoured within one candle.

**Risks.** Double-counting limits between engine and risk engine during the transition. Mitigation: the engine's tail is removed in the same commit the risk engine lands, with the evidence-text regression test.

**What must NOT be done yet.** No leverage support; no futures.

---

### PHASE 13 — Backtesting, out-of-sample, walk-forward, Monte Carlo

**Objective.** A backtester over months of stored candles (and recorded trades where present) using the Phase 4 simulator, per strategy and per fused decision, with train/validation/OOS splits, rolling walk-forward, Monte-Carlo resampling of the trade list, and reports that separate in-sample from out-of-sample.

**Why now.** Before any factory and before any live gate: CRITICAL B7.

**Files likely to change.** `src/replay.ts` (becomes a thin wrapper over the backtester for the existing commands), `src/market.ts` (long backfill paging beyond the 200-page guard via the candle store), `src/server.ts` (`/api/backtest/*`), `web/index.html` (Test tab: OOS columns), `package.json` (scripts).

**Files likely to be created.** `src/backtest/runner.ts`, `src/backtest/splits.ts`, `src/backtest/walkForward.ts`, `src/backtest/monteCarlo.ts`, `src/backtest/report.ts` (JSON + text), `src/backtest/metrics.ts` (win rate, PF, expectancy, max DD, Sharpe-like on R, streaks, trades/day), `test/backtest/*.test.ts`.

**Dependencies.** Phases 4, 5 (candle store), 10, 12.

**Data requirements.** At least 6–12 months of 5m candles in the store (backfilled by REST; ~100k candles). Trades recordings only for the windows recorded.

**Tests required.** Deterministic runs; splits never overlap; walk-forward windows roll correctly; Monte Carlo reproduces the mean of the input; reports label sample sizes below `minSetupsForConfidence`.

**Acceptance criteria.** A report per strategy with IS/OOS/WF/MC sections; the README's "will it make money" section points at the OOS number only.

**Risks.** Order-flow strategies cannot be backtested outside recorded windows. The report must say `not backtestable: no trade recording for this window` rather than fall back to candles.

**What must NOT be done yet.** No automated parameter search (Phase 14).

---

### PHASE 14 — Strategy factory, breeding, survivor selection

**Objective.** Generate strategy variants (a genome = strategy id + parameter vector + filters), evaluate them with the Phase 13 backtester, and keep survivors that pass OOS and walk-forward with multiple-testing discipline.

**Why now.** Only after the backtester is trustworthy; otherwise the factory breeds overfit.

**Files likely to change.** `src/strategies/types.ts` (parameter schema per strategy), `src/settings.ts`, `src/server.ts` (`/api/factory/*`), `web/index.html` (Factory tab, minimal).

**Files likely to be created.** `src/factory/genome.ts`, `src/factory/generate.ts` (grid + random + simple evolutionary mutation), `src/factory/evaluate.ts`, `src/factory/select.ts` (min trades, OOS ≥ threshold, parameter-stability check on neighbours, deflated Sharpe or equivalent correction for the number of trials), `src/factory/campaign.ts` (a run with a seed, persisted), `test/factory/*.test.ts`.

**Dependencies.** Phase 13.

**Data requirements.** Same as Phase 13; long histories.

**Tests required.** Deterministic with a seed; selection rejects a variant that only wins in-sample (fixture); parameter-stability check rejects a spike; trial count is recorded and applied.

**Acceptance criteria.** A campaign produces a ranked survivor list with all evidence attached; nothing is auto-enabled.

**Risks.** Compute time on a laptop. Mitigation: campaigns are resumable and bounded.

**What must NOT be done yet.** No survivor goes to paper without a passport (Phase 15).

---

### PHASE 15 — Strategy vault, passports, decay detection, champion-challenger

**Objective.** Persist every strategy instance with a passport (genome, backtest, OOS, walk-forward, Monte Carlo, paper, shadow, live results, regime fit, decay status, why it traded), detect decay (rolling expectancy vs expectation, CUSUM on R), and run champion-challenger promotion.

**Why now.** Gives the factory output a lifecycle before any of it touches paper or live.

**Files likely to change.** `src/store.ts` (tables `strategies`, `passports`, `strategy_results`), `src/server.ts` (`/api/vault/*`), `web/index.html` (Vault tab), `src/adaptiveFilter.ts` (memory lessons become passport events).

**Files likely to be created.** `src/vault/passport.ts`, `src/vault/decay.ts`, `src/vault/promotion.ts`, `test/vault/*.test.ts`.

**Dependencies.** Phases 13–14.

**Data requirements.** Results from every stage.

**Tests required.** Decay flags when rolling expectancy drops below the OOS lower bound for N trades; promotion only when the challenger beats the champion on OOS and paper; passports are immutable except appended results.

**Acceptance criteria.** The vault table in the UI matches the passports on disk; a decaying strategy is automatically demoted to watch.

**Risks.** Small samples make decay noisy. Mitigation: minimum N per rule, documented.

**What must NOT be done yet.** No automatic promotion to live.

---

### PHASE 16 — AI research agents, AI CIO, market narrator

**Objective.** The assistant explains what the quantitative engine already knows, in the fixed format *market read → what confirms → what invalidates → current decision → why not yet*, and a research agent proposes factory campaigns. Neither can place, size or approve orders.

**Why now.** Sits on top of features, fusion and risk; earlier it would narrate guesses.

**Files likely to change.** `src/ai.ts` (structured output schema; context assembled from `FeatureSnapshot`, fusion and risk rather than the brief text), `src/skills.ts` (new hats: CIO, Narrator, Researcher), `src/server.ts` (`/api/narrate`), `src/mcp.ts` (read-only tools for features/decision/vault), `web/index.html` (AI market read panel), `.claude/skills/*` (updated to the new commands).

**Files likely to be created.** `src/ai/narrator.ts`, `src/ai/cio.ts`, `src/ai/researcher.ts` (produces campaign specs, never runs them without a click), `test/ai/format.test.ts` (offline: the prompt contains the required sections and no numbers outside the context).

**Dependencies.** Phases 11–15.

**Data requirements.** None new.

**Tests required.** Context builder includes every feature the narrator cites; format validator rejects an answer missing a section; refusal path unchanged.

**Acceptance criteria.** A narration for a fixture snapshot follows the format; the CIO's "decision" always equals the fused decision after risk.

**Risks.** Cost. Mitigation: narration on candle close only when the fused state changes.

**What must NOT be done yet.** No AI-generated orders, ever.

---

### PHASE 17 — Professional command-center UI

**Objective.** Modularise the frontend and build the command-center layout: main chart with VWAP/profile/structure/liquidity/order-flow overlays; order-flow panel; AI market read; strategies panel; risk panel; system health; vault; replay player (▶ PLAY through stored candles showing the evidence at each step).

**Why now.** The engine is trustworthy and stable enough that UI work will not be thrown away.

**Files likely to change.** `web/index.html` (becomes a shell), `web/sw.js` (cache the new module files), `src/server.ts` (serve `web/js/*` and `web/css/*`, SSE), `README.md` screenshots.

**Files likely to be created.** `web/js/api.js`, `web/js/state.js`, `web/js/chart/*.js` (candles, overlays, interaction: pan/zoom, crosshair), `web/js/panels/*.js` (today, flow, strategies, risk, vault, replay, ask, journal, news, tv), `web/js/palette.js`, `web/js/voice.js`, `web/css/app.css`, `test/ui/*.mjs` (Playwright smoke: routes render, no console errors, 1180/400 px).

**Dependencies.** Phases 5, 8, 11, 12, 15, 16 for panels; can start earlier for the shell.

**Data requirements.** `/api/stream` SSE from Phase 5.

**Tests required.** Playwright smoke in CI (headless Chromium is already available on the dev machine; CI uses `playwright-core` with the system Chromium or a container).

**Acceptance criteria.** The main screen matches the target layout; every panel has a loading and an error state; the replay player steps through a stored day and shows each strategy's evidence per candle.

**Risks.** Scope creep. Mitigation: panels land one at a time behind the existing tabs.

**What must NOT be done yet.** No live-order controls in the UI until Phase 20.

---

### PHASE 18 — Paper trading (event-driven, measured)

**Objective.** Run the full stack on real data with fake money for a meaningful sample, recording signals, simulated fills, the real spread at fill time, slippage assumptions vs observed book, missed and false signals, latency, and per-strategy performance into the vault.

**Why now.** First end-to-end proof; everything below it is now measurable.

**Files likely to change.** `src/paperTrader.ts` (event-driven; records the book at decision time), `src/vault/*` (paper results), `web/index.html` (paper panel with the new fields).

**Files likely to be created.** `src/paper/metrics.ts`, `test/paper/*.test.ts`.

**Dependencies.** Phases 5, 12, 15, 17 (panel).

**Data requirements.** Live streams for weeks.

**Tests required.** A paper trade records the observed spread; a missed signal (kill switch or stale data) is logged as missed with reason.

**Acceptance criteria.** ≥ 4 weeks and ≥ `minSetupsForConfidence` fused trades recorded; report compares realised paper expectancy with OOS expectancy per strategy.

**Risks.** Impatience. The exit criterion is a sample size, not a date.

**What must NOT be done yet.** No exchange keys.

---

### PHASE 19 — Shadow trading

**Objective.** The system builds the exact order it *would* send (symbol, side, quantity rounded to filters, price, OCO legs) against the live book, logs it, and later scores what would have happened using actual trades — without sending. Requires a read-only exchange adapter.

**Why now.** Bridge between paper and live; proves sizing, filters and timing on the real venue.

**Files likely to change.** `src/mode.ts` (`shadow` reachable), `src/watch.ts`, `src/server.ts` (`/api/shadow`), `src/doctor.ts` (key permission check: must be read-only, `canWithdraw=false`), `.env.example` (`EXCHANGE_API_KEY`, `EXCHANGE_API_SECRET` documented as read-only for this phase).

**Files likely to be created.** `src/exchange/types.ts`, `src/exchange/binanceRest.ts` (signed requests: HMAC-SHA256, `X-MBX-APIKEY`, `recvWindow`, server-time offset; read-only endpoints only in this phase: `exchangeInfo`, `account`, `openOrders`, `myTrades`), `src/exchange/filters.ts` (already from Phase 12; reads live `exchangeInfo`), `src/shadow/recorder.ts`, `src/shadow/scorer.ts`, `test/exchange/sign.test.ts`, `test/shadow/*.test.ts` (against a mock signed API).

**Dependencies.** Phases 12, 18.

**Data requirements.** Live book and trades; a read-only key.

**Tests required.** Signature matches a known vector; time offset applied; a key with withdrawal permission is refused by the doctor; shadow order quantity respects `LOT_SIZE`/`NOTIONAL`.

**Acceptance criteria.** ≥ 2 weeks of shadow orders scored; slippage and fill-rate assumptions in Phase 4 updated from observed data; discrepancies logged.

**Risks.** Sending by mistake. Mitigation: this phase's adapter has no order-placing method at all; it is added in Phase 20 in a separate module.

**What must NOT be done yet.** No `POST /api/v3/order` code anywhere in the tree.

---

### PHASE 20 — Live exchange execution

**Objective.** Execute real orders, testnet first, then tiny real size, with an order state machine, OCO brackets on the exchange, reconciliation from fills, a live-armed gate chain, and behavioural comparison with paper/shadow.

**Why now.** Only after B1–B9 are closed and the comparison from Phase 19 is acceptable.

**Files likely to change.** `src/mode.ts` (`testnet`, `live` reachable through gates), `src/execution.ts` (routes by mode; paper path unchanged), `src/store.ts` (tables `orders`, `fills`, `order_events`), `src/riskEngine.ts` (execution protection uses real book), `src/server.ts` (`/api/live/*` behind the guard and a second confirmation), `src/doctor.ts`, `web/index.html` (LIVE badge, kill switch button), `config.ts` (`live` block with hard caps), `README.md` (a "Real money" chapter with the gate chain), `.env.example` (`MRCASH_LIVE=I_UNDERSTAND_REAL_MONEY`).

**Files likely to be created.** `src/exchange/binanceTrade.ts` (`marketBuy` by `quoteOrderQty`, `marketSell`, `ocoSell` via `POST /api/v3/orderList/oco` with `aboveType`/`belowType` on global/testnet and the `order/oco` shape on Binance.US behind a flavour switch, `cancelAll`, `orderList`), `src/live/orders.ts` (state machine: `new → submitted → open → partially_filled → filled | cancelled | rejected | reconciled`), `src/live/reconcile.ts`, `src/live/gates.ts` (testnet track record ≥ N trades, config on, env phrase, typed confirmation, caps, guard present, kill switch absent, feed healthy), `src/live/trader.ts`, `scripts/live-arm.ts`, `test/live/*.test.ts` (mock exchange with fills, partial fills, OCO leg fill, rejects, disconnect mid-order).

**Dependencies.** All of 1–19 except 14–16 (factory, vault and AI are not required for a single hand-picked strategy to go live, but the vault passport of that strategy is).

**Data requirements.** Testnet key; later a real key with trade-only permission and IP restriction.

**Tests required.** Every gate has a failing test; state machine transitions; reconciliation from `myTrades` recovers a position after restart; OCO leg fill closes the local position with the real commission; kill switch cancels open orders; a rejected order leaves no phantom position.

**Acceptance criteria.** ≥ 20 testnet trades reconciled with zero mismatch; real-money phase starts at the minimum notional; a written comparison of live vs shadow vs paper fills after ≥ 20 real trades.

**Risks.** Spot is long-only; short signals are logged, not traded, and the UI says so. Binance global vs Binance.US differ in OCO endpoint shape; both are behind tests with recorded responses.

**What must NOT be done yet.** No futures, no leverage, no size increases until the comparison report is accepted by the user.

---

### PHASE 21 — Production hardening and 24/7 recovery

**Objective.** A supervised process with structured logs, rotation, a health endpoint, crash recovery that reconciles state on start, alerting on failures, backups of the store, and HTTPS for remote access.

**Why now.** Required before capital is at risk; the paper/shadow process should already run this way (start it in parallel with Phases 18–19).

**Files likely to change.** `start-24-7.command`/`.bat` (replaced by a supervisor config), `src/server.ts` (`/api/health` deep checks), `src/watch.ts` (startup reconciliation), `README.md` (deployment chapter).

**Files likely to be created.** `Dockerfile`, `docker-compose.yml`, `deploy/pm2.config.cjs` or `deploy/mrcash.service`, `src/log.ts` (levels, JSON lines, rotation), `scripts/backup.ts`, `docs/DEPLOY.md`, `test/log.test.ts`, `test/recovery.test.ts` (kill during an open paper position ⇒ restart reconciles).

**Dependencies.** Phase 3 (store), Phase 5 (stream recovery), Phase 20 for live reconciliation.

**Data requirements.** None new.

**Tests required.** Recovery test; log rotation; health endpoint reports every feed and the store.

**Acceptance criteria.** 7 days unattended on a VPS with no manual restart; every restart logged with cause; backups restorable.

**Risks.** Laptop sleep. The README already says a machine that stays on is required; this phase makes the VPS path documented and tested.

**What must NOT be done yet.** Nothing is blocked by this phase; it should not be skipped.

---

## E. Dependency graph

```
P1 Security ──┐
              ├─► P2 Tests/CI ─► P3 Store ─► P4 Fills ─────────────────────┐
              │                     │                                        │
              │                     └─► P5 Market-data bus ─► P6 Features ──┼─► P7 Structure/Liquidity
              │                                     │                        │            │
              │                                     └─► P8 Order flow ───────┼────────────┤
              │                                                              │            ▼
              │                                                              │      P9 Regime
              │                                                              │            │
              │                                                              ▼            ▼
              │                                                     P10 Multi-strategy engine
              │                                                              │
              │                                                              ▼
              │                                                       P11 Signal fusion
              │                                                              │
              └──────────────────────────────────────────────────────────────┼─► P12 Risk engine (veto)
                                                                             │            │
                                                                             ▼            │
                                                            P13 Backtest/OOS/WF/MC ◄──────┘
                                                                             │
                                                    ┌────────────────────────┼──────────────────┐
                                                    ▼                        ▼                  ▼
                                             P14 Factory ─► P15 Vault   P16 AI layer      P17 Command-center UI
                                                    │            │            │                  │
                                                    └────────────┴────────────┴──────────────────┘
                                                                             │
                                                                             ▼
                                                                    P18 Paper (measured)
                                                                             │
                                                                             ▼
                                                                    P19 Shadow (read-only adapter)
                                                                             │
                                                      P21 Hardening ─────────┼─► (must be running before P20)
                                                                             ▼
                                                                    P20 Live (testnet → tiny real)
```

Rules the graph encodes: nothing after P4 may cite a performance number produced before P4; nothing may read order flow that P5 has not proven continuous; nothing may reach P20 without P12, P13, P18, P19 and P21.

---

## F. Answers

**1. Immediate next phase.** PHASE 1 — Security and safety.

**2. Exact next task to execute.**
Task P1-1: create `src/guard.ts` and wire it into `src/server.ts` so that every `POST` under `/api/` (and `/api/memory/reset`, `/api/plan/clear`) is rejected unless (a) the request carries `x-mrcash-csrf` equal to the token issued by `/api/config` for that session and (b) `Sec-Fetch-Site` is `same-origin` or absent-with-matching-`Origin`; add `test/guard.test.ts` and a first `test/server.test.ts` that starts the server on an ephemeral port (`MRCASH_PORT`) with a temp data folder (`MRCASH_DATA_DIR`) and proves a cross-origin POST to `/api/memory/reset` no longer wipes memory.
The command that starts the task, run from `trading-bot/`, is the baseline check that must still pass at the end:

```
npm run selftest && npx tsc --noEmit
```

followed by creating the two files above and running:

```
node --test test/
```

**3. Definition of done for Phase 1.**
- Every state-changing route is covered by the guard and by a test that a forged cross-origin request is rejected.
- PIN failures are throttled per client address; a test shows one client's lockout does not affect another.
- `src/mode.ts` exists, `runtimeMode()` returns `paper`, `execution.ts` consults it, and the `LIVE_TRADING_ENABLED` self-test still passes.
- `data/STOP` (via `npm run stop` / `npm run resume` / `/api/stop`) prevents any new paper position within one watch cycle, with a test.
- `/api/health` returns mode, kill-switch state and data-folder writability.
- `npm run selftest` is 72/72, `npx tsc --noEmit` is clean, `node --test test/` is green.
- No change to any trading decision: the self-test day and a replay on the mock feeds produce the same trades as before (checked by hand once; automated in Phase 2).
- README and `trading_bot_instructions.md` §2 updated to describe the guard, the throttle, the mode module and the kill switch.
