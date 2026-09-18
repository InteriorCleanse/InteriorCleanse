/**
 * THE MARKET OBSERVER — records what the engine saw and what the paper trader
 * did, once per event whatever happens (restart, re-run), scores it with a
 * stated reason, turns selected events into case studies only after the
 * outcome is stored, and never puts an outcome into a live explanation.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir, syntheticKlines } from '../helpers.ts'
import type { Candle } from '../../src/types.ts'
import type { Snapshot } from '../../src/bot.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'

const tmp = tempDataDir('mrcash-observer-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const { store } = await import('../../src/store.ts')
const ev = await import('../../src/observer/events.ts')
const sig = await import('../../src/observer/significance.ts')
const ob = await import('../../src/observer/observer.ts')
const live = await import('../../src/observer/live.ts')
const cs = await import('../../src/school/caseStudies.ts')
const vault = await import('../../src/knowledge/vault.ts')
const rec = await import('../../src/paper/reconcile.ts')
after(() => tmp.cleanup())

const NOW = Date.UTC(2026, 0, 20, 15, 0)
const STEP = 300_000
const candles: Candle[] = syntheticKlines(5, 17, NOW).map((k) => ({ openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5], closeTime: k[6] }))
store().upsertCandles(config.symbol, config.interval, candles, 'rest')
const steps = cs.stepEngine(candles, 200)
const snapAt = (i: number): Snapshot => ({ candles: candles.slice(0, i + 1), analysis: steps[i].analysis, signal: steps[i].analysis.signal, news: null, plan: null, engine: null, flow: null, state: null, strategyVotes: steps[i].votes ?? [], decision: steps[i].decision ?? null })

test('significance scores from measurable properties, states why, and selects nothing ordinary', () => {
  const ordinary = sig.scoreSignificance({ type: 'SESSION CHANGE' })
  assert.equal(ordinary.selected, false)
  assert.ok(ordinary.reasons.length >= 1)
  const disagree = sig.scoreSignificance({ type: 'STRATEGY ACTIVATION', votes: { buys: 1, sells: 1, nearMisses: 0 } })
  assert.equal(disagree.selected, true)
  assert.ok(disagree.reasons.some((r) => /disagreement/.test(r)))
  assert.doesNotMatch(disagree.note, /will (rise|fall|rally|drop|reverse|continue)/)
  const deep = sig.scoreSignificance({ type: 'LIQUIDITY EVENT', sweepDepthAtr: 1.2, volRatio: 2.6 })
  assert.equal(deep.selected, true)
  assert.equal(deep.basis.sweepDepthAtr, 1.2)
  const smallCohort = sig.scoreSignificance({ type: 'PAPER EXIT', paper: { rMultiple: 3, cohortMean: 0.2, cohortSd: 0.5, cohortN: 4, maeR: -0.1, mfeR: 3.2, maeP10: null, mfeP90: null, excursionN: 4, fusedScore: 80, quality: 85, enterScore: 60 } })
  assert.ok(smallCohort.reasons.some((r) => /under the bar/.test(r)), 'four trades cannot support an "unusual" read')
  assert.equal(smallCohort.basis.cohortZ, undefined)
  const diverge = sig.scoreSignificance({ type: 'PAPER EXIT', paper: { rMultiple: 3, cohortMean: 0.2, cohortSd: 0.5, cohortN: 30, maeR: -0.1, mfeR: 3.2, maeP10: -1.2, mfeP90: 2.0, excursionN: 30, fusedScore: 80, quality: 85, enterScore: 60 } })
  assert.equal(diverge.selected, true)
  assert.ok(diverge.reasons.some((r) => /major divergence/.test(r)) && diverge.reasons.some((r) => /unusual MFE/.test(r)))
})

test('the observer records engine events from the live cycle, with available-at, evidence and a BEFORE summary; the same cycle twice records nothing new', () => {
  ob.resetObserver()
  let total = 0
  for (let i = steps.length - 40; i < steps.length; i++) total += ob.observeCycle(snapAt(i), candles[i].closeTime + 1).recorded.length
  assert.ok(total >= 3, `expected events over 40 candles, got ${total}`)
  const all = ev.listObservations({ limit: 500 })
  for (const o of all) {
    assert.ok(o.availableAt >= o.time)
    assert.equal(o.engineVersion.length > 0, true)
    assert.equal(typeof o.featureVersion, 'number')
    assert.ok(o.evidence.length >= 1)
    assert.ok(o.significance.reasons.length >= 1)
    assert.ok(!('after' in o), 'no outcome on an observation')
  }
  // Re-run the same cycles (as after a restart): every row already exists.
  ob.resetObserver()
  let dup = 0, fresh = 0
  for (let i = steps.length - 40; i < steps.length; i++) { const r = ob.observeCycle(snapAt(i), candles[i].closeTime + 1); dup += r.duplicates; fresh += r.recorded.length }
  assert.equal(fresh, 0, 'a restart re-observing the same candles adds nothing')
  assert.ok(dup >= 3)
  assert.equal(ev.listObservations({ limit: 500 }).length, all.length)
  // A timer tick on the same candle records nothing.
  const again = ob.observeCycle(snapAt(steps.length - 1), NOW + 1)
  assert.equal(again.recorded.length, 0)
})

function pos(i: number, over: Partial<PaperPosition> = {}): PaperPosition {
  const openedAt = candles[candles.length - 60 + i].openTime
  return {
    id: `obs-pp${i}`, openedAt, dayKey: '2026-01-20', session: 'London', setupKey: 'BTCUSDT|5m|silver-bullet|long', direction: 'long',
    intendedEntry: candles[candles.length - 60 + i].open, entry: candles[candles.length - 60 + i].open, stop: candles[candles.length - 60 + i].open * 0.995, target: candles[candles.length - 60 + i].open * 1.01, quantity: 0.01, riskUsd: 1, quality: 85, reason: 'test', atr: 50, status: 'pending',
    strategyId: 'silver-bullet', regime: 'trending-up', snapshot: { signalId: `s${i}`, symbol: 'BTCUSDT', interval: '5m', engineVersion: '2.3.0', featureVersion: 1, volatility: 'normal', fusedScore: 80, fusedAction: 'LONG', confirms: [], invalidates: [], contributors: [], evidence: [], riskChecks: [], riskVetoedBy: null, newsMinutes: null, inBlackout: false },
    ...over,
  }
}

test('paper events flow automatically: entry, exit with reconciled excursions, risk veto — each once', () => {
  const last = steps.length - 1
  const p = pos(0)
  store().savePosition(p)
  ob.observeCycle(snapAt(last), NOW + 2)
  store().savePosition({ ...p, status: 'open', filledAt: p.openedAt + STEP })
  const entry = ob.observeCycle(snapAt(last), NOW + 3)
  assert.ok(entry.recorded.some((o) => o.type === 'PAPER ENTRY' && o.recordId === p.id))
  const closedAt = p.openedAt + 20 * STEP
  store().savePosition({ ...p, status: 'open', filledAt: p.openedAt + STEP })
  store().savePosition({ ...p, status: 'closed', filledAt: p.openedAt + STEP, closedAt, exit: p.entry * 1.004, exitReason: 'time', rMultiple: 0.8, outcome: 'WIN', candlesHeld: 19 })
  const exit = ob.observeCycle(snapAt(last), NOW + 4)
  const x = exit.recorded.find((o) => o.type === 'PAPER EXIT')!
  assert.ok(x, 'an exit is observed')
  assert.equal(x.recordId, p.id)
  assert.ok(x.evidence.some((e) => e.field === 'mae.status' && e.value === 'OBSERVED'), 'the exit carries reconciled excursions from stored candles')
  const stored = store().positions<PaperPosition>('closed').find((c) => c.id === p.id)!
  assert.equal(typeof stored.mae, 'number')
  assert.ok(stored.reconciledAt)
  assert.equal(rec.reconcileExcursions(stored)!.changed, false, 'reconciliation is idempotent')
  assert.throws(() => store().savePosition({ ...stored, rMultiple: 5 }), /immutable/, 'nothing but the reconciliation fields may change')

  const veto = pos(1, { id: 'obs-veto', status: 'closed', closedAt: candles[candles.length - 59].openTime + STEP, exitReason: 'missed', note: 'risk veto: daily loss limit reached' })
  store().savePosition(veto)
  const v = ob.observeCycle(snapAt(last), NOW + 5)
  const rv = v.recorded.find((o) => o.type === 'RISK VETO')!
  assert.ok(rv)
  assert.equal(rv.caseKind, 'risk-veto')
  assert.ok(rv.evidence.some((e) => e.field === 'category' && e.value === 'risk-veto'))
  assert.equal(ob.observeCycle(snapAt(last), NOW + 6).recorded.filter((o) => o.type === 'PAPER EXIT' || o.type === 'RISK VETO').length, 0, 'seen positions are not re-observed')
})

test('candidates resolve into audited case studies only once the horizon is stored; the live view never shows an outcome while observing', async () => {
  ob.resetObserver()
  // Force a candidate from an engine event near the end of the window so its horizon is NOT yet stored.
  const before = ev.listObservations({ status: 'CANDIDATE', limit: 500 }).length
  const notYet = ob.resolveCandidates(candles[candles.length - 1].closeTime + 1, { max: 50 })
  const early = ev.listObservations({ status: 'CANDIDATE', limit: 500 })
  for (const o of early) assert.ok(o.availableAt + (ob.HORIZON + 1) * STEP > candles[candles.length - 1].closeTime + 1 || notYet.resolved.some((r) => r.id === o.id) || notYet.unresolvable.some((r) => r.id === o.id), 'a candidate with its horizon stored is resolved or unresolvable, never left hanging')
  // Now pretend time has moved on well past every horizon: everything due resolves or is marked unresolvable.
  const far = candles[candles.length - 1].closeTime + 40 * STEP
  const r = ob.resolveCandidates(far, { max: 100 })
  const dataEnd = candles[candles.length - 1].closeTime
  assert.equal(ev.listObservations({ status: 'CANDIDATE', limit: 500 }).filter((o) => o.availableAt + (ob.HORIZON + 1) * STEP <= dataEnd).length, 0, 'every candidate whose horizon is STORED is resolved; the rest wait for candles, however late the clock is')
  assert.ok(ev.listObservations({ status: 'CANDIDATE', limit: 500 }).length > 0, 'candidates near the end of the data wait rather than being guessed')
  const allResolved = [...notYet.resolved, ...r.resolved]
  assert.ok(allResolved.length >= 1, 'something due was resolved across the two passes')
  for (const x of allResolved) {
    const item = vault.getItem(x.caseId)!
    assert.equal(item.kind, 'case-study')
    assert.deepEqual(cs.hindsightFindings(item.payload as never), [])
  }
  const lv = live.liveView(far)
  for (const o of lv.observing) assert.equal(o.result, null, 'observing entries carry no result')
  for (const o of lv.revealed) { assert.equal(o.status, 'REVEALED'); assert.ok(o.caseId) }
  assert.ok(lv.counts.total >= before)
  if (allResolved.length) {
    const rp = live.replayForObservation(allResolved[0].id)!
    assert.ok(rp, 'a revealed event becomes a replay lesson')
    assert.equal(rp.bundle.lesson.stops.length, 1)
    const { stopView } = await import('../../src/school/replaySchool.ts')
    const raw = JSON.stringify(stopView(rp.bundle, 0))
    assert.ok(!raw.includes('"after"') && !raw.includes('"answer"'), 'the replay stops before the outcome')
  }
})

test('observation ids are deterministic and the record is content-addressed', () => {
  const a = ev.observationId({ type: 'LIQUIDITY EVENT', symbol: 'BTCUSDT', timeframe: '5m', availableAt: 1, refId: 'x' })
  const b = ev.observationId({ type: 'LIQUIDITY EVENT', symbol: 'BTCUSDT', timeframe: '5m', availableAt: 1, refId: 'x' })
  const c = ev.observationId({ type: 'LIQUIDITY EVENT', symbol: 'BTCUSDT', timeframe: '5m', availableAt: 2, refId: 'x' })
  assert.equal(a, b)
  assert.notEqual(a, c)
})
