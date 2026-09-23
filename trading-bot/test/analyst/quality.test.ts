/**
 * DATA QUALITY — bad data must never quietly become trading evidence.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PaperPosition } from '../../src/paperTrader.ts'
import type { Candle } from '../../src/types.ts'
import { paperDataset } from '../../src/analyst/records.ts'
import { candleQuality, recordQuality, dataQualityReport, THRESHOLDS } from '../../src/analyst/quality.ts'

const STEP = 300_000
const T0 = Date.UTC(2026, 0, 13, 13, 30)
function bars(from: number, count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => ({ openTime: from + i * STEP, closeTime: from + i * STEP + STEP - 1, open: 100, high: 101, low: 99, close: 100, volume: 1 }))
}
let n = 0
function pos(over: Partial<PaperPosition> = {}): PaperPosition {
  n++
  return {
    id: `p${n}`, openedAt: T0 + n * STEP, filledAt: T0 + n * STEP + STEP, closedAt: T0 + n * STEP + 4 * STEP, dayKey: 'D', session: 'London',
    setupKey: 'BTCUSDT|5m|silver-bullet|BUY', direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 1, riskUsd: 1,
    quality: 70, reason: '', atr: 1, status: 'closed', exitReason: 'target', exit: 102, rMultiple: 2, pnlUsd: 2, feesUsd: 0, outcome: 'WIN',
    strategyId: 'silver-bullet', regime: 'ranging', observedSpreadPct: 0.01, ...over,
  } as PaperPosition
}

test('a clean window is OK with every bar present', () => {
  const q = candleQuality(bars(T0, 100), STEP, T0, T0 + 99 * STEP)
  assert.equal(q.expected, 100)
  assert.equal(q.present, 100)
  assert.equal(q.missing, 0)
  assert.equal(q.duplicates, 0)
  assert.deepEqual(q.anomalies, [])
})

test('missing candles are counted as gaps, and over the bar the verdict is DEGRADED', () => {
  const full = bars(T0, 100)
  const holed = full.filter((_, i) => i < 40 || i >= 45) // five missing = 5%
  const q = candleQuality(holed, STEP, T0, T0 + 99 * STEP)
  assert.equal(q.missing, 5)
  assert.equal(q.gaps.length, 1)
  assert.equal(q.gaps[0].bars, 5)
  const r = dataQualityReport({ dataset: paperDataset([pos()]), candles: holed, stepMs: STEP, window: { from: T0, to: T0 + 99 * STEP } })
  assert.equal(r.verdict, 'DEGRADED')
  assert.match(r.note, /^DATA QUALITY: DEGRADED/)
  assert.ok(r.issues.find((i) => i.kind === 'missing-candles' && i.severity === 'degraded'))
  // One missing bar in a hundred is under the 2% bar: a warning, not a downgrade.
  const one = full.filter((_, i) => i !== 50)
  const r1 = dataQualityReport({ dataset: paperDataset([pos()]), candles: one, stepMs: STEP, window: { from: T0, to: T0 + 99 * STEP } })
  assert.equal(r1.verdict, 'OK')
  assert.equal(r1.issues.find((i) => i.kind === 'missing-candles')!.severity, 'warn')
  assert.equal(THRESHOLDS.missingCandleShare, 0.02)
})

test('duplicates and timestamp anomalies are DEGRADED on sight', () => {
  const dup = [...bars(T0, 20), bars(T0, 20)[5]]
  assert.equal(candleQuality(dup, STEP, T0, T0 + 19 * STEP).duplicates, 1)
  const offGrid = [...bars(T0, 20), { openTime: T0 + 7 * STEP + 60_000, closeTime: T0 + 8 * STEP - 1, open: 100, high: 101, low: 99, close: 100, volume: 1 }]
  const q = candleQuality(offGrid, STEP, T0, T0 + 19 * STEP)
  assert.ok(q.anomalies.some((a) => /off the 5-minute grid/.test(a.reason)))
  const badPrice = bars(T0, 20).map((c, i) => (i === 3 ? { ...c, high: 98 } : c))
  assert.ok(candleQuality(badPrice, STEP, T0, T0 + 19 * STEP).anomalies.some((a) => /high\/low do not contain/.test(a.reason)))
  const r = dataQualityReport({ dataset: paperDataset([pos()]), candles: dup, stepMs: STEP, window: { from: T0, to: T0 + 19 * STEP } })
  assert.equal(r.verdict, 'DEGRADED')
})

test('a stale feed degrades the verdict; an unknown feed age does not', () => {
  const ok = dataQualityReport({ dataset: paperDataset([pos()]), candles: bars(T0, 10), stepMs: STEP, window: { from: T0, to: T0 + 9 * STEP }, feed: { ageSec: 30, maxAgeSec: 900 } })
  assert.equal(ok.verdict, 'OK')
  assert.equal(ok.feed.stale, false)
  const stale = dataQualityReport({ dataset: paperDataset([pos()]), candles: bars(T0, 10), stepMs: STEP, window: { from: T0, to: T0 + 9 * STEP }, feed: { ageSec: 5000, maxAgeSec: 900 } })
  assert.equal(stale.verdict, 'DEGRADED')
  const unknown = dataQualityReport({ dataset: paperDataset([pos()]), candles: bars(T0, 10), stepMs: STEP, window: { from: T0, to: T0 + 9 * STEP }, feed: { ageSec: null, maxAgeSec: 900 } })
  assert.equal(unknown.feed.stale, null)
})

test('record quality counts corrupt, incomplete and unrecorded fields; corrupt is DEGRADED, missing snapshot is a warning', () => {
  const d = paperDataset([
    pos(), pos({ regime: undefined }), pos({ id: '' }), pos({ exit: undefined, rMultiple: undefined }),
    pos({ exitReason: 'missed', filledAt: undefined, rMultiple: 0, pnlUsd: 0 }),
  ])
  const q = recordQuality(d)
  assert.equal(q.total, 5)
  assert.equal(q.corrupt, 1)
  assert.equal(q.missed, 1)
  assert.equal(q.trades, 3)
  assert.equal(q.incomplete, 1)
  assert.equal(q.missingRegime, 1)
  assert.equal(q.missingSnapshot, 3, 'none of these fixtures carry a decision-time snapshot')
  assert.equal(q.unresolvedExcursions, 3)
  const r = dataQualityReport({ dataset: d, candles: [], stepMs: STEP, window: null })
  assert.equal(r.verdict, 'DEGRADED')
  assert.equal(r.issues.find((i) => i.kind === 'corrupt-record')!.severity, 'degraded')
  assert.equal(r.issues.find((i) => i.kind === 'missing-snapshot')!.severity, 'warn')
})

test('most trades missing a regime is DEGRADED; a minority is a warning', () => {
  const mostly = paperDataset([pos({ regime: undefined }), pos({ regime: undefined }), pos()])
  assert.equal(dataQualityReport({ dataset: mostly, candles: [], stepMs: STEP, window: null }).issues.find((i) => i.kind === 'missing-regime')!.severity, 'degraded')
  const few = paperDataset([pos({ regime: undefined }), pos(), pos()])
  assert.equal(dataQualityReport({ dataset: few, candles: [], stepMs: STEP, window: null }).issues.find((i) => i.kind === 'missing-regime')!.severity, 'warn')
})

test('an empty dataset is OK with no records, not DEGRADED for being empty', () => {
  const r = dataQualityReport({ dataset: paperDataset([]), candles: [], stepMs: STEP })
  assert.equal(r.verdict, 'OK')
  assert.match(r.note, /No records in this dataset/)
  assert.equal(r.candles.expected, 0)
})
