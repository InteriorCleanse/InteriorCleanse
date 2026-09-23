/**
 * The regime classifier on its five inputs: each state on a fixture set of
 * inputs, plus the two tricky transitions the plan calls out — a CHoCH with
 * the averages still disagreeing (transition), and a compression-then-BOS
 * with expanding volatility (breakout). Also that the market-state card
 * carries the regime without any of its other fields changing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyRegime, describeRegime } from '../src/features/regime.ts'
import type { RegimeInputs } from '../src/features/regime.ts'
import { assessMarket } from '../src/regime.ts'
import { IctEngine } from '../src/ictStrategy.ts'
import { FeatureEngine } from '../src/features/engine.ts'
import { setupDay, mk, STEP } from './fixtures/candles.ts'
import { config } from '../config.ts'

const RECENT = config.features.regime.recentShiftCandles

const base: RegimeInputs = {
  swingTrend: null, lastShiftKind: null, lastShiftDir: null, shiftAgeCandles: null,
  averages: null, momentumAtr: 0, volLabel: 'normal', volExpanding: false, flow: null,
}

test('trending up: structure and the averages both point up', () => {
  const r = classifyRegime({ ...base, swingTrend: 'bullish', averages: 'up', momentumAtr: 2, flow: 'up' }, RECENT)
  assert.equal(r.state, 'trending-up')
  assert.equal(r.direction, 'up')
  assert.equal(r.confidence, 100, 'all four inputs agree')
  assert.match(r.reasons.join(' '), /higher highs and higher lows.*point up/)
  assert.match(describeRegime(r), /Trending up/)
})

test('trending down: the mirror image', () => {
  const r = classifyRegime({ ...base, swingTrend: 'bearish', averages: 'down', momentumAtr: -2 }, RECENT)
  assert.equal(r.state, 'trending-down')
  assert.equal(r.direction, 'down')
  assert.equal(r.confidence, 75, 'three of four inputs point down; flow abstained')
})

test('ranging: no agreed direction and nothing breaking', () => {
  const r = classifyRegime({ ...base, swingTrend: null, averages: null, momentumAtr: 0.2 }, RECENT)
  assert.equal(r.state, 'ranging')
  assert.equal(r.direction, null)
  assert.match(r.reasons.join(' '), /Ranges resolve when one side gets swept/)
  // Structure leaning one way but averages disagreeing is still a range, not a trend.
  assert.equal(classifyRegime({ ...base, swingTrend: 'bullish', averages: 'down' }, RECENT).state, 'ranging')
})

test('transition: a fresh CHoCH the averages have not confirmed', () => {
  const r = classifyRegime({ ...base, swingTrend: 'bullish', lastShiftKind: 'CHoCH', lastShiftDir: 'bullish', shiftAgeCandles: 3, averages: 'down' }, RECENT)
  assert.equal(r.state, 'transition')
  assert.equal(r.direction, 'up', 'the direction of the change of character')
  assert.match(r.reasons.join(' '), /flipped up.*averages have not confirmed/)
  // Once the averages agree with the CHoCH direction, it is a trend, not a transition.
  assert.equal(classifyRegime({ ...base, swingTrend: 'bullish', lastShiftKind: 'CHoCH', lastShiftDir: 'bullish', shiftAgeCandles: 3, averages: 'up' }, RECENT).state, 'trending-up')
  // A CHoCH too long ago no longer signals a transition.
  assert.notEqual(classifyRegime({ ...base, lastShiftKind: 'CHoCH', lastShiftDir: 'bullish', shiftAgeCandles: RECENT + 5, averages: 'down' }, RECENT).state, 'transition')
})

test('breakout: volatility expands on a fresh break of structure', () => {
  const r = classifyRegime({ ...base, lastShiftKind: 'BOS', lastShiftDir: 'bullish', shiftAgeCandles: 2, volExpanding: true, volLabel: 'wild' }, RECENT)
  assert.equal(r.state, 'breakout')
  assert.equal(r.direction, 'up')
  assert.equal(r.volatility, 'high')
  assert.match(r.reasons.join(' '), /compressed and has just expanded on a fresh break/)
  // A BOS without the volatility expansion is not a breakout.
  assert.notEqual(classifyRegime({ ...base, swingTrend: 'bullish', averages: 'up', lastShiftKind: 'BOS', lastShiftDir: 'bullish', shiftAgeCandles: 2, volExpanding: false }, RECENT).state, 'breakout')
})

test('volatility maps quiet/normal/wild to low/normal/high', () => {
  assert.equal(classifyRegime({ ...base, volLabel: 'quiet' }, RECENT).volatility, 'low')
  assert.equal(classifyRegime({ ...base, volLabel: 'normal' }, RECENT).volatility, 'normal')
  assert.equal(classifyRegime({ ...base, volLabel: 'wild' }, RECENT).volatility, 'high')
})

test('the transition check wins over breakout when both a CHoCH and expansion are present', () => {
  // A CHoCH is not a BOS, so only the transition branch can fire; this pins the ordering.
  const r = classifyRegime({ ...base, lastShiftKind: 'CHoCH', lastShiftDir: 'bearish', shiftAgeCandles: 1, averages: 'up', volExpanding: true, volLabel: 'wild' }, RECENT)
  assert.equal(r.state, 'transition')
  assert.equal(r.direction, 'down')
})

test('the engine puts a regime on the analysis, and the market-state card carries it unchanged', () => {
  const { candles } = setupDay()
  const engine = new IctEngine(candles)
  let a = engine.step(0)
  for (let i = 1; i < candles.length; i++) a = engine.step(i)
  assert.ok(a.features.regime.available, 'the ICT engine runs the structure trackers, so the regime is available')
  const rg = a.features.regime.value!
  assert.ok(['trending-up', 'trending-down', 'ranging', 'breakout', 'transition'].includes(rg.state))
  assert.ok(['low', 'normal', 'high'].includes(rg.volatility))
  assert.ok(rg.reasons.length > 0, 'a regime always explains itself')
  // The card carries the regime but its own verdict is unchanged.
  const state = assessMarket(candles, a, null, null, candles[candles.length - 1].closeTime)
  assert.deepEqual(state.regime, rg)
  const without = assessMarket(candles, { ...a, features: { ...a.features, regime: { ...a.features.regime, value: null, available: false } } }, null, null, candles[candles.length - 1].closeTime)
  assert.equal(without.regime, undefined)
  assert.equal(without.trend, state.trend)
  assert.equal(without.strength, state.strength)
  assert.deepEqual(without.evidence, state.evidence)
})

test('a candles-only run (no structure trackers) has no regime, and says so', () => {
  const candles = Array.from({ length: 20 }, (_, i) => mk(i * STEP, 100, 100.5, 99.5, 100))
  // The ICT engine always supplies structure; a bare FeatureEngine does not.
  const fe = new FeatureEngine(null)
  const s = fe.step(candles, 19, { dayKey: 'D', session: null, atr: 1 })
  assert.equal(s.regime.available, false)
  assert.match(s.regime.note ?? '', /No structure trackers/)
})
