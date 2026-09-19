# Phase 25 — Paper Operations Audit

Written before any Phase 25 code, from the source as it stood at commit
d0ae311 (Phase 24 complete, CI green, 839 tests, config.ts unchanged since
before Phase 23, `live.enabled` and `shadow.enabled` false).

Purpose: describe the complete paper pipeline from market-data arrival to
education, stage by stage, and name what Phase 25 has to add or verify so
the system can run for weeks in PAPER mode with no silent failure. Paper
mode means LIVE MARKET DATA with SIMULATED EXECUTION. Nothing in this
phase changes an entry, an exit, risk, sizing, fusion, a regime rule, a
strategy parameter, live execution or the live gate.

## The pipeline, stage by stage

| Stage | Input | Output | Failure mode | Retry | Persistence | Observability | Tests | Recovery |
|---|---|---|---|---|---|---|---|---|
| MARKET DATA (`src/data/feed.ts`, `binanceStream.ts`, `market.ts`) | Exchange WebSocket (kline, aggTrade, bookTicker, depth) and REST klines | `candle:closed` / `candle:update` / `trade` / `bookTicker` / `book` on the bus; a closed candle announced once whichever path delivered it | Stream drop, silent socket (no message for `staleAfterMs`), REST 4xx/5xx or network failure, depth sequence break | Stream: exponential back-off `reconnectMinMs`..`reconnectMaxMs`, host rotation; REST heartbeat every interval fills anything the stream missed; depth resync on sequence break | Closed candles written to the `candles` table before any listener reacts | `feed.health()`: mode, stream connected/host/lastMessageAt/reconnects/lastGap, lastClosed, heartbeat; `stream:up/down/gap` bus events | `feed.test.ts`, `binanceStream.test.ts`, `candleStore.test.ts` | Automatic; the store-first candle reader back-fills gaps on the next read and remembers permanent gaps |
| CANDLE STORE (`src/data/candleStore.ts`, `store.ts`) | Closed candles from stream or REST | Ordered, deduplicated history (`PRIMARY KEY symbol, interval, open_time`); gap detection and back-fill; pruning after `keepDays` | Exchange outage leaves a gap; a malformed candle | Gaps re-requested until three intervals old, then remembered as known | SQLite in WAL mode, `busy_timeout` 5 s, `synchronous=NORMAL`, `quick_check` on demand | `storedCandleCount`, `lastStoredCandle`, known gaps in kv | `candleStore.test.ts`, `store.test.ts` | Durable; a restart re-reads from disk and fetches only what is missing |
| FEATURES / STRUCTURE / STRATEGIES / FUSION (`bot.ts analyzeNow`, `ict*`, `features/*`, `strategies/*`, `fusion.ts`) | The last `warmupCandles()` closed candles, news, order flow | `Snapshot`: analysis, votes, fused decision, plan | A market-data error aborts the cycle (`MarketDataError`); a strategy throwing aborts the cycle | The next candle close or the safety timer runs a new cycle | None — recomputed each cycle from stored candles (deterministic over the same candles) | `watcher.lastError()`, `watch:cycle` on the bus, eventLog entries | `engine.test.ts`, `fusion.test.ts`, `strategies/*`, `features/*` | Stateless; nothing to recover |
| RISK (`riskEngine.ts`, `killswitch.ts`) | The trade signal and `RiskState` (kill switch, candle age, spread, exposure, daily brakes, drawdown) | Approve with size, or a named veto | Stale data or kill switch veto → recorded as a MISSED signal with the reason | Re-evaluated on every cycle with a new signal | Vetoes with a reason are stored as missed positions; refused-by-memory rows go to the ledger | `veto-*` events (deduplicated per signal), `snapshot.riskChecks` on the record | `riskEngine.test.ts`, `killswitch.test.ts`, `orderPathGuard.test.ts` | Stateless |
| PAPER DECISION (`watch.ts watchOnce`) | Signal + risk verdict + memory | A PENDING position with the decision-time snapshot, or a missed record | A crash between `assess` and `openPosition` loses nothing (the signal recurs on the next cycle); duplicate protection is `once('setup-<time>')`, persisted in the `announced` table | Next cycle | Position row (status pending) + `positions.json` mirror | eventLog `Paper … QUEUED` | `watch.test.ts`, `paperTrader.test.ts` | `once` is store-backed: a restart cannot queue the same signal twice |
| PAPER FILL (`paperTrader.managePositions` → `sim/fills.simulateEntry`) | Pending position + stored candles | Filled at the next candle's open plus half-spread plus slippage, re-sized at the fill, passed through venue filters; or MISSED beyond `maxEntryDriftAtr` | The venue filter rejects the size → recorded as missed, not invented | Next cycle re-evaluates a still-pending order | Position row updated to open (`filledAt`, `entryCostUsd`, `latencyMs`) | eventLog `Paper … FILLED` | `fills.test.ts`, `paperTrader.test.ts`, `filters.test.ts` | Pending orders are re-adopted on start (`recoverOpenPositions`) and filled from the candles that closed meanwhile |
| POSITION MANAGEMENT (`managePositions`, `evaluateExit`) | Open position + candles | Held, or an exit | A gap through the stop fills at the open; stop beats target on the same candle; time exit at `maxHoldCandles` | Every cycle | Position row | eventLog on close | `paperTrader.test.ts`, `fills.test.ts` | Same: the candles that closed during downtime are walked on the first cycle after restart |
| PAPER EXIT / IMMUTABLE RECORD (`finalize`, `store.savePosition`) | Exit price and reason | Closed position with R, PnL, fees, outcome; ledger row; equity row; journal entry; vault passport result | A second write that changes a closed record throws and names the fields (`RECONCILIATION_FIELDS` only) | Not applicable — one finalize per position | Position row (immutable), ledger, equity, journal, `positions.json`, `equity.csv` | eventLog `Paper … closed at …R` | `paperTrader.test.ts`, `outcomeConsistency.test.ts`, `store.test.ts` (immutability) | Durable; the mirror files are rewritten from the store |
| ATTRIBUTION / EVIDENCE (`analyst/*`) | Closed positions | `EvidenceRecord` with provenance, cohorts, comparisons | A corrupt record is counted, excluded, never repaired silently | Recomputed on request | None (derived) | `/api/evidence`, data-quality panel | `test/analyst/*` | Stateless |
| KNOWLEDGE (`learning/observer.ts`, `knowledge/*`) | The close (`observePaperClose`) | Post-mortem item, evidence counts on items and hypotheses; decay, failures, memory | A throwing learning step is caught in the watch loop and logged; the position is already final | On the next cycle the idempotent item id makes a retry safe | kv `knowledge:`, `failure:`, `hypothesis:` | eventLog `Learning loop skipped` on failure; Knowledge tab | `test/learning/observer.test.ts`, `test/knowledge/*` | Idempotent ids; the backfill route re-runs the loop over unseen closes |
| RESEARCH (`observer/*`, `research/*`, `learning/ops.ts`) | `watch:cycle` on the bus; the research timer | Observations, candidates, case studies, queue, experiments, challenger, digests | A throwing observer step is caught and written to ops state; a research step failure is recorded per step | Each tick re-runs every step; a stranded RUNNING experiment is finished first | `observations` table, kv `experiment:`, `queue:`, `digest:*`, `research:ops` | `/api/ops`, `/api/ops/state`, Observer tab | `test/observer/*`, `test/research/*`, `test/learning/ops.test.ts`, `adversarial.test.ts`, `growth.test.ts`, `lifecycle.test.ts` | Resumes from persisted state; content-addressed ids prevent duplicates |
| EDUCATION (`school/*`) | Resolved cases, the paper record | Lessons (versioned), exercises, replay, lesson of the day | A lesson build failure is confined to the request or the digest step | Next request / next tick | kv `lesson-version:`, vault items | School tab, `/api/school/*` | `test/school/*`, `digest.test.ts` | Stateless over the record |

## The fill model, as it stands (`src/sim/fills.ts`, `config.execution`)

- Entry: a market order on the candle `latencyCandles` after the signal candle (1 = the next candle's open). Fill price = that open plus `spreadBps/2 + slippageBps` against the trade. If the open has drifted more than `maxEntryDriftAtr` ATRs from the intended price the order is MISSED, never chased.
- Stop: a market order fired when the candle trades through it; fills `spreadBps/2 + slippageBps` worse than the stop. A candle that gaps through the stop fills at the open.
- Target: a resting limit; fills only when price trades through by `targetTouchBps`, at the target price. Stop beats target on the same candle.
- Time exit: at `maxHoldCandles`, a market order at the close plus costs.
- Fees: `takerFeePercent` on entries, stops and time exits; `makerFeePercent` on target fills.
- Partial fills: none are modelled; every fill is full size at one price.
- Candle assumptions: only OHLC of stored closed candles; no intra-candle path is assumed beyond "stop first when both are touched".
- Latency: one candle between decision and fill; `latencyMs` is recorded per position.
- Sizing is re-done at the fill price and passed through the venue filters that risk applied; a size the venue would reject is a miss.

Every paper figure on the desk is therefore SIMULATED EXECUTION on LIVE DATA, and the UI must say so wherever a paper result appears.

## What already holds

- One announcement per candle close (feed dedupe set plus the store's primary key).
- One paper order per signal across restarts (`once` keys in the durable `announced` table).
- Closed records immutable except the reconciliation fields.
- Startup recovery re-adopts pending and open positions and counts boots and recoveries.
- Research and observation ids are content-addressed; a tick that runs twice writes nothing twice; a stranded experiment is finished first.
- The learning layer is caught at every boundary and never read by the engine.

## What is missing, and what Phase 25 adds

| Gap found | Phase 25 answer |
|---|---|
| `src/log.ts` (structured logger with rotation) exists and nothing uses it | `src/ops/log.ts`: an ops logger on top of it with component, event, severity INFO/WARN/ERROR/CRITICAL, correlation id, symbol and strategy fields, and suppression of repeated identical messages |
| No process lock: two `npm start` on one data directory would run two watch loops and two research schedulers against one store | `src/ops/lock.ts`: a lock file with pid and heartbeat; a second process refuses to start |
| `/api/health` calls the process healthy from the store and the data dir alone; no thresholds for engine, observer, research or persistence | `src/ops/heartbeat.ts`: every "last …" mark with explicit thresholds and HEALTHY / DEGRADED / STALE / STOPPED |
| Feed health has no counters for duplicate closes, timestamp anomalies or gap events, and no "stale for how long" | `src/ops/feedHealth.ts`, counting what the bus delivers; malformed stream frames are dropped by the parser before the bus and are reported as a known limitation |
| No per-trade reconciliation of the stored record against the fill model and the candles | `src/ops/reconcile.ts` |
| No daily integrity check across candles, observations, records, research, knowledge | `src/ops/integrity.ts`, stored once per trading day |
| No persistent soak counters; `SoakMetrics` measures uptime only | `src/ops/soak.ts` |
| No dataset checkpoints | `src/ops/checkpoints.ts` at first fill, 10, 25, 50, 100, 200 closed trades |
| Errors are visible only as the watcher's last error and eventLog lines | error counters per component in the ops log, surfaced by the health API and alerts |
| A failed knowledge write in the digest step is logged but not retried | `src/ops/retry.ts`: visible, retried next tick, idempotent by id |
| Alerts exist for market events only | ops alerts through the same `eventLog`, deduplicated per hour |
| No operations screen | the Operations tab and `/api/ops/health` |

## Things this audit could not verify here

The development container cannot reach the exchange or news hosts (HTTP 403
through its proxy). Everything below the market-data stage was exercised
against the recorded mock feed and synthetic candles. Real feed quality,
reconnect behaviour against the real stream, and paper execution fidelity
are established only by the soak run on a machine with network access; the
runbook (`PAPER_SOAK_RUNBOOK.md`) lists the fifteen acceptance checks for
that run.
