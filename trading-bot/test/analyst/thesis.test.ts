/**
 * THE FALSIFIABLE THESIS — commit to the number that would prove us wrong.
 *
 * These tests hold three lines. NOT ESTABLISHED is the default and it covers
 * every cohort under the bar, without an interval, or whose interval includes
 * zero — most cohorts, most of the time. The falsification threshold is derived
 * from the observed distribution and the configured research threshold, and
 * the method is printed beside it — never a number somebody liked. And no
 * status, in any state, is spelt "proven".
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PaperPosition } from '../../src/paperTrader.ts'
import { paperDataset } from '../../src/analyst/records.ts'
import { cohort, SAMPLE_BARS } from '../../src/analyst/cohorts.ts'
import { thesisFor, thesesFor, renderThesis } from '../../src/analyst/thesis.ts'
import { tCritical95 } from '../../src/analyst/attribution.ts'
import { config } from '../../config.ts'

let n = 0
function pos(r: number, over: Partial<PaperPosition> = {}): PaperPosition {
  n++
  return {
    id: `p${n}`, openedAt: 1_700_000_000_000 + n * 3_600_000, closedAt: 1_700_000_000_000 + n * 3_600_000 + 60_000,
    dayKey: 'D', session: 'London', setupKey: 'BTCUSDT|5m|silver-bullet|BUY', direction: 'long',
    intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 1, riskUsd: 1, quality: 70, reason: '', atr: 1,
    status: 'closed', exitReason: r > 0 ? 'target' : 'stop', exit: 100 + r, rMultiple: r, pnlUsd: r, feesUsd: 0,
    outcome: r > 0.001 ? 'WIN' : r < -0.001 ? 'LOSS' : 'FLAT', strategyId: 'silver-bullet', regime: 'trending-up', ...over,
  } as PaperPosition
}
const all = (ps: PaperPosition[]) => cohort(paperDataset(ps), { name: 'test cohort', filters: [] })

test('zero trades: NOT ESTABLISHED, nothing observed, nothing to falsify', () => {
  const t = thesisFor(all([]))
  assert.equal(t.status, 'NOT ESTABLISHED')
  assert.equal(t.n, 0)
  assert.match(t.observation, /Nothing is observed/)
  assert.equal(t.falsification, null)
  assert.match(t.wouldFalsify, /no thesis has been formed/i)
})

test('under the sample bar: NOT ESTABLISHED even when every trade won', () => {
  const t = thesisFor(all(Array.from({ length: SAMPLE_BARS.insufficient - 1 }, () => pos(2))))
  assert.equal(t.status, 'NOT ESTABLISHED')
  assert.equal(t.falsification, null)
  assert.match(t.observation, new RegExp(`under the ${SAMPLE_BARS.insufficient}`))
})

test('an interval that includes zero is NOT ESTABLISHED, and says how many trades it would take', () => {
  // Alternating +1.2 / −1 over 20 trades: positive mean, wide interval.
  const t = thesisFor(all(Array.from({ length: 20 }, (_, i) => pos(i % 2 ? -1 : 1.2))))
  assert.equal(t.status, 'NOT ESTABLISHED')
  assert.ok(t.ci95 && t.ci95.lo <= 0 && t.ci95.hi >= 0)
  assert.equal(t.falsification, null)
  assert.match(t.wouldChange[0], /trades would be needed/)
  assert.match(t.wouldFalsify, /consistent with a positive edge, no edge, and a negative one/)
})

test('an interval above zero is OBSERVED POSITIVE, with a derived falsification threshold', () => {
  // 40 trades: +2, +2, −0.5 repeating — mean ≈ +1.17, tight enough to clear zero.
  const ps = Array.from({ length: 40 }, (_, i) => pos(i % 3 === 2 ? -0.5 : 2))
  const c = all(ps)
  const t = thesisFor(c)
  assert.equal(t.status, 'OBSERVED POSITIVE')
  assert.ok(t.falsification)
  const f = t.falsification!
  assert.equal(f.nextTrades, config.replay.minSetupsForConfidence, 'the horizon is the configured research threshold, not an ad-hoc one')
  assert.equal(f.thresholdSource, 'observed distribution × configured research threshold')
  // Recompute the threshold from the printed method: X = μ − t·s/√N.
  const s = c.stats
  const expected = s.meanR! - (tCritical95(f.nextTrades - 1) * s.sdR!) / Math.sqrt(f.nextTrades)
  assert.ok(Math.abs(f.meanThresholdR - expected) < 1e-9)
  assert.ok(f.meanThresholdR < s.meanR!, 'the falsification bar sits below the observed mean')
  assert.match(f.method, /t₉₅\(\d+\) · s \/ √\d+/)
  assert.match(t.wouldFalsify, /produce a mean R below/)
})

test('an interval below zero is OBSERVED NEGATIVE, with the mirror-image threshold', () => {
  const ps = Array.from({ length: 40 }, (_, i) => pos(i % 3 === 2 ? 0.5 : -2))
  const t = thesisFor(all(ps))
  assert.equal(t.status, 'OBSERVED NEGATIVE')
  assert.ok(t.falsification!.meanThresholdR > t.meanR!)
  assert.match(t.wouldFalsify, /produce a mean R above/)
})

test('an explicitly configured horizon is honoured; the source label still says where it came from', () => {
  const ps = Array.from({ length: 40 }, (_, i) => pos(i % 3 === 2 ? -0.5 : 2))
  const t = thesisFor(all(ps), 30)
  assert.equal(t.falsification!.nextTrades, 30)
  assert.match(t.falsification!.method, /√30/)
})

/**
 * NO STATUS, IN ANY STATE, CLAIMS MORE THAN OBSERVATION.
 */
test('no rendering, at any sample, uses "proven", "established", "guaranteed" or "will"', () => {
  const banned = /\b(proven|established as|guaranteed|will (?:make|work|continue)|certain|best strategy)\b/i
  const shapes = [
    [], Array.from({ length: 5 }, () => pos(2)), Array.from({ length: 20 }, (_, i) => pos(i % 2 ? -1 : 1.2)),
    Array.from({ length: 40 }, (_, i) => pos(i % 3 === 2 ? -0.5 : 2)), Array.from({ length: 300 }, (_, i) => pos(i % 3 === 2 ? -0.5 : 2)),
  ]
  for (const ps of shapes) {
    const text = renderThesis(thesisFor(all(ps)))
    assert.equal(banned.test(text), false, text)
    assert.match(text, /NOT CLAIMED:/)
    assert.match(text, /not a forecast/)
  }
})

test('theses are produced for every cohort, NOT ESTABLISHED ones included', () => {
  const ts = thesesFor([all([]), all([pos(1)]), all(Array.from({ length: 40 }, (_, i) => pos(i % 3 === 2 ? -0.5 : 2)))])
  assert.deepEqual(ts.map((t) => t.status), ['NOT ESTABLISHED', 'NOT ESTABLISHED', 'OBSERVED POSITIVE'])
  assert.equal(ts[2].source, 'PAPER')
})
