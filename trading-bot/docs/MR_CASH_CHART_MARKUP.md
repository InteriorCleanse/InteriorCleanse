# MR. CASH CHART MARKUP (Phase 22C/22D/22I)

What automatically appears on the chart, where each mark comes from, and how to
read the workspace. Companion to `docs/CHART_ANNOTATION_SCHEMA.md` (the data
model) and `docs/MR_CASH_INTELLIGENCE_SPEC.md` (the architecture).

**The rule behind all of it:** a concept is drawn **only if the engine actually
detected it**. There is no hindsight, no cosmetic marking, and no mark that the
engine itself could not justify.

---

## 1. Using the workspace

Open the **Intel** tab (🧭).

### Layer groups (12)

| Group | Contains | On by default |
|---|---|---|
| **Structure** | swings, HH/HL/LH/LL, BOS, CHoCH, dealing range | ✅ |
| **Liquidity** | session/day levels, EQH/EQL, pools, sweeps, raids, failed breakouts | ✅ |
| **FVG** | fair value gaps, midpoints, mitigation, inversion | ✅ |
| **Order blocks** | order blocks, breakers, their mitigation/invalidation | — |
| **ICT** | silver bullet, unicorn, turtle soup, other strategy setups | — |
| **Trades** | entry, take profit, entry/target zones | ✅ |
| **Risk** | stop loss, stop zone, invalidation level, risk/reward | ✅ |
| **VWAP** | day VWAP with bands | — |
| **Sessions** | session boundary boxes | — |
| **News** | high-impact blackout windows | — |
| **Order flow** | cumulative-delta state (or its UNAVAILABLE notice) | — |
| **Regime** | trend / range / volatility readings | — |

**The default is deliberately not everything.** A chart with every mark lit at
once is unreadable, and an unreadable chart is one you stop checking. The default
shows the decision-relevant core — structure, liquidity, imbalance, and the live
trade with its risk. The other seven groups are one click away, and each chip
shows how many annotations it holds so nothing is hidden *silently*.

| Control | What it does |
|---|---|
| Layer chips (12) | Show/hide a group. **Hides marks; never drops data.** |
| Higher timeframes | Toggle the HTF context band |
| **Show all** | Enable all twelve groups |
| **Hide all** | Disable all twelve (a clean candle chart) |
| **Reset** | Back to the uncluttered default, plus default zoom |
| Drag | Pan |
| Wheel | Zoom |
| Click a mark | Opens the provenance inspector |
| Click a timeline row | Selects that mark on the chart |

The journey the UI is built for:

> **What is happening?** (chart) → **What does the engine see?** (layers) →
> **Why?** (provenance inspector) → **What did it do?** (trade intelligence) →
> **What changed?** (delta + timeline)

---

## 2. What gets marked

### Structure — `structure` layer
Swing highs and lows, labelled **HH / HL / LH / LL** (or plain H/L for the first
of each kind); **BOS** (break with the trend) vs **CHoCH** (the first break
against it); the **dealing range** with its premium/discount/equilibrium zone.

Source: `SwingTracker`, `StructureTracker`, `dealingRange`.
A swing is only drawn once the tracker has **confirmed** it — which is
`swingLookback` candles after it printed, because the tracker needs candles on
both sides. That delay is recorded in `knownAt`, not smoothed away.

### Liquidity — `liquidity` layer
Session highs/lows, previous day high/low, previous week high/low, **equal
highs/lows**, plus the **buy-side / sell-side pools** they imply (drawn only
while the level is intact), **liquidity sweeps** (session levels), **liquidity
raids** (swing levels), and **failed breakouts**.

Source: `liquidity.ts`, `IctAnalysis.levels / sweepsToday / swingSweepsToday`.
A level is `ACTIVE` while intact, `TRIGGERED` once swept, `INVALIDATED` once
price closes clean through it — the engine's own distinction between a *sweep*
and a *break*.

### Imbalance — `imbalance` layer
Bullish and bearish **fair value gaps**, their **midpoint** (drawn only while the
gap is still in play), **mitigation**, and **inversion**.

Source: `FvgTracker`, `ifvgRole`.
An *inverted* gap is `INVALIDATED` **as a gap** — it now works the other way
round, and the annotation says which role it has taken. The engine records
*that* a gap is mitigated but not *when*, so the mitigation mark is explicitly a
"as of this candle" statement rather than a claimed timestamp.

### Order blocks — `orderblock` layer
Bullish and bearish **order blocks**, **breaker blocks** (a broken block that has
flipped role), **mitigation** and **invalidation**.

Source: `OrderBlockTracker`, `breakerRole`.
A broken bullish block is drawn as a **breaker** with its direction flipped to
bearish, because that is what the engine says it now is.

### ICT setups — `ict` layer
**Silver bullet** window and setup, **unicorn** setup, **turtle soup** setup, and
any other registered strategy's setup.

Source: the strategy's own `StrategyVote`.
Drawn **only when a strategy actually voted BUY/SELL**. A `HOLD` produces no
setup mark — the layer does not draw wishes. The rationale carries the vote's
reason and its `met/total` condition count; the invalidation condition lists the
steps still failing.

### Trade map — `trade` layer
**Entry**, **stop loss**, **take profit**, the **stop zone** (risk band), the
**target zone** (reward band), the **risk/reward** reading and the
**invalidation level**.

Source: the engine's `TradePlan`.
Drawn only when the engine produced a plan. With no plan, there is no trade map —
nothing is imagined. Each mark links to its signal, and to the paper trade it
became, when there is one.

### Context — `context` layer
**VWAP** with its bands, **session boundaries** (each session's high/low and
window), **trend/range regime**, **volatility regime**, **order-flow state**, and
**news markers** (high-impact blackout windows).

Source: the feature engine and the news module.
These carry the data-quality label of the feature behind them. An unavailable
feature still produces an annotation — one that **says it is unavailable and
why** — rather than quietly vanishing.

---

## 2a. Derived visualization logic, declared (AUDIT 1)

Everything above is read from engine state. These few things are **derived by
this layer** rather than taken from the engine, so they are declared here rather
than left for someone to discover:

| Derived | What it is | Why it is not a second engine |
|---|---|---|
| **Weekly high/low** | max/min over candles aggregated into weeks, anchored **Monday 00:00 UTC** | The engine has no weekly concept at all, so there is nothing to contradict. The anchor is a display choice (the epoch was a Thursday, which would give Thursday→Wednesday "weeks"). |
| **HTF swings** (`1d`/`4h`/`1h`) | the engine's own `SwingTracker` run over aggregated bars | Reuses the engine's model on a different timeframe; no parallel implementation. |
| **`buyside-liquidity` / `sellside-liquidity`** | which side of the book a level implies | A labelling convention over `level.kind`, not a new detection. |
| **`failed-breakout`** | a level with `sweptAt` set and `brokenAt` unset | A restatement of the engine's own sweep-vs-break distinction. |
| **Confluence link classification** | which ingredient a fusion confirm/invalidate line refers to | Text grouping for display. The **score shown is the fusion engine's own**; nothing is re-scored. |
| **Rejection categories** | mapping a veto name or failing step to a category | Grouping of reasons the engine recorded; the reasons themselves are verbatim. |

### A real defect this audit caught

The MTF layer used to compute **previous-day** high/low from UTC-midnight
buckets, while the engine derives them on the **ICT trading day that rolls at
18:00 ET**. Both were emitted as `previous-day-high`, so the chart drew **two
different lines for the same concept — measured $279.56 apart on live data.**

That is exactly the second-engine failure this layer exists to avoid. Fixed by
deleting the duplicate: previous-day levels now come **only** from the engine's
`pdh`/`pdl`. Locked by a regression test that fails if the MTF layer ever emits a
previous-day level again.

---

## 3. Higher-timeframe context

HTF marks are visually and structurally separate from execution-timeframe
structure (`bands.htfContext` vs `bands.execution`).

- Timeframes are **discovered from stored candles**, never assumed. The
  availability report shows each timeframe and, when it is not usable, says
  `UNAVAILABLE` with the bar count — nothing is synthesised.
- **Previous week / previous day extremes** are plain max/min over real candles,
  knowable only once the period **closed**.
- **HTF swings** are produced by the engine's own `SwingTracker` run over
  aggregated bars — not a parallel implementation.
- An incomplete higher-timeframe bar is never emitted.

---

## 4. Provenance: "why is this on my chart?"

Clicking any mark answers, from recorded state only:

**WHAT** · **WHY** (the engine's own rationale) · **WHEN** (event time *and* the
time it became knowable) · **SOURCE** (module + feature key) · **TIMEFRAME** ·
**PRICE** · **STRATEGY CONNECTION** · **REGIME** · **DATA QUALITY** ·
**STATUS** · **INVALIDATION** · **RELATED SIGNAL** · **RELATED TRADE** · **ID**.

Where the engine recorded no explanation, the inspector says
*"No engine rationale was recorded for this object."* It does not write one.

---

## 5. Data quality on the chart

| Label | Meaning |
|---|---|
| `REAL` | From the live tape or read directly off real candles |
| `APPROXIMATE` | Built from candles where the tape would have been exact |
| `UNAVAILABLE` | Could not be computed; the mark exists to say so |

Order flow is `UNAVAILABLE` whenever the stream is not trusted. It is **never**
estimated from candles, and the rationale says so explicitly.

---

## 5a. knownAt semantics — every annotation type (AUDIT 2)

The table every look-ahead argument comes back to. **`eventTime`** = when the
market did it. **`knownAt`** = the earliest moment the engine could report it.
**Replay shows an annotation only once the cursor reaches its `knownAt`.**

"Needs future candles?" is the column that matters: where it says **yes**, the
object is confirmed by candles *after* the one it sits on, and drawing it at its
event time would be a look-ahead lie.

| Annotation type | Source engine state | eventTime | knownAt | Needs future candles? | Visible in replay from |
|---|---|---|---|---|---|
| `swing-high` / `swing-low` | `SwingTracker` | the swing candle | close of candle `index + swingLookback` | **yes** — needs `swingLookback` bars on the far side | the confirming candle |
| `higher-high` / `higher-low` / `lower-high` / `lower-low` | `SwingTracker` (labelled) | the swing candle | close of candle `index + swingLookback` | **yes** | the confirming candle |
| `bos` | `StructureTracker.shifts` | the breaking candle | same candle | no | the breaking candle |
| `choch` | `StructureTracker.shifts` | the breaking candle | same candle | no | the breaking candle |
| `dealing-range` | `analysis.dealingRange` | current candle | current candle | no (re-derived each candle) | immediately |
| `fvg-bullish` / `fvg-bearish` | `FvgTracker` | `createdTime` | same | no | the creating candle |
| `fvg-midpoint` | `FvgTracker` (live gaps only) | `createdTime` | same | no | the creating candle |
| `fvg-mitigation` | `FvgTracker.state = mitigated` | **current candle** | same | no | the candle it is observed |
| `fvg-invalidation` | `FvgTracker.invertedTime` | `invertedTime` | same | no | the inverting candle |
| `order-block-*` | `OrderBlockTracker` | block candle `time` | same | no¹ | the block candle |
| `breaker-block` | `OrderBlockTracker.state = broken` | block candle `time` | same | no | the block candle (role flips on break) |
| `block-mitigation` | `OrderBlockTracker.mitigatedIndex` | candle at `mitigatedIndex` | same | no | the mitigating candle |
| `block-invalidation` | `OrderBlockTracker.brokenTime` | `brokenTime` | same | no | the breaking candle |
| `session-high` / `session-low` / `equal-highs` / `equal-lows` / `previous-day-high` / `previous-day-low` | `analysis.levels` (engine) | `level.time` | same | no | once the forming session/day closed |
| `buyside-liquidity` / `sellside-liquidity` | `analysis.levels`, intact only | `level.time` | same | no | with the level |
| `liquidity-sweep` | `analysis.sweepsToday` | sweep candle | same | no | the sweeping candle |
| `liquidity-raid` | `analysis.swingSweepsToday` | raid candle | same | no | the raiding candle |
| `failed-breakout` | `level.sweptAt && !brokenAt` | `sweptAt` | same | no | the sweeping candle |
| `previous-week-high` / `previous-week-low` | aggregated candles (MTF) | period **start** | period **end** | **yes** — the week must close | the week's close |
| HTF swings (`1d`/`4h`/`1h`) | `SwingTracker` on aggregated bars | the HTF swing bar | close of the confirming HTF bar | **yes** | the confirming HTF bar |
| `silver-bullet-*` / `unicorn-setup` / `turtle-soup-setup` / `strategy-setup` | `StrategyVote` (action ≠ HOLD) | current candle | same | no | the voting candle |
| `entry` / `stop-loss` / `take-profit` / zones / `risk-reward` / `invalidation-level` | `analysis.signal.plan` | current candle | same | no | the signalling candle |
| `vwap` / `volatility-regime` / `trend-regime` / `range-regime` / `order-flow-state` | `analysis.features.*` | current candle | same | no | immediately |
| `session-boundary` | `SessionTracker` | session `startTime` | same | no | the session open |
| `news-marker` | news blackouts | blackout `start` | same | no | the blackout start |

¹ The order block itself is identified retrospectively (it is the last opposite
candle *before* a displacement), but the engine only ever **reports** it once the
displacement has happened, and the annotation is only produced from the analysis
at that later candle. So in replay it appears at the displacement, not at the
block candle — the box is simply drawn back over its own candle, which is the
normal way order blocks are displayed.

**Two deliberately honest cases:**

- **`fvg-mitigation`** — the engine records *that* a gap is mitigated but not
  *when*. So the annotation is timestamped to the current candle and its
  rationale says the exact moment is not recorded. It does **not** invent one.
- **Block mitigation** — the engine *does* record `mitigatedIndex`, so the exact
  candle is used. The difference between these two cases is the difference
  between reporting and guessing.

Enforced by `test/intel/audit.test.ts` (per-type rules), `test/intel/replay.test.ts`
(frame-level leakage, including a deliberately poisoned frame) and
`test/intel/mtf.test.ts` (HTF periods and swings).

---

## 6. Replay

Replay renders only what was knowable at the cursor (`knownAt <= cursor`). You
cannot see a break of structure before the candle that broke it, a gap before it
formed, or a setup before its conditions were met.

This is guaranteed twice over — by construction (frames come from an incremental
engine that has only consumed candles up to that point) and by contract (the
`knownAt` filter, plus `auditFrames()` which re-checks the whole sequence).
`test/intel/replay.test.ts` deliberately poisons a frame to prove the audit
actually catches leakage rather than merely asserting its absence.

---

## 7. What this layer will never do

- Produce a signal, or a "suggested" trade of its own
- Size a position, or alter risk
- Modify, delay or veto an engine decision
- Draw something the engine did not detect
- Fill a missing value with a plausible-looking number

It makes the system easier to understand, audit and operate. It changes nothing
about what the system decides.
