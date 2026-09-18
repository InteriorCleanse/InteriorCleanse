/**
 * EVIDENCE RECORDS — one shape, and it always says where it came from.
 *
 * The analyst layer answers "where did the results come from?" and it cannot
 * do that over two different trade shapes with two different vocabularies. So
 * every trade the layer looks at is first turned into an `EvidenceRecord`: the
 * same fields, the same session names, the same derived clock, and — the part
 * that is not negotiable — the same provenance stamp on every one.
 *
 * Two sources feed it and they are NEVER mixed silently:
 *
 *   PAPER    — closed paper positions. Real market data, simulated execution.
 *              Honest, and empty until the bot has actually traded.
 *   BACKTEST — replay trades. A simulation over stored candles. Populated
 *              immediately, and worth strictly less.
 *
 * A dataset is a list of records plus a `Provenance`, and building one from
 * records of mixed source throws. If two datasets are ever combined, that
 * happens through `combine()`, which produces a dataset whose source is
 * literally the string 'MIXED' and whose label says what went in.
 *
 * THE FIELDS COME FROM THE ENGINE'S OWN RECORDS, NOTHING IS INFERRED.
 *
 * Each field below is read from something the engine wrote at the time. When
 * the engine did not write it, the field is null and the name goes into
 * `missing`, so a downstream table can show "not recorded" in that cell instead
 * of a default. In particular:
 *
 *   - `regime` is the regime read AT DECISION TIME (paper: since Phase 22;
 *     backtest: at the signal candle). It is never recomputed from later data.
 *   - `mae`/`mfe` are OUTCOME measures walked from the candles strictly between
 *     fill and exit. They are not decision-time attributes and are labelled
 *     UNAVAILABLE, not zero, when that window has a gap.
 *   - hour and weekday are derived from the decision time in New York time —
 *     a pure function of a recorded timestamp, so deterministic.
 *
 * Read-only. Nothing here can place, size, shape or veto an order, and nothing
 * here is consulted by the engine.
 */

import { config } from '../../config.ts'
import { toET } from '../sessions.ts'
import { paperOutcome } from '../paperTrader.ts'
import { strategyOf } from '../paper/metrics.ts'
import { metaById } from '../strategies/registry.ts'
import type { PaperPosition, DecisionSnapshot } from '../paperTrader.ts'
import type { Candle, ReplayTrade, SessionName } from '../types.ts'
import type { StrategyFamily } from '../strategies/types.ts'

// ---------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------

export type Source = 'PAPER' | 'BACKTEST' | 'MIXED'

export type DataType = 'LIVE MARKET / SIMULATED EXECUTION' | 'SIMULATED' | 'MIXED'

export type Provenance = {
  source: Source
  dataType: DataType
  /** First and last decision time in the dataset, or null when empty. */
  period: { from: number; to: number } | null
  /** Records that count as trades: not missed, not corrupt. */
  trades: number
  /** Records that were refused before they could run (paper only). */
  missed: number
  /** Records the reader could not trust; excluded from every statistic. */
  corrupt: number
  symbols: string[]
  intervals: string[]
  /** One line a table header can print. */
  label: string
  /** Present only on a MIXED dataset: what was combined. */
  combinedFrom?: Provenance[]
}

export type Dataset = { provenance: Provenance; records: EvidenceRecord[] }

// ---------------------------------------------------------------
// The record
// ---------------------------------------------------------------

export type Regime = 'trending-up' | 'trending-down' | 'ranging' | 'breakout' | 'transition'
export type Volatility = 'quiet' | 'normal' | 'wild'
export type Outcome = 'WIN' | 'LOSS' | 'FLAT' | 'MISSED'

export type ExcursionStatus = 'OBSERVED' | 'UNAVAILABLE' | 'NOT COMPUTED'

/** An excursion in R, and whether it is a measurement. */
export type Excursion = { r: number | null; status: ExcursionStatus; note: string }

export type EvidenceRecord = {
  id: string
  source: Exclude<Source, 'MIXED'>
  strategyId: string
  family: StrategyFamily | 'fused' | 'unknown'
  symbol: string
  interval: string
  /** Normalised session name; 'none' when outside every session. */
  session: SessionName | 'none'
  regime: Regime | null
  volatility: Volatility | null
  direction: 'long' | 'short'
  /** When the engine decided (the signal candle's close). */
  decidedAt: number
  filledAt: number | null
  closedAt: number | null
  hourET: number | null
  /** 0 = Sunday … 6 = Saturday, New York time. */
  weekdayET: number | null
  intendedEntry: number | null
  entry: number | null
  stop: number | null
  target: number | null
  exit: number | null
  exitReason: string | null
  rMultiple: number | null
  outcome: Outcome
  missed: boolean
  /** The strategy's own 0–100 checklist score at decision time, when it wrote one. */
  quality: number | null
  /** The fused score at decision time, when it was recorded (paper snapshot only). */
  fusedScore: number | null
  mtfAligned: boolean | null
  /** Minutes to the nearest high-impact blackout at decision time; null = not recorded. */
  newsMinutes: number | null
  spreadPct: number | null
  durationMs: number | null
  mae: Excursion
  mfe: Excursion
  engineVersion: string | null
  featureVersion: number | null
  /** Names of the fields the engine did not record for this trade. */
  missing: string[]
  corrupt: boolean
  corruptReason: string | null
}

const NOT_COMPUTED: Excursion = { r: null, status: 'NOT COMPUTED', note: 'Excursions are resolved from the candle store on request.' }

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** Session label → name, from the same config the engine labels with. */
const LABEL_TO_NAME: Record<string, SessionName> = Object.fromEntries(
  (Object.keys(config.ict.sessions) as SessionName[]).map((name) => [config.ict.sessions[name].label.toLowerCase(), name]),
) as Record<string, SessionName>

export function normaliseSession(raw: string | null | undefined): SessionName | 'none' {
  if (!raw) return 'none'
  const s = raw.trim()
  if (s in config.ict.sessions) return s as SessionName
  return LABEL_TO_NAME[s.toLowerCase()] ?? 'none'
}

function familyOf(strategyId: string): EvidenceRecord['family'] {
  if (strategyId === 'fused') return 'fused'
  return metaById().get(strategyId)?.family ?? 'unknown'
}

/** `BTCUSDT|5m|session-ifvg|BUY` → the parts the key carries. */
function keyParts(setupKey: string | undefined): { symbol: string | null; interval: string | null } {
  const parts = (setupKey ?? '').split('|')
  return { symbol: parts.length >= 3 ? parts[0] || null : null, interval: parts.length >= 3 ? parts[1] || null : null }
}

function clock(at: number | null): { hourET: number | null; weekdayET: number | null } {
  if (at === null || !isNum(at) || at <= 0) return { hourET: null, weekdayET: null }
  const p = toET(at)
  return { hourET: p.hour, weekdayET: p.weekday }
}

// ---------------------------------------------------------------
// PAPER
// ---------------------------------------------------------------

/**
 * A closed paper position, as evidence.
 *
 * Corruption is checked before anything is derived. A record with no id, a
 * direction that is not long/short, a non-finite price, or a "closed" status
 * with no exit reason is not a trade the layer can reason about, and it is
 * marked rather than repaired.
 */
export function fromPaperPosition(p: PaperPosition): EvidenceRecord {
  const missing: string[] = []
  const problems: string[] = []

  if (typeof p.id !== 'string' || !p.id) problems.push('no id')
  if (p.direction !== 'long' && p.direction !== 'short') problems.push(`direction "${String(p.direction)}"`)
  if (!isNum(p.openedAt) || p.openedAt <= 0) problems.push('no decision time')
  if (p.status === 'closed' && !p.exitReason) problems.push('closed with no exit reason')
  for (const [k, v] of [['entry', p.entry], ['stop', p.stop], ['target', p.target]] as const) {
    if (v !== undefined && !isNum(v)) problems.push(`${k} is not a number`)
  }
  if (p.rMultiple !== undefined && !isNum(p.rMultiple)) problems.push('rMultiple is not a number')

  const missed = p.exitReason === 'missed'
  const kp = keyParts(p.setupKey)
  const strategyId = strategyOf(p)
  const snap: DecisionSnapshot | undefined = p.snapshot

  const symbol = kp.symbol ?? snap?.symbol ?? null
  const interval = kp.interval ?? snap?.interval ?? null
  if (!symbol) missing.push('symbol')
  if (!interval) missing.push('interval')
  if (p.regime === undefined || p.regime === 'unavailable') missing.push('regime')
  if (!snap?.volatility) missing.push('volatility')
  if (snap?.fusedScore === undefined || snap?.fusedScore === null) missing.push('fusedScore')
  missing.push('mtfAligned') // no alignment scalar exists in the engine; not invented here
  if (snap?.newsMinutes === undefined || snap?.newsMinutes === null) missing.push('newsMinutes')
  if (!snap?.engineVersion) missing.push('engineVersion')
  if (p.observedSpreadPct === undefined) missing.push('spreadPct')
  if (!missed && p.filledAt === undefined) missing.push('filledAt')

  const decidedAt = isNum(p.openedAt) ? p.openedAt : 0
  const regime = p.regime && p.regime !== 'unavailable' && REGIMES.has(p.regime) ? (p.regime as Regime) : null

  return {
    id: String(p.id ?? ''),
    source: 'PAPER',
    strategyId,
    family: familyOf(strategyId),
    symbol: symbol ?? 'unknown',
    interval: interval ?? 'unknown',
    session: normaliseSession(p.session),
    regime,
    volatility: snap?.volatility ?? null,
    direction: p.direction === 'short' ? 'short' : 'long',
    decidedAt,
    filledAt: isNum(p.filledAt) ? p.filledAt : null,
    closedAt: isNum(p.closedAt) ? p.closedAt : null,
    ...clock(decidedAt),
    intendedEntry: isNum(p.intendedEntry) ? p.intendedEntry : null,
    entry: isNum(p.entry) ? p.entry : null,
    stop: isNum(p.stop) ? p.stop : null,
    target: isNum(p.target) ? p.target : null,
    exit: isNum(p.exit) ? p.exit : null,
    exitReason: p.exitReason ?? null,
    rMultiple: missed ? null : isNum(p.rMultiple) ? p.rMultiple : null,
    outcome: problems.length ? 'MISSED' : paperOutcome(p),
    missed,
    quality: isNum(p.quality) ? p.quality : null,
    fusedScore: isNum(snap?.fusedScore) ? snap!.fusedScore! : null,
    mtfAligned: null,
    newsMinutes: isNum(snap?.newsMinutes) ? snap!.newsMinutes! : null,
    spreadPct: isNum(p.observedSpreadPct) ? p.observedSpreadPct : null,
    durationMs: isNum(p.filledAt) && isNum(p.closedAt) && !missed ? Math.max(0, p.closedAt - p.filledAt) : null,
    mae: NOT_COMPUTED,
    mfe: NOT_COMPUTED,
    engineVersion: snap?.engineVersion ?? null,
    featureVersion: isNum(snap?.featureVersion) ? snap!.featureVersion! : null,
    missing,
    corrupt: problems.length > 0,
    corruptReason: problems.length ? problems.join('; ') : null,
  }
}

const REGIMES = new Set<string>(['trending-up', 'trending-down', 'ranging', 'breakout', 'transition'])


// ---------------------------------------------------------------
// BACKTEST
// ---------------------------------------------------------------

export function fromReplayTrade(t: ReplayTrade, opts: { symbol?: string; interval?: string } = {}): EvidenceRecord {
  const missing: string[] = []
  const problems: string[] = []
  if (t.action !== 'BUY' && t.action !== 'SELL') problems.push(`action "${String(t.action)}"`)
  if (!isNum(t.time) || t.time <= 0) problems.push('no decision time')
  if (!isNum(t.entryPrice) || !isNum(t.exitPrice)) problems.push('entry or exit is not a number')
  if (t.rMultiple !== null && !isNum(t.rMultiple)) problems.push('rMultiple is not a number')

  const kp = keyParts(t.setupKey)
  const strategyId = (t.setupKey ?? '').split('|')[2] || 'unknown'
  const symbol = kp.symbol ?? opts.symbol ?? null
  const interval = kp.interval ?? opts.interval ?? null
  if (!symbol) missing.push('symbol')
  if (!interval) missing.push('interval')
  if (t.regime === undefined) missing.push('regime')
  // A replay never records these: it has no fused snapshot, no book, no news read.
  missing.push('volatility', 'fusedScore', 'mtfAligned', 'newsMinutes', 'spreadPct', 'engineVersion')

  const decidedAt = isNum(t.time) ? t.time : 0
  const stop = t.plan?.stop ?? null
  return {
    id: `bt-${strategyId}-${t.index}-${decidedAt}`,
    source: 'BACKTEST',
    strategyId,
    family: familyOf(strategyId),
    symbol: symbol ?? 'unknown',
    interval: interval ?? 'unknown',
    session: normaliseSession(t.session),
    regime: t.regime && REGIMES.has(t.regime) ? t.regime : null,
    volatility: null,
    direction: t.action === 'SELL' ? 'short' : 'long',
    decidedAt,
    filledAt: isNum(t.entryTime) ? t.entryTime : null,
    closedAt: isNum(t.exitTime) ? t.exitTime : null,
    ...clock(decidedAt),
    intendedEntry: isNum(t.intendedEntry) ? t.intendedEntry : null,
    entry: isNum(t.entryPrice) ? t.entryPrice : null,
    stop: isNum(stop) ? stop : null,
    target: t.plan?.takeProfit ?? null,
    exit: isNum(t.exitPrice) ? t.exitPrice : null,
    exitReason: t.exitReason ?? null,
    rMultiple: isNum(t.rMultiple) ? t.rMultiple : null,
    outcome: problems.length ? 'MISSED' : t.outcome,
    missed: false,
    quality: isNum(t.quality) ? t.quality : null,
    fusedScore: null,
    mtfAligned: null,
    newsMinutes: null,
    spreadPct: null,
    durationMs: isNum(t.entryTime) && isNum(t.exitTime) ? Math.max(0, t.exitTime - t.entryTime) : null,
    mae: NOT_COMPUTED,
    mfe: NOT_COMPUTED,
    engineVersion: null,
    featureVersion: null,
    missing,
    corrupt: problems.length > 0,
    corruptReason: problems.length ? problems.join('; ') : null,
  }
}

// ---------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------

function provenanceOf(records: EvidenceRecord[], source: Source): Provenance {
  const dataType: DataType = source === 'PAPER' ? 'LIVE MARKET / SIMULATED EXECUTION' : source === 'BACKTEST' ? 'SIMULATED' : 'MIXED'
  const usable = records.filter((r) => !r.corrupt)
  const trades = usable.filter((r) => !r.missed)
  const times = usable.map((r) => r.decidedAt).filter((t) => t > 0)
  const period = times.length ? { from: Math.min(...times), to: Math.max(...times) } : null
  const symbols = [...new Set(usable.map((r) => r.symbol))].sort()
  const intervals = [...new Set(usable.map((r) => r.interval))].sort()
  // New York calendar days, like every other date on the page — a period that
  // began on a UTC date would disagree with the trading-day key beside it.
  const when = period ? `${toET(period.from).dateKey} → ${toET(period.to).dateKey}` : 'no period'
  return {
    source, dataType, period, trades: trades.length, missed: usable.length - trades.length, corrupt: records.length - usable.length,
    symbols, intervals,
    label: `SOURCE: ${source} · DATA TYPE: ${dataType} · PERIOD: ${when} · TRADES: ${trades.length}`,
  }
}

/** Closed paper positions as a PAPER dataset. */
export function paperDataset(closed: PaperPosition[]): Dataset {
  const records = closed.map(fromPaperPosition)
  return { provenance: provenanceOf(records, 'PAPER'), records }
}

/** Replay trades as a BACKTEST dataset. */
export function backtestDataset(trades: ReplayTrade[], opts: { symbol?: string; interval?: string } = {}): Dataset {
  const records = trades.map((t) => fromReplayTrade(t, opts))
  return { provenance: provenanceOf(records, 'BACKTEST'), records }
}

/**
 * Build a dataset from records that already exist. Throws on a mix of sources —
 * the one door through which a simulation could be quietly averaged into a
 * live record is this one, and it is locked.
 */
export function datasetOf(records: EvidenceRecord[]): Dataset {
  const sources = new Set(records.map((r) => r.source))
  if (sources.size > 1) {
    throw new Error(`refusing to build a dataset from mixed sources (${[...sources].sort().join(' + ')}) — use combine() and carry the MIXED label`)
  }
  const source: Source = records[0]?.source ?? 'PAPER'
  return { provenance: provenanceOf(records, source), records }
}

/**
 * Explicitly combine datasets. The result is labelled MIXED on its face and
 * remembers what went in; nothing downstream may present it as either source.
 */
export function combine(parts: Dataset[]): Dataset {
  const records = parts.flatMap((d) => d.records)
  const p = provenanceOf(records, 'MIXED')
  const from = parts.map((d) => d.provenance)
  return {
    provenance: { ...p, combinedFrom: from, label: `SOURCE: MIXED (${from.map((f) => `${f.source}: ${f.trades}`).join(' + ')}) · DATA TYPE: MIXED — an explicit aggregation, not a performance record` },
    records,
  }
}

/** Records that may enter a statistic: not corrupt, not missed, with an R. */
export function tradesOf(d: Dataset): EvidenceRecord[] {
  return d.records.filter((r) => !r.corrupt && !r.missed && r.rMultiple !== null)
}

// ---------------------------------------------------------------
// Excursions — outcome measures, walked from the candles between fill and exit
// ---------------------------------------------------------------

/**
 * Maximum adverse and favourable excursion, in R, from the candles between the
 * fill and the exit.
 *
 * Coverage is checked before anything is measured. A window with a gap in it
 * reads as a smaller excursion for the wrong reason, so the excursion is
 * UNAVAILABLE — with the gap named — rather than a number that is quietly too
 * kind. The stop distance is the R unit, exactly as the engine's own R uses it.
 *
 * This is an outcome measure, not a decision-time attribute: it only ever looks
 * at candles strictly after the fill, which are all in the past by the time a
 * trade is closed and analysed.
 */
export function excursions(
  r: Pick<EvidenceRecord, 'direction' | 'entry' | 'stop' | 'filledAt' | 'closedAt' | 'missed'>,
  candles: Candle[],
): { mae: Excursion; mfe: Excursion } {
  const unavailable = (note: string): { mae: Excursion; mfe: Excursion } => ({ mae: { r: null, status: 'UNAVAILABLE', note }, mfe: { r: null, status: 'UNAVAILABLE', note } })
  if (r.missed) return unavailable('The order never filled; there was no position to have an excursion.')
  if (r.entry === null || r.stop === null || r.filledAt === null || r.closedAt === null) return unavailable('The record has no fill, stop or exit time to walk between.')
  const risk = Math.abs(r.entry - r.stop)
  if (!(risk > 0)) return unavailable('Zero stop distance — R is undefined.')

  const run = candles.filter((c) => c.openTime >= r.filledAt! && c.openTime <= r.closedAt!).sort((a, b) => a.openTime - b.openTime)
  if (!run.length) return unavailable('No candles are stored for the life of this trade.')
  // Coverage: the step is measured from the data and no gap may exceed it.
  const gaps: number[] = []
  for (let i = 1; i < run.length; i++) gaps.push(run[i].openTime - run[i - 1].openTime)
  const step = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : (run[0].closeTime - run[0].openTime + 1)
  const hole = gaps.find((g) => g > step * 1.5)
  if (hole !== undefined) return unavailable(`A ${Math.round(hole / 60_000)}-minute gap in the stored candles falls inside this trade; a partial walk would understate the excursion.`)
  if (run[0].openTime > r.filledAt + step) return unavailable('The stored candles begin after the fill.')
  if (run[run.length - 1].closeTime + step < r.closedAt) return unavailable('The stored candles end before the exit.')

  const long = r.direction === 'long'
  let worst = 0
  let best = 0
  for (const c of run) {
    const adverse = long ? r.entry - c.low : c.high - r.entry
    const favourable = long ? c.high - r.entry : r.entry - c.low
    if (adverse > worst) worst = adverse
    if (favourable > best) best = favourable
  }
  return {
    mae: { r: -(worst / risk), status: 'OBSERVED', note: `Worst move against the entry over ${run.length} candle(s), in R.` },
    mfe: { r: best / risk, status: 'OBSERVED', note: `Best move in favour over ${run.length} candle(s), in R.` },
  }
}

/** Resolve excursions for every record from a candle source. Pure over the source given. */
export function withExcursions(d: Dataset, candlesBetween: (symbol: string, interval: string, from: number, to: number) => Candle[]): Dataset {
  const records = d.records.map((r) => {
    if (r.corrupt || r.missed || r.filledAt === null || r.closedAt === null) return { ...r, ...excursions(r, []) }
    const candles = candlesBetween(r.symbol, r.interval, r.filledAt, r.closedAt)
    return { ...r, ...excursions(r, candles) }
  })
  return { provenance: d.provenance, records }
}

// ---------------------------------------------------------------
// What each source can and cannot say
// ---------------------------------------------------------------

export type FieldAvailability = { field: keyof EvidenceRecord; recorded: number; total: number; note: string }

/** Per field, how many records actually carry it — so a table can label a column "not recorded" honestly. */
export function fieldAvailability(d: Dataset): FieldAvailability[] {
  const usable = d.records.filter((r) => !r.corrupt)
  const total = usable.length
  const count = (f: keyof EvidenceRecord, ok: (r: EvidenceRecord) => boolean) => usable.filter(ok).length
  const fields: Array<[keyof EvidenceRecord, (r: EvidenceRecord) => boolean, string]> = [
    ['regime', (r) => r.regime !== null, 'the regime read at decision time'],
    ['volatility', (r) => r.volatility !== null, 'the volatility label at decision time (paper snapshot only)'],
    ['session', (r) => r.session !== 'none', 'inside a named session'],
    ['quality', (r) => r.quality !== null, 'the strategy checklist score'],
    ['fusedScore', (r) => r.fusedScore !== null, 'the fused score at decision time (paper snapshot only)'],
    ['mtfAligned', (r) => r.mtfAligned !== null, 'higher-timeframe alignment at decision time (paper snapshot only)'],
    ['newsMinutes', (r) => r.newsMinutes !== null, 'minutes to the nearest blackout at decision time (paper snapshot only)'],
    ['spreadPct', (r) => r.spreadPct !== null, 'the observed spread at decision time (paper only)'],
    ['mae', (r) => r.mae.status === 'OBSERVED', 'maximum adverse excursion, from stored candles'],
    ['mfe', (r) => r.mfe.status === 'OBSERVED', 'maximum favourable excursion, from stored candles'],
    ['engineVersion', (r) => r.engineVersion !== null, 'the engine version that made the decision'],
  ]
  return fields.map(([field, ok, note]) => ({ field, recorded: count(field, ok), total, note }))
}
