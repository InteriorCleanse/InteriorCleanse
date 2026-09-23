/**
 * The locked holdout gate, and the IC/ICIR scoring that feeds the loop.
 *
 * The test that matters most is the overfit one: a genome that looked superb
 * during selection and collapses on fresh data MUST be killed. A gate that only
 * ever passes things is not a gate.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { finalGate, defaultGateCriteria, pValueFromSharpe, renderGate } from '../../src/factory/gate.ts'
import { informationCoefficient, edgeConsistency, edgeDecay, multipleTesting, icirVerdict, bucketByTime, pearson, toScored } from '../../src/factory/ic.ts'
import type { ScoredTrade } from '../../src/factory/ic.ts'
import { computeMetrics } from '../../src/backtest/metrics.ts'
import { monteCarlo } from '../../src/backtest/monteCarlo.ts'
import type { TradeLike } from '../../src/backtest/metrics.ts'
import type { BacktestReport } from '../../src/backtest/report.ts'
import type { Judged } from '../../src/factory/select.ts'
import { genomeId } from '../../src/factory/genome.ts'

const DAY = 86_400_000

function mk(i: number, r: number): TradeLike {
  // pnlUsd, not pnlPercent — TradeLike has no pnlPercent, and the `as TradeLike`
  // cast hid that for as long as the tests went untypechecked.
  return { time: i * DAY, rMultiple: r, pnlUsd: r, outcome: r > 0 ? 'WIN' : r < 0 ? 'LOSS' : 'FLAT' }
}

/** n trades alternating to give a positive mean with real variance. */
function trades(n: number, win: number, loss: number, winEvery = 2): TradeLike[] {
  return Array.from({ length: n }, (_, i) => mk(i, i % winEvery === 0 ? win : loss))
}

function report(selection: TradeLike[], holdout: TradeLike[]): BacktestReport {
  const empty = computeMetrics([])
  return {
    strategy: 't', window: null, all: computeMetrics([...selection, ...holdout]),
    inSample: empty, validation: computeMetrics(selection), outOfSample: computeMetrics(holdout),
    walkForward: null, monteCarlo: monteCarlo([]), notes: [], notBacktestable: null,
  }
}

function judged(params: Record<string, number>, selection: TradeLike[], holdout: TradeLike[]): Judged {
  const genome = { strategyId: 't', params }
  const sel = computeMetrics(selection)
  return {
    id: genomeId(genome), evaluation: { id: genomeId(genome), genome, report: report(selection, holdout) },
    selectionTrades: sel.trades, selectionAvgR: sel.avgR, selectionSharpe: sel.sharpeR,
    enoughTrades: true, positiveOos: true, stable: true, stabilityShare: 1, neighboursTested: 4,
    deflated: { observed: 1, benchmark: 0, probability: 1 }, passedDeflated: true, survived: true, reasons: [],
  } as Judged
}

// ---------------------------------------------------------------
// The gate
// ---------------------------------------------------------------

test('THE ONE THAT MATTERS: an overfit survivor is killed by the locked holdout', () => {
  // Superb during selection, worthless on fresh data — the classic fitted result.
  const selection = trades(60, 2, -0.2)       // strongly positive
  const holdout = trades(60, 0.2, -0.9)       // collapses
  const r = finalGate([judged({ a: 1 }, selection, holdout)], 50)

  assert.equal(r.viable.length, 0, 'an overfit genome must not survive the holdout')
  const v = r.verdicts[0]
  assert.equal(v.viable, false)
  assert.ok((v.selectionAvgR ?? 0) > 0, 'it did look good during selection')
  assert.ok(v.degradation !== null && v.degradation > 0.5, `expectancy should have collapsed, got degradation ${v.degradation}`)
  assert.ok(v.reasons.some((x) => /signature of a fit, not an edge|not positive/.test(x)), v.reasons.join(' | '))
})

test('a thin holdout is refused outright, however good the numbers look', () => {
  const selection = trades(60, 1, -0.5)
  const holdout = trades(4, 5, -0.1) // spectacular, and meaningless
  const r = finalGate([judged({ a: 2 }, selection, holdout)], 10)
  assert.equal(r.viable.length, 0)
  assert.ok(r.verdicts[0].reasons.some((x) => /Only 4 holdout trade\(s\)/.test(x)))
})

test('the multiple-testing correction tightens as the campaign gets bigger', () => {
  const selection = trades(80, 1, -0.5)
  const holdout = trades(80, 1, -0.5) // a genuinely persistent edge

  const few = finalGate([judged({ a: 3 }, selection, holdout)], 2)
  const many = finalGate([judged({ a: 3 }, selection, holdout)], 5000)

  assert.ok(few.multipleTesting.bonferroni > many.multipleTesting.bonferroni, 'more trials must mean a stricter threshold')
  // The same result cannot be more significant merely because more things were tried.
  assert.ok(many.verdicts[0].correctedAlpha < few.verdicts[0].correctedAlpha)
  assert.equal(few.trials, 2)
  assert.equal(many.trials, 5000)
})

test('an edge that holds up on fresh data can pass — the gate is not merely a rejector', () => {
  const selection = trades(120, 1, -0.5)
  const holdout = trades(120, 1, -0.5)
  const r = finalGate([judged({ a: 4 }, selection, holdout)], 5)
  assert.equal(r.verdicts[0].enoughTrades, true)
  assert.equal(r.verdicts[0].heldUp, true, r.verdicts[0].reasons.join(' | '))
  assert.ok(r.verdicts[0].pValue !== null && r.verdicts[0].pValue < 0.05)
})

test('the gate says plainly that passing is not proof of profitability', () => {
  const selection = trades(120, 1, -0.5)
  const r = finalGate([judged({ a: 5 }, selection, trades(120, 1, -0.5))], 3)
  const text = [...r.verdicts.flatMap((v) => v.reasons), r.note].join(' ')
  if (r.viable.length) assert.match(text, /not proof of profitability/i)
  assert.match(renderGate(r).join('\n'), /LOCKED HOLDOUT GATE/)
})

test('an empty survivor list is reported honestly, not as a pass', () => {
  const r = finalGate([], 100)
  assert.equal(r.viable.length, 0)
  assert.match(r.note, /NO survivor cleared|0 of 0/)
})

test('p-value from Sharpe behaves and is bounded', () => {
  assert.equal(pValueFromSharpe(null, 100), null)
  assert.equal(pValueFromSharpe(0.5, 2), null, 'too few trades to say anything')
  assert.equal(pValueFromSharpe(-0.5, 100), 1, 'a negative edge cannot be significant')
  const p = pValueFromSharpe(0.3, 100)
  assert.ok(p !== null && p > 0 && p < 0.01, `expected a small p-value, got ${p}`)
  // Strictly decreasing in sample size for a fixed Sharpe.
  assert.ok((pValueFromSharpe(0.2, 200) as number) < (pValueFromSharpe(0.2, 50) as number))
})

test('defaults come from config, not from magic numbers here', () => {
  const c = defaultGateCriteria()
  assert.ok(c.minHoldoutTrades > 0)
  assert.equal(c.maxDegradation, 0.5)
  assert.ok(c.alpha > 0 && c.alpha < 1)
})

// ---------------------------------------------------------------
// IC / ICIR / decay
// ---------------------------------------------------------------

function scored(n: number, f: (i: number) => { r: number; q: number | null }, stepMs = DAY): ScoredTrade[] {
  return Array.from({ length: n }, (_, i) => {
    const { r, q } = f(i)
    return { time: i * stepMs, rMultiple: r, conviction: q }
  })
}

test('IC detects conviction that genuinely predicts outcome', () => {
  // Quality drives the result, with a little noise on top.
  const good = scored(90, (i) => { const q = 40 + (i % 12) * 5; return { r: (q - 70) / 25 + ((i % 3) - 1) * 0.02, q } })
  const ic = informationCoefficient(good)
  assert.ok(ic.meanIc !== null && ic.meanIc > 0.8, `expected a strong IC, got ${ic.meanIc}`)
  assert.ok(ic.bucketsScored >= 2)
})

test('IC is UNDEFINED, never zero, when conviction has no variance or is absent', () => {
  const flat = scored(60, (i) => ({ r: i % 2 ? 1 : -0.5, q: 80 })) // same score every time
  const none = scored(60, (i) => ({ r: i % 2 ? 1 : -0.5, q: null }))
  assert.equal(informationCoefficient(flat).meanIc, null)
  assert.match(informationCoefficient(flat).note, /undefined here, not zero/)
  assert.equal(informationCoefficient(none).meanIc, null)
  assert.match(informationCoefficient(none).note, /IC is undefined/)
  // But expectancy consistency still works, which is the point of having both.
  assert.ok(edgeConsistency(flat).meanAvgR !== null)
})

test('ICIR verdicts follow the documented bands', () => {
  assert.equal(icirVerdict(0.7), 'STRONG')
  assert.equal(icirVerdict(0.4), 'MODERATE')
  assert.equal(icirVerdict(0.1), 'WEAK')
  assert.equal(icirVerdict(null), 'UNAVAILABLE')
})

test('edge decay refuses to estimate a half-life it cannot support', () => {
  const tiny = scored(8, (i) => ({ r: i % 2 ? 1 : -0.5, q: 70 }))
  const d = edgeDecay(tiny)
  assert.equal(d.halfLifeDays, null)
  assert.match(d.note, /need 20/)

  // Enough trades but a stable edge — no decay to fit.
  const stable = scored(80, (i) => ({ r: i % 2 ? 1 : -0.5, q: 70 }))
  assert.equal(edgeDecay(stable).halfLifeDays, null)
  assert.match(edgeDecay(stable).note, /not declining|not estimated/)
})

test('edge decay sees a genuinely fading edge', () => {
  // Strong early, gone late.
  const fading = scored(80, (i) => ({ r: i < 40 ? (i % 2 ? 2 : -0.2) : (i % 2 ? 0.1 : -0.6), q: 70 }))
  const d = edgeDecay(fading)
  assert.ok(d.firstHalfAvgR !== null && d.secondHalfAvgR !== null)
  assert.ok((d.change as number) < 0, 'the edge should be measured as shrinking')
  assert.ok((d.firstHalfAvgR as number) > (d.secondHalfAvgR as number))
})

test('bucketing is calendar-based, so a quiet stretch shows as a gap not a rebalance', () => {
  const t: ScoredTrade[] = [
    { time: 0, rMultiple: 1, conviction: 50 },
    { time: 1 * DAY, rMultiple: 1, conviction: 50 },
    { time: 100 * DAY, rMultiple: 1, conviction: 50 }, // long silence, then one trade
  ]
  const b = bucketByTime(t, 30 * DAY)
  assert.equal(b.length, 2, 'two occupied buckets, not three evenly-filled ones')
  assert.equal(b[0].trades.length, 2)
  assert.equal(b[1].trades.length, 1)
})

test('pearson refuses degenerate input rather than returning a misleading 0', () => {
  assert.equal(pearson([1, 2], [1, 2]), null, 'too few points')
  assert.equal(pearson([1, 1, 1, 1], [1, 2, 3, 4]), null, 'no variance on one side')
  const r = pearson([1, 2, 3, 4], [2, 4, 6, 8])
  assert.ok(r !== null && Math.abs(r - 1) < 1e-9)
})

test('Bonferroni for 200 trials matches the textbook value', () => {
  const mt = multipleTesting(200, 0.05)
  assert.ok(Math.abs(mt.bonferroni - 0.00025) < 1e-12)
  assert.ok(mt.sidak > mt.bonferroni, 'Šidák is slightly less brutal than Bonferroni')
  assert.match(mt.note, /deflated Sharpe as the primary correction/)
})

test('toScored drops memory-blocked trades and unscored ones', () => {
  const list = toScored([
    { time: 1, rMultiple: 1, quality: 80 },
    { time: 2, rMultiple: null, quality: 80 },
    { time: 3, rMultiple: 1, quality: 80, blockedByMemory: true },
  ] as never)
  assert.equal(list.length, 1)
  assert.equal(list[0].conviction, 80)
})
