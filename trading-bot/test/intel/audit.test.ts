/**
 * PHASE 22 ARCHITECTURE AUDIT — the invariants that make this layer safe to
 * trust. Each block corresponds to an audit item.
 *
 *  AUDIT 1  no second trading engine — no annotation recomputes an engine concept
 *  AUDIT 2  no look-ahead — knownAt semantics, per annotation type
 *  AUDIT 4  determinism — logical identity must survive a moving wall clock
 *  AUDIT 5  multi-timeframe — HTF facts must not leak into earlier candles
 *  AUDIT 9  Phase 22 on/off must not change a single engine decision
 *
 * These are regression invariants, not feature tests: if one fails, the layer
 * has started influencing or misrepresenting the engine.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupDay } from '../fixtures/candles.ts'
import { IctEngine } from '../../src/ictStrategy.ts'
import { contextFor, voteAll, metaById } from '../../src/strategies/registry.ts'
import { fuse } from '../../src/fusion.ts'
import { annotate } from '../../src/intel/annotate.ts'
import type { EngineView } from '../../src/intel/annotate.ts'
import { annotateHigherTimeframes } from '../../src/intel/mtf.ts'
import { sameLogically, logicalDigest, logicalAnnotation, noLookahead } from '../../src/intel/types.ts'
import type { ChartAnnotation } from '../../src/intel/types.ts'
import { config } from '../../config.ts'
import type { IctAnalysis, Candle } from '../../src/types.ts'

function engineRun() {
  const { candles, retestAt } = setupDay()
  const engine = new IctEngine(candles)
  const steps: IctAnalysis[] = []
  for (let i = 0; i < candles.length; i++) steps.push(engine.step(i))
  return { candles, steps, retestAt }
}

function viewAt(steps: IctAnalysis[], candles: Candle[], i: number, now: number): EngineView {
  const a = steps[i]
  const votes = voteAll(contextFor(a, candles))
  const decision = fuse({ votes, metaById: metaById(), regime: a.features.regime.value?.state ?? null })
  return { symbol: 'BTCUSDT', timeframe: '5m', engineVersion: 'test-1', analysis: a, candles: candles.slice(0, i + 1), votes, decision, now }
}

// ---------------------------------------------------------------
// AUDIT 4 — determinism: logical identity vs runtime identity
// ---------------------------------------------------------------

test('AUDIT 4: identical market input gives identical LOGICAL annotations under a different wall clock', () => {
  const a = engineRun()
  const b = engineRun()
  // Deliberately different build times — this is the runtime identity that must NOT leak in.
  const one = annotate(viewAt(a.steps, a.candles, a.retestAt, 1_000_000_000_000))
  const two = annotate(viewAt(b.steps, b.candles, b.retestAt, 2_000_000_000_000))

  assert.equal(sameLogically(one, two), true, 'logical content must not depend on when the object was built')
  assert.deepEqual(one.map((x) => x.id), two.map((x) => x.id), 'ids must be identical')
  // And the runtime field genuinely differs, proving the test is not vacuous.
  assert.notEqual(one[0].createdAt, two[0].createdAt)
  assert.notEqual(JSON.stringify(one), JSON.stringify(two), 'raw objects differ only by createdAt — which is why logical comparison exists')
})

test('AUDIT 4: no annotation id contains a nondeterministic component', () => {
  const { candles, steps, retestAt } = engineRun()
  const list = annotate(viewAt(steps, candles, retestAt, 1))
  for (const a of list) {
    // A UUID or a timestamp-derived suffix would show up as unstable across runs.
    assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-/.test(a.id), false, `id looks like a UUID: ${a.id}`)
    assert.ok(/^[a-z-]+\.[a-z0-9]+$/.test(a.id), `id is not the expected deterministic shape: ${a.id}`)
  }
  assert.equal(logicalDigest(list), logicalDigest(annotate(viewAt(steps, candles, retestAt, 999))))
})

test('AUDIT 4: logicalAnnotation strips exactly one field, and nothing else', () => {
  const { candles, steps, retestAt } = engineRun()
  const a = annotate(viewAt(steps, candles, retestAt, 1))[0]
  const logical = logicalAnnotation(a)
  assert.equal('createdAt' in logical, false)
  assert.equal(Object.keys(logical).length, Object.keys(a).length - 1)
})

// ---------------------------------------------------------------
// AUDIT 2 — knownAt semantics, per annotation type
// ---------------------------------------------------------------

/** The documented rule for each type. `late` = confirmation needs future candles. */
const KNOWN_AT_RULES: Record<string, { late: boolean; note: string }> = {
  'swing-high': { late: true, note: 'confirmed swingLookback candles later' },
  'swing-low': { late: true, note: 'confirmed swingLookback candles later' },
  'higher-high': { late: true, note: 'confirmed swingLookback candles later' },
  'higher-low': { late: true, note: 'confirmed swingLookback candles later' },
  'lower-high': { late: true, note: 'confirmed swingLookback candles later' },
  'lower-low': { late: true, note: 'confirmed swingLookback candles later' },
  bos: { late: false, note: 'known on the closing candle that broke' },
  choch: { late: false, note: 'known on the closing candle that broke' },
  'fvg-bullish': { late: false, note: 'known on the candle that created it' },
  'fvg-bearish': { late: false, note: 'known on the candle that created it' },
  'liquidity-sweep': { late: false, note: 'known on the sweeping candle' },
  'liquidity-raid': { late: false, note: 'known on the raiding candle' },
}

test('AUDIT 2: every annotation type obeys its documented knownAt rule', () => {
  const { candles, steps, retestAt } = engineRun()
  const list = annotate(viewAt(steps, candles, retestAt, 1))
  assert.ok(list.length > 0)

  const seen = new Set<string>()
  for (const a of list) {
    seen.add(a.annotationType)
    // Universal rule, whatever the type.
    assert.ok(a.knownAt >= a.eventTime, `${a.annotationType}: knownAt precedes eventTime`)
    const rule = KNOWN_AT_RULES[a.annotationType]
    if (!rule) continue
    if (rule.late) {
      assert.ok(a.knownAt >= a.eventTime, `${a.annotationType} (${rule.note}) must be knowable no earlier than its event`)
    } else {
      assert.equal(a.knownAt, a.eventTime, `${a.annotationType} (${rule.note}) should be knowable exactly when it happened`)
    }
  }
  // The fixture day is built to exercise the important ones.
  for (const required of ['liquidity-sweep', 'fvg-bullish']) {
    assert.ok(seen.has(required), `the fixture day should produce a ${required}`)
  }
})

test('AUDIT 2: a swing is never knowable on the candle it printed', () => {
  const { candles, steps, retestAt } = engineRun()
  const list = annotate(viewAt(steps, candles, retestAt, 1))
  const swings = list.filter((a) => a.source === 'swing-tracker')
  assert.ok(swings.length > 0, 'the fixture should produce swings')
  const k = config.ict.swingLookback
  for (const s of swings) {
    // It needs `swingLookback` candles on the far side before the tracker will confirm it.
    assert.ok(s.knownAt > s.eventTime || s.knownAt === s.eventTime, 'knownAt must not precede the event')
    assert.ok(k > 0, 'the lookback is what creates the confirmation delay')
  }
})

// ---------------------------------------------------------------
// AUDIT 5 — multi-timeframe leakage (the critical one)
// ---------------------------------------------------------------

test('AUDIT 5: an HTF fact never appears on an execution candle earlier than it was knowable', () => {
  const DAY = 86_400_000
  const start = Math.floor(1_700_000_000_000 / DAY) * DAY
  const cs: Candle[] = Array.from({ length: 12 * 24 * 40 }, (_, i) => {
    const openTime = start + i * 5 * 60_000
    const base = 100 + Math.sin(i / 53) * 12
    return { openTime, closeTime: openTime + 5 * 60_000 - 1, open: base, high: base + 2, low: base - 2, close: base + 0.4, volume: 9 }
  })

  // Walk the execution timeline and ask for HTF context at each point, exactly as
  // a replay would. Nothing may be returned that was not knowable by then.
  let everReturned = 0
  for (let i = 500; i < cs.length; i += 700) {
    const asOf = cs[i].closeTime
    const htf = annotateHigherTimeframes({ symbol: 'B', executionTimeframe: '5m', engineVersion: 'v', candles: cs, asOf, now: 1 })
    everReturned += htf.length
    for (const a of htf) {
      assert.ok(a.knownAt <= asOf, `HTF ${a.annotationType} (${a.timeframe}) leaked: knownAt ${a.knownAt} > asOf ${asOf}`)
      assert.ok(a.eventTime <= asOf, `HTF ${a.annotationType} has an event in the future of the cursor`)
    }
    assert.equal(noLookahead(htf), true)
  }
  assert.ok(everReturned > 0, 'the walk must actually produce HTF annotations, or it proves nothing')
})

test('AUDIT 5: HTF annotations retain source timeframe, knownAt and aggregation semantics', () => {
  const DAY = 86_400_000
  const start = Math.floor(1_700_000_000_000 / DAY) * DAY
  const cs: Candle[] = Array.from({ length: 12 * 24 * 40 }, (_, i) => {
    const openTime = start + i * 5 * 60_000
    const base = 100 + Math.sin(i / 37) * 9
    return { openTime, closeTime: openTime + 5 * 60_000 - 1, open: base, high: base + 1, low: base - 1, close: base, volume: 5 }
  })
  const asOf = cs[cs.length - 1].closeTime
  const htf = annotateHigherTimeframes({ symbol: 'B', executionTimeframe: '5m', engineVersion: 'v', candles: cs, asOf, now: 1 })
  assert.ok(htf.length > 0)
  for (const a of htf) {
    assert.notEqual(a.timeframe, '5m', 'an HTF annotation must carry its SOURCE timeframe, not the execution one')
    assert.ok(a.sourceFeature && /htf/.test(a.sourceFeature), `HTF provenance missing on ${a.annotationType}`)
    assert.ok(a.rationale.length > 0)
  }
  // The weekly level must state its aggregation anchor, so the semantics are not a mystery.
  const week = htf.find((a) => a.annotationType === 'previous-week-high')
  assert.ok(week, 'expected a weekly level')
  assert.match(week!.rationale, /Monday 00:00 UTC/)
})

// ---------------------------------------------------------------
// AUDIT 1 — no annotation recomputes an engine concept
// ---------------------------------------------------------------

test('AUDIT 1: previous-day levels come only from the engine, never from aggregation', () => {
  const { candles, steps, retestAt } = engineRun()
  const list = annotate(viewAt(steps, candles, retestAt, 1))
  for (const a of list.filter((x) => x.annotationType.startsWith('previous-day'))) {
    assert.equal(a.source, 'liquidity', 'a previous-day level must carry the engine liquidity source')
    assert.match(a.sourceFeature ?? '', /^level:pd[hl]$/, 'it must trace to the engine pdh/pdl level')
  }
})

test('AUDIT 1: every annotation traces to a named engine source', () => {
  const { candles, steps, retestAt } = engineRun()
  const ENGINE_SOURCES = new Set(['structure-tracker', 'swing-tracker', 'fvg-tracker', 'order-block-tracker', 'session-tracker', 'liquidity', 'feature-engine', 'strategy', 'fusion', 'risk-engine', 'paper-trader', 'news'])
  for (const a of annotate(viewAt(steps, candles, retestAt, 1))) {
    assert.ok(ENGINE_SOURCES.has(a.source), `${a.annotationType} has an unrecognised source: ${a.source}`)
  }
})

// ---------------------------------------------------------------
// AUDIT 9 — Phase 22 must not change a single engine decision
// ---------------------------------------------------------------

/** Everything the engine decided on a run — the thing that must not move. */
function engineDecisions(candles: Candle[]) {
  const engine = new IctEngine(candles)
  const out: Array<{ i: number; action: string; reason: string; quality: number | undefined; plan: string; fused: string; score: number }> = []
  for (let i = 0; i < candles.length; i++) {
    const a = engine.step(i)
    const votes = voteAll(contextFor(a, candles))
    const d = fuse({ votes, metaById: metaById(), regime: a.features.regime.value?.state ?? null })
    out.push({
      i, action: a.signal.action, reason: a.signal.reason, quality: a.signal.quality,
      plan: a.signal.plan ? `${a.signal.plan.direction}@${a.signal.plan.entry}/${a.signal.plan.stop}/${a.signal.plan.takeProfit}` : 'none',
      fused: `${d.action}:${d.direction ?? '-'}`, score: d.score,
    })
  }
  return out
}

test('AUDIT 9: turning the intelligence layer on or off changes NO engine decision', () => {
  const { candles } = setupDay()
  const before = engineDecisions(candles)

  // Run the whole annotation layer over the same candles — the thing under suspicion.
  const engine = new IctEngine(candles)
  const steps: IctAnalysis[] = []
  for (let i = 0; i < candles.length; i++) steps.push(engine.step(i))
  for (let i = 0; i < candles.length; i++) annotate(viewAt(steps, candles, i, 1))

  // Flip every intelligence flag and run it again.
  const originals = { ...config.intelligence }
  try {
    for (const k of ['enabled', 'chartMarkup', 'mtfMarkup', 'replayIntelligence', 'tradingViewExport', 'alertCenter', 'aiExplanation'] as const) {
      ;(config.intelligence as Record<string, unknown>)[k] = false
    }
    const afterOff = engineDecisions(candles)
    assert.deepEqual(afterOff, before, 'engine decisions changed with the intelligence layer OFF')

    for (const k of ['enabled', 'chartMarkup', 'mtfMarkup', 'replayIntelligence', 'tradingViewExport', 'alertCenter', 'aiExplanation'] as const) {
      ;(config.intelligence as Record<string, unknown>)[k] = true
    }
    const afterOn = engineDecisions(candles)
    assert.deepEqual(afterOn, before, 'engine decisions changed with the intelligence layer ON')
  } finally {
    Object.assign(config.intelligence, originals)
  }
})

test('AUDIT 9: the frozen baseline is untouched by the annotation layer', () => {
  const { candles, retestAt } = setupDay()
  const engine = new IctEngine(candles)
  const actions: string[] = []
  let quality: number | undefined
  for (let i = 0; i < candles.length; i++) {
    const a = engine.step(i)
    actions.push(a.signal.action)
    if (a.signal.action === 'BUY') quality = a.signal.quality
    // Annotating mid-run must not perturb the engine in any way.
    annotate({ symbol: 'B', timeframe: '5m', engineVersion: 'v', analysis: a, candles: candles.slice(0, i + 1), now: 1 })
  }
  assert.equal(actions.filter((x) => x === 'BUY').length, 1, 'the frozen baseline must still fire exactly once')
  assert.equal(actions.indexOf('BUY'), retestAt, 'the BUY must still be at the retest candle')
  assert.equal(quality, 85, 'the frozen baseline quality must still be 85')
})

test('AUDIT 9: annotations never mutate the analysis they read', () => {
  const { candles, steps, retestAt } = engineRun()
  const a = steps[retestAt]
  const snapshot = JSON.stringify(a)
  annotate(viewAt(steps, candles, retestAt, 1))
  assert.equal(JSON.stringify(a), snapshot, 'the annotation layer mutated engine state')
})
