/**
 * EVIDENCE RECORDS — one shape, and it always says where it came from.
 *
 * The failure this layer exists to prevent is quiet: a backtest number sitting
 * in a table next to a paper number with nothing on the page to tell them
 * apart. So these tests hold the provenance stamp above everything else — a
 * mixed list must throw, a combined one must say MIXED on its face — and then
 * the unglamorous half: a missing field is null and named, a corrupt record is
 * flagged and excluded, and nothing is ever filled in with a plausible default.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PaperPosition } from '../../src/paperTrader.ts'
import type { Candle, ReplayTrade } from '../../src/types.ts'
import {
  fromPaperPosition, fromReplayTrade, paperDataset, backtestDataset, datasetOf, combine, tradesOf,
  excursions, withExcursions, fieldAvailability, normaliseSession,
} from '../../src/analyst/records.ts'

const T0 = Date.UTC(2026, 0, 13, 13, 30) // 08:30 New York, a Tuesday

let n = 0
function pos(over: Partial<PaperPosition> = {}): PaperPosition {
  n++
  return {
    id: `p${n}`, openedAt: T0 + n * 60_000, filledAt: T0 + n * 60_000 + 300_000, closedAt: T0 + n * 60_000 + 3_600_000,
    dayKey: 'D', session: 'New York AM', setupKey: 'BTCUSDT|5m|silver-bullet|BUY',
    direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 1, riskUsd: 1, quality: 70, reason: '', atr: 1,
    status: 'closed', exitReason: 'target', exit: 102, rMultiple: 2, pnlUsd: 2, feesUsd: 0, outcome: 'WIN',
    strategyId: 'silver-bullet', regime: 'trending-up', observedSpreadPct: 0.01,
    ...over,
  } as PaperPosition
}
function rt(over: Partial<ReplayTrade> = {}): ReplayTrade {
  n++
  return {
    index: n, time: T0 + n * 60_000, action: 'BUY', intendedEntry: 100, entryPrice: 100, entryTime: T0 + n * 60_000 + 300_000,
    exitPrice: 102, exitTime: T0 + n * 60_000 + 3_600_000, exitReason: 'target', costsUsd: 0.1, pnlPercent: 2, pnlUsd: 2, rMultiple: 2,
    outcome: 'WIN', setupKey: 'BTCUSDT|5m|unicorn|BUY', session: 'newYork', regime: 'ranging', quality: 60,
    plan: { direction: 'long', entry: 100, stop: 99, takeProfit: 102, rr: 2, entryLabel: '', stopLabel: '', targetLabel: '' },
    ...over,
  } as ReplayTrade
}

// ---------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------

test('a paper record and a backtest record are stamped with their source and data type', () => {
  const p = paperDataset([pos()])
  assert.equal(p.provenance.source, 'PAPER')
  assert.equal(p.provenance.dataType, 'LIVE MARKET / SIMULATED EXECUTION')
  assert.match(p.provenance.label, /^SOURCE: PAPER · DATA TYPE: LIVE MARKET \/ SIMULATED EXECUTION · PERIOD: .* · TRADES: 1$/)
  const b = backtestDataset([rt()])
  assert.equal(b.provenance.source, 'BACKTEST')
  assert.equal(b.provenance.dataType, 'SIMULATED')
  assert.match(b.provenance.label, /TRADES: 1$/)
})

test('a dataset built from mixed sources is refused outright', () => {
  const mixed = [fromPaperPosition(pos()), fromReplayTrade(rt())]
  assert.throws(() => datasetOf(mixed), /refusing to build a dataset from mixed sources \(BACKTEST \+ PAPER\)/)
})

test('an explicit combination is labelled MIXED and remembers what went in', () => {
  const c = combine([paperDataset([pos(), pos()]), backtestDataset([rt()])])
  assert.equal(c.provenance.source, 'MIXED')
  assert.equal(c.provenance.dataType, 'MIXED')
  assert.match(c.provenance.label, /SOURCE: MIXED \(PAPER: 2 \+ BACKTEST: 1\)/)
  assert.match(c.provenance.label, /not a performance record/)
  assert.deepEqual(c.provenance.combinedFrom!.map((f) => f.source), ['PAPER', 'BACKTEST'])
})

test('zero trades is a period of nothing, not a period of zeros', () => {
  const d = paperDataset([])
  assert.equal(d.provenance.trades, 0)
  assert.equal(d.provenance.period, null)
  assert.match(d.provenance.label, /PERIOD: no period · TRADES: 0/)
  assert.deepEqual(tradesOf(d), [])
})

test('one trade is a dataset of one, with its period being that instant', () => {
  const d = paperDataset([pos()])
  assert.equal(d.provenance.trades, 1)
  assert.equal(d.provenance.period!.from, d.provenance.period!.to)
})

// ---------------------------------------------------------------
// Fields: read, derived, missing, never defaulted
// ---------------------------------------------------------------

test('fields come off the engine record; symbol and interval are read from the setup key', () => {
  const r = fromPaperPosition(pos())
  assert.equal(r.strategyId, 'silver-bullet')
  assert.equal(r.family, 'session')
  assert.equal(r.symbol, 'BTCUSDT')
  assert.equal(r.interval, '5m')
  assert.equal(r.session, 'newYork', 'the label "New York AM" normalises to the session name')
  assert.equal(r.regime, 'trending-up')
  assert.equal(r.direction, 'long')
  assert.equal(r.rMultiple, 2)
  assert.equal(r.outcome, 'WIN')
  assert.equal(r.spreadPct, 0.01)
  assert.equal(r.durationMs, 3_300_000)
})

test('hour and weekday are derived from the decision time in New York, deterministically', () => {
  const a = fromPaperPosition(pos({ openedAt: T0 }))
  const b = fromPaperPosition(pos({ openedAt: T0 }))
  assert.equal(a.hourET, 8)
  assert.equal(a.weekdayET, 2, 'Tuesday')
  assert.deepEqual({ h: a.hourET, w: a.weekdayET }, { h: b.hourET, w: b.weekdayET })
})

test('what the engine did not record is null AND named, never defaulted', () => {
  const r = fromPaperPosition(pos({ regime: undefined, observedSpreadPct: undefined }))
  assert.equal(r.regime, null)
  assert.equal(r.spreadPct, null)
  for (const f of ['regime', 'spreadPct', 'volatility', 'fusedScore', 'mtfAligned', 'newsMinutes', 'engineVersion']) {
    assert.ok(r.missing.includes(f), `"${f}" should be listed as missing`)
  }
  // A regime the engine explicitly marked unavailable is the same as none.
  assert.equal(fromPaperPosition(pos({ regime: 'unavailable' })).regime, null)
})

test('a backtest record says what a replay can never record, instead of pretending', () => {
  const r = fromReplayTrade(rt())
  assert.equal(r.source, 'BACKTEST')
  assert.equal(r.regime, 'ranging', 'the regime read at the signal candle is carried')
  assert.equal(r.volatility, null)
  assert.equal(r.spreadPct, null)
  for (const f of ['volatility', 'fusedScore', 'mtfAligned', 'newsMinutes', 'spreadPct', 'engineVersion']) assert.ok(r.missing.includes(f))
  // And an older replay trade with no regime field says so.
  assert.ok(fromReplayTrade(rt({ regime: undefined })).missing.includes('regime'))
})

test('a missed paper order is a record with no R, excluded from trades but counted', () => {
  const d = paperDataset([pos(), pos({ exitReason: 'missed', rMultiple: 0, pnlUsd: 0, filledAt: undefined })])
  assert.equal(d.provenance.trades, 1)
  assert.equal(d.provenance.missed, 1)
  const missed = d.records[1]
  assert.equal(missed.missed, true)
  assert.equal(missed.rMultiple, null, 'a missed order has no R — the zero on the record is not a result')
  assert.equal(tradesOf(d).length, 1)
})

test('session normalisation accepts names, labels and nothing', () => {
  assert.equal(normaliseSession('london'), 'london')
  assert.equal(normaliseSession('London'), 'london')
  assert.equal(normaliseSession('New York PM'), 'nyPM')
  assert.equal(normaliseSession(''), 'none')
  assert.equal(normaliseSession('Somewhere'), 'none')
})

// ---------------------------------------------------------------
// Corruption
// ---------------------------------------------------------------

test('a corrupt record is flagged with its reason and excluded from every statistic', () => {
  const bad = [
    pos({ id: '' }),
    pos({ direction: 'sideways' as never }),
    pos({ openedAt: Number.NaN }),
    pos({ entry: Number.POSITIVE_INFINITY }),
    pos({ exitReason: undefined }),
    pos({ rMultiple: Number.NaN }),
  ]
  const d = paperDataset(bad)
  assert.equal(d.provenance.corrupt, 6)
  assert.equal(d.provenance.trades, 0)
  assert.equal(tradesOf(d).length, 0)
  for (const r of d.records) {
    assert.equal(r.corrupt, true)
    assert.ok(r.corruptReason && r.corruptReason.length > 0, 'a corrupt record must say why')
  }
  assert.match(d.records[1].corruptReason!, /direction "sideways"/)
  assert.match(d.records[4].corruptReason!, /closed with no exit reason/)
})

// ---------------------------------------------------------------
// Excursions — outcome measures, honest about coverage
// ---------------------------------------------------------------

function candles(from: number, count: number, step = 300_000, price = 100): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const openTime = from + i * step
    // A dip to 99.5 on the third candle, a run to 103 on the eighth.
    const low = i === 2 ? 99.5 : price - 0.1
    const high = i === 7 ? 103 : price + 0.1
    return { openTime, closeTime: openTime + step - 1, open: price, high, low, close: price, volume: 1 }
  })
}

test('MAE and MFE are walked from the candles between fill and exit, in R', () => {
  const r = fromPaperPosition(pos({ filledAt: T0, closedAt: T0 + 12 * 300_000 }))
  const { mae, mfe } = excursions(r, candles(T0, 13))
  assert.equal(mae.status, 'OBSERVED')
  assert.equal(mfe.status, 'OBSERVED')
  assert.ok(Math.abs(mae.r! - -0.5) < 1e-9, `MAE should be -0.5R (dip to 99.5 on a 1.0 stop), got ${mae.r}`)
  assert.ok(Math.abs(mfe.r! - 3) < 1e-9, `MFE should be +3R (run to 103), got ${mfe.r}`)
})

test('a gap inside the trade makes the excursion UNAVAILABLE, not smaller', () => {
  const r = fromPaperPosition(pos({ filledAt: T0, closedAt: T0 + 12 * 300_000 }))
  const full = candles(T0, 13)
  const holed = full.filter((_, i) => i !== 5 && i !== 6)
  const { mae } = excursions(r, holed)
  assert.equal(mae.status, 'UNAVAILABLE')
  assert.match(mae.note, /gap in the stored candles/)
  assert.equal(mae.r, null)
})

test('no candles, a missed order, or a zero stop distance is UNAVAILABLE with a reason', () => {
  const r = fromPaperPosition(pos({ filledAt: T0, closedAt: T0 + 3_600_000 }))
  assert.equal(excursions(r, []).mae.status, 'UNAVAILABLE')
  assert.match(excursions({ ...r, missed: true }, candles(T0, 13)).mfe.note, /never filled/)
  assert.match(excursions({ ...r, stop: 100 }, candles(T0, 13)).mae.note, /Zero stop distance/)
})

test('withExcursions resolves every record from the source given and leaves provenance alone', () => {
  const d = paperDataset([pos({ filledAt: T0, closedAt: T0 + 12 * 300_000 }), pos({ exitReason: 'missed', rMultiple: 0, pnlUsd: 0, filledAt: undefined })])
  const out = withExcursions(d, (_s, _i, from, to) => candles(from, Math.round((to - from) / 300_000) + 1))
  assert.equal(out.provenance.label, d.provenance.label)
  assert.equal(out.records[0].mae.status, 'OBSERVED')
  assert.equal(out.records[1].mae.status, 'UNAVAILABLE')
  // Before resolution, the excursion is explicitly NOT COMPUTED — never zero.
  assert.equal(d.records[0].mae.status, 'NOT COMPUTED')
})

// ---------------------------------------------------------------
// What the source can say
// ---------------------------------------------------------------

test('field availability counts what was actually recorded, per field', () => {
  const d = paperDataset([pos(), pos({ regime: undefined }), pos({ observedSpreadPct: undefined })])
  const by = Object.fromEntries(fieldAvailability(d).map((f) => [f.field, f]))
  assert.equal(by.regime.recorded, 2)
  assert.equal(by.regime.total, 3)
  assert.equal(by.spreadPct.recorded, 2)
  assert.equal(by.volatility.recorded, 0, 'no snapshot was written, so no record carries volatility')
  assert.equal(by.mae.recorded, 0, 'excursions have not been resolved')
})

/**
 * DETERMINISM. The same engine records must produce byte-identical evidence
 * records every time — an attribution that drifts between two reads of the
 * same data is not an attribution.
 */
test('the same records produce identical evidence, run to run', () => {
  const src = [pos(), pos({ direction: 'short' }), rt() as never]
  const a = JSON.stringify(paperDataset(src.slice(0, 2)).records)
  const b = JSON.stringify(paperDataset(src.slice(0, 2)).records)
  assert.equal(a, b)
})

/**
 * THE LAYER CANNOT REACH THE ORDER PATH.
 */
test('the record layer imports nothing that can act', async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { ROOT } = await import('../helpers.ts')
  const src = readFileSync(join(ROOT, 'src', 'analyst', 'records.ts'), 'utf8')
  for (const f of ['live/trader', 'live/orders', 'execution.ts', 'openPosition', 'savePosition', 'riskEngine', 'fusion.ts', 'watch.ts']) {
    assert.equal(src.includes(f), false, `src/analyst/records.ts references "${f}"`)
  }
})
