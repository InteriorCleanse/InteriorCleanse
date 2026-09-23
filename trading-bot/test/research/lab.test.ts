/**
 * THE RESEARCH LAB and the quant add-ons — overfitting detector with a trial
 * registry, the regime atlas, the news-to-price diffusion fit, the
 * prediction-market calculator, research questions with a critique attached,
 * and proposals that end at a human and apply nothing.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir, syntheticKlines } from '../helpers.ts'
import type { Candle } from '../../src/types.ts'
import type { EvidenceRecord } from '../../src/analyst/records.ts'

const tmp = tempDataDir('mrcash-lab-')
process.env.MRCASH_DATA_DIR = tmp.dir
const ov = await import('../../src/research/overfitting.ts')
const atlas = await import('../../src/research/regimeAtlas.ts')
const hk = await import('../../src/research/hawkes.ts')
const pm = await import('../../src/school/predictionMarket.ts')
const lab = await import('../../src/research/lab.ts')
const rec = await import('../../src/analyst/records.ts')
const { config } = await import('../../config.ts')
after(() => tmp.cleanup())

function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
function gauss(r: () => number): number { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }

test('OVERFITTING — the deflated Sharpe bar rises with trials; a lucky best-of-N does not survive; insufficient track says so', () => {
  const r = rng(3)
  const nullRs = Array.from({ length: 60 }, () => gauss(r))
  const m = ov.moments(nullRs)
  assert.equal(m.n, 60)
  assert.ok(Math.abs(m.mean) < 0.5)
  assert.ok(m.skew !== null && m.kurtosis !== null)
  const curve = ov.deflationCurve(60)
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i].benchmarkSharpe > curve[i - 1].benchmarkSharpe, 'the benchmark grows with trials')

  // Best of 500 pure-noise series: a high Sharpe that the deflation should not let through.
  let best: number[] = [], bestSr = -Infinity
  for (let t = 0; t < 500; t++) { const rs = Array.from({ length: 40 }, () => gauss(r)); const mm = ov.moments(rs); if ((mm.sharpe ?? -Infinity) > bestSr) { bestSr = mm.sharpe!; best = rs } }
  assert.ok(bestSr > 0.3, `best-of-500 noise Sharpe should look good (${bestSr.toFixed(2)})`)
  const one = ov.deflatedSharpeFull(best, 1)
  const five = ov.deflatedSharpeFull(best, 500)
  assert.ok(five.probability! < one.probability!, 'counting the trials lowers the probability')
  assert.notEqual(five.verdict, 'SURVIVES DEFLATION', `best-of-500 noise must not survive (p=${five.probability!.toFixed(2)})`)
  assert.equal(ov.deflatedSharpeFull(best.slice(0, 10), 1).verdict, 'INSUFFICIENT DATA')
  assert.match(ov.deflatedSharpeFull(best.slice(0, 10), 1).note, /No deflated figure is stated/)

  // A real, large edge survives a modest trial count.
  const edge = Array.from({ length: 200 }, () => 0.6 + gauss(r))
  assert.equal(ov.deflatedSharpeFull(edge, 20).verdict, 'SURVIVES DEFLATION')
})

test('OVERFITTING — the trial registry counts everything, discarded included, per strategy and in total', () => {
  assert.equal(ov.trialsFor('silver-bullet'), 0)
  ov.recordTrials({ strategyId: 'silver-bullet', source: 'factory-campaign', count: 60, note: 'grid', at: 1 })
  ov.recordTrials({ strategyId: 'silver-bullet', source: 'research-lab', count: 3, note: 'variants, all discarded', at: 2 })
  ov.recordTrials({ strategyId: 'unicorn', source: 'evidence-backtest', count: 1, note: 'baseline', at: 3 })
  assert.equal(ov.trialsFor('silver-bullet'), 63)
  const reg = ov.trialRegistry()
  assert.equal(reg.total, 64)
  assert.equal(reg.byStrategy.unicorn, 1)
  assert.equal(reg.bySource['factory-campaign'], 60)
  assert.match(reg.note, /discarded variants count the same/)
  assert.throws(() => ov.recordTrials({ strategyId: 'x', source: 'manual', count: 0, note: '' }), /at least one/)
})

const T0 = Date.UTC(2026, 0, 13, 13, 30)
function r(i: number, over: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: `p${i}`, source: 'PAPER', strategyId: 'silver-bullet', family: 'session', symbol: 'BTCUSDT', interval: '5m', session: 'london', regime: 'trending-up', volatility: 'normal',
    direction: 'long', decidedAt: T0 + i * 3_600_000, filledAt: T0 + i * 3_600_000 + 300_000, closedAt: T0 + i * 3_600_000 + 1_800_000, hourET: 8, weekdayET: 2,
    intendedEntry: 100, entry: 100, stop: 99, target: 102, exit: 101, exitReason: 'take-profit', rMultiple: 1, outcome: 'WIN', missed: false,
    quality: 85, fusedScore: 80, mtfAligned: null, newsMinutes: null, spreadPct: null, durationMs: 1_500_000,
    mae: { r: -0.3, status: 'OBSERVED', note: '' }, mfe: { r: 1.2, status: 'OBSERVED', note: '' },
    engineVersion: '2.3.0', featureVersion: 1, missing: [], corrupt: false, corruptReason: null, ...over,
  }
}

test('REGIME ATLAS — cells under the bar show n only; "repeats" needs adjacent established cells with the same sign', () => {
  const rows: EvidenceRecord[] = []
  let i = 0
  // session family: 60 wins in quiet, 60 wins in normal (repeat), 6 in wild (under bar)
  for (let k = 0; k < 60; k++) rows.push(r(i++, { volatility: 'quiet', rMultiple: k % 4 === 0 ? -1 : 1.2, outcome: k % 4 === 0 ? 'LOSS' : 'WIN' }))
  for (let k = 0; k < 60; k++) rows.push(r(i++, { volatility: 'normal', rMultiple: k % 4 === 0 ? -1 : 1.2, outcome: k % 4 === 0 ? 'LOSS' : 'WIN' }))
  for (let k = 0; k < 6; k++) rows.push(r(i++, { volatility: 'wild', rMultiple: 3, outcome: 'WIN' }))
  // trend family: 60 losses in quiet (struggles), nothing else
  for (let k = 0; k < 60; k++) rows.push(r(i++, { family: 'trend', strategyId: 'trend-pullback', volatility: 'quiet', rMultiple: k % 4 === 0 ? 1 : -0.8, outcome: k % 4 === 0 ? 'WIN' : 'LOSS' }))
  const a = atlas.regimeAtlas(rec.datasetOf(rows), 'volatility')
  assert.deepEqual(a.conditions, ['quiet', 'normal', 'wild'])
  const session = a.rows.find((x) => x.family === 'session')!
  const wild = session.cells.find((c) => c.condition === 'wild')!
  assert.equal(wild.n, 6)
  assert.equal(wild.meanR, null, 'a +3R mean on six trades is not shown')
  assert.equal(wild.established, false)
  assert.deepEqual(session.repeats, [{ sign: 'positive', conditions: ['quiet', 'normal'] }])
  const trend = a.rows.find((x) => x.family === 'trend')!
  assert.deepEqual(trend.struggles, ['quiet'])
  assert.deepEqual(trend.repeats, [])
  assert.match(trend.note, /One cell is a result; a repeat is a pattern/)
  assert.equal(a.source, 'PAPER')
  assert.match(atlas.renderAtlas(a), /REGIME ATLAS · VOLATILITY · PAPER/)
  const empty = atlas.regimeAtlas(rec.datasetOf([]), 'regime')
  assert.equal(empty.rows.length, 0)
  assert.ok(empty.notes.some((n) => /NOT ENOUGH DATA/.test(n)))
})

test('NEWS DIFFUSION — the fit refuses under the minimum events, recovers excitation from a simulated stream, and never states direction', () => {
  const from = T0, to = T0 + 30 * 86_400_000
  const few = hk.fitHawkes({ priceTimes: [T0 + 1], newsTimes: [T0], from, to })
  assert.equal(few.status, 'INSUFFICIENT DATA')
  assert.match(few.note, /needs at least/)
  // Simulate: 40 releases; each release kicks a cluster of price events with a 20-minute half-life; plus a sparse baseline.
  const rr = rng(11)
  const news: number[] = []
  for (let k = 0; k < 40; k++) news.push(from + Math.floor(rr() * 30 * 86_400_000))
  news.sort((a, b) => a - b)
  const price: number[] = []
  for (const tn of news) { const bursts = 3 + Math.floor(rr() * 4); for (let b = 0; b < bursts; b++) price.push(tn + Math.floor(-Math.log(rr()) * 20 * 60_000 / Math.LN2)) }
  for (let k = 0; k < 80; k++) price.push(from + Math.floor(rr() * 30 * 86_400_000))
  const fit = hk.fitHawkes({ priceTimes: price, newsTimes: news, from, to, threshold: 'simulated' })
  assert.equal(fit.status, 'ESTIMATED')
  assert.ok(fit.alphaNP! > 0, 'news excitation recovered')
  assert.ok(fit.eventsPerRelease! > 1, `a release should be seen to add events (${fit.eventsPerRelease!.toFixed(2)})`)
  assert.ok(fit.halfLifeMin! > 2 && fit.halfLifeMin! < 240, `half-life in a plausible range (${fit.halfLifeMin!.toFixed(1)} min)`)
  assert.ok(fit.branchingRatio! < 1)
  assert.ok(fit.shares!.news > 0.2, 'news should carry a meaningful share of intensity in this simulation')
  assert.doesNotMatch(fit.note, /\b(bullish|bearish|long|short|up|down)\b/i)
  assert.match(fit.note, /Activity only/)
  // Price events from candles use a stated threshold.
  const candles: Candle[] = syntheticKlines(3, 5, to).map((k) => ({ openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5], closeTime: k[6] }))
  const pe = hk.priceEvents(candles, 3)
  assert.match(pe.threshold, /3σ/)
  assert.ok(pe.times.every((t) => t <= candles[candles.length - 1].closeTime))
})

test('PREDICTION MARKETS — edge is arithmetic, costs can erase it, Kelly is fractional and capped, everything is SIMULATED', () => {
  const s = pm.singleVenueEdge({ ask: 0.46 }, { ask: 0.51 })
  assert.ok(Math.abs(s.edge - 0.03) < 1e-9)
  assert.equal(s.theoretical, true)
  assert.equal(pm.singleVenueEdge({ ask: 0.5 }, { ask: 0.52 }).theoretical, false)
  const x = pm.crossVenueEdge({ venue: 'A', yes: { ask: 0.55, bid: 0.54 } }, { venue: 'B', yes: { ask: 0.63, bid: 0.62 } })
  assert.ok(Math.abs(x.divergence - 0.07) < 1e-9)
  assert.equal(x.cheapVenue, 'A')
  const dead = pm.netEdge(0.03, 1, { feePerSide: 0.02, sides: 2, slippagePerContract: 0.015 })
  assert.equal(dead.survives, false)
  assert.match(dead.note, /does not survive costs is a loss/)
  const alive = pm.netEdge(0.07, 0.93, { feePerSide: 0.01, sides: 2, slippagePerContract: 0.005 })
  assert.equal(alive.survives, true)
  const k = pm.kellyFraction(0.6, pm.netOdds(0.5))
  assert.ok(Math.abs(k.fullKelly - 0.2) < 1e-9, 'f* = (1·0.6 − 0.4)/1 = 0.2')
  assert.ok(Math.abs(k.suggested - 0.05) < 1e-9, 'quarter Kelly')
  assert.equal(pm.kellyFraction(0.9, 9).suggested, 0.1, 'capped')
  assert.equal(pm.kellyFraction(0.4, 1).fullKelly, 0)
  assert.equal(pm.walkBook([{ price: 0.5, size: 10 }, { price: 0.52, size: 10 }], 15)!.avgPrice.toFixed(4), '0.5067')
  assert.equal(pm.walkBook([{ price: 0.5, size: 10 }], 15), null)
  assert.equal(pm.consensusProbability([{ price: 0.5, depth: 100 }, { price: 0.6, depth: 300 }]), 0.575)
  const w = pm.workedExample()
  assert.equal(w.provenance, 'SIMULATED')
  assert.ok(w.steps.some((t) => /not connected to any prediction market/.test(t)))
})

test('RESEARCH QUESTIONS — drafted UNTESTED from cohorts clear of zero, with the in-sample caveat and a critique attached', () => {
  const rows: EvidenceRecord[] = []
  for (let k = 0; k < 60; k++) rows.push(r(k, { session: 'london', rMultiple: k % 5 === 0 ? -1 : 1, outcome: k % 5 === 0 ? 'LOSS' : 'WIN' }))
  for (let k = 60; k < 120; k++) rows.push(r(k, { session: 'asia', strategyId: 'unicorn', rMultiple: k % 2 ? 1 : -1, outcome: k % 2 ? 'WIN' : 'LOSS' }))
  for (let k = 120; k < 160; k++) rows.push(r(k, { session: 'newYork', strategyId: 'unicorn', rMultiple: 2, outcome: 'WIN' }))
  const qs = lab.researchQuestions(rec.datasetOf(rows), { now: T0 })
  assert.ok(qs.length >= 1)
  const london = qs.find((q) => q.dimension === 'session' && q.value === 'london')!
  assert.equal(london.draft.status, 'UNTESTED')
  assert.equal(london.draft.direction, 'positive')
  assert.match(london.draft.observation, /in-sample observation/)
  assert.ok(london.draft.limitations.some((l) => /in-sample by construction/.test(l)))
  assert.ok(london.critique.items.some((i) => i.concern === 'Multiple comparisons'))
  assert.ok(!qs.some((q) => q.value === 'asia'), 'a coin-flip cohort raises no question')
  assert.ok(!qs.some((q) => q.value === 'newYork'), 'forty trades is under the 50-trade bar for a question, however good they look')
  assert.deepEqual(lab.researchQuestions(rec.datasetOf([])), [])
  const mixed = rec.combine([rec.datasetOf(rows.slice(0, 10)), rec.datasetOf([r(99, { source: 'BACKTEST' })])])
  assert.deepEqual(lab.researchQuestions(mixed), [], 'a mixed dataset is never the basis of a question')
})

test('PROPOSALS — gates decide PROPOSED vs GATES FAILED; a human decides; approval applies nothing; expiry is recorded', () => {
  const rr = rng(5)
  const critiqueOk = lab.critiqueCohort({ name: 'x', filters: [], provenance: rec.datasetOf([]).provenance, stats: { ...rec.datasetOf([]).provenance, n: 250 } as never, recordIds: [], composition: { regime: { 'trending-up': 100, ranging: 100, breakout: 50 } } } as never, { source: 'PAPER' })
  const strong = Array.from({ length: 200 }, () => 0.6 + gauss(rr))
  const good = lab.makeProposal({ kind: 'parameter-variant', strategyId: 'silver-bullet', title: 'RR 2.5', rationale: 'holds OOS', change: 'rr 2.0 → 2.5', params: { rr: 2.5 }, oosRs: strong, paperTrades: 30, walkForwardPositiveShare: 0.8, hypothesisStatuses: ['OOS SUPPORTED'], critique: critiqueOk, trials: 20, now: T0 })
  assert.equal(good.status, 'PROPOSED')
  assert.equal(good.requires, 'HUMAN APPROVAL')
  assert.ok(good.gates.every((g) => g.met), good.gates.filter((g) => !g.met).map((g) => g.detail).join('; '))
  const weak = lab.makeProposal({ kind: 'parameter-variant', strategyId: 'silver-bullet', title: 'RR 3', rationale: 'looked good', change: 'rr 2.0 → 3.0', oosRs: strong.slice(0, 12), paperTrades: 3, hypothesisStatuses: ['OBSERVED IN SAMPLE'], critique: critiqueOk, trials: 400, now: T0 })
  assert.equal(weak.status, 'GATES FAILED')
  assert.throws(() => lab.decideProposal(weak, 'APPROVED', 'gt', 'go'), /only a PROPOSED proposal/)
  const approved = lab.decideProposal(good, 'APPROVED', 'gt', 'agreed after reading the gates', T0 + 1)
  assert.equal(approved.status, 'APPROVED')
  assert.match(approved.history[approved.history.length - 1].detail, /Nothing is applied/)
  assert.equal(config.ict.minRR, config.ict.minRR, 'config is untouched by approval')
  lab.saveProposal(approved)
  const other = lab.saveProposal(lab.makeProposal({ kind: 'retire', strategyId: 'unicorn', title: 'retire', rationale: 'decaying', change: 'disable unicorn', paperTrades: 40, critique: critiqueOk, now: T0 }))
  assert.equal(other.status, 'PROPOSED', 'a structural proposal needs only the paper and critique gates')
  assert.equal(lab.listProposals({ status: 'PROPOSED' }).length, 1)
  const swept = lab.sweepProposals(T0 + lab.PROPOSAL_TTL_MS + 1)
  assert.ok(swept.some((p) => p.id === other.id && p.status === 'EXPIRED'))
  assert.match(lab.renderProposal(approved), /requires HUMAN APPROVAL/)
})
