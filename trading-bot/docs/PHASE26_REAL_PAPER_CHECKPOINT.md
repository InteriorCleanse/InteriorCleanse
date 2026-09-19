# Phase 26 — Real Paper Operations Checkpoint

Result in one line: **NOT ENOUGH REAL PAPER DATA.** The environment this
phase ran in has no route to any exchange or news host, so no real candle was
received, no real signal, fill or trade exists, and every market-evidence
criterion below is open. What could be done here was done honestly: the
software checks, the real-configuration start without any mock data, the
operational findings that run produced, and the fixes for the two real
defects it exposed.

Nothing in this phase touched a strategy, an entry, an exit, risk, sizing,
fusion, a regime rule, a parameter, the live gate or `config.ts`.

## Step 1 — Environment check (this machine, 2026-09-19)

| Check | Result |
|---|---|
| `npm install` | up to date (zero runtime dependencies) |
| `npm run doctor` | ran; 7 required connections failed (see Step 2); **threw `RangeError: Maximum call stack size exceeded` from the stream probe — fixed, see Findings** |
| `npm run typecheck` | clean |
| `npm run selftest` | 80 / 80 |
| `npm test` | 881 / 881 (878 before this phase, +3 added here) |
| Environment variables | `MRCASH_*`, `LIVE_TRADING_ENABLED`, `EXCHANGE_API_KEY/SECRET`, `ANTHROPIC_API_KEY`, `TZ` all unset; no `.env`; `HTTPS_PROXY` set by the container |
| Clock / timezone | system and Node both UTC; `Etc/UTC`; exchange clock unreachable, so the time difference could not be measured |
| Data directory | `data/` writable; `mrcash.db` writable; no lock file |
| Process lock | acquired on start, second process refused (Step 3) |
| Paper mode | **PAPER MODE CONFIRMED** — `mode: paper`, `dataSource.label: PAPER`, `execution: SIMULATED EXECUTION` |
| Live mode | **REAL TRADING DISABLED** — `config.live.enabled` false, `config.shadow.enabled` false, `LIVE_TRADING_ENABLED` unset, `security.ok: true` |

## Step 2 — Real feed test

| Item | Value |
|---|---|
| Venue | Binance spot (REST `api.binance.com`, `api.binance.us`, `data-api.binance.vision`; streams `data-stream.binance.vision`, `stream.binance.com:9443`, `stream.binance.us:9443`) |
| Symbol / timeframe | BTCUSDT / 5m |
| REST status | **unreachable** — every host: TCP connect rejected by the egress proxy (organisation policy), HTTP 000 |
| Stream status | **unreachable** — all three hosts `could not connect`, 6 reconnect attempts in 75 s with the configured back-off |
| Candle freshness / latest candle | none received in this environment |
| Local clock | 2026-09-19 03:06:30 UTC |
| Exchange clock / difference | not measurable (no route) |
| News feeds | calendar, CoinDesk, CoinTelegraph, Google News: HTTP 403 / connect rejected |

No mock data was substituted. This step **FAILED** here and must be repeated
on a machine with network access before any later step can produce evidence.

## Step 3 — Start in the real configuration

`node src/server.ts` with no `MRCASH_MARKET_URL`, no stream override, on a
fresh data directory, observed for 75 s and then stopped:

- **ONE PROCESS** (pid 5898), lock held, `lock.ours: true`.
- **ONE WATCH LOOP**: one cycle ran at start and failed honestly with `Could not download prices this cycle — will try again next candle`.
- **ONE RESEARCH SCHEDULER**: first tick after 20 s, `10/10 steps ran; no experiment; 0 digests; Nothing in production changed`.
- **ONE OPERATIONS MONITOR**: two ticks (4 and 7 ms), persistence probe HEALTHY, daily integrity written (ISSUES: no candle stored — true).
- A second `node src/server.ts` on the same data directory exited 1 with `… is already owned by Mr. Cash pid 5898 … One process per data directory …`.

Initial `/api/ops/health` (abridged, verbatim values):

```
overall: STALE           verdict: "STALE — Every essential mark is inside its healthy window. Feed: STALE."
dataSource: PAPER / SIMULATED EXECUTION       security.ok: true
feed.verdict: STALE   mode: rest   websocket.connected: false   reconnects: 6   freshness: "No candle stored."
marks: marketData/candle/engineCycle/observer/paper*: HEALTHY (never recorded; process started Ns ago)
       researchTick HEALTHY 56s   persistence HEALTHY 16s   healthCheck HEALTHY 16s
alerts: stale-data WARN · repeated-reconnects WARN · engine-error WARN
errors: 1 (watch: cycle-failed)      soak: runs 1, cycles 0, reconnects 5, staleFeedSec 61
process: rss 119 MB, heap 18 MB, db 4 KB
```

The bell received each alert once; `ops.log` held 14 lines (component,
event, severity, correlation id), with the three distinct stream-down
messages and no flood.

## Steps 4–18

| Step | Status |
|---|---|
| 4 Operations dashboard | Rendered and smoke-tested on the mock feed (22 tabs). `dataSource = PAPER`, `execution = SIMULATED EXECUTION` confirmed on the real-configuration run via the API. No UI element implies live execution (desk chip, paper card and Operations banner all say simulated). |
| 5 Observe real market data | **Not possible here.** 0 candles, 0 cycles completed, 0 observer events, 1 research tick, 6 reconnect attempts, 1 error, 61 s stale. |
| 6 First real paper signal | **Not yet occurring** — no market data. |
| 7 First real paper fill | **Not yet occurring.** |
| 8 First closed paper trade | **Not yet occurring.** |
| 9 No-hindsight audit | Software-verified only (reconciliation asserts the snapshot carries no outcome; integrity flags look-ahead; lifecycle/adversarial tests). No real trade to audit. |
| 10 Real feed health | Recorded above; nothing repaired. |
| 11 24/7 stability | OBSERVED RUNTIME in the real configuration: 75 s. REQUIRED SOAK REMAINING: all of it — the runbook's fifteen checks over days. |
| 12–13 Checkpoints | Machinery in place (first fill, 10/25/50/100/200, frozen summaries, review gates, reconciliation, integrity, drift, challenger through the research tick). None reached. |
| 14 Daily learning | Digest, case study, replay and lesson pipeline verified in tests; no qualifying real event. |
| 15 Research trigger | Observation → question → hypothesis → dataset → experiment verified in tests; nothing to trigger. |
| 16 Failure tests | Restart / SIGKILL / second process / feed interruption: verified in `test/ops/*` and on the real-configuration run (stream unreachable: reconnects with back-off, REST fallback, alerts, no crash). |
| 17 Paper day report | **Added** (`/api/ops/day`, `/api/ops/days`; written once per trading day by the monitor). The only day report this environment can write says NOT ENOUGH REAL PAPER DATA. |
| 18 Do not optimise | Nothing changed. |

## Findings and fixes (Step 19)

| # | Class | Finding | Fix | Test |
|---|---|---|---|---|
| 1 | **BUG / NETWORK** | `npm run doctor` threw `RangeError: Maximum call stack size exceeded` repeatedly. Node's built-in WebSocket re-fires `error` when `close()` is called on a socket still CONNECTING; the probe's error handler closed and did not guard, so it recursed. The live stream client already guarded (`this.ws !== ws`) and was not affected. | `probeStream` settles once and never closes a socket that has not connected. | `binanceStream.test.ts`: blocked-socket probe, 7/7 |
| 2 | **OBSERVABILITY** | The `watcher-stopped` CRITICAL alert would have fired after 30 min of a blocked network with the body "Candles are arriving but no cycle ran", blaming the watch loop when the feed was STALE. | Raised only when the feed verdict is OK or DATA DEGRADED; with STALE/OFF the stale-data alert already says why. | `resilience.test.ts` |
| 3 | **OBSERVABILITY** | A SIGTERM left the lock file behind (Node does not run `exit` handlers on signals). Harmless — a dead owner is taken over — but untidy. | `holdLock` releases on SIGTERM/SIGINT where nothing else handles the signal, then exits 0. | `secondProcess.test.ts` |
| 4 | **DATA QUALITY** | The repository's default `data/` directory holds 9 pending "crossover" positions and missed "session-ifvg" rows dated 1970-01-01 with entry 100 and no snapshot — synthetic test artefacts from before per-test data isolation — beside 9,215 real REST candles (2026-08-14 → 2026-09-15). | **Not deleted.** Recommendation: run the real soak on a fresh `MRCASH_DATA_DIR`, or move `data/` aside first, so the first real decision is the first row. | — |
| 5 | **OBSERVABILITY** | No permanent per-day record existed (Step 17 asked for one). | `src/ops/dayReport.ts` composed from durable records only. | `records.test.ts` |

## Step 20 — Exit criteria

- [ ] real exchange feed confirmed — **NO** (no route from this environment)
- [x] paper mode confirmed
- [x] live mode confirmed OFF
- [x] one-process lock confirmed (real second process refused)
- [ ] real candles received — **NO**
- [ ] observer processing real data — **NO** (0 candles)
- [x] research scheduler running (1 tick, 10/10 steps, at zero data)
- [~] Operations dashboard healthy — rendered; reports STALE because the feed is unreachable, which is the correct reading
- [x] first real paper signal — **explicitly documented as not yet occurring**
- [x] first real paper fill — **explicitly documented as not yet occurring**
- [x] first real closed paper trade — **explicitly documented as not yet occurring**
- [~] reconciliation verified — software only (881 tests); 0 real trades to reconcile
- [~] no-lookahead verified — software only
- [x] data integrity verified — ran on the real-configuration start (ISSUES: no candle stored, which is true)
- [x] restart recovery verified — tests plus SIGKILL/SIGTERM/second-process on a real server process
- [x] security verified
- [x] no strategy modifications made

## To complete this checkpoint on a networked machine

```bash
cd trading-bot
npm install && npm run doctor        # every Prices / Live stream / News line must be ✓ before continuing
npm run typecheck && npm run selftest && npm test
MRCASH_DATA_DIR=./data-soak npm start   # a fresh directory: the first real decision is the first row
curl -s localhost:4173/api/ops/health | jq '.data | {overall, dataSource, security, feed: .feed.verdict, alerts}'
curl -s localhost:4173/api/ops/day | jq -r '.data.text'
```

Then follow `docs/PAPER_SOAK_RUNBOOK.md`: section 6 at the first fill,
section 8 for the drills, section 10 for the fifteen checks, and record the
results with dates in `docs/PAPER_VALIDATION_RESULTS.md`.
