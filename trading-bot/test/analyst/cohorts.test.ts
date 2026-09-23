/**
 * COHORTS — measurements with their sample size welded on.
 *
 * The line these tests hold: a positive mean on eight trades is INSUFFICIENT
 * DATA and nothing else. No output at any sample size may call a cohort
 * "profitable" or "high edge"; the status labels describe the DATA, and the
 * thresholds are the exported constants so the docs, the UI and this code
 * cannot drift apart. Every cohort carries its provenance and the ids of the
 * trades inside it, so any number on screen can be traced back to its rows.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PaperPosition } from '../../src/paperTrader.ts'
import { paperDataset, backtestDataset } from '../../src/analyst/records.ts'
import {
  SAMPLE_BARS, sampleStatus, describeStatus, cohort, byDimension, crossTable, heatmap, statsOf, matches, valueOf,
  newsBucket, qualityBucket, renderCohort,
} from '../../src/analyst/cohorts.ts'
import type { ReplayTrade } from '../../src/types.ts'

const T0 = Date.UTC(2026, 0, 13, 13, 30)
let n = 0
function pos(r: number, over: Partial<PaperPosition> = {}): PaperPosition {
  n++
  return {
    id: `p${n}`, openedAt: T0 + n * 3_600_000, filledAt: T0 + n * 3_600_000 + 300_000, closedAt: T0 + n * 3_600_000 + 1_800_000,
    dayKey: 'D', session: 'London', setupKey: 'BTCUSDT|5m|silver-bullet|BUY', direction: 'long',
    intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 1, riskUsd: 1, quality: 70, reason: '', atr: 1,
    status: 'closed', exitReason: r > 0 ? 'target' : 'stop', exit: 100 + r, rMultiple: r, pnlUsd: r, feesUsd: 0,
    outcome: r > 0.001 ? 'WIN' : r < -0.001 ? 'LOSS' : 'FLAT', strategyId: 'silver-bullet', regime: 'trending-up',
    ...over,
  } as PaperPosition
}
/** k trades alternating +2R / −1R, in the given session. */
function alternating(k: number, over: Partial<PaperPosition> = {}): PaperPosition[] {
  return Array.from({ length: k }, (_, i) => pos(i % 3 === 2 ? -1 : 2, over))
}

// ---------------------------------------------------------------
// Status labels are about the data, and the thresholds are the constants
// ---------------------------------------------------------------

test('the status is a data-status label driven by the exported bars', () => {
  assert.deepEqual(SAMPLE_BARS, { insufficient: 10, early: 50, developing: 200 }, 'the bars are the documented 0–9 / 10–49 / 50–199 / 200+')
  assert.equal(sampleStatus(0), 'INSUFFICIENT SAMPLE')
  assert.equal(sampleStatus(SAMPLE_BARS.insufficient - 1), 'INSUFFICIENT SAMPLE')
  assert.equal(sampleStatus(SAMPLE_BARS.insufficient), 'EARLY SAMPLE')
  assert.equal(sampleStatus(SAMPLE_BARS.early - 1), 'EARLY SAMPLE')
  assert.equal(sampleStatus(SAMPLE_BARS.early), 'DEVELOPING DATASET')
  assert.equal(sampleStatus(SAMPLE_BARS.developing), 'LARGER DATASET')
  for (const s of ['INSUFFICIENT SAMPLE', 'EARLY SAMPLE', 'DEVELOPING DATASET', 'LARGER DATASET'] as const) {
    assert.match(describeStatus(s), /trades/i)
  }
})

test('a positive mean on eight trades is INSUFFICIENT SAMPLE, and is not called anything else', () => {
  const c = cohort(paperDataset(Array.from({ length: 8 }, () => pos(2))), { name: 'eight winners', filters: [] })
  assert.equal(c.stats.n, 8)
  assert.equal(c.stats.meanR, 2)
  assert.equal(c.stats.status, 'INSUFFICIENT SAMPLE')
  const text = renderCohort(c)
  assert.equal(/profitable|high edge|proven|edge confirmed/i.test(text), false, 'a small positive sample earned a quality word')
  assert.match(text, /Nothing is claimed/)
})

test('no output at any sample size uses a quality word', () => {
  for (const k of [1, 9, 10, 49, 50, 199, 200, 350]) {
    const c = cohort(paperDataset(alternating(k)), { name: `n=${k}`, filters: [] })
    const text = renderCohort(c) + ' ' + c.stats.statusNote
    assert.equal(/\b(profitable|high edge|proven|guaranteed|will make|edge confirmed)\b/i.test(text), false, `n=${k}: ${text}`)
  }
})

// ---------------------------------------------------------------
// Zero, one, tiny, normal
// ---------------------------------------------------------------

test('a cohort with no trades is NOT ENOUGH DATA — never 0% win rate or 0 expectancy', () => {
  const c = cohort(paperDataset([]), { name: 'empty', filters: [] })
  assert.equal(c.stats.n, 0)
  assert.equal(c.stats.meanR, null)
  assert.equal(c.stats.winRate, null)
  assert.equal(c.stats.expectancyR, null)
  assert.equal(c.stats.profitFactor, null)
  assert.equal(c.stats.ci95, null)
  assert.match(renderCohort(c), /NOT ENOUGH DATA/)
  assert.deepEqual(c.recordIds, [])
})

test('one trade has a mean and no interval, no dispersion, no profit factor', () => {
  const c = cohort(paperDataset([pos(1.5)]), { name: 'one', filters: [] })
  assert.equal(c.stats.n, 1)
  assert.equal(c.stats.meanR, 1.5)
  assert.equal(c.stats.medianR, 1.5)
  assert.equal(c.stats.sdR, null)
  assert.equal(c.stats.ci95, null)
  assert.equal(c.stats.profitFactor, null)
  assert.equal(c.stats.winRate, 1)
  assert.equal(c.stats.status, 'INSUFFICIENT SAMPLE')
})

test('a normal cohort reports mean, median, dispersion, interval, drawdown, streak and n together', () => {
  const c = cohort(paperDataset(alternating(60)), { name: 'normal', filters: [] })
  const s = c.stats
  assert.equal(s.n, 60)
  assert.equal(s.status, 'DEVELOPING DATASET')
  assert.ok(s.meanR! > 0.9 && s.meanR! < 1.1, `mean ${s.meanR}`)
  assert.equal(s.medianR, 2)
  assert.ok(s.sdR! > 1.3 && s.sdR! < 1.5, `sd ${s.sdR}`)
  assert.ok(s.ci95 && s.ci95.lo < s.meanR! && s.ci95.hi > s.meanR!)
  assert.equal(s.maxDrawdownR, 1, 'a single −1R after a +2R is a 1R drawdown')
  assert.equal(s.longestLosingStreak, 1)
  assert.ok(s.profitFactor! > 3.9 && s.profitFactor! < 4.1, 'two +2R per −1R is a profit factor of 4')
  assert.equal(s.wins, 40)
  assert.equal(s.losses, 20)
  assert.equal(typeof s.tradesNeeded, 'number')
  // Every number is traceable.
  assert.equal(c.recordIds.length, 60)
  assert.equal(c.provenance.source, 'PAPER')
})

test('the profit factor is withheld under the early-sample bar, where it is two small sums divided', () => {
  const small = statsOf(paperDataset(alternating(SAMPLE_BARS.early - 1)).records)
  assert.equal(small.profitFactor, null)
  const enough = statsOf(paperDataset(alternating(SAMPLE_BARS.early)).records)
  assert.ok(enough.profitFactor !== null)
  assert.match(renderCohort(cohort(paperDataset(alternating(5)), { name: 'x', filters: [] })), new RegExp(`not reported under ${SAMPLE_BARS.early} trades`))
})

// ---------------------------------------------------------------
// Filters, dimensions and cross tables
// ---------------------------------------------------------------

test('filters cut on recorded values, and a cohort carries its provenance and its composition', () => {
  const d = paperDataset([
    ...alternating(12, { session: 'London', strategyId: 'silver-bullet' }),
    ...alternating(12, { session: 'New York AM', strategyId: 'silver-bullet' }),
    ...alternating(12, { session: 'London', strategyId: 'unicorn', setupKey: 'BTCUSDT|5m|unicorn|BUY' }),
  ])
  const c = cohort(d, { name: 'Silver Bullet + London', filters: [{ dimension: 'strategyId', values: ['silver-bullet'] }, { dimension: 'session', values: ['london'] }] })
  assert.equal(c.stats.n, 12)
  assert.equal(c.stats.status, 'EARLY SAMPLE')
  assert.equal(c.provenance.source, 'PAPER')
  assert.deepEqual(c.composition.regime, { 'trending-up': 12 })
  assert.equal('strategyId' in c.composition, false, 'a filtered dimension is not repeated in the composition')
})

test('a dimension table is ordered by sample size, never by result, and leaves unrecorded values out', () => {
  const d = paperDataset([
    ...alternating(3, { session: 'Asia' }),                        // small but every trade wins after alternation? no: 2,2,-1
    ...Array.from({ length: 3 }, () => pos(5, { session: 'Asia' })), // 6 Asia, high mean
    ...alternating(20, { session: 'London' }),
    ...alternating(2, { session: '' }),
  ])
  const t = byDimension(d, 'session')
  assert.deepEqual(t.rows.map((r) => r.name), ['london', 'asia', 'none'])
  assert.ok(t.rows[1].stats.meanR! > t.rows[0].stats.meanR!, 'the smaller bucket has the flattering mean and still sits below')
  assert.equal(t.rows[1].stats.status, 'INSUFFICIENT SAMPLE')
  const reg = byDimension(paperDataset([pos(1), pos(1, { regime: undefined })]), 'regime')
  assert.equal(reg.unrecorded, 1)
  assert.match(reg.note, /carry no recorded regime/)
})

test('includeEmpty lists every known value of a dimension, with zero-trade rows that say so', () => {
  const t = byDimension(paperDataset([pos(1, { session: 'London' })]), 'session', { includeEmpty: true })
  const asia = t.rows.find((r) => r.name === 'asia')!
  assert.equal(asia.stats.n, 0)
  assert.equal(asia.stats.meanR, null)
  assert.match(renderCohort(asia), /NOT ENOUGH DATA/)
})

test('a cross table has a cell for every pair, and a heatmap withholds values under the bar', () => {
  const d = paperDataset([
    ...alternating(15, { session: 'London', strategyId: 'silver-bullet' }),
    ...alternating(4, { session: 'London', strategyId: 'unicorn', setupKey: 'BTCUSDT|5m|unicorn|BUY' }),
    ...alternating(11, { session: 'New York AM', strategyId: 'unicorn', setupKey: 'BTCUSDT|5m|unicorn|BUY' }),
  ])
  const x = crossTable(d, 'session', 'strategyId')
  assert.deepEqual(x.rowKeys, ['london', 'newYork'])
  assert.deepEqual(x.colKeys, ['silver-bullet', 'unicorn'])
  assert.equal(x.cells[0][0].stats.n, 15)
  assert.equal(x.cells[0][1].stats.n, 4)
  assert.equal(x.cells[1][0].stats.n, 0, 'an empty pair is present as a zero-trade cell, not absent')
  const h = heatmap(d, 'session', 'strategyId')
  const tiny = h.cells.find((c) => c.row === 'london' && c.col === 'unicorn')!
  assert.equal(tiny.n, 4)
  assert.equal(tiny.shown, false)
  assert.equal(tiny.meanR, null, 'a cell under the bar has no value for a renderer to colour')
  const ok = h.cells.find((c) => c.row === 'london' && c.col === 'silver-bullet')!
  assert.equal(ok.shown, true)
  assert.ok(ok.meanR !== null)
})

test('buckets for news proximity and checklist quality say "not recorded" rather than defaulting', () => {
  assert.equal(newsBucket(null), 'not recorded')
  assert.equal(newsBucket(10), '≤30 min before')
  assert.equal(newsBucket(60), '30–120 min before')
  assert.equal(newsBucket(500), '>2 h before')
  assert.equal(newsBucket(5, true), 'inside blackout')
  assert.equal(qualityBucket(null), 'not recorded')
  assert.equal(qualityBucket(85), '80–100')
  assert.equal(qualityBucket(10), '<40')
  const r = paperDataset([pos(1, { openedAt: T0 })]).records[0]
  assert.equal(valueOf(r, 'newsBucket'), 'not recorded', 'no snapshot was written, so news proximity is not recorded')
  assert.equal(valueOf(r, 'hourET'), '08:00')
  assert.equal(valueOf(r, 'weekdayET'), 'Tue')
  assert.equal(matches(r, [{ dimension: 'weekdayET', values: ['Tue'] }]), true)
})

test('backtest cohorts carry the BACKTEST stamp through every table', () => {
  const rt = (i: number): ReplayTrade => ({
    index: i, time: T0 + i * 3_600_000, action: 'BUY', intendedEntry: 100, entryPrice: 100, entryTime: T0 + i * 3_600_000 + 300_000,
    exitPrice: 102, exitTime: T0 + i * 3_600_000 + 900_000, exitReason: 'target', costsUsd: 0, pnlPercent: 2, pnlUsd: 2, rMultiple: 2,
    outcome: 'WIN', setupKey: 'BTCUSDT|5m|turtle-soup|BUY', session: 'london', regime: 'ranging',
  } as ReplayTrade)
  const d = backtestDataset(Array.from({ length: 12 }, (_, i) => rt(i)))
  assert.equal(byDimension(d, 'regime').provenance.source, 'BACKTEST')
  assert.equal(crossTable(d, 'session', 'regime').provenance.source, 'BACKTEST')
  assert.equal(heatmap(d, 'session', 'regime').provenance.source, 'BACKTEST')
  assert.match(renderCohort(cohort(d, { name: 'all', filters: [] })), /\[BACKTEST\]/)
})

/**
 * DETERMINISM. Two evaluations of the same dataset must agree to the byte.
 */
test('the same dataset yields identical cohorts every time', () => {
  const src = alternating(40)
  const a = JSON.stringify(byDimension(paperDataset(src), 'session'))
  const b = JSON.stringify(byDimension(paperDataset(src), 'session'))
  assert.equal(a, b)
})
