/**
 * The intelligence layer's markup (Phase 22B/22C).
 *
 * These run over the REAL engine on the hand-built setup day, so what is being
 * asserted is the actual projection of engine state — not a mock of it. The
 * invariants that matter: the same market input always produces the same
 * annotations (ids included), every annotation carries usable provenance,
 * lifecycles are mapped from engine state rather than decided here, and a value
 * the engine could not supply is reported UNAVAILABLE instead of invented.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import { setupDay } from '../fixtures/candles.ts'
import type { EngineView } from '../../src/intel/annotate.ts'
import type { IctAnalysis } from '../../src/types.ts'

// Isolate the data directory BEFORE loading anything that reads it. `DATA_DIR`
// is a top-level const captured at import time, and `voteAll` reaches the
// SQLite store through the settings lookup — so a static import here would
// bind this file to the SHARED default store and race every other test file
// running in parallel ("database is locked").
const tmp = tempDataDir('mrcash-intel-annotate-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { IctEngine } = await import('../../src/ictStrategy.ts')
const { contextFor, voteAll, metaById } = await import('../../src/strategies/registry.ts')
const { fuse } = await import('../../src/fusion.ts')
const { annotate, annotateStructure, annotateLiquidity, annotateImbalance, annotateOrderBlocks, annotateStrategies, annotateTradeMap, annotateContext } = await import('../../src/intel/annotate.ts')
const { noLookahead, knowableAt, annotationId, ANNOTATION_SCHEMA_VERSION } = await import('../../src/intel/types.ts')
after(() => tmp.cleanup())

const NOW = 1_700_000_000_000

/** Run the real engine over the setup day and return the analysis at each candle. */
function engineRun() {
  const { candles, retestAt } = setupDay()
  const engine = new IctEngine(candles)
  const steps: IctAnalysis[] = []
  for (let i = 0; i < candles.length; i++) steps.push(engine.step(i))
  return { candles, steps, retestAt }
}

function viewAt(steps: IctAnalysis[], candles: ReturnType<typeof setupDay>['candles'], i: number): EngineView {
  const a = steps[i]
  const votes = voteAll(contextFor(a, candles))
  const decision = fuse({ votes, metaById: metaById(), regime: a.features.regime.value?.state ?? null })
  return { symbol: 'BTCUSDT', timeframe: '5m', engineVersion: 'test-1', analysis: a, votes, decision, now: NOW }
}

test('annotations are produced from real engine state, across every layer', () => {
  const { candles, steps, retestAt } = engineRun()
  const list = annotate(viewAt(steps, candles, retestAt))
  assert.ok(list.length > 0, 'the setup day should yield annotations')
  const layers = new Set(list.map((a) => a.layer))
  // The setup day is built to produce a sweep, a displacement gap and a trade.
  for (const expected of ['structure', 'liquidity', 'imbalance', 'trade', 'context']) {
    assert.ok(layers.has(expected as never), `expected the ${expected} layer, got ${[...layers].join(', ')}`)
  }
})

test('the same market input produces byte-identical annotations, ids included', () => {
  const a = engineRun()
  const b = engineRun()
  const listA = annotate(viewAt(a.steps, a.candles, a.retestAt))
  const listB = annotate(viewAt(b.steps, b.candles, b.retestAt))
  assert.deepEqual(listA.map((x) => x.id), listB.map((x) => x.id))
  assert.equal(JSON.stringify(listA), JSON.stringify(listB), 'two identical runs must serialise identically')
})

test('ids are content-derived — no clock, no randomness', () => {
  const one = annotationId({ layer: 'imbalance', annotationType: 'fvg-bullish', timeframe: '5m', eventTime: 1000, priceHigh: 10, priceLow: 9 })
  const two = annotationId({ layer: 'imbalance', annotationType: 'fvg-bullish', timeframe: '5m', eventTime: 1000, priceHigh: 10, priceLow: 9 })
  assert.equal(one, two)
  const different = annotationId({ layer: 'imbalance', annotationType: 'fvg-bullish', timeframe: '5m', eventTime: 1001, priceHigh: 10, priceLow: 9 })
  assert.notEqual(one, different)
  // Float noise must not fork an id.
  const noisy = annotationId({ layer: 'imbalance', annotationType: 'fvg-bullish', timeframe: '5m', eventTime: 1000, priceHigh: 10.0000000001, priceLow: 9 })
  assert.equal(one, noisy)
})

test('every annotation carries complete provenance', () => {
  const { candles, steps, retestAt } = engineRun()
  for (const a of annotate(viewAt(steps, candles, retestAt))) {
    assert.equal(a.schemaVersion, ANNOTATION_SCHEMA_VERSION)
    assert.equal(a.engineVersion, 'test-1')
    assert.equal(a.symbol, 'BTCUSDT')
    assert.ok(a.timeframe, 'timeframe must be set')
    assert.ok(a.source, 'source module must be named')
    assert.ok(a.rationale && a.rationale.length > 0, `rationale missing on ${a.annotationType}`)
    assert.ok(['REAL', 'APPROXIMATE', 'UNAVAILABLE'].includes(a.dataQuality))
    assert.ok(['ACTIVE', 'MITIGATED', 'INVALIDATED', 'EXPIRED', 'TRIGGERED', 'RESOLVED'].includes(a.lifecycleStatus))
    assert.ok(Number.isFinite(a.eventTime) && Number.isFinite(a.knownAt))
  }
})

test('nothing is ever knowable before it happened', () => {
  const { candles, steps } = engineRun()
  for (let i = 0; i < steps.length; i += 7) {
    assert.equal(noLookahead(annotate(viewAt(steps, candles, i))), true, `frame ${i} violated knownAt >= eventTime`)
  }
})

test('structure: swings are labelled and breaks are classified BOS vs CHoCH', () => {
  const { candles, steps, retestAt } = engineRun()
  const list = annotateStructure(viewAt(steps, candles, retestAt))
  const types = new Set(list.map((a) => a.annotationType))
  assert.ok([...types].some((t) => ['swing-high', 'swing-low', 'higher-high', 'higher-low', 'lower-high', 'lower-low'].includes(t)), 'expected swing annotations')
  const breaks = list.filter((a) => a.annotationType === 'bos' || a.annotationType === 'choch')
  for (const b of breaks) {
    assert.equal(b.lifecycleStatus, 'TRIGGERED')
    assert.ok(b.direction === 'bullish' || b.direction === 'bearish')
    assert.ok(b.invalidationCondition, 'a break must say what would undo it')
  }
})

test('liquidity: levels carry their side, their lifecycle, and their raids', () => {
  const { candles, steps, retestAt } = engineRun()
  const list = annotateLiquidity(viewAt(steps, candles, retestAt))
  assert.ok(list.length > 0)
  // A swept level must be TRIGGERED, a broken one INVALIDATED, an intact one ACTIVE.
  const a = steps[retestAt]
  for (const lv of a.levels) {
    const mark = list.find((x) => x.sourceFeature === `level:${lv.kind}`)
    if (!mark) continue
    const expected = lv.brokenAt !== undefined ? 'INVALIDATED' : lv.sweptAt !== undefined ? 'TRIGGERED' : 'ACTIVE'
    assert.equal(mark.lifecycleStatus, expected, `${lv.kind} lifecycle`)
  }
  // The day is built around a sweep of the Asia low.
  assert.ok(list.some((x) => x.annotationType === 'liquidity-sweep'), 'expected a liquidity sweep annotation')
  // Only intact levels advertise an untaken pool.
  for (const pool of list.filter((x) => x.annotationType === 'buyside-liquidity' || x.annotationType === 'sellside-liquidity')) {
    assert.equal(pool.lifecycleStatus, 'ACTIVE')
  }
})

test('imbalance: FVG state maps to lifecycle, and a live gap gets a midpoint', () => {
  const { candles, steps, retestAt } = engineRun()
  const view = viewAt(steps, candles, retestAt)
  const list = annotateImbalance(view)
  const a = view.analysis!
  assert.ok(a.fvgs.length > 0, 'the setup day builds a displacement gap')
  const map = { fresh: 'ACTIVE', mitigated: 'MITIGATED', inverted: 'INVALIDATED', expired: 'EXPIRED' } as const
  for (const f of a.fvgs) {
    const mark = list.find((x) => x.sourceFeature === `fvg:${f.id}`)
    assert.ok(mark, `no annotation for gap ${f.id}`)
    assert.equal(mark!.lifecycleStatus, map[f.state])
    assert.equal(mark!.priceHigh, f.top)
    assert.equal(mark!.priceLow, f.bottom)
    const mid = list.find((x) => x.sourceFeature === `fvg-mid:${f.id}`)
    if (f.state === 'fresh' || f.state === 'mitigated') {
      assert.ok(mid, 'a live gap should expose its midpoint')
      assert.equal(mid!.price, (f.top + f.bottom) / 2)
    } else {
      assert.equal(mid, undefined, 'a dead gap should not advertise a midpoint')
    }
  }
})

test('order blocks: state maps to lifecycle and a broken block becomes a breaker', () => {
  const { candles, steps, retestAt } = engineRun()
  const view = viewAt(steps, candles, retestAt)
  const list = annotateOrderBlocks(view)
  const map = { fresh: 'ACTIVE', mitigated: 'MITIGATED', broken: 'INVALIDATED', expired: 'EXPIRED' } as const
  for (const b of view.analysis!.orderBlocks) {
    const mark = list.find((x) => x.sourceFeature === `ob:${b.id}`)
    assert.ok(mark, `no annotation for block ${b.id}`)
    assert.equal(mark!.lifecycleStatus, map[b.state])
    if (b.state === 'broken') {
      // A broken block flips role, so its drawn direction is the opposite of its own.
      assert.equal(mark!.annotationType, 'breaker-block')
      assert.equal(mark!.direction, b.direction === 'bullish' ? 'bearish' : 'bullish')
    }
  }
})

test('ICT strategies are only drawn when a strategy actually voted for them', () => {
  const { candles, steps, retestAt } = engineRun()
  const view = viewAt(steps, candles, retestAt)
  const list = annotateStrategies(view)
  const voted = new Set(view.votes!.filter((v) => v.action !== 'HOLD').map((v) => v.id))
  for (const a of list) {
    if (a.annotationType === 'silver-bullet-window') continue // a time fact, not a setup
    for (const id of a.strategyIds) assert.ok(voted.has(id), `${id} was drawn but did not vote`)
  }
  // A HOLD must never produce a setup mark.
  const holders = view.votes!.filter((v) => v.action === 'HOLD').map((v) => v.id)
  for (const h of holders) {
    assert.equal(list.some((a) => a.annotationType !== 'silver-bullet-window' && a.strategyIds.includes(h)), false, `${h} is holding but was drawn`)
  }
})

test('the trade map is drawn only when the engine produced a plan, and matches it exactly', () => {
  const { candles, steps, retestAt } = engineRun()
  const view = viewAt(steps, candles, retestAt)
  const plan = view.analysis!.signal.plan
  assert.ok(plan, 'the setup day should yield a plan at the retest candle')
  const list = annotateTradeMap(view)
  const at = (t: string) => list.find((x) => x.annotationType === t)
  assert.equal(at('entry')!.price, plan!.entry)
  assert.equal(at('stop-loss')!.price, plan!.stop)
  assert.equal(at('take-profit')!.price, plan!.takeProfit)
  assert.equal(at('invalidation-level')!.price, plan!.stop)
  for (const a of list) assert.equal(a.layer, 'trade')

  // With no plan there is no trade map at all — nothing is imagined.
  const noPlan = { ...view, analysis: { ...view.analysis!, signal: { ...view.analysis!.signal, plan: undefined } }, decision: null }
  assert.deepEqual(annotateTradeMap(noPlan as EngineView), [])
})

test('context reports unavailable features as UNAVAILABLE, with the reason, instead of inventing them', () => {
  const { candles, steps, retestAt } = engineRun()
  const view = viewAt(steps, candles, retestAt)
  const a = view.analysis!
  // Blank out VWAP and the regime the way a cold start or a dead feed would.
  const blinded: IctAnalysis = {
    ...a,
    features: {
      ...a.features,
      vwapDay: { value: null, available: false, source: 'none', asOf: a.time, approximate: false, note: 'no volume yet' },
      regime: { value: null, available: false, source: 'none', asOf: a.time, approximate: false, note: 'not enough history' },
    },
  }
  const list = annotateContext({ ...view, analysis: blinded })
  const vwap = list.find((x) => x.annotationType === 'vwap')!
  assert.equal(vwap.dataQuality, 'UNAVAILABLE')
  assert.equal(vwap.price, null)
  assert.match(vwap.rationale, /unavailable/i)
  assert.match(vwap.rationale, /no volume yet/)

  // Order flow is never estimated from candles.
  const flow = list.find((x) => x.annotationType === 'order-flow-state')!
  assert.match(flow.rationale, /never estimated from candles|unavailable/i)
})

test('an approximate feature is reported APPROXIMATE, never upgraded to REAL', () => {
  const { candles, steps, retestAt } = engineRun()
  const view = viewAt(steps, candles, retestAt)
  const a = view.analysis!
  const approx: IctAnalysis = {
    ...a,
    features: {
      ...a.features,
      vwapDay: { value: { vwap: 100, upper: 101, lower: 99, sd: 1, anchoredAt: a.time, candles: 10, volume: 5 }, available: true, source: 'candles', asOf: a.time, approximate: true, note: 'built from candles' },
    },
  }
  const vwap = annotateContext({ ...view, analysis: approx }).find((x) => x.annotationType === 'vwap')!
  assert.equal(vwap.dataQuality, 'APPROXIMATE')
  assert.match(vwap.rationale, /approximated from candles/i)
})

test('malformed or empty engine state produces nothing, and never throws', () => {
  assert.deepEqual(annotate({ symbol: 'X', timeframe: '5m', engineVersion: 'v', analysis: null }), [])
  const { candles, steps, retestAt } = engineRun()
  const view = viewAt(steps, candles, retestAt)
  // Empty collections everywhere.
  const empty: IctAnalysis = { ...view.analysis!, levels: [], fvgs: [], orderBlocks: [], swings: [], structureShifts: [], sweepsToday: [], swingSweepsToday: [], dealingRange: null, sessions: {} }
  assert.doesNotThrow(() => annotate({ ...view, analysis: empty }))
  // Votes present but evidence empty.
  assert.doesNotThrow(() => annotate({ ...view, votes: [{ id: 'x', action: 'BUY', direction: 'long', confidence: 10, reason: '', evidence: [], setupKey: 'k' }] }))
})

test('the knowable filter is what a replay cursor uses', () => {
  const { candles, steps, retestAt } = engineRun()
  const list = annotate(viewAt(steps, candles, retestAt))
  const cutoff = Math.min(...list.map((a) => a.knownAt))
  const early = knowableAt(list, cutoff)
  assert.ok(early.length >= 1)
  assert.ok(early.every((a) => a.knownAt <= cutoff))
  assert.equal(knowableAt(list, 0).length, 0, 'nothing is knowable before the data starts')
})
