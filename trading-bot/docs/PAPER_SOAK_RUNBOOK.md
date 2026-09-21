# Paper Soak Runbook — Phase 25

How to run Mr. Cash continuously in PAPER mode on real market data, prove it
is operating with no silent failures, and read the record honestly.

PAPER means: LIVE MARKET DATA with SIMULATED EXECUTION. Every fill is made
by the fill model (next candle open plus spread and slippage). No exchange
credentials are used or needed. Nothing in this runbook enables live trading.

## 0. What this run can and cannot establish

| Established by software (tests, CI, this repository) | Established only by the soak on a networked machine |
|---|---|
| The pipeline runs end to end on a recorded feed and on synthetic candles | Real feed quality: reconnects, gaps, latency against the exchange |
| One process per data directory; a second is refused | Real uptime over days |
| Kill at any point → no duplicate fill, row, observation or research run | Paper execution fidelity against real prints |
| Every "last …" mark has a threshold and a status | How often the real feed is DEGRADED or STALE |
| The record reconciles against itself and the fill model | That any paper trade is worth anything (it is not claimed) |

The development container cannot reach the exchange (HTTP 403 through its
proxy), so everything in the right-hand column is NOT YET ESTABLISHED until
this runbook is executed on a machine with network access.

## 1. Start

```bash
cd trading-bot
npm run typecheck && npm run selftest && npm test        # 878 tests, selftest 80/80
LIVE_TRADING_ENABLED= npm start                          # PAPER mode; opens http://127.0.0.1:<webPort>
```

Confirm at once:

```bash
curl -s http://127.0.0.1:4173/api/ops/health | head -c 600
```

Expect `"dataSource":{"label":"PAPER","execution":"SIMULATED EXECUTION"}` and
`"security":{"ok":true}`. If the label is MOCK the process is pointed at a
recorded feed (`MRCASH_MARKET_URL` is set) and nothing it records is market
evidence. If the label is LIVE, stop: the live flag is set somewhere.

## 2. Single process

A second `npm start` (or `npm run watch`) on the same data directory must
refuse:

```
  <data dir> is already owned by Mr. Cash pid 12345 on <host> (started …, heartbeat 3s ago).
  One process per data directory: stop it first, or start this one with a different MRCASH_DATA_DIR.
```

It exits with code 1 and the first process is untouched. Only after you have
stopped the other process yourself may you start with `MRCASH_FORCE_LOCK=1`.
A crashed owner does not lock you out: a lock whose pid is dead or whose
heartbeat is older than two minutes is taken over automatically.

## 3. The Operations tab

`More → Is it working? → Operations`. Eight views, all from `/api/ops/health`:

- **Overview** — overall HEALTHY / DEGRADED / STALE / STOPPED, data source, security, every heartbeat mark with its age and the rule it was judged by, active alerts, process and performance.
- **Market data** — feed verdict OK / DATA DEGRADED / STALE / OFF, REST and WebSocket state, freshness against the exchange clock, missing candles in 24 h, counters (duplicate closes, timestamp anomalies, gaps, reconnects, stale duration).
- **Paper engine** — last decision, last simulated fill, last close; the record; checkpoints and what to review at each.
- **Research & learning** — last research tick, last observer event, counts, failed writes waiting for retry.
- **Database & integrity** — persistence probe, SQLite quick_check, today's integrity report by section.
- **Reconciliation** — every closed trade against the fill model and the candles.
- **Soak** — observed uptime, restarts, every counter since the soak began.
- **Log & alerts** — error counts by component, the recent ops log with correlation ids, suppressed repeats.

The JSON is at `/api/ops/health`, `/api/ops/heartbeat`, `/api/ops/feed`,
`/api/ops/soak`, `/api/ops/performance`, `/api/ops/integrity`,
`/api/ops/reconciliation`, `/api/ops/checkpoints`, `/api/ops/log`,
`/api/ops/retries`, and the permanent per-day record at `/api/ops/day`
(today so far; `?day=YYYY-MM-DD` for a stored day; `?store=1` to write today's
now) and `/api/ops/days`. The monitor writes each day's report once when the
trading day rolls. The file record is `<data dir>/ops.log` (JSON lines,
rotated at 5 MB × 5).

## 4. Heartbeat thresholds (interval = the configured candle, 5m by default)

| Mark | HEALTHY | DEGRADED | STALE / STOPPED |
|---|---|---|---|
| last market-data update | ≤ 2 intervals | ≤ 6 | beyond |
| last candle (stored close) | ≤ 2 intervals after close | ≤ 6 | beyond |
| last engine cycle | ≤ 2 intervals | ≤ 6 | beyond |
| last research tick | ≤ 2 ticks (15 min each) | ≤ 4 | STOPPED when the next run is > 4 ticks overdue |
| last successful persistence (probe write + read) | ≤ 2 min + 1 interval | ≤ 6 intervals | beyond |
| last observer event | ≤ 24 h | ≤ 3 days | beyond (a quiet tape records nothing) |
| last paper decision / fill / close | follow the engine cycle: a quiet market is not a fault | | |

A mark that has never happened is measured from process start, so a fresh
boot reads "pending", not STOPPED.

## 5. Alerts (through the bell, once per hour per condition, counted on the ops log)

stale data · degraded data · repeated reconnects (≥ 5/h) · watch loop
STALE/STOPPED while candles arrive (CRITICAL) · research scheduler stopped ·
engine cycle error · persistence probe failing (CRITICAL when stale) · SQLite
quick_check not ok (CRITICAL) · another process on the lock (CRITICAL) ·
corrupted or duplicate records · error rate ≥ 20/h · **live flag set anywhere
(CRITICAL)**.

## 6. The first real paper fill — verification chain

Operations → **First fill** runs this chain for you as the acceptance
contract (`/api/ops/first-fill`, `docs/FIRST_FILL_ACCEPTANCE.md`): every
check below is a named PASS / FAIL / MISSING there, the verdict is durable,
and the bell rings `FIRST PAPER FILL ACCEPTED` when the whole chain holds.
Human review is still yours: mark the `first-fill` checkpoint reviewed on the
Paper engine view once you have read the BEFORE and AFTER cards.

When the Paper engine view shows the `first paper fill` checkpoint (the bell
rings `PAPER CHECKPOINT: first paper fill`), verify each link from the record,
not from memory:

1. **Signal candle** — the position's `openedAt` is a candle close on the exchange clock (`openTime % interval == 0`).
2. **Decision snapshot** — `snapshot.signalId`, `engineVersion`, `featureVersion`, `riskChecks` are on the record; nothing in the snapshot names an outcome.
3. **Queued order** — the ops log has `paper.queued`-class lines around that close (`/api/ops/log?component=watch`); the events table has the `QUEUED` bell entry.
4. **Fill candle** — `filledAt` is the open of the next candle; `entry` equals that candle's stored open × (1 + (spreadBps/2 + slippageBps)/10 000) for a long (÷ for a short). Read the candle: `/api/ops/feed` for freshness, the Chart tab or the store for the open.
5. **Sizing** — `quantity × |entry − stop|` ≤ `riskUsd`, and the size passed the venue filters.
6. **Record** — `/api/ops/reconciliation?run=1` shows the trade `CONSISTENT` (or `INCOMPLETE` only for fields the check cannot have yet, e.g. MAE/MFE before the close).
7. **Ledger** — after the close, exactly one `live-paper` row with the fill price and the outcome.
8. **Journal** — one entry with "Intended entry … filled at …".
9. **Observer** — a `PAPER ENTRY` observation with `recordId` = the position id.
10. **Post-mortem** — after the close, one knowledge item for the position; `/api/ops/retries` empty (or the item is listed with its error and retried by the next research tick).
11. **UI label** — the Desk chip and the paper account card say SIMULATED EXECUTION.

Do not alter anything because the first result is a win or a loss.

## 7. Checkpoints and human review gates

Recorded once, with a frozen summary, at the first fill and at 10 / 25 / 50 /
100 / 200 closed paper trades. Each lists what to review. Mark it reviewed on
the Operations tab; the summary never changes. Labels follow the analyst's
sample bars: INSUFFICIENT < 10, EARLY < 50, DEVELOPING < 200, LARGER DATASET
≥ 200. Cohort research is allowed for cohorts with 50 or more trades.

## 8. Kill and restart drills (do these once, on the soak machine)

For each: kill the process (`kill -9 <pid>` or Ctrl+C), restart, then check
`/api/ops/health` → soak.restarts incremented, no duplicate fill in the
record (`/api/ops/integrity?run=1` → paper.duplicateSignals 0),
`/api/ops/reconciliation?run=1` → mismatched 0.

- during a quiet market (no position)
- with a PENDING order (after a decision, before the next candle)
- with an OPEN position
- at a candle close (the second the bell rings)
- during a research tick (Operations → Research shows `running`)
- right after a close (the post-mortem may be queued for retry — that is the visible, retryable path, not a fault)

## 9. Daily reading (five minutes)

1. Operations → Overview: overall status, any alert.
2. Market data: feed verdict, missing candles in 24 h, reconnects, stale duration.
3. Database & integrity: today's report OK; if ISSUES, read the section, do not delete anything.
4. Reconciliation: mismatched must be 0; INCOMPLETE is reported, not faulted.
5. Soak: uptime vs wall clock, restarts.
6. Observer / Knowledge tabs: the daily digest for the day that ended.

## 10. The fifteen acceptance checks (run on a machine with network access)

| # | Check | Where | Pass when |
|---|---|---|---|
| 1 | Data source | `/api/ops/health` → dataSource | `PAPER`, `SIMULATED EXECUTION` (never MOCK for acceptance) |
| 2 | Security | → security | `ok: true`; `config.live.enabled` false; `LIVE_TRADING_ENABLED` unset |
| 3 | Single process | second `npm start` | refused with the owner named, exit 1 |
| 4 | Feed | → feed.verdict over 24 h of the ops log | OK most of the time; every DEGRADED/STALE period has a reason (reconnect, gap) and an alert |
| 5 | Candles | → feed.missing over 24 h | 0 missing, or every gap is a known exchange gap |
| 6 | Heartbeat | → heartbeat.overall | HEALTHY during market hours; every non-HEALTHY mark explained by feed or research state |
| 7 | Engine cycles | → soak.counters.cycles | ≈ one per candle interval over the day (288/day at 5m) |
| 8 | Persistence | → heartbeat.marks.persistence | HEALTHY; quick_check `ok` |
| 9 | Research | → heartbeat.marks.researchTick, soak.counters.researchRuns | ≈ 96 runs/day; last error empty or explained |
| 10 | Observer | → soak.counters.observations | growing on active days; `lifecycle` idempotency: a restart adds no duplicates |
| 11 | First fill | checkpoint `first-fill` + §6 chain | every link verified from the record |
| 12 | Reconciliation | `/api/ops/reconciliation?run=1` | mismatched 0 |
| 13 | Integrity | `/api/ops/integrity` (daily) | OK, or ISSUES with only known candle gaps |
| 14 | Kill drills | §8 | restarts counted; no duplicate; no lost position |
| 15 | Uptime | → soak.uptime | observed uptime ≥ 95 % of wall clock over the soak, restarts listed |

Record the fifteen results with dates in `docs/PAPER_VALIDATION_RESULTS.md`.
Until they are recorded, MARKET EVIDENCE IS NOT YET ESTABLISHED, whatever the
tests say.

## 11. Exact commands

```bash
# verify the software
npm run typecheck && npm run selftest && npm test && npm run ui:smoke   # ui:smoke needs the app running on BASE_URL

# run the soak (PAPER mode, live data, simulated execution)
npm start                     # web app + watch loop + research ops + ops monitor
npm run watch                 # terminal-only loop (same lock, same monitor); not both on one data dir

# read
curl -s localhost:4173/api/ops/health | jq '.data | {overall, verdict, dataSource, security, alerts}'
curl -s "localhost:4173/api/ops/reconciliation?run=1" | jq '.data | {total, consistent, mismatched, incomplete}'
curl -s "localhost:4173/api/ops/integrity?run=1" | jq '.data | {verdict, issues}'
curl -s localhost:4173/api/ops/soak | jq '.data | {uptime, restarts, counters}'
tail -f data/ops.log
```

Replace 4173 with `config.webPort` (or `MRCASH_PORT`) if changed.
