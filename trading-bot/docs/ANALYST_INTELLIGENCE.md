# ANALYST INTELLIGENCE + ATTRIBUTION — the evidence pipeline

**Purpose.** Make Mr. Cash exceptionally good at answering six questions about
its own results — *where* did they come from, *under what conditions*, *which*
strategies and setups, *what changed* between winning and losing conditions,
*how much data* supports the conclusion, and *what would falsify* it — and make
it impossible for the dashboard to hide uncertainty while doing so.

**Not the purpose.** Predicting markets, manufacturing an edge, or making
Mr. Cash "smarter than Buffett". Nothing in this layer creates a trade.

---

## 1. Architecture

```
                 ┌─────────────────────────────────────────────────────┐
 ENGINE (only    │ watch.ts → riskEngine → paperTrader → store          │  writes
 source of       │            DecisionSnapshot captured at order time   │  records
 decisions)      └──────────────────────┬──────────────────────────────┘
                                        │ read-only
                 ┌──────────────────────▼──────────────────────────────┐
 ANALYST LAYER   │ analyst/records.ts    EvidenceRecord + Provenance    │
 (observer;      │ analyst/cohorts.ts    cohorts, dimensions, heatmaps  │
 pure functions; │ analyst/thesis.ts     falsifiable theses             │
 no writes to    │ analyst/compare.ts    PAPER vs BACKTEST               │
 the engine)     │ analyst/quality.ts    DATA QUALITY: OK | DEGRADED     │
                 │ analyst/narrate.ts    validated narrator              │
                 │ analyst/evidence.ts   assembler for /api/evidence     │
                 │ paper/oosReference.ts stored OOS backtest reference   │
                 └──────────────────────┬──────────────────────────────┘
                                        │
                 ┌──────────────────────▼──────────────────────────────┐
 SURFACE         │ /api/evidence/*  ·  web/js/evidence.js (EVIDENCE tab)│
                 └─────────────────────────────────────────────────────┘
```

**The non-negotiable rule.** The engine (`watch.ts`, `riskEngine.ts`,
`paperTrader.ts`, `fusion.ts`, the strategies, `execution.ts`, the live path)
remains the only authority for signals, entries, exits, risk and position
decisions. The analyst layer reads engine output and historical records. It
cannot place, size, shape or veto an order; source-level tests fail if any
analyst module references the order path, and the existing import guards keep
the engine from importing the analyst layer.

**Modules reused, not duplicated.** `intel/tradeIntel.ts` (`whyTrade`,
`whyNot`, `tradeStages`), `intel/explain.ts` (the citation-validation
pattern), `backtest/metrics.ts` (drawdown, profit factor, streaks),
`backtest/report.ts` (the OOS split), `factory/stats.ts` and
`analyst/attribution.ts` (t-intervals, Welch, multiple-testing),
`data/candleStore.ts` (`findGaps`), `paper/validation.ts` (gates,
`comparePaperToOos`), `features/regime.ts` (the only regime vocabulary).

---

## 2. Data provenance

Every trade the layer looks at is first normalised into an `EvidenceRecord`
that carries its source. A dataset is a list of records plus a `Provenance`:

```
SOURCE: PAPER · DATA TYPE: LIVE MARKET / SIMULATED EXECUTION · PERIOD: 2026-01-13 → 2026-02-20 · TRADES: 37
SOURCE: BACKTEST · DATA TYPE: SIMULATED · PERIOD: 2025-12-01 → 2026-01-10 · TRADES: 842
```

- **PAPER** — closed paper positions. Real market data, simulated execution.
- **BACKTEST** — replay trades over stored candles. Populated immediately,
  worth strictly less.
- **MIXED** — exists only as the explicit output of `combine()`, is labelled
  MIXED on its face, and remembers what went in. `datasetOf()` on records of
  mixed source **throws**. No view in the app merges the two; the comparison
  view prints both labels on its header.
- **LIVE / REAL** — does not exist in this layer. It would only ever apply if
  the existing live gate were explicitly activated, which it is not.

**Fields come from the engine's own records; nothing is inferred.** A field
the engine did not write is `null` *and* named in `record.missing`, so a table
prints "not recorded" in that cell instead of a default. The per-source
availability table (`fieldAvailability`) is shown on the Overview.

| Field | PAPER | BACKTEST |
|---|---|---|
| strategy, family, symbol, interval | from the setup key | from the setup key |
| session | recorded | recorded |
| regime | recorded **at decision time** (Phase 22) | recorded **at the signal candle** (added this phase; never recomputed) |
| volatility, fused score/confirms, evidence steps, risk checks, news proximity, engine/feature version, signal id | **decision-time snapshot** (added this phase) | not recorded — a replay has none of these |
| spread at decision | recorded when a book quote existed | not recorded |
| MAE / MFE | walked from stored candles between fill and exit | same |
| MTF alignment | **not recorded** — no alignment scalar exists in the engine, and one is not invented | not recorded |

**The decision-time snapshot.** `DecisionSnapshot` is captured by the watch
loop from state already in scope at the moment the order is decided and stored
on the position verbatim. It contains no outcome field by construction:
`sanitizeSnapshot` copies only the declared keys, so an exit price or an R
smuggled in under any name is dropped. A test pins that a position opened with
a snapshot is identical in every engine field to one opened without.

**Immutability.** A closed paper record can only be rewritten in the
designated reconciliation fields (`mae`, `mfe`, `reconciledAt`,
`reconciliationNote`). Any other change throws and names the fields.

---

## 3. Statistical methodology

- **Mean R, median R, dispersion (sample sd), win rate, drawdown (cumulative-R
  peak-to-trough), longest losing run** — from `backtest/metrics.ts` and
  `attribution.ts`, so a cohort and a validation report cannot disagree about
  the same trades.
- **Interval** — a 95% **Student's t** interval for the true mean, with the
  tabulated critical value (not 1.96, which quietly narrows small-sample
  intervals in the flattering direction). Null under two trades.
- **Comparison of two groups** — Welch's t with Satterthwaite degrees of
  freedom; the verdict is whether the interval on the difference includes zero.
- **Multiple comparisons** — the attribution report applies Šidák across the
  pairwise tests it runs and prints the corrected alpha.
- **Trades needed** — `n ≈ (z·sd/|mean|)²`, an order-of-magnitude estimate
  that assumes the edge stays what it currently looks like, which is the
  assumption under test. Printed as "roughly".
- **Profit factor** — withheld under the early-sample bar: a ratio of two small
  sums is noise.
- **Bootstrap intervals** — **not implemented**; none existed and none was
  manufactured. Monte Carlo (`backtest/monteCarlo.ts`) remains available on
  backtest reports.

Every number is displayed with its `n`. Prefer *"Mean R +0.30, N 18, variation
±0.40"* to a bare *"+0.30"*.

---

## 4. Sample-size rules

The bars are one exported constant (`SAMPLE_BARS`) so the code, the UI and this
document cannot drift:

| Trades | Status | Meaning |
|---|---|---|
| 0 | **NOT ENOUGH DATA** | Nothing is estimated. Never 0% win rate, 0 expectancy, "no edge" or "failed". |
| 0–9 | **INSUFFICIENT SAMPLE** | Nothing is claimed; figures shown in grey so you can watch them fill in. |
| 10–49 | **EARLY SAMPLE** | A direction, not a finding. |
| 50–199 | **DEVELOPING DATASET** | The interval starts to narrow. |
| 200+ | **LARGER DATASET** | A larger dataset — still a description of the past. |

These are **dataset descriptions**, not strategy-quality ratings. A test walks
every band and fails if any rendering uses *profitable*, *high edge*, *proven*,
*guaranteed* or *edge confirmed* at any sample size.

---

## 5. Cohort rules

A cohort is a named subset defined by filters on recorded dimensions:
`strategyId`, `family`, `session`, `regime`, `volatility`, `symbol`,
`interval`, `direction`, `hourET`, `weekdayET`, `exitReason`, `newsBucket`,
`qualityBucket`. Up to three filters can be combined in the UI; the API takes
up to eight.

- Every cohort carries its **provenance**, its **stats with n**, the **ids of
  the trades inside it** (so any number is traceable to rows), and a
  **composition** across the other dimensions.
- Dimension tables are ordered by **sample size, never by result**, so a lucky
  small cell cannot float to the top and look like a finding. Sessions are not
  ranked "best".
- Trades whose value along a dimension was not recorded are counted and **left
  out** of every row rather than filed under a guess.
- Heatmap cells under the bar show **n and no value** — nothing for a renderer
  to colour.
- Session overlaps are **not** reported: the session framework defines no
  overlap period, and one was not invented.

---

## 6. Falsification methodology

For each cohort the thesis panel states **CURRENT OBSERVATION**, **WHAT WOULD
CHANGE THIS CONCLUSION**, and **WHAT WOULD FALSIFY IT**, plus **NOT CLAIMED**.

- **NOT ESTABLISHED** is the default: under the bar, with no interval, or with
  an interval that includes zero, there is no thesis to falsify.
- **OBSERVED POSITIVE / NEGATIVE** — the interval excludes zero in this sample.
  *Observed* is the strongest word used; nothing is spelt "proven".
- **The threshold is derived, not chosen.** Under the thesis "the true mean is
  what we observed", the next *N* trades average below
  `X = μ − t₉₅(N−1)·s/√N` about 2.5% of the time; observing that falsifies the
  thesis at the 95% level. *N* is the configured research threshold
  (`config.replay.minSetupsForConfidence`, the same one the backtester and the
  paper gates use). The method is printed beside every threshold with its
  inputs.

---

## 7. Backtest limitations

- A backtest is **SIMULATED**: next-open fills with modelled spread, slippage
  and fees; it never queued behind a real book or missed a fill to a fast
  market. It is labelled SIMULATED wherever it appears and never presented as
  paper or live performance.
- The in-sample / validation / out-of-sample split is kept separate
  (`backtest/report.ts`); only the OOS number is used as a reference.
- Regime for backtest trades is the value the feature engine computed **at the
  signal candle**, written down at that step. The crossover replay has no
  feature engine and leaves it null.
- Order-flow strategies are **not backtestable** on candles and are reported as
  such, never approximated.
- The backtest cache and the out-of-sample reference are computed only on an
  explicit `POST` (`/api/evidence/backtest`, `/api/validation/oos-reference`)
  and read from the store everywhere else; a source-level test pins that the
  one call site sits inside a POST handler.

---

## 8. Paper-trading limitations

- **Live market data, simulated execution.** Fills are the next candle's open
  plus modelled costs against a real book quote when one existed; slippage is
  an assumption recorded on the position.
- **Zero trades at launch.** Every paper view says NOT ENOUGH DATA until trades
  close. The backtest side can populate immediately and is labelled.
- Positions opened **before** the decision-time snapshot existed carry no
  snapshot; their WHY is not reconstructed, because reconstructing it from a
  later feature engine would be hindsight. The trade detail says so.
- The paper drawdown figures are **closed-trade** drawdown (labelled as such);
  intra-trade excursion is available separately as MAE/MFE.

---

## 9. Known biases and the safeguards that exist

| Bias | Safeguard | Status |
|---|---|---|
| Tiny-sample conclusions | sample bars, t-intervals, withheld profit factor, grey cells | implemented |
| Lookahead | decision-time snapshot; regime at the signal candle; MAE/MFE only from candles after the fill; `intel/replay.ts` frame audit; adversarial snapshot-smuggling test | implemented |
| Mixing in-sample and OOS | separate split in `backtest/report.ts`; only OOS used as a reference | implemented |
| Mixing PAPER and BACKTEST | `datasetOf` throws on a mix; MIXED label on explicit combination | implemented |
| Multiple testing | Šidák in the attribution report | implemented (attribution only; not applied across every cohort a user builds) |
| Selection bias | stated in every thesis's NOT CLAIMED list | **documented, not solved** — a cohort chosen because it looked good is still subject to it |
| Survivorship bias | strategies are listed whether or not they traded (`includeEmpty`) | partial — retired factory strategies are outside this layer's scope |
| Overfitting | this layer tunes nothing; paper is validation data | by construction |
| Data leakage | candle-quality checks; corrupt records excluded | implemented |

Where a safeguard cannot be implemented yet, it is listed here rather than
implied by a metric existing.

---

## 10. AI boundaries

The narrator (`analyst/narrate.ts`) may summarise evidence. It may never
generate a signal, override risk, alter an engine decision, invent a figure,
infer causation, describe a small sample as an edge, or claim certainty. This
is enforced by a **validator every sentence passes through, AI-written or
not**:

1. Every figure must be one the cited cohort, thesis or dataset holds
   (`[[cohort:london]]`, `[[thesis:london]]`, `[[dataset:PAPER]]`). A citation
   covers everything since the previous citation. `+0.95R` against a cohort
   whose mean is `+1.00R` rejects the text.
2. A citation to something not in the evidence rejects the text.
3. Quality words, direction words and causal words each reject.
4. Zero trades is "NOT ENOUGH DATA" and the AI is not consulted.

An AI whose text fails is overruled by the deterministic narration with the
problems listed. A test feeds it a liar and checks the reader never sees it.

---

## 11. Examples

**Zero paper trades (launch):**
```
PAPER TRADING — NOT ENOUGH DATA — Trades: 0 · Status: ACCUMULATING DATA
BACKTEST · SIMULATION — 842 simulated trades — DEVELOPING DATASET
Paper vs backtest — verdict: INSUFFICIENT SAMPLE
  No paper trades yet. The backtest column is a simulation to compare against once paper has 10 or more trades.
```

**A cohort at 18 trades:**
```
london  [PAPER]
  Trades: 18   Status: EARLY SAMPLE
  Mean R: +0.30   Median R: +0.10   Variation: ±0.40   N: 18
  95% interval for the true mean: −0.10R to +0.70R
  Win rate: 53.7% (…)   Max drawdown: 2.10R   Longest losing run: 3
  Profit factor: not reported under 50 trades
  Under 50 trades. A direction, not a finding — the interval is still wide enough to include the opposite conclusion.
```

**A thesis:**
```
london  [PAPER]  THESIS STATUS: OBSERVED POSITIVE
  CURRENT OBSERVATION: Observed mean R of +1.17 (95% interval +0.81 to +1.53) over 40 PAPER trades. Status: EARLY SAMPLE.
  WHAT WOULD FALSIFY IT? If the next 20 qualifying PAPER trades in this cohort produce a mean R below +0.61, the thesis is falsified at the 95% level.
    method: X = μ − t₉₅(19) · s / √20 with μ = +1.17, s = 1.19, t = 2.09.
```

---

## 12. What "not enough data" means

It means exactly what it says: **no estimate is made**. Not a zero, not a
placeholder, not "no edge", not "failed". The system becomes more informative
as evidence accumulates — 0 trades: NOT ENOUGH DATA; 10: EARLY SAMPLE; 50:
DEVELOPING DATASET; 200: LARGER DATASET — and at no point is sample size alone
converted into a claim about future profitability.

---

## 13. Surface

- `GET /api/evidence` — overview (both sources, comparison, data quality,
  narration, field availability, the bars)
- `GET /api/evidence/dimension?source=&dim=&all=1`
- `GET /api/evidence/cross?source=&rows=&cols=`
- `GET /api/evidence/cohort?source=&filters=[{dimension,values}]`
- `GET /api/evidence/trades?source=` · `GET /api/evidence/trade?id=`
- `POST /api/evidence/backtest` — refresh the cached backtest (CSRF-gated,
  same-origin, like every POST)
- `POST /api/validation/oos-reference` · `GET /api/validation/oos-reference`
- Dashboard: **Evidence** tab under *Is it working?* — Overview, Sessions,
  Regimes, Strategies, Cohorts, Time, Paper, Backtest, Thesis, Data quality;
  a PAPER/BACKTEST toggle on every measured view.

Security is unchanged: the tab is an external ES module loaded under the
existing nonce-based CSP with no inline handlers; POSTs carry the CSRF token
and same-origin headers.
