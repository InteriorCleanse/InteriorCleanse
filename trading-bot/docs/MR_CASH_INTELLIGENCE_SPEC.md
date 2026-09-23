# MR. CASH INTELLIGENCE LAYER — ARCHITECTURE SPEC (Phase 22)

A **read-only intelligence and visualization layer** that sits *above* the
validated trading engine. Its job is to make what the engine already sees
legible: automatic chart markup, provenance for every mark, "why this trade"
and "why not", replay without look-ahead, and a TradingView-compatible export.

**The single most important rule:** this layer observes. It is **not** a second
trading engine. It never produces a signal, never sizes a position, never
vetoes, never fills, and never changes a decision. The existing engine remains
the sole source of truth.

---

## 1. Architecture

### 1.1 Position in the system

```
                    ┌──────────────────────────────────────┐
  market data  ───► │  EXISTING ENGINE (authoritative)     │
                    │  feed → IctEngine.step(i)            │
                    │    ├ SessionTracker  ├ SwingTracker  │
                    │    ├ StructureTracker├ FvgTracker    │
                    │    ├ OrderBlockTracker               │
                    │    └ FeatureEngine (VWAP/flow/regime)│
                    │  → IctAnalysis(i)                    │
                    │  → strategies.voteAll → fuse         │
                    │  → riskEngine.assess → paperTrader   │
                    └───────────────┬──────────────────────┘
                                    │  (read-only projection)
                                    ▼
                    ┌──────────────────────────────────────┐
                    │  INTELLIGENCE LAYER (this phase)     │
                    │  src/intel/*                         │
                    │  annotate() : EngineView → Annotation[]│
                    │  confluence / tradeIntel / delta      │
                    │  timeline / alerts / explain / pine   │
                    └───────┬──────────────────┬───────────┘
                            ▼                  ▼
                   Native Mr. Cash chart   Pine export
                   (real-time truth)       (offline artifact)
```

The arrow into the intelligence layer is **one-way**. No module under
`src/intel/` is imported by the engine, the strategies, fusion, risk, the paper
trader or execution. A CI-visible invariant test asserts this.

### 1.2 What is reused (nothing is duplicated)

| Need | Reused from |
|---|---|
| Candles / feed | `src/data/feed.ts`, `src/data/candleStore.ts` |
| Swings, BOS/CHoCH, order blocks, dealing range | `IctAnalysis.swings`, `.structureShifts`, `.orderBlocks`, `.dealingRange` (`src/structure.ts`, `src/orderblocks.ts`) |
| Liquidity levels, sweeps | `IctAnalysis.levels`, `.sweepsToday`, `.swingSweepsToday` (`src/liquidity.ts`) |
| Fair value gaps | `IctAnalysis.fvgs` (`src/fvg.ts`) |
| Sessions / killzones | `IctAnalysis.sessions`, `.session`, `.inKillzone` (`src/sessions.ts`) |
| VWAP, volatility, momentum, order flow, regime | `IctAnalysis.features` (`src/features/*`) |
| Strategy setups + evidence | `voteAll` / `StrategyVote.evidence` (`src/strategies/registry.ts`) |
| Fused decision | `fuse` / `FusedDecision` (`src/fusion.ts`) |
| Risk reasons | `assess` / `RiskVerdict.checks`, `.vetoedBy` (`src/riskEngine.ts`) |
| Trades | `readPositions()` (`src/paperTrader.ts`) |
| Replay stepping | `IctEngine.step(i)` (`src/ictStrategy.ts`), `replaySteps` (`src/replay.ts`) |
| Validation status | `src/paper/validation.ts` (unchanged) |
| Existing UI patterns | `web/index.html`, `web/js/*`, existing canvas chart |

The layer defines **no** new feature, structure or strategy model.

### 1.3 Module map

| Module | Responsibility |
|---|---|
| `src/intel/types.ts` | The canonical `ChartAnnotation`, lifecycle, provenance, enums, schema version |
| `src/intel/annotate.ts` | Pure extractors: engine state → annotations |
| `src/intel/mtf.ts` | Higher-timeframe context vs execution-timeframe structure |
| `src/intel/confluence.ts` | Strategy layers, agreement/disagreement, the confluence chain |
| `src/intel/tradeIntel.ts` | "Why this trade" / "why not", from real evidence + risk checks |
| `src/intel/delta.ts` | What changed between two annotation frames |
| `src/intel/timeline.ts` | Ordered event timeline across categories |
| `src/intel/alerts.ts` | Alert events derived from deltas (never orders) |
| `src/intel/explain.ts` | AI explanation contract over engine state, citing annotation ids |
| `src/intel/pine.ts` | TradingView Pine v5 generator from canonical annotations |
| `src/intel/flags.ts` | Feature-flag resolution |

---

## 2. Data flow

```
IctEngine.step(i) ──► IctAnalysis(i) ─┐
voteAll(ctx)      ──► StrategyVote[] ─┤
fuse(votes)       ──► FusedDecision  ─┼─► EngineView(i) ─► annotate() ─► ChartAnnotation[]
assess(cand)      ──► RiskVerdict    ─┤                                        │
readPositions()   ──► PaperPosition[]─┘                                        │
                                                    ┌──────────────────────────┼─────────────┐
                                                    ▼                          ▼             ▼
                                              native chart              timeline/alerts   Pine export
```

`EngineView` is a **read-only bundle** of already-computed engine output. The
intelligence layer never re-derives structure, never re-runs a strategy to get a
different answer, and never recomputes risk.

---

## 3. Annotation model

One canonical representation for every mark on every chart:

```ts
type ChartAnnotation = {
  id: string                  // deterministic, content-derived
  schemaVersion: number
  engineVersion: string
  symbol: string
  timeframe: string
  annotationType: AnnotationType
  layer: AnnotationLayer      // structure | liquidity | imbalance | orderblock | ict | trade | context
  source: AnnotationSource    // which engine module produced the underlying fact
  sourceFeature: string | null
  createdAt: number           // when this annotation object was built
  eventTime: number           // when the market event happened
  knownAt: number             // when the engine could first know it  (no-lookahead key)
  startTime: number
  endTime: number | null      // null = still extends to "now"
  price: number | null
  priceHigh: number | null
  priceLow: number | null
  direction: 'long' | 'short' | 'bullish' | 'bearish' | null
  strategyIds: string[]
  strategyState: string | null
  regime: string | null
  dataQuality: 'REAL' | 'APPROXIMATE' | 'UNAVAILABLE'
  confidence: number | null
  rationale: string           // engine-derived, never invented
  invalidationCondition: string | null
  lifecycleStatus: Lifecycle
  linkedSignalId: string | null
  linkedTradeId: string | null
  replayTimestamp: number | null
}
```

**No field is ever invented.** A value the engine does not supply is `null`, and
`dataQuality` becomes `UNAVAILABLE` with the reason in `rationale`. Anything
computed from candles where the live tape would have been exact is
`APPROXIMATE` (the existing `Feature.approximate` contract is propagated
verbatim).

### 3.1 Deterministic ids

`id = <layer>.<annotationType>.<timeframe>.<eventTime>.<priceKey>` hashed to a
short stable string. **No randomness, no wall-clock in the id.** The same market
input therefore always produces the same annotation ids — the critical
invariant of §22R.

### 3.2 Lifecycle

```
ACTIVE ──► MITIGATED ──► INVALIDATED
   │           │
   ├──► EXPIRED│
   ├──► TRIGGERED ──► RESOLVED
   └──► INVALIDATED
```

Lifecycle is **mapped from engine state**, never inferred independently:

| Engine state | Lifecycle |
|---|---|
| `FVG.state = 'fresh'` | `ACTIVE` |
| `FVG.state = 'mitigated'` | `MITIGATED` |
| `FVG.state = 'inverted'` | `INVALIDATED` (it now works the other way round) |
| `FVG.state = 'expired'` | `EXPIRED` |
| `OrderBlock.state = 'fresh' / 'mitigated' / 'broken' / 'expired'` | `ACTIVE` / `MITIGATED` / `INVALIDATED` / `EXPIRED` |
| `Level` intact | `ACTIVE` |
| `Level.sweptAt` set | `TRIGGERED` |
| `Level.brokenAt` set | `INVALIDATED` |
| Strategy setup voted BUY/SELL | `TRIGGERED` |
| Trade closed | `RESOLVED` |

---

## 4. Provenance model

Every annotation answers "why is this on my chart?" without guessing:

- **WHAT** — `annotationType` + `priceHigh/priceLow/price`
- **WHY** — `rationale`, taken from the engine's own describe helpers
  (`describeShift`, `describeSwing`, `describeOrderBlock`, `describeSweep`,
  `describeDealingRange`) or from `EvidenceStep.detail`
- **WHEN** — `eventTime` (market) and `knownAt` (knowable)
- **SOURCE** — `source` + `sourceFeature` (the module and the feature key)
- **TIMEFRAME** — `timeframe`
- **STRATEGY CONNECTION** — `strategyIds` + `strategyState`
- **REGIME** — `regime` from `features.regime`
- **DATA QUALITY** — `dataQuality`, propagated from `Feature.source/approximate`
- **STATUS** — `lifecycleStatus`
- **INVALIDATION** — `invalidationCondition`
- **RELATED SIGNAL / TRADE** — `linkedSignalId` / `linkedTradeId`

If the engine supplied no rationale, the annotation says so explicitly rather
than generating prose.

---

## 5. Object lifecycle

An annotation is **derived, not stored**. Each call to `annotate()` rebuilds the
full set from current engine state, so annotations cannot drift from the engine.
Alerts and the timeline are the only *persisted* products, and they are derived
from diffs between consecutive frames (`delta.ts`). This keeps the layer
stateless and makes determinism testable.

---

## 6. Multi-timeframe behaviour

- Timeframes are **discovered, not assumed**. The execution timeframe is
  `config.interval`. Higher timeframes are offered only when candle data for
  them is actually available (aggregated from stored candles, or absent).
- Annotations are tagged with their `timeframe` and split into two bands:
  - **HTF context** — e.g. previous week high/low, daily structure, daily FVG
  - **Execution structure** — e.g. 5m BOS, sweep, 5m FVG, strategy trigger
- Each timeframe is an independently toggleable layer in the UI.
- When a requested timeframe has no data, the layer reports
  `UNAVAILABLE` for it — it does **not** synthesise candles.

---

## 7. Replay behaviour (no look-ahead)

**Guarantee by construction:** `IctEngine.step(i)` is incremental and has only
consumed candles `0..i`. Annotations are a pure function of `IctAnalysis(i)`, so
an annotation produced at step `i` cannot contain future information.

**Guarantee by contract:** every annotation carries `knownAt`. The replay view
at cursor time `T` renders only annotations with `knownAt <= T`. Two invariants
are asserted in tests:

1. `knownAt >= eventTime` for every annotation (nothing is known before it happens).
2. For every step `i`, `max(knownAt) <= candles[i].closeTime` (no frame contains
   anything knowable only later).

A dedicated leakage test walks the replay and fails if any annotation appears in
a frame earlier than the frame in which the engine first reported it.

Replay supports PLAY / PAUSE / STEP FORWARD / STEP BACK / SPEED / JUMP TO EVENT,
reusing the existing replay player.

---

## 8. TradingView integration strategy

**Honest statement of the limitation, up front:** TradingView provides **no
public, supported API that lets external software draw on, or stream data into,
a user's logged-in chart**. Pine Script executes inside TradingView on
TradingView-provided data; it cannot fetch an external URL. Therefore:

- ❌ We do **not** claim live remote drawing on a user's chart.
- ❌ We do **not** scrape TradingView or automate a logged-in account.
- ✅ We generate **self-contained Pine v5 source** whose drawing commands are
  *baked from real Mr. Cash annotations* (fixed times and prices), which the
  user pastes into the Pine Editor.
- ✅ The existing webhook path (`/api/tv-alert`) remains the only *inbound*
  TradingView integration, unchanged.

Consequence: the Pine export is a **point-in-time artifact**, not a live feed.
It is stamped with the generation time and the engine version, and the generated
header says plainly that it is a snapshot. The **native Mr. Cash chart remains
the real-time source of truth**. Full detail in `docs/TRADINGVIEW_INTEGRATION.md`.

The generator emits levels/boxes/labels from the same canonical annotations the
native chart uses, so the two cannot silently diverge — no independent Pine-side
recalculation of structure is performed.

---

## 9. Security boundaries

- The intelligence layer takes **no** exchange credentials, and imports neither
  `src/exchange/binanceTrade.ts` nor `src/live/*`. (Asserted by test.)
- It places no orders and exposes no state-changing route; every `/api/intel/*`
  endpoint is **GET** and read-only.
- The Pine export is **sanitised**: it emits only symbol, timeframe, times,
  prices and labels. A deny-list strips anything resembling a key, secret,
  token, PIN, CSRF value, file path or environment variable, and a test asserts
  a poisoned input cannot leak into the output.
- No private account information, balances or credentials appear in any export.

---

## 10. Test strategy

Covered in `test/intel/`:

1. annotation creation · 2. determinism (same input → identical ids/order) ·
3. provenance completeness · 4. lifecycle transitions · 5. FVG · 6. BOS ·
7. CHoCH · 8. liquidity · 9. order blocks · 10. ICT strategies ·
11. multi-timeframe mapping · 12. replay determinism · 13. **no-lookahead** ·
14. strategy disagreement · 15. trade linkage · 16. rejection explanation ·
17. validation integration · 18. Pine export snapshot · 19. malformed events ·
20. unavailable data · 21. dataQuality propagation · 22. feature flags ·
23. UI smoke.

Plus an **isolation test**: no engine module imports `src/intel/*`.

---

## 11. Feature flags

`config.intelligence` — all independent, all defaulting safe:

| Flag | Default | Effect |
|---|---|---|
| `enabled` | true | Master switch for the whole layer |
| `chartMarkup` | true | Automatic annotations |
| `mtfMarkup` | true | Higher-timeframe layers |
| `replayIntelligence` | true | Replay annotation frames |
| `tradingViewExport` | true | Pine generator + route |
| `alertCenter` | true | Alert derivation |
| `aiExplanation` | true | AI explanation endpoint |

**No trading-execution flag is touched.** `LIVE_TRADING_ENABLED` stays `false`,
`config.live.enabled` stays `false`, `config.shadow.enabled` stays `false`.
Turning every intelligence flag off must leave trading behaviour byte-identical.

---

## 12. Limitations (stated, not worked around)

1. **TradingView cannot be driven remotely.** Export is a snapshot artifact
   (§8). No supported mechanism exists to inject live external data into Pine.
2. **Higher timeframes are only as good as stored candles.** Where history is
   absent, the timeframe reports `UNAVAILABLE`; nothing is synthesised.
3. **Order-flow annotations require the live tape.** With the stream down they
   are `UNAVAILABLE`, never estimated from candles.
4. **Annotations are derived, not persisted**, so a historical annotation set
   can only be reproduced by replaying the same candles through the same engine
   version. `engineVersion` + `schemaVersion` are stamped for exactly this.
5. **The layer cannot explain what the engine does not record.** Where an engine
   rationale is missing, the annotation says "no engine rationale recorded"
   rather than inventing one.
6. **AI explanation is bounded**: it explains existing engine state and cites
   annotation ids. It cannot originate a signal, alter risk, or disagree with
   the engine; a validator rejects any answer referencing an id that is not in
   the supplied context.
7. **This layer does not improve trading performance** and is not intended to.
   It changes nothing about what the engine decides.
