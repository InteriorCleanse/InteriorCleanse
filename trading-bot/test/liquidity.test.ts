/** Swing sweeps and the liquidity reading on hand-built candles. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mk, STEP } from './fixtures/candles.ts'
import { SwingTracker } from '../src/structure.ts'
import { detectSwingSweep, detectSweeps, isHighLevel } from '../src/liquidity.ts'
import { liquidityReading } from '../src/features/liquidity.ts'
import type { Candle, Level, Sweep } from '../src/types.ts'
import { config } from '../config.ts'

const t0 = Date.UTC(2026, 0, 15, 14, 0)
const at = (i: number) => t0 + i * STEP
const ATR = 1

/** A swing high at 105 (index 3) confirmed by index 6, then quiet candles. */
function withSwingHigh(): { cs: Candle[]; swings: SwingTracker } {
  const vals = [100, 102, 104, 105, 104, 102, 100, 100, 100]
  const cs = vals.map((v, i) => mk(at(i), v - 0.05, v + (i === 3 ? 0 : 0.1), v - 0.1, v + 0.05))
  cs[3] = mk(at(3), 104.9, 105, 104.5, 104.95)
  const swings = new SwingTracker()
  for (let i = 0; i < cs.length; i++) swings.add(cs, i)
  return { cs, swings }
}

test('a wick past the last swing high that closes back below it is a swing sweep; a clean close through it is not', () => {
  const { cs, swings } = withSwingHigh()
  assert.equal(swings.latest('high')!.price, 105)
  const swept = new Set<number>()
  const minDepth = ATR * config.ict.sweepMinDepthAtr
  // Not deep enough.
  cs.push(mk(at(9), 100, 105 + minDepth / 2, 99.9, 104))
  assert.equal(detectSwingSweep(cs[9], 9, swings, ATR, swept), null)
  // Deep enough and closed back below: a sweep from above.
  cs.push(mk(at(10), 100, 105.5, 99.9, 104))
  const s = detectSwingSweep(cs[10], 10, swings, ATR, swept)!
  assert.ok(s)
  assert.equal(s.side, 'above')
  assert.equal(s.level.kind, 'swing-high')
  assert.match(s.level.label, /^Swing high \((H|HH|LH)\)$/)
  assert.equal(s.wick, 105.5)
  assert.ok(Math.abs(s.depthAtr - 0.5) < 1e-9)
  assert.equal(s.level.sweptAt, cs[10].openTime)
  assert.ok(isHighLevel(s.level))
  // The same swing cannot be swept twice.
  cs.push(mk(at(11), 100, 105.6, 99.9, 104))
  assert.equal(detectSwingSweep(cs[11], 11, swings, ATR, swept), null)
  // A clean close above a fresh swing high is a break, not a sweep.
  const fresh = withSwingHigh()
  fresh.cs.push(mk(at(9), 100, 106, 99.9, 105.8))
  assert.equal(detectSwingSweep(fresh.cs[9], 9, fresh.swings, ATR, new Set()), null)
})

test('a swing low is the mirror image', () => {
  const vals = [100, 98, 96, 95, 96, 98, 100, 100, 100]
  const cs = vals.map((v, i) => mk(at(i), v + 0.05, v + 0.1, v - (i === 3 ? 0 : 0.1), v - 0.05))
  cs[3] = mk(at(3), 95.1, 95.5, 95, 95.05)
  const swings = new SwingTracker()
  for (let i = 0; i < cs.length; i++) swings.add(cs, i)
  assert.equal(swings.latest('low')!.price, 95)
  cs.push(mk(at(9), 100, 100.1, 94.4, 96))
  const s = detectSwingSweep(cs[9], 9, swings, ATR, new Set())!
  assert.equal(s.side, 'below')
  assert.equal(s.level.kind, 'swing-low')
  assert.ok(!isHighLevel(s.level))
})

test('the liquidity reading names the nearest intact pool above and below and counts today\'s raids', () => {
  const levels: Level[] = [
    { kind: 'asia-high', price: 110, time: 1, label: 'Asia high' },
    { kind: 'pdh', price: 120, time: 1, label: "Yesterday's high" },
    { kind: 'asia-low', price: 95, time: 1, label: 'Asia low', sweptAt: 5 },
    { kind: 'pdl', price: 90, time: 1, label: "Yesterday's low" },
    { kind: 'eqh', price: 104, time: 1, label: 'Equal highs', brokenAt: 6 },
  ]
  const sweeps: Sweep[] = [{ level: levels[2], side: 'below', index: 5, time: 5, wick: 94.5, depthAtr: 0.5 }]
  const swingSweeps: Sweep[] = [{ level: { kind: 'swing-high', price: 103, time: 2, label: 'Swing high (HH)' }, side: 'above', index: 8, time: 8, wick: 103.5, depthAtr: 0.5 }]
  const r = liquidityReading({ levels, sweeps, swingSweeps }, 100, 2)
  assert.equal(r.above!.label, 'Asia high', 'the broken equal highs do not count')
  assert.equal(r.above!.distanceAtr, 5)
  assert.equal(r.below!.label, "Yesterday's low", 'the swept Asia low does not count')
  assert.equal(r.sweptToday.sessionLevels, 1)
  assert.equal(r.sweptToday.swings, 1)
  assert.equal(r.sweptToday.last!.label, 'Swing high (HH)', 'the most recent raid of either kind')
  const empty = liquidityReading({ levels: [], sweeps: [], swingSweeps: [] }, 100, 2)
  assert.equal(empty.above, null)
  assert.equal(empty.sweptToday.last, null)
})

test('session-level sweeps are untouched by the new swing kinds: detectSweeps still marks a level once', () => {
  const levels: Level[] = [{ kind: 'asia-high', price: 105, time: at(0), label: 'Asia high' }]
  const c = mk(at(5), 104, 105.5, 103.9, 104.5)
  const out = detectSweeps(c, 5, levels, ATR)
  assert.equal(out.length, 1)
  assert.equal(detectSweeps(mk(at(6), 104, 105.6, 103.9, 104.5), 6, levels, ATR).length, 0)
})
