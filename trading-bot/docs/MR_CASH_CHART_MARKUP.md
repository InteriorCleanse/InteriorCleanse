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

| Control | What it does |
|---|---|
| Layer chips | Show/hide a layer. **Hides marks; never drops data.** |
| Higher timeframes | Toggle the HTF context band |
| Clear all annotations | Hides every layer at once |
| Reset default view | Restores all layers and the default zoom |
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
