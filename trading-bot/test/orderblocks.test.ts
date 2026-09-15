/** Order blocks on hand-built candles: detection, the quality marks, mitigation, the breaker flip, and expiry. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mk, STEP } from './fixtures/candles.ts'
import { OrderBlockTracker, detectOrderBlock, breakerRole, describeOrderBlock } from '../src/orderblocks.ts'
import type { Candle } from '../src/types.ts'

const t0 = Date.UTC(2026, 0, 15, 14, 0)
const at = (i: number) => t0 + i * STEP
const ATR = 1
const ctxNone = { brokeStructure: false, leftFvg: false }

/** Quiet candles, a red candle, then a big green displacement. */
function bullishSetup(): Candle[] {
  return [
    mk(at(0), 100, 100.4, 99.6, 100.1),
    mk(at(1), 100.1, 100.5, 99.7, 100.2),
    mk(at(2), 100.2, 100.6, 99.4, 99.6), // the last red candle: the order block, 99.4–100.6
    mk(at(3), 99.6, 102.2, 99.5, 102.0), // displacement: body 2.4 ATR
  ]
}

test('a displacement candle turns the last opposite-coloured candle before it into an order block, wick to wick', () => {
  const cs = bullishSetup()
  assert.equal(detectOrderBlock(cs, 2, ATR, ctxNone), null, 'a small candle is not a displacement')
  const ob = detectOrderBlock(cs, 3, ATR, ctxNone)!
  assert.ok(ob)
  assert.equal(ob.direction, 'bullish')
  assert.equal(ob.index, 2)
  assert.equal(ob.top, 100.6)
  assert.equal(ob.bottom, 99.4)
  assert.equal(ob.displacementIndex, 3)
  assert.equal(ob.state, 'fresh')
  assert.equal(ob.withStructureBreak, false)
  assert.equal(ob.withFvg, false)
  // The quality marks come from the caller, which knows whether the same candle broke structure or left a gap.
  const marked = detectOrderBlock(cs, 3, ATR, { brokeStructure: true, leftFvg: true })!
  assert.equal(marked.withStructureBreak, true)
  assert.equal(marked.withFvg, true)
  assert.match(describeOrderBlock(marked), /broke structure and left a gap/)
  // A bearish one is the mirror: the last green candle before a big red one.
  const bear = [mk(at(0), 100, 100.5, 99.5, 100.4), mk(at(1), 100.4, 98.2, 100.5, 98.0)]
  bear[1] = mk(at(1), 100.4, 100.5, 98.0, 98.1)
  const ob2 = detectOrderBlock(bear, 1, ATR, ctxNone)!
  assert.equal(ob2.direction, 'bearish')
  assert.equal(ob2.index, 0)
})

test('the block is found only within the lookback, and a same-coloured candle in between is skipped over', () => {
  const cs = [
    mk(at(0), 100.2, 100.6, 99.4, 99.6), // red — too far back for lookback 3? index 0 vs displacement at 4: distance 4
    mk(at(1), 99.6, 100.0, 99.5, 99.9), // green
    mk(at(2), 99.9, 100.1, 99.8, 100.0), // green
    mk(at(3), 100.0, 100.2, 99.9, 100.1), // green
    mk(at(4), 100.1, 102.6, 100.0, 102.5), // displacement up
  ]
  assert.equal(detectOrderBlock(cs, 4, ATR, ctxNone), null, 'the only red candle is outside the 3-candle lookback')
  cs[2] = mk(at(2), 100.0, 100.3, 99.7, 99.8) // make candle 2 red
  const ob = detectOrderBlock(cs, 4, ATR, ctxNone)!
  assert.equal(ob.index, 2, 'the nearest opposite-coloured candle wins, skipping the green one at 3')
})

test('a block is mitigated when touched, becomes a breaker when closed through, and expires when the breaker fails too', () => {
  const cs = bullishSetup()
  const tr = new OrderBlockTracker()
  for (let i = 0; i < cs.length; i++) tr.update(cs, i, ATR, ctxNone)
  assert.equal(tr.blocks.length, 1)
  const ob = tr.blocks[0]
  // Price moves away, then comes back into the zone and closes above its floor: mitigated.
  cs.push(mk(at(4), 102.0, 102.5, 101.5, 102.1))
  tr.update(cs, 4, ATR, ctxNone)
  assert.equal(ob.state, 'fresh')
  cs.push(mk(at(5), 102.1, 102.2, 100.3, 100.9))
  const e5 = tr.update(cs, 5, ATR, ctxNone)
  assert.equal(ob.state, 'mitigated')
  assert.equal(ob.mitigatedIndex, 5)
  assert.equal(e5.mitigated.length, 1)
  assert.deepEqual(tr.open('bullish').map((b) => b.id), [ob.id])
  // Then a close below the bottom: broken → breaker, now resistance.
  cs.push(mk(at(6), 100.9, 101.0, 99.0, 99.2))
  const e6 = tr.update(cs, 6, ATR, ctxNone)
  assert.equal(ob.state, 'broken')
  assert.equal(ob.brokenIndex, 6)
  assert.equal(e6.broken.length, 1)
  assert.equal(breakerRole(ob), 'resistance')
  assert.deepEqual(tr.breakers('resistance').map((b) => b.id), [ob.id])
  assert.equal(tr.open('bullish').length, 0)
  assert.match(describeOrderBlock(ob), /breaker \(resistance\)/)
  // Price pokes back into the breaker but closes below its top: still a breaker.
  cs.push(mk(at(7), 99.2, 100.2, 99.0, 99.5))
  tr.update(cs, 7, ATR, ctxNone)
  assert.equal(ob.state, 'broken')
  // A close back above the top means the breaker failed: expired and gone from the active list.
  cs.push(mk(at(8), 99.5, 101.2, 99.4, 101.0))
  tr.update(cs, 8, ATR, ctxNone)
  assert.equal(ob.state, 'expired')
  assert.ok(!tr.active().some((b) => b.id === ob.id), 'gone from the active list')
  assert.equal(breakerRole(ob), null)
  // The big red candle at 6 and the big green one at 8 were displacements of their own, so they made blocks of their own:
  // the last green candle before 6 is 4; the last red candle before 8 is 6 itself (7 was green, so it is skipped).
  assert.deepEqual(tr.active().map((b) => [b.direction, b.index]), [['bearish', 4], ['bullish', 6]])
})

test('the displacement candle itself cannot mitigate its own block, and the same block is not created twice', () => {
  const cs = bullishSetup()
  const tr = new OrderBlockTracker()
  for (let i = 0; i < cs.length; i++) tr.update(cs, i, ATR, ctxNone)
  assert.equal(tr.blocks[0].state, 'fresh', 'the displacement opened inside the zone but that is not a retest')
  tr.update(cs, 3, ATR, ctxNone)
  assert.equal(tr.blocks.length, 1)
})
