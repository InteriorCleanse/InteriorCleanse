# PAPER VALIDATION PLAN — Mr. Cash (TITAN)

The next validation stage after the pre-production audit: **extended paper
trading**. The goal is *not* to maximise P&L. It is to prove the system behaves
the same way against real, live market data as it did in development — that
signals occur when expected, that paper executions match the honest fill
simulator, that behaviour is stable across regimes and sessions, that slippage
is reasonable, that strategies aren't secretly the same bet, that no edge is
decaying, that the AI explanation matches the engine's decision, and that the
24/7 process soaks and recovers without drama.

**Hard rules for this stage (non-negotiable):**

- **No real money.** `LIVE_TRADING_ENABLED` stays `false`; the live path stays
  dormant and unwired (see `LIVE_EXECUTION_AUDIT.md`). No exchange credentials
  for trading, no live gate bypass.
- **Paper is validation data, not a fitting target.** Do **not** change a
  strategy rule or tune a parameter because of a paper result — good or bad.
  Optimising against paper is overfitting; it is the one thing this stage exists
  to *avoid*. If the profile must change, that is a deliberate act that **resets
  the sample** (bump `paperValidation.profile`).
- **Never fabricate missing data.** A number we cannot measure is reported as
  `null` / `UNAVAILABLE` / `INSUFFICIENT SAMPLE`, never as a flattering
  placeholder. Order flow is labelled `REAL` / `ESTIMATED` / `UNAVAILABLE`.

---

## 1. The frozen validation profile

The profile is recorded in code at `config.paperValidation` and snapshotted by
`validationProfile()` (`src/paper/validation.ts`). It is **frozen**: changing any
input below is a deliberate act that invalidates the running sample. Bump
`config.paperValidation.profile` (`PAPER_VALIDATION-1` today) when you do.

| Dimension | Value (from `config.ts`) |
|---|---|
| Market universe | `symbol` = BTCUSDT |
| Timeframe | `interval` = 5m |
| Strategy engine | `strategy` = ict (the frozen ICT session model opens paper trades) |
| Fusion drives trading? | `fusion.driveTrading` = false (ICT session model trades; the fused call is shown, not acted on) |
| Risk limits | `risk.maxOpenPositions`, `risk.maxDrawdownPercent`, `risk.maxCandleAgeSec`, `risk.maxSpreadPct`; `riskPerTradePercent`; `ict.maxTradesPerDay`, `ict.dailyLossLimitR` |
| Execution / fees | `execution.spreadBps`, `slippageBps`, `targetTouchBps`, `latencyCandles`, `maxEntryDriftAtr`, `takerFeePercent`, `makerFeePercent` |
| Data provider | Binance public (`data-api.binance.vision`), or `MRCASH_MARKET_URL` when set |
| Freshness limits | `data.staleAfterMs`; `risk.maxCandleAgeSec` (a stale candle vetoes an entry) |
| Sessions | `ict.killzones` (london, newYork), `ict.timezone` (America/New_York), `ict.skipWeekends` |
| Versions | app `version.ts`; strategy/feature versions travel with the code (git SHA of this branch) |

The profile snapshot is served live at `GET /api/validation` (`data.profile`)
and printed at the top of the daily report, so what a run was measured under is
always on the record.

---

## 2. What is collected (real-time, never fabricated)

The 24/7 watch loop already records everything this stage needs; nothing new is
invented, and no data is synthesised when the feed is down:

- **Per-trade paper journal** — every *taken* trade, ~28 fields: queued/filled/
  closed times, day, session, **regime at decision time**, strategy, setup key,
  direction, intended vs filled price, stop, target, size, risk $, quality, the
  **observed book bid/ask and spread**, the **order-flow honesty label**, the
  assumed slippage, fill latency, candles held, exit reason, exit, R-multiple,
  P&L, costs, and the reason string. (`perTradeJournal`.)
- **No-trade journal** — every *real setup that was refused* before it could run,
  with the reason and a risk category (`risk-veto` / `stale-data` /
  `kill-switch` / `price-ran-away` / `cancelled`). (`noTradeJournal`.) This is
  what keeps the record honest: the edge is judged on every setup it faced, not
  only the ones that happened to fill.
- **Per-strategy performance** — taken/missed, win rate, expectancy (avg R),
  observed spread, latency, sample span — deliberately **not ranked by raw
  return**. (`paperByStrategy`, reused from Phase 18.)
- **Paper vs backtest/OOS** — realised paper expectancy against each strategy's
  out-of-sample passport number, walk-forward and Monte-Carlo already living in
  the passport. (`comparePaperToOos`.)
- **Regime & session breakdowns** — `byRegime`, `bySession`, `byOutcome`.
- **Strategy correlation / redundancy** — per-day R correlated across strategies;
  pairs ≥ 0.7 clustered as redundant. (`strategyCorrelations`.)
- **Decay** — per strategy, `HEALTHY` / `WATCH` / `DECAYING` / `RETIRED` /
  `INSUFFICIENT SAMPLE`, reusing the Phase-15 CUSUM + rolling-expectancy detector
  and the passport decay line. (`decayByStrategy`.)
- **AI ↔ engine consistency** — the CIO call is, by construction, the fused
  decision after risk; the narrator is validated against the same context. The
  report flags any divergence anyway. (`aiEngineConsistency`.)
- **System soak** — continuous uptime, feed and store health, recovery
  adoptions. (`soakMetrics` + `/api/health` + `recovery.ts`.)
- **Data quality** — the share of actionable signals seen on a fresh, trusted
  feed (stale/kill misses subtracted). Null until a signal is seen.
  (`dataQuality`.)

---

## 3. The validation gates (explicit, configurable)

The exit criterion is a **sample**, never a date and never a P&L target. Until
**every** gate is met, the verdict is **INSUFFICIENT SAMPLE**, and the report
says which gate is short and by how much. A gate whose value cannot be measured
yet counts as **not met** — nothing is assumed. Thresholds live in
`config.paperValidation.gates`.

| Gate | Threshold (default) | Why |
|---|---|---|
| Total taken trades | ≥ 40 | A system-wide floor for meaning. |
| Trades per strategy | ≥ 20 | The thinnest trading strategy must clear the confidence bar. |
| Calendar span | ≥ 4 weeks | A burst in one week is not a track record. |
| Regimes covered | ≥ 2 | The edge must be seen in more than one market. |
| Sessions covered | ≥ 2 | Not one lucky killzone. |
| Data quality | ≥ 95% | Results only count on a fresh, trusted feed. |
| Paper vs out-of-sample | shortfall ≤ 0.10 R | The edge must survive real spread/slippage/misses. |
| Max drawdown | ≤ 25% | Stability of the paper equity curve. |
| System soak | ≥ 168 h continuous | The 24/7 property, demonstrated, not assumed. |

`GET /api/validation` returns the gate table with live values and a
progress percentage; the **Validation** dashboard tab shows the same with a
progress bar.

---

## 4. Shadow trading — prepared, NOT activated

Shadow (Phase 19) is *prepared* here and reported as `SHADOW_READY` only when
(a) the paper gates are met and (b) a read-only exchange key is present. **This
stage never turns shadow on.** Activation stays a deliberate, separate human
action: set `config.shadow.enabled` and provide a read-only key. `shadowReadiness()`
only reports; it flips nothing. The next stage's own gate (≥ 20 scored shadow
orders) is documented now so the path is clear.

---

## 5. The one rule worth repeating

**Do not overfit to paper.** No parameter is tuned to a paper result. If a
strategy looks poor on a thin sample, the answer is *more sample*, not a tweak.
If it looks poor on a *sufficient* sample, that is a finding to record and act on
deliberately (demote / retire via the vault), not a licence to curve-fit. Paper
is the exam, not the study guide.

---

## 6. Deliverables

- `docs/PAPER_VALIDATION_PLAN.md` — this document.
- `docs/PAPER_VALIDATION_RUNBOOK.md` — how to run, collect, monitor, report.
- `docs/PAPER_VALIDATION_RESULTS.md` — the living results (INSUFFICIENT SAMPLE
  until the gates are met).
- Code: `src/paper/validation.ts` (pure engine), `GET /api/validation`
  (JSON + `?format=text` daily report), the **Validation** dashboard tab,
  per-trade regime capture in `paperTrader.ts` / `watch.ts`.
- Tests: `test/paper/validation.test.ts`.

## 7. Definition of done

The stage is *set up* (this deliverable) when: the profile is frozen and
documented; collection runs with no fabricated data; the journals, breakdowns,
correlation, decay, AI-consistency, soak and gates are computed from real data
and surfaced in the API, the dashboard and the daily report; the gates report
INSUFFICIENT SAMPLE until met; shadow is prepared but off; tests, typecheck,
selftest and the UI smoke all pass; and the no-overfit rule is enforced in code
and docs. The stage is *complete* (a later, runtime milestone) when the gates
actually read GATES MET on a real run and the results doc is filled in.
