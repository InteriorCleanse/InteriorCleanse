/**
 * The report ties it together and, above all, tells the truth about sample
 * size: it must label an out-of-sample window that is too small to trust, and
 * it must call out the curve-fitting pattern (good in-sample, dead out-of).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReport, reportLines } from '../../src/backtest/report.ts'
import type { TradeLike } from '../../src/backtest/metrics.ts'
import { config } from '../../config.ts'

const DAY = 86_400_000
function trade(dayIndex: number, r: number): TradeLike {
  return { time: dayIndex * DAY, rMultiple: r, pnlUsd: r * 100, outcome: r > 0 ? 'WIN' : r < 0 ? 'LOSS' : 'FLAT' }
}

test('a report with a thin out-of-sample window says so in its notes', () => {
  // A handful of trades — the OOS slice is far under the confidence threshold.
  const trades = [trade(0, 1), trade(10, 1), trade(20, -1), trade(30, 1), trade(40, -1)]
  const r = buildReport('demo', trades, { walkForward: null })
  const min = config.replay.minSetupsForConfidence
  assert.ok(r.outOfSample.trades < min)
  assert.ok(r.notes.some((n) => n.includes('under the') && n.includes('trust')), 'should flag the small out-of-sample')
})

test('the classic curve-fit — good in-sample, dead out-of-sample — is called out', () => {
  // Wins early (in-sample), losses late (out-of-sample) so the split diverges.
  const trades: TradeLike[] = []
  for (let d = 0; d < 60; d++) trades.push(trade(d, 1)) // in-sample: all wins
  for (let d = 60; d < 80; d++) trades.push(trade(d, 1)) // validation
  for (let d = 80; d < 100; d++) trades.push(trade(d, -1)) // out-of-sample: all losses
  const r = buildReport('overfit', trades, { walkForward: null })
  assert.ok((r.inSample.avgR ?? 0) > 0)
  assert.ok((r.outOfSample.avgR ?? 0) <= 0)
  assert.ok(r.notes.some((n) => n.toLowerCase().includes('curve-fitting')), 'should warn about curve-fitting')
})

test('an empty trade list produces a valid report with a null window', () => {
  const r = buildReport('empty', [], { walkForward: null })
  assert.equal(r.window, null)
  assert.equal(r.all.trades, 0)
  assert.equal(r.outOfSample.trades, 0)
  assert.ok(Array.isArray(r.notes) && r.notes.length > 0)
})

test('the report is deterministic — same trades, identical report', () => {
  const trades = Array.from({ length: 40 }, (_, i) => trade(i, i % 3 === 0 ? -1 : 1))
  const a = buildReport('det', trades, { walkForward: { trainDays: 30, testDays: 10 } })
  const b = buildReport('det', trades, { walkForward: { trainDays: 30, testDays: 10 } })
  assert.deepEqual(a, b)
})

test('reportLines renders every section and marks small samples', () => {
  const trades = [trade(0, 1), trade(5, -1), trade(10, 2)]
  const lines = reportLines(buildReport('demo', trades, { walkForward: null }))
  const text = lines.join('\n')
  assert.ok(text.includes('STRATEGY: demo'))
  assert.ok(text.includes('OUT-OF-SAMPLE'))
  assert.ok(text.includes('Monte Carlo'))
  assert.ok(text.includes('(small sample)'))
})

test('a not-backtestable report quotes no window and carries only the reason', () => {
  const r = buildReport('orderflow-momentum', [], { notBacktestable: 'live tape only' })
  assert.equal(r.notBacktestable, 'live tape only')
  assert.equal(r.all.trades, 0)
  assert.equal(r.outOfSample.trades, 0)
  assert.equal(r.walkForward, null)
  assert.deepEqual(r.notes, ['live tape only'])
  const text = reportLines(r).join('\n')
  assert.ok(text.includes('NOT BACKTESTABLE'))
  assert.ok(!text.includes('OUT-OF-SAMPLE'), 'no window rows for a not-backtestable strategy')
})

test('memory-blocked trades never enter the report', () => {
  const trades: TradeLike[] = [trade(0, 1), { ...trade(1, -9), blockedByMemory: true }]
  const r = buildReport('mem', trades, { walkForward: null })
  assert.equal(r.all.trades, 1)
  assert.equal(r.all.totalR, 1)
})
