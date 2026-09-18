/**
 * ATTRIBUTION — the honesty of the error bars is the feature.
 *
 * The failure this module exists to prevent is a real one and it is everywhere:
 *
 *     London   avgR +0.41   (3 trades)
 *     New York avgR +0.08   (37 trades)
 *
 * Printed like that, a person concludes London is the edge and starts trading
 * only London. It is not a finding — three trades cannot distinguish +0.41R from
 * losing money. These tests hold the line that makes the module worth having: a
 * small bucket must REFUSE to claim, a wide interval must say so, and a gap
 * inside the noise must be reported as noise no matter how large it looks.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PaperPosition } from '../../src/paperTrader.ts'
import {
  tCritical95, sampleSd, meanWithInterval, tradesNeededToDecide,
  attributeBy, compareBuckets, attributionReport, renderAttribution, MIN_BUCKET_TRADES,
} from '../../src/analyst/attribution.ts'

let n = 0
/** A closed paper trade with a given R in a given session. */
function trade(rMultiple: number, over: Partial<PaperPosition> = {}): PaperPosition {
  n++
  return {
    id: `t${n}`, openedAt: 1_700_000_000_000 + n * 60_000, dayKey: 'D', session: 'London', setupKey: 'K',
    direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 1,
    riskUsd: 1, quality: 70, reason: '', atr: 1, status: 'closed', exitReason: 'target',
    rMultiple, pnlUsd: rMultiple, feesUsd: 0, closedAt: 1_700_000_000_000 + n * 120_000,
    ...over,
  } as PaperPosition
}

// ---------------------------------------------------------------
// The statistics
// ---------------------------------------------------------------

test('the t critical value is used, not the flattering normal one', () => {
  // At 2 degrees of freedom the interval is nearly twice as wide as the normal
  // would make it. Using 1.96 everywhere is the single easiest way to make a
  // small sample look conclusive.
  assert.equal(tCritical95(2), 4.303)
  assert.equal(tCritical95(9), 2.262)
  assert.equal(tCritical95(30), 2.042)
  assert.ok(tCritical95(200) < 2.042 && tCritical95(200) > 1.96, 'large samples should converge toward 1.96')
  assert.ok(tCritical95(5) > tCritical95(25), 'fewer trades must always mean a wider interval')
})

test('the standard deviation needs two points and says so instead of returning zero', () => {
  assert.equal(sampleSd([]), null)
  assert.equal(sampleSd([1]), null, 'one trade has no spread — zero would claim certainty')
  assert.ok(Math.abs(sampleSd([1, 3])! - Math.SQRT2) < 1e-9)
})

test('an interval on one trade is refused rather than drawn as a point', () => {
  const one = meanWithInterval([2])
  assert.equal(one.mean, 2)
  assert.equal(one.ci95, null, 'a single trade must not produce an interval')
})

test('more trades narrow the interval, which is the whole point', () => {
  const few = meanWithInterval([1, -1, 1, -1])
  const many = meanWithInterval(Array.from({ length: 80 }, (_, i) => (i % 2 ? 1 : -1)))
  assert.ok(few.ci95 && many.ci95)
  const widthFew = few.ci95!.hi - few.ci95!.lo
  const widthMany = many.ci95!.hi - many.ci95!.lo
  assert.ok(widthMany < widthFew / 3, `80 trades should be far tighter than 4 (${widthMany} vs ${widthFew})`)
})

test('the sample size needed is quoted, and no sample size rescues an edge of zero', () => {
  assert.ok(tradesNeededToDecide(0.1, 1)! > tradesNeededToDecide(0.5, 1)!, 'a smaller edge needs more trades')
  assert.equal(tradesNeededToDecide(0, 1), null, 'an edge of nothing cannot be proven by waiting')
  assert.equal(tradesNeededToDecide(0.5, 0), null)
})

// ---------------------------------------------------------------
// The thing this exists to prevent
// ---------------------------------------------------------------

test('a three-trade bucket REFUSES to claim a result, however good it looks', () => {
  const closed = [trade(2.0), trade(1.5), trade(1.2)]
  const [b] = attributeBy(closed, (p) => p.session)
  assert.equal(b.trades, 3)
  assert.ok(b.avgR! > 1.5, 'the average really is high')
  assert.equal(b.verdict, 'TOO FEW', 'but three trades may not state a result')
  assert.match(b.note, /no result is claimed/i)
})

test('a big sample of coin flips is reported as inconclusive, not as a small edge', () => {
  // +1 / −1 alternating: a true mean of zero with a lot of spread.
  const closed = Array.from({ length: 40 }, (_, i) => trade(i % 2 ? 1 : -1))
  const [b] = attributeBy(closed, (p) => p.session)
  assert.equal(b.verdict, 'INCONCLUSIVE')
  assert.ok(b.ci95!.lo < 0 && b.ci95!.hi > 0, 'the interval must straddle zero')
  assert.match(b.note, /straddles zero/)
})

test('a genuinely losing bucket is called losing, not unlucky', () => {
  const closed = Array.from({ length: 30 }, () => trade(-0.9))
  const [b] = attributeBy(closed, (p) => p.session)
  assert.equal(b.verdict, 'NEGATIVE')
  assert.match(b.note, /losing, not unlucky/)
})

test('a large consistent edge is allowed to be called positive', () => {
  // The module must not be so cautious that it can never say anything.
  const closed = Array.from({ length: 30 }, (_, i) => trade(i % 5 === 0 ? 0.6 : 1.1))
  const [b] = attributeBy(closed, (p) => p.session)
  assert.equal(b.verdict, 'POSITIVE')
  assert.ok(b.ci95!.lo > 0)
})

test('buckets sort by sample size, so a lucky small one never tops the page', () => {
  const closed = [
    ...Array.from({ length: 25 }, () => trade(0.05, { session: 'New York' })),
    ...Array.from({ length: 3 }, () => trade(3.0, { session: 'London' })),
  ]
  const buckets = attributeBy(closed, (p) => p.session)
  assert.equal(buckets[0].key, 'New York', 'the bigger sample comes first even though it earned less per trade')
  assert.equal(buckets[1].verdict, 'TOO FEW')
})

// ---------------------------------------------------------------
// Comparisons
// ---------------------------------------------------------------

test('a large-looking gap between two noisy buckets is reported as noise', () => {
  const aRs = Array.from({ length: 12 }, (_, i) => (i % 2 ? 2.5 : -2.0))   // mean ~+0.25, huge spread
  const bRs = Array.from({ length: 12 }, (_, i) => (i % 2 ? 2.0 : -2.0))   // mean ~0
  const [a] = attributeBy(aRs.map((r) => trade(r, { session: 'A' })), (p) => p.session)
  const [b] = attributeBy(bRs.map((r) => trade(r, { session: 'B' })), (p) => p.session)
  const c = compareBuckets(a, b, aRs, bRs)
  assert.equal(c.verdict, 'INDISTINGUISHABLE')
  assert.match(c.note, /inside the noise/)
})

test('a comparison against a tiny bucket refuses rather than guessing', () => {
  const aRs = Array.from({ length: 20 }, () => 0.5)
  const bRs = [2.0, 1.0]
  const [a] = attributeBy(aRs.map((r) => trade(r, { session: 'A' })), (p) => p.session)
  const [b] = attributeBy(bRs.map((r) => trade(r, { session: 'B' })), (p) => p.session)
  const c = compareBuckets(a, b, aRs, bRs)
  assert.equal(c.verdict, 'TOO FEW')
  assert.equal(c.ci95, null)
  assert.match(c.note, new RegExp(String(MIN_BUCKET_TRADES)))
})

// ---------------------------------------------------------------
// The report
// ---------------------------------------------------------------

test('with no trades it says there is nothing to attribute, and invents nothing', () => {
  const r = attributionReport([])
  assert.equal(r.trades, 0)
  for (const d of r.dimensions) {
    assert.deepEqual(d.buckets, [], `${d.name} invented a bucket from no data`)
    assert.deepEqual(d.comparisons, [])
  }
  const text = renderAttribution(r)
  assert.match(text, /No paper trades yet/)
  assert.match(text, /correct thing for it to do/)
})

test('a missed order is never counted as a trade', () => {
  const closed = [trade(1), trade(1), trade(0, { exitReason: 'missed', rMultiple: 0 })]
  const r = attributionReport(closed)
  assert.equal(r.trades, 2, 'a missed order was not a trade and must not dilute the attribution')
})

test('the report states how many comparisons were run and what that costs', () => {
  const closed = [
    ...Array.from({ length: 14 }, (_, i) => trade(i % 2 ? 1 : -0.8, { session: 'London' })),
    ...Array.from({ length: 14 }, (_, i) => trade(i % 2 ? 1 : -0.9, { session: 'New York' })),
  ]
  const r = attributionReport(closed)
  assert.ok(r.multipleComparisons.tests >= 1)
  assert.ok(r.multipleComparisons.correctedAlpha <= 0.05)
  assert.match(renderAttribution(r), /MULTIPLE COMPARISONS/)
})

test('the caveats name the specific ways these numbers mislead', () => {
  const r = attributionReport([trade(1)])
  const joined = r.caveats.join(' ')
  assert.match(joined, /validation data, not a target to tune against/i)
  assert.match(joined, /independent/i, 'clustered trades break the interval maths and that must be said')
  assert.match(joined, /Nothing here predicts the next trade/i)
})
