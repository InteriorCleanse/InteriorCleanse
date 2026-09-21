# First-Fill Acceptance

How the first real PAPER fill becomes a trustworthy, auditable event: the
audited chain, the acceptance contract, the verifier that checks it over the
durable record, and the screen that shows it. Nothing in this phase changes
how Mr. Cash decides to trade.

State at the time of writing: zero real paper trades. The correct reading of
every surface described here is WAITING FOR FIRST REAL PAPER FILL and NOT
ENOUGH REAL PAPER DATA.

## 1. The chain as it is actually implemented (Step 1 audit)

| # | Stage | Source | Record / event | Persistence | Timestamp source | Identifiers and provenance | Existing validation | Failure handling |
|---|---|---|---|---|---|---|---|---|
| 1 | Market data received | `src/data/feed.ts`, `binanceStream.ts`, `market.ts` | `candle:closed` on the bus (stream or REST heartbeat) | — | exchange candle `openTime`/`closeTime` | symbol, interval, `source` | dedupe set, parser drops malformed frames | reconnect with back-off, REST fallback, gap back-fill |
| 2 | Candle finalized | `src/data/candleStore.ts`, `store.upsertCandles` | `candles` row | SQLite `candles` (PK symbol, interval, open_time) | candle times | `source` per row; known gaps in kv | `findGaps`, `lastClosedOpenTime` | permanent gaps remembered, never filled with invented bars |
| 3 | Observer cycle | `learning/ops.ts onWatchCycle` → `observer/observer.ts observeCycle` | `observations` rows, `research:ops.lastCycleAt` | SQLite `observations`, kv | `watch:cycle.at` (cycle time); `availableAt` = the close the event could be known at | content-addressed `observationId` | idempotent id; hindsight audit at resolution | caught per step; ops state records the error |
| 4 | Candidate generated | `bot.ts analyzeNow` → strategies → `fusion.ts` → `watch.ts fusedToSignal` | `Signal` (setupKey, time, plan, evidence) | none (recomputed per cycle) | signal candle `closeTime` | `setupKey`, `time` | strategy conformance tests | a throwing strategy aborts the cycle; next close retries |
| 5 | Strategy evidence attached | `watch.ts` builds `DecisionSnapshot` | `snapshot` on the position | with the position | decision time = signal time | `signalId = setupKey@time`, `engineVersion`, `featureVersion`, contributors, evidence, riskChecks | `sanitizeSnapshot` keeps only declared fields (no outcome can be stored there) | — |
| 6 | Risk veto evaluated | `riskEngine.assess` in `watch.ts` | `verdict.checks`, `vetoedBy` → on the snapshot | with the position; vetoes as MISSED rows | decision time | rule names (Kill switch, Fresh data, Exposure, Exchange filters, …) | `riskEngine.test.ts`, `orderPathGuard.test.ts` | veto → missed record with reason, no order |
| 7 | Decision produced | `watch.ts watchOnce` → `paperTrader.openPosition` | `PaperPosition` status `pending` | SQLite `positions` + `positions.json` mirror | `openedAt` = signal time | `id` (`p<time36><rand>`), `dayKey`, session, strategyId, regime, book at decision | `once('setup-<time>')` in the durable `announced` table | a restart cannot queue the same signal twice |
| 8 | Paper execution accepted/rejected | `paperTrader.managePositions` → `fillPosition` / `missPosition` | position → `open` or `closed/missed` | `positions`, ledger SKIP row on a miss | fill candle `openTime` | — | venue filters at the fill size | a size the venue would reject is a miss, not an invented fill |
| 9 | Simulated fill | `sim/fills.simulateEntry` | `entry`, `filledAt`, `entryCostUsd`, `latencyMs`, re-sized `quantity`, `riskUsd` | `positions` | fill candle open | — | `fills.test.ts`, `paperTrader.test.ts` | drift beyond `maxEntryDriftAtr` → MISSED |
| 10 | Position state updated | `paperTrader.savePosition` | row + mirror | `positions`, `positions.json` | — | `id` | closed rows immutable except reconciliation fields | `recoverOpenPositions` on start |
| 11 | Reconciliation | `paper/reconcile.ts` (MAE/MFE, the only writer), `ops/reconcile.ts` (trade reconciliation, read-only) | `mae`, `mfe`, `reconciledAt`; `ops:reconciliation` | `positions`, kv | — | position `id` | `records.test.ts` | INCOMPLETE is reported, never repaired |
| 12 | Checkpoint evaluated | `ops/checkpoints.ts checkCheckpoints` (monitor, each cycle) | `checkpoint:first-fill` | kv | monitor cycle time; `summary.firstFillAt` = the fill | `first-fill` | frozen summary; human `reviewed` flag | idempotent |
| 13 | Day report updated | `ops/dayReport.ts` (monitor at the day roll; `/api/ops/day` on demand) | `paper-day:<dayKey>` | kv | trading-day window | `dayKey` | counts read from the record each time | — |
| 14 | Durable evidence persisted | `store.ts` | positions, ledger, equity, journal, events, observations, kv | SQLite WAL, `busy_timeout` 5 s | — | — | `quick_check`, daily integrity | — |
| 15 | Learning/observer records linked | `observer.ts` (PAPER ENTRY / PAPER EXIT with `recordId`), `learning/observer.ts observePaperClose` (post-mortem at the close) | observations, knowledge items with `provenance.recordIds` | `observations`, kv `knowledge:` | `availableAt` ≥ event time | `recordId` = position id; case study `caseId` | `hindsightFindings` on every case; idempotent ids; retry queue | a failed write is recorded and retried, never duplicated |

Two things the audit found and did not change:

- The decision snapshot records engine and feature versions but no fingerprint of the frozen profile. The verifier reports the running profile's fingerprint beside the recorded versions (check B6). Recording the fingerprint on the snapshot at decision time would strengthen it; that is a change to `watch.ts` and is listed under follow-up candidates, not made here.
- The ledger is written at the close, not at the fill. The contract therefore treats the ledger check as NOT_APPLICABLE while the position is open and checks it at the close, while still failing if a MISSED row exists for a signal that filled.

The first-fill checklist that already existed (`checkpoints.ts`, `review` text on the `first-fill` checkpoint, runbook section 6) is reused: the checkpoint is check F, and its `reviewed` flag is the human review gate on the acceptance screen.

Baseline before any change: 229 tests across the chain's suites (paper trader, fills, recovery, store, ops, observer, learning boundary, security, paper, analyst) passed.

## 2. The acceptance contract (Step 2)

One first fill: the earliest position on record with a fill time and not missed. Checks, each PASS / FAIL / MISSING / NOT_APPLICABLE with the record it read:

| Id | Group | Check |
|---|---|---|
| A1 | Market data | Data source is PAPER (live exchange data): not a recorded feed (`MRCASH_MARKET_URL`), not LIVE |
| A2 | | The signal candle is stored |
| A3 | | The fill candle is stored |
| A4 | | Signal and fill candles are contiguous (exactly `latencyCandles` apart) |
| A5 | | Timestamps sit on the exchange clock |
| A6 | | The freshness risk check passed at the decision (from the snapshot) |
| A7 | | No known exchange gap touches the decision window |
| B1 | Decision | A decision exists on the immutable record |
| B2 | | Decision timestamp and trading day are recorded and agree |
| B3 | | Provenance: signal id, symbol, interval, engine and feature versions |
| B4 | | Decision-time inputs: evidence steps and fused votes |
| B5 | | A risk verdict exists and approved |
| B6 | | Frozen configuration identity: recorded versions, running versions, profile fingerprint |
| B7 | | PAPER mode explicit: runtime mode, live flag unset, ledger rows in paper mode |
| C1 | Execution | The paper path produced the fill |
| C2 | | No LIVE path (gate closed in config and environment) |
| C3 | | No SHADOW path (shadow off, no shadow orders on the store) |
| C4 | | The fill price reproduces from `simulateEntry` over the stored candles |
| C5 | | Spread and slippage charged as modelled |
| C6 | | Latency recorded and equal to decision → fill |
| C7 | | Fill timestamp and identifier |
| D1 | State | Position state reflects the fill |
| D2 | | Ledger: one close row and no missed row (at the close; N/A while open) |
| D3 | | Exposure reflects the fill (while open) |
| D4 | | Trade reconciliation CONSISTENT (at the close; N/A while open) |
| D5 | | No duplicate record for the signal, no duplicate id |
| E1 | Durable record | The observer's PAPER ENTRY observation exists for the record |
| E2 | | The evidence layer reads the record as valid |
| E3 | | The record is in the store and the readable mirror |
| F1 | Checkpoint | The `first-fill` checkpoint exists |
| F2 | | Its frozen summary names this fill |
| G1 | Day report | The day report for the fill's day counts the fill |
| G2 | | Day-report counts agree with the record |
| G3 | | The day's integrity status is represented |
| H | No-hindsight | The snapshot carries no outcome field; the observer record is not available before it happened; every linked case study passes `hindsightFindings` |

Verdict: WAITING with no fill; ACCEPTED only when nothing failed and nothing required is missing; otherwise NOT ACCEPTED with the failed and missing ids named. Missing evidence is never a pass.

Durable state under `ops:first-fill`: position id, status, `acceptedAt` (written once, on the first ACCEPTED), first and last evaluation times, failed and missing ids, a bounded status history, and `regressed` with a note if a later evaluation disagrees with an earlier acceptance. The earlier acceptance is kept and the disagreement shown, never silently corrected.

## 3. Where it lives (Steps 3–7)

- Verifier: `src/ops/firstFill.ts` — `evaluateFirstFill({ now, persist })`, `firstFilledPosition()`, `readFirstFillState()`, `dataSourceLabel()`. Reads only positions, candles, ledger, observations, knowledge items, checkpoints, the day report, the shadow store and the config gates. Reuses `simulateEntry`, `reconcileTrade`, `hindsightFindings`, `fromPaperPosition`, `validationProfile`, `paperDayReport`, `listCheckpoints`.
- Monitor: `src/ops/monitor.ts` re-evaluates after every engine cycle (after checkpoints). The bell rings `FIRST PAPER FILL ACCEPTED` once, and `OPS WARN: first-fill acceptance disagreement` once if a later evaluation regresses.
- Route: `GET /api/ops/first-fill` (`src/ops/api.ts opsFirstFill`).
- Screen: Operations → **First fill** (`web/js/ops.js renderFirstFill`): status, data source and execution labels, durable verdict and human-review state; the chain (Market Data → Decision → Risk → Paper Execution → Fill → Position → Reconciliation → Durable Record → Checkpoint → Day Report) with PASS / FAIL / WAITING / NOT YET OBSERVED; the no-hindsight audit; the checks table; then two separate cards, **BEFORE / DECISION-TIME KNOWLEDGE** and **AFTER / EXECUTION AND OUTCOME**. Before the first fill the screen says WAITING FOR FIRST REAL PAPER FILL and NOT ENOUGH REAL PAPER DATA and shows every stage as NOT YET OBSERVED.

## 4. Failure handling (Step 8)

| Situation | Where it shows |
|---|---|
| stale data / missing candle / unresolved gap | A2, A3, A4, A6, A7 |
| rejected candidate, risk veto | never a fill; B5 FAIL if a vetoed decision somehow filled |
| paper execution rejection (miss) | not a fill; a MISSED row for a signal that also filled fails D2 |
| missing fill record | WAITING (no fill on record) |
| duplicate fill | D5 |
| position mismatch | C4, C5, C6, D1, D3 |
| reconciliation mismatch | D4 (closed), C4 (open) |
| missing provenance | B3, B4, B6, hindsight MISSING |
| checkpoint failure | F1, F2 |
| day-report mismatch | G1, G2 |
| persistence failure | E3; the kv write of the verdict is best-effort and the verdict is recomputed on every read |
| wrong execution mode | A1, B7, C2, C3 |

A failed first-fill attempt is never presented as a first fill. Nothing is manufactured to recover.

## 5. Tests (Step 9)

`test/ops/firstFill.test.ts`, eight tests on a throwaway store, every fixture labelled TEST FIXTURE / SYNTHETIC and run through the real fill model:

zero trades (WAITING, nothing passed, NOT ENOUGH REAL PAPER DATA) · valid chain (NOT ACCEPTED with the missing evidence named until the observer, checkpoint and integrity have run; then ACCEPTED with every applicable check PASS and the reconciliation stage WAITING for the close; BEFORE carries no fill or outcome field; the acceptance time is durable) · wrong execution mode (live flag, recorded feed, shadow orders) · model mismatch and regression (earlier acceptance kept, disagreement flagged) · duplicate fill · missing evidence (MISSING, never PASS) · hindsight violation · after the close (ledger and reconciliation join the contract).

## 6. Follow-up candidates (out of scope, not implemented)

- Record a fingerprint of the frozen profile on the decision snapshot at decision time (`watch.ts`), so B6 can compare recorded against recorded rather than recorded against running.
- A `firstFill` line on the permanent day report once the day's fill is accepted.
