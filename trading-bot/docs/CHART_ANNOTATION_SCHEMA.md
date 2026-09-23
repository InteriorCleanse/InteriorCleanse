# CHART ANNOTATION SCHEMA (Phase 22B)

The canonical representation of every mark the intelligence layer can put on a
chart. Defined in `src/intel/types.ts`; current `schemaVersion` is **1**.

One model serves the native chart, the replay frames, the timeline, the alert
centre, the AI explanation context and the TradingView export — so all six show
the same facts and cannot drift apart.

---

## 1. The two rules

1. **Nothing is invented.** Every value comes from engine state that already
   exists. A value the engine does not supply is `null`, and `dataQuality`
   becomes `UNAVAILABLE` with the reason stated in `rationale`.
2. **Nothing is known before it happens.** `eventTime` is when the market did
   it; `knownAt` is when the engine could first report it. `knownAt >= eventTime`
   always (enforced in `makeAnnotation`, asserted in tests).

---

## 2. Fields

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Deterministic, content-derived (see §4). Same input → same id. |
| `schemaVersion` | number | This document's version. |
| `engineVersion` | string | The app version that produced it. |
| `symbol` | string | Market, e.g. `BTCUSDT`. |
| `timeframe` | string | The timeframe this mark belongs to (`5m`, `1h`, `1d`, …). |
| `annotationType` | enum | What it is (§3). |
| `layer` | enum | `structure` · `liquidity` · `imbalance` · `orderblock` · `ict` · `trade` · `context`. The UI toggles these. |
| `source` | enum | Which engine module produced the underlying fact. |
| `sourceFeature` | string \| null | The specific tracker/feature key, e.g. `fvg:g12`. |
| `createdAt` | number | When the annotation object was built (not market time). |
| `eventTime` | number | When the market event happened. |
| `knownAt` | number | When the engine could FIRST know it. Replay filters on this. |
| `startTime` | number | Where the drawing starts. Defaults to `eventTime`. |
| `endTime` | number \| null | Where it stops. `null` = still extends to "now". |
| `price` | number \| null | The single price, for a level or a point. |
| `priceHigh` / `priceLow` | number \| null | The bounds, for a zone. |
| `direction` | enum \| null | `long` · `short` · `bullish` · `bearish` · `null`. |
| `strategyIds` | string[] | Strategies that reference this object. |
| `strategyState` | string \| null | e.g. a breaker's role, a regime label, a vote. |
| `regime` | string \| null | The regime reading at the time. |
| `dataQuality` | enum | `REAL` · `APPROXIMATE` · `UNAVAILABLE` (§5). |
| `confidence` | number \| null | 0–100 when the engine supplied one. Never guessed. |
| `rationale` | string | Engine-derived explanation. Never generated prose. |
| `invalidationCondition` | string \| null | What would kill this object. |
| `lifecycleStatus` | enum | §6. |
| `linkedSignalId` | string \| null | The signal this belongs to. |
| `linkedTradeId` | string \| null | The paper trade this produced. |
| `replayTimestamp` | number \| null | Set inside a replay frame, so a frame is self-describing. |

`discriminator` is an **input-only** hint used to keep two otherwise identical
annotations apart in the id. It never appears on the finished object.

---

## 3. Annotation types

**Structure** — `swing-high`, `swing-low`, `higher-high`, `higher-low`,
`lower-high`, `lower-low`, `bos`, `choch`, `dealing-range`

**Liquidity** — `equal-highs`, `equal-lows`, `buyside-liquidity`,
`sellside-liquidity`, `previous-day-high`, `previous-day-low`,
`previous-week-high`, `previous-week-low`, `session-high`, `session-low`,
`liquidity-sweep`, `liquidity-raid`, `failed-breakout`

**Imbalance** — `fvg-bullish`, `fvg-bearish`, `fvg-midpoint`, `fvg-mitigation`,
`fvg-invalidation`

**Order blocks** — `order-block-bullish`, `order-block-bearish`,
`breaker-block`, `block-mitigation`, `block-invalidation`

**ICT strategies** — `silver-bullet-window`, `silver-bullet-setup`,
`unicorn-setup`, `turtle-soup-setup`, `strategy-setup`

**Trade map** — `entry`, `stop-loss`, `take-profit`, `entry-zone`, `stop-zone`,
`target-zone`, `risk-reward`, `invalidation-level`

**Context** — `vwap`, `session-boundary`, `volatility-regime`, `trend-regime`,
`range-regime`, `news-marker`, `order-flow-state`

A type is only ever emitted when the engine actually detected the thing.

---

## 4. Deterministic ids

```
id = "<annotationType>.<hash>"
hash = FNV-1a(layer | annotationType | timeframe | eventTime | price | priceHigh | priceLow | discriminator)
```

- **No clock, no randomness, no ordering dependence.**
- Prices are quantised to 6 decimals, so float noise cannot fork an id.
- `lifecycleStatus` is deliberately **not** in the id — an object that moves from
  `ACTIVE` to `MITIGATED` keeps its identity, which is what lets the delta report
  a *lifecycle change* rather than a disappearance plus an appearance.

The hash is FNV-1a purely to keep ids short. It carries no security meaning.

---

## 5. Data quality

Propagated verbatim from the existing `Feature` contract. **A label is never
upgraded.**

| Label | Meaning |
|---|---|
| `REAL` | From the live tape, or read directly off real candles. |
| `APPROXIMATE` | Computed from candles where the tape would have been exact (`Feature.approximate === true`). |
| `UNAVAILABLE` | Could not be computed. The annotation still exists, to say so, with the engine's own note in `rationale`. |

Order-flow annotations are `UNAVAILABLE` whenever the stream is not trusted.
They are **never** estimated from candles.

---

## 6. Lifecycle

```
ACTIVE ──► MITIGATED ──► INVALIDATED
   │           │
   ├──► EXPIRED│
   ├──► TRIGGERED ──► RESOLVED
   └──► INVALIDATED
```

Mapped from engine state — the layer never decides a lifecycle independently:

| Engine state | Lifecycle |
|---|---|
| `FVG.state = fresh` | `ACTIVE` |
| `FVG.state = mitigated` | `MITIGATED` |
| `FVG.state = inverted` | `INVALIDATED` (it now works the other way round) |
| `FVG.state = expired` | `EXPIRED` |
| `OrderBlock.state = fresh / mitigated / broken / expired` | `ACTIVE` / `MITIGATED` / `INVALIDATED` / `EXPIRED` |
| `Level` intact | `ACTIVE` |
| `Level.sweptAt` set | `TRIGGERED` |
| `Level.brokenAt` set | `INVALIDATED` |
| A strategy voted BUY/SELL | `TRIGGERED` |
| A paper trade closed | `RESOLVED` |

---

## 7. Timing semantics (the part that prevents self-deception)

`knownAt` is the whole no-look-ahead guarantee, so it is set deliberately per
type rather than defaulted:

| Annotation | `eventTime` | `knownAt` | Why |
|---|---|---|---|
| Swing | the swing candle | the close of the candle `swingLookback` bars later | `SwingTracker` needs bars on **both** sides; the swing is not confirmed until then. |
| BOS / CHoCH | the breaking candle | the same candle | The break is known on the close that did it. |
| FVG | creation candle | the same candle | The gap exists as soon as it prints. |
| FVG inversion | `invertedTime` | the same | The engine records the inversion candle. |
| FVG mitigation | the current candle | the same | The engine records *that* it is mitigated but **not when** — so no earlier time is claimed. |
| Block mitigation | the candle at `mitigatedIndex` | the same | The engine *does* record which candle mitigated a block. |
| Level | `level.time` | the same | It exists once the session/day that formed it closed. |
| HTF period extreme | period start | **period end** | A period's high/low is not knowable until the period closes. |
| Context / regime / strategy setup | the current candle | the same | Current-state readings, re-derived each candle. |

Where the engine does not record a time, the annotation says so in its
`rationale` instead of picking a plausible one.

---

## 8. Ordering and helpers

- `sortAnnotations` — total order by `eventTime`, then `id`. Two runs over the
  same input produce the same *sequence*, not merely the same set.
- `dedupeAnnotations` — by id, first wins, so extractors may overlap safely.
- `knowableAt(list, cursor)` — the replay filter (`knownAt <= cursor`).
- `filterByLayer` — the UI toggles. Hides marks; never drops data.
- `noLookahead(list)` — true when every annotation satisfies `knownAt >= eventTime`.
