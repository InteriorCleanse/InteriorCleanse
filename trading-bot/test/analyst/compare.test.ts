/**
 * PAPER VS BACKTEST — the two never confused, the difference never over-read.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PaperPosition } from '../../src/paperTrader.ts'
import type { ReplayTrade } from '../../src/types.ts'
import { paperDataset, backtestDataset } from '../../src/analyst/records.ts'
import { comparePaperToBacktest, renderComparison } from '../../src/analyst/compare.ts'
import { SAMPLE_BARS } from '../../src/analyst/cohorts.ts'

const T0 = Date.UTC(2026, 0, 13, 13, 30)
let n = 0
function pos(r: number): PaperPosition {
  n++
  return {
    id: `p${n}`, openedAt: T0 + n * 3_600_000, filledAt: T0 + n * 3_600_000 + 300_000, closedAt: T0 + n * 3_600_000 + 900_000,
    dayKey: 'D', session: 'London', setupKey: 'BTCUSDT|5m|silver-bullet|BUY', direction: 'long',
    intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 1, riskUsd: 1, quality: 70, reason: '', atr: 1,
    status: 'closed', exitReason: r > 0 ? 'target' : 'stop', exit: 100 + r, rMultiple: r, pnlUsd: r, feesUsd: 0,
    outcome: r > 0.001 ? 'WIN' : r < -0.001 ? 'LOSS' : 'FLAT', strategyId: 'silver-bullet', regime: 'trending-up',
  } as PaperPosition
}
function rt(r: number): ReplayTrade {
  n++
  return {
    index: n, time: T0 + n * 3_600_000, action: 'BUY', intendedEntry: 100, entryPrice: 100, entryTime: T0 + n * 3_600_000 + 300_000,
    exitPrice: 100 + r, exitTime: T0 + n * 3_600_000 + 900_000, exitReason: r > 0 ? 'target' : 'stop', costsUsd: 0, pnlPercent: r, pnlUsd: r, rMultiple: r,
    outcome: r > 0.001 ? 'WIN' : r < -0.001 ? 'LOSS' : 'FLAT', setupKey: 'BTCUSDT|5m|silver-bullet|BUY', session: 'london', regime: 'trending-up',
  } as ReplayTrade
}
const seq = (k: number, hi: number, lo: number) => Array.from({ length: k }, (_, i) => (i % 3 === 2 ? lo : hi))

test('zero paper trades: INSUFFICIENT SAMPLE, the backtest column still shows, the paper column says nothing', () => {
  const c = comparePaperToBacktest(paperDataset([]), backtestDataset(seq(30, 2, -1).map(rt)))
  assert.equal(c.verdict, 'INSUFFICIENT SAMPLE')
  assert.equal(c.deltaR, null)
  assert.match(c.note, /No paper trades yet/)
  const trades = c.rows.find((r) => r.metric === 'Trades')!
  assert.equal(trades.backtest, '30')
  assert.equal(trades.paper, '0')
  const mean = c.rows.find((r) => r.metric === 'Mean R')!
  assert.equal(mean.paper, '—', 'no paper mean is shown as a dash, never as zero')
  assert.match(c.rows.find((r) => r.metric === 'Data type')!.backtest, /SIMULATED/)
  assert.match(c.rows.find((r) => r.metric === 'Data type')!.paper, /LIVE MARKET/)
})

test('the sides cannot be swapped or mixed', () => {
  const p = paperDataset([pos(1)]), b = backtestDataset([rt(1)])
  assert.throws(() => comparePaperToBacktest(b as never, p as never), /paper side must be a PAPER dataset/)
  assert.throws(() => comparePaperToBacktest(p, p as never), /backtest side must be a BACKTEST dataset/)
})

test('under the per-side bar on either side, the verdict is INSUFFICIENT SAMPLE and says which side is short', () => {
  const c = comparePaperToBacktest(paperDataset(seq(SAMPLE_BARS.insufficient - 1, 2, -1).map(pos)), backtestDataset(seq(40, 2, -1).map(rt)))
  assert.equal(c.verdict, 'INSUFFICIENT SAMPLE')
  assert.match(c.note, new RegExp(`Paper has ${SAMPLE_BARS.insufficient - 1} and the backtest has 40`))
  assert.equal(c.thresholds.minPerSide, SAMPLE_BARS.insufficient)
})

test('the same distribution on both sides is ALIGNED, with an interval that includes zero', () => {
  const c = comparePaperToBacktest(paperDataset(seq(45, 2, -1).map(pos)), backtestDataset(seq(45, 2, -1).map(rt)))
  assert.equal(c.verdict, 'ALIGNED')
  assert.ok(Math.abs(c.deltaR!) < 1e-9)
  assert.ok(c.ci95!.lo < 0 && c.ci95!.hi > 0)
  assert.match(c.note, /consistent with each other at this sample/)
})

test('a large measured gap is DIFFERENT — with direction, and with no cause asserted', () => {
  const c = comparePaperToBacktest(paperDataset(seq(45, 0.2, -1).map(pos)), backtestDataset(seq(45, 2, -1).map(rt)))
  assert.equal(c.verdict, 'DIFFERENT')
  assert.ok(c.deltaR! < 0, 'paper below the backtest, as a signed number')
  assert.ok(c.ci95!.hi < 0)
  assert.equal(/degrad|improv|broken|failed/i.test(c.note), false, 'DIFFERENT must not be dressed as a diagnosis')
  assert.match(c.note, /its cause is not asserted/)
})

test('the rendering prints both provenance labels and every caveat', () => {
  const text = renderComparison(comparePaperToBacktest(paperDataset(seq(12, 2, -1).map(pos)), backtestDataset(seq(12, 2, -1).map(rt)), { assumptions: { backtest: 'spread 5bp / slip 3bp / fee 0.1%', paper: 'live book, slip 3bp assumed' } }))
  assert.match(text, /BACKTEST: SOURCE: BACKTEST · DATA TYPE: SIMULATED/)
  assert.match(text, /PAPER:    SOURCE: PAPER · DATA TYPE: LIVE MARKET \/ SIMULATED EXECUTION/)
  assert.match(text, /Execution assumptions\s+spread 5bp/)
  assert.match(text, /Neither is real-money performance/)
})
