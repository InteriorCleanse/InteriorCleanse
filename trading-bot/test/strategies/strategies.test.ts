/**
 * The playbook. Every strategy conforms to one interface; each fires exactly
 * once on a context built to satisfy it and holds (naming the gate) on one
 * built to break it; and the ICT session strategy's vote is byte-identical
 * to the session model's own signal on the baseline fixture day.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import { setupDay } from '../fixtures/candles.ts'
import { IctEngine } from '../../src/ictStrategy.ts'
import { sessionIfvg } from '../../src/strategies/sessionIfvg.ts'
import type { Candle } from '../../src/types.ts'
import type { FeatureSnapshot, Feature } from '../../src/features/types.ts'
import type { StrategyContext } from '../../src/strategies/types.ts'

// Isolate the data directory before loading anything that captures DATA_DIR.
// Static imports are hoisted, so the assignment must precede a dynamic import.
const tmp = tempDataDir('mrcash-strategies-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { contextFor, STRATEGIES, getStrategy, strategyIds } = await import('../../src/strategies/registry.ts')
after(() => tmp.cleanup())

const STEP = 300_000
const t0 = Date.UTC(2026, 0, 15, 14, 0)
const mk = (i: number, o: number, h: number, l: number, c: number): Candle => ({ openTime: t0 + i * STEP, closeTime: t0 + i * STEP + STEP - 1, open: o, high: h, low: l, close: c, volume: 5 })

// Generic in T: the old signature returned Feature<number> whatever it was
// handed, so a Feature<RegimeReading> fixture typechecked as a number and the
// mistake only ever showed up at runtime.
function feat<T>(value: T | null): Feature<T> { return { value: value as T, available: value !== null, source: value === null ? 'none' : 'candles', asOf: 0, approximate: false } }

/** A full but mostly-empty feature snapshot; override the pieces a test needs. */
/**
 * These fixtures build DELIBERATELY PARTIAL readings — a regime with four of its
 * fields, a structure with the two a strategy actually looks at. Typing `over`
 * as Partial<FeatureSnapshot> would demand each one be complete and exact, which
 * would make every fixture three times the size for no extra coverage.
 *
 * So the looseness is confined to this one parameter, with an honest cast, and
 * `feat` itself stays generic and truthful. The alternative — a `feat` that
 * claims everything is a Feature<number> — is what let a Feature<RegimeReading>
 * fixture typecheck as a number until the tests were first typechecked.
 */
function snapshot(over: Record<string, unknown> = {}): FeatureSnapshot {
  const empty = feat(null)
  return {
    version: 1, index: 5, openTime: 0, closeTime: 0, price: 100, asOf: 0, dayKey: 'D', session: 'newYork',
    atr: feat(2), hourly: empty, momentum: empty, volatility: feat({ ratio: 1, typicalAtr: 2, label: 'normal' }),
    vwapDay: empty, vwapSession: empty, vwapDayTape: empty, profileDay: empty, structure: empty, liquidity: empty, regime: empty,
    flow: { delta: empty, cvd: empty, cvdSinceGap: empty, tapeSpeed: empty, largeTrades: empty, bookImbalance: empty, footprint: empty, absorption: empty, stream: { trusted: false, trustedSince: null } },
    tape: { exact: false, note: '' },
    ...over,
  } as unknown as FeatureSnapshot
}

function ctx(candles: Candle[], index: number, features: FeatureSnapshot): StrategyContext {
  return { candles, index, price: candles[index].close, atr: 2, analysis: null, features }
}

const vwap = (v: number, sd = 1) => ({ vwap: v, upper: v + sd, lower: v - sd, sd, anchoredAt: 0, candles: 5, volume: 100 })
const regime = (state: string, direction: 'up' | 'down' | null = null, confidence = 60) => ({ state, direction, volatility: 'normal', confidence, reasons: ['x'], votes: { structure: null, averages: null, momentum: null, flow: null } })

test('every strategy conforms: an id, a legal action, an ordered non-empty evidence list, a string setupKey, a numeric confidence', () => {
  const candles = [mk(0, 100, 101, 99, 100), mk(1, 100, 101, 99, 100)]
  for (const s of STRATEGIES) {
    const v = s.evaluate(ctx(candles, 1, snapshot()))
    assert.equal(v.id, s.meta.id)
    assert.ok(['BUY', 'SELL', 'HOLD'].includes(v.action), `${s.meta.id} action ${v.action}`)
    assert.ok(Array.isArray(v.evidence), `${s.meta.id} evidence`)
    assert.equal(typeof v.setupKey, 'string')
    assert.equal(typeof v.confidence, 'number')
    if (v.action !== 'HOLD') assert.ok(v.plan, `${s.meta.id} a trade vote carries a plan`)
    assert.equal(strategyIds().includes(s.meta.id), true)
  }
})

test('the ICT session strategy is byte-identical to the session model and fires once, at the retest candle', () => {
  const { candles, retestAt } = setupDay()
  const engine = new IctEngine(candles)
  const actions: string[] = []
  for (let i = 0; i < candles.length; i++) {
    const a = engine.step(i)
    const vote = sessionIfvg.evaluate(contextFor(a, candles))
    actions.push(vote.action)
    // The vote carries the analysis signal unchanged.
    assert.equal(vote.reason, a.signal.reason)
    assert.equal(vote.setupKey, a.signal.setupKey)
    assert.deepEqual(vote.evidence, a.signal.evidence)
    assert.equal(vote.plan, a.signal.plan)
    assert.equal(vote.confidence, a.signal.quality ?? 0)
  }
  assert.equal(actions.filter((x) => x === 'BUY').length, 1)
  assert.equal(actions.indexOf('BUY'), retestAt)
})

test('VWAP reclaim: fires once when price crosses back above the VWAP, holds when it does not', () => {
  const s = getStrategy('vwap-reclaim')!
  const below = mk(4, 99, 99.5, 98.5, 99) // prev closes below VWAP 100
  const cross = mk(5, 99, 100.6, 98.9, 100.5) // dips to VWAP, closes above
  const fires = s.evaluate(ctx([below, below, below, below, below, cross], 5, snapshot({ vwapDay: feat(vwap(100)), regime: feat(regime('ranging')) })))
  assert.equal(fires.action, 'BUY')
  assert.ok(fires.plan && fires.plan.direction === 'long')
  assert.ok(fires.evidence.length >= 2 && fires.evidence.every((e) => e.passed))
  const flat = mk(5, 100.5, 101, 100.4, 100.8) // already above; no cross
  const holds = s.evaluate(ctx([below, below, below, below, below, flat], 5, snapshot({ vwapDay: feat(vwap(100)), regime: feat(regime('ranging')) })))
  assert.equal(holds.action, 'HOLD')
  assert.ok(holds.evidence.some((e) => !e.passed), 'a hold names the gate')
})

test('breakout: fires on a breakout regime, holds otherwise', () => {
  const s = getStrategy('breakout')!
  const c = [mk(4, 100, 101, 99, 100), mk(5, 100, 103, 99.8, 102.5)]
  const fires = s.evaluate(ctx(c, 1, snapshot({ regime: feat(regime('breakout', 'up', 70)) })))
  assert.equal(fires.action, 'BUY')
  assert.ok(fires.plan && fires.plan.stop < fires.plan.entry)
  assert.equal(s.evaluate(ctx(c, 1, snapshot({ regime: feat(regime('ranging')) }))).action, 'HOLD')
})

test('trend pullback: fires in a trend, in discount, on a support order block', () => {
  const s = getStrategy('trend-pullback')!
  const c = [mk(4, 100, 101, 99, 100), mk(5, 100, 101, 99, 100)]
  const structure = feat({ trend: 'bullish', swingTrend: 'bullish', lastShift: { kind: 'BOS', direction: 'bullish', price: 100, time: 0, index: 3, description: '' }, swings: [], dealingRange: { high: 110, low: 90, equilibrium: 100, position: 20, zone: 'discount', fromLabel: '' }, orderBlocks: { active: 1, support: { id: 'ob', top: 100.5, bottom: 99, kind: 'order block', direction: 'bullish', distanceAtr: 0.2 }, resistance: null } })
  const fires = s.evaluate(ctx(c, 1, snapshot({ regime: feat(regime('trending-up', 'up', 80)), structure })))
  assert.equal(fires.action, 'BUY')
  assert.ok(fires.evidence.map((e) => e.step).includes('Order block'))
  // In premium (wrong half) it holds.
  const base = structure.value!
  const structPrem = feat({ ...base, dealingRange: { ...base.dealingRange, zone: 'premium', position: 80 } })
  assert.equal(s.evaluate(ctx(c, 1, snapshot({ regime: feat(regime('trending-up', 'up', 80)), structure: structPrem }))).action, 'HOLD')
})

test('mean reversion: fires fading a stretch past the band in a range, holds in a trend', () => {
  const s = getStrategy('mean-reversion')!
  const c = [mk(4, 100, 101, 99, 100), mk(5, 101, 103, 101, 102.5)] // closes above the upper band (101)
  const fires = s.evaluate(ctx(c, 1, snapshot({ vwapDay: feat(vwap(100)), regime: feat(regime('ranging')) })))
  assert.equal(fires.action, 'SELL')
  assert.ok(fires.plan && Math.abs(fires.plan.takeProfit - 100) < 1e-9, 'targets the VWAP')
  // In a trend it refuses to fade.
  assert.equal(s.evaluate(ctx(c, 1, snapshot({ vwapDay: feat(vwap(100)), regime: feat(regime('trending-up', 'up')) }))).action, 'HOLD')
})

test('order-flow momentum needs the live tape: it holds, saying so, when the stream is not trusted', () => {
  const s = getStrategy('orderflow-momentum')!
  const c = [mk(4, 100, 101, 99, 100), mk(5, 100, 101, 99, 100)]
  const down = s.evaluate(ctx(c, 1, snapshot()))
  assert.equal(down.action, 'HOLD')
  assert.match(down.reason, /stream|tape/i)
  // With a trusted tape, agreeing delta/CVD and an accelerating tape, it fires.
  const flow = {
    delta: feat({ buyV: 3, sellV: 1, delta: 2, buyUsd: 300, sellUsd: 100, deltaUsd: 200, buyShare: 0.75, trades: 4, volume: 4 }),
    cvd: feat({ value: 10, valueUsd: 1000, anchoredAt: 0, candles: 5, complete: true, restartedAt: null }),
    cvdSinceGap: feat(null), tapeSpeed: feat({ tradesPerMinute: 90, previousPerMinute: 40, acceleration: 2.25, windowSec: 60, label: 'accelerating' }),
    largeTrades: feat(null), bookImbalance: feat(null), footprint: feat(null), absorption: feat(null), stream: { trusted: true, trustedSince: 0 },
  }
  const fires = s.evaluate(ctx(c, 1, snapshot({ flow: flow as never, regime: feat(regime('trending-up', 'up')) })))
  assert.equal(fires.action, 'BUY')
  assert.ok(fires.evidence.map((e) => e.step).includes('Speed'))
})
