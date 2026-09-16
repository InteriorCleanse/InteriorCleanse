/**
 * The three parked ICT stories, ported as strategies: silver bullet, unicorn,
 * turtle soup. Each fires on a hand-built analysis that satisfies it and holds
 * — naming the gate — on one that breaks it. Read-only opinions; none of them
 * changes the frozen session model.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { silverBullet, SILVER_BULLET_HOURS } from '../../src/strategies/silverBullet.ts'
import { unicorn } from '../../src/strategies/unicorn.ts'
import { turtleSoup } from '../../src/strategies/turtleSoup.ts'
import { strategyIds } from '../../src/strategies/registry.ts'
import type { IctAnalysis, FVG, OrderBlock, Sweep } from '../../src/types.ts'
import type { StrategyContext } from '../../src/strategies/types.ts'

function fvg(o: Partial<FVG>): FVG {
  return { id: 'f', direction: 'bullish', top: 105, bottom: 100, createdIndex: 8, createdTime: 0, sizeAtr: 1.2, fromDisplacement: true, state: 'fresh', ...o }
}
function ob(o: Partial<OrderBlock>): OrderBlock {
  return { id: 'b', direction: 'bearish', top: 105, bottom: 100, index: 3, time: 0, displacementIndex: 4, sizeAtr: 1.5, withStructureBreak: true, withFvg: true, state: 'broken', ...o }
}
function sweep(o: Partial<Sweep>): Sweep {
  return { level: { kind: 'swingHigh', price: 110, label: 'prior high', time: 0 } as never, side: 'above', index: 9, time: 0, wick: 112, depthAtr: 0.8, ...o }
}
function analysis(over: Partial<IctAnalysis>): IctAnalysis {
  return { index: 10, etClock: '10:30', structureTrend: 'bullish', fvgs: [], orderBlocks: [], sweepsToday: [], swingSweepsToday: [], ...over } as unknown as IctAnalysis
}
function ctx(price: number, a: IctAnalysis): StrategyContext {
  return { candles: [], index: 10, price, atr: 2, analysis: a, features: null }
}

// ---- silver bullet ----
test('silver bullet fires on a fresh displacement gap retest inside a window', () => {
  const a = analysis({ etClock: '10:30', structureTrend: 'bullish', fvgs: [fvg({ state: 'fresh', direction: 'bullish', top: 105, bottom: 100, createdIndex: 8, fromDisplacement: true })] })
  const v = silverBullet.evaluate(ctx(102, a))
  assert.equal(v.action, 'BUY')
  assert.equal(v.direction, 'long')
  assert.ok(v.plan && v.plan.stop < 100)
})

test('silver bullet holds outside the windows and names the window gate', () => {
  const a = analysis({ etClock: '09:00', fvgs: [fvg({})] })
  const v = silverBullet.evaluate(ctx(102, a))
  assert.equal(v.action, 'HOLD')
  assert.ok(v.evidence.some((e) => e.step === 'Window' && !e.passed))
  assert.ok(SILVER_BULLET_HOURS.includes(10))
})

// ---- unicorn ----
test('unicorn fires when a broken bearish block overlaps a bullish gap and price retests', () => {
  const a = analysis({ orderBlocks: [ob({ direction: 'bearish', state: 'broken', top: 105, bottom: 100 })], fvgs: [fvg({ direction: 'bullish', state: 'fresh', top: 104, bottom: 101 })] })
  const v = unicorn.evaluate(ctx(102, a))
  assert.equal(v.action, 'BUY')
  assert.equal(v.direction, 'long')
})

test('unicorn holds when there is no breaker', () => {
  const a = analysis({ orderBlocks: [ob({ state: 'fresh' })], fvgs: [fvg({})] })
  const v = unicorn.evaluate(ctx(102, a))
  assert.equal(v.action, 'HOLD')
  assert.ok(v.evidence.some((e) => e.step === 'Breaker' && !e.passed))
})

// ---- turtle soup ----
test('turtle soup fades a failed high raid (short) once price closes back inside', () => {
  const a = analysis({ swingSweepsToday: [sweep({ side: 'above', level: { price: 110 } as never, wick: 112, index: 9 })] })
  const v = turtleSoup.evaluate(ctx(108, a)) // price back below the raided high
  assert.equal(v.action, 'SELL')
  assert.equal(v.direction, 'short')
  assert.ok(v.plan && v.plan.stop > 110)
})

test('turtle soup holds while the raid has not failed yet', () => {
  const a = analysis({ swingSweepsToday: [sweep({ side: 'above', level: { price: 110 } as never, wick: 112, index: 9 })] })
  const v = turtleSoup.evaluate(ctx(111, a)) // still above the raided high
  assert.equal(v.action, 'HOLD')
  assert.ok(v.evidence.some((e) => e.step === 'Failure' && !e.passed))
})

// ---- registry ----
test('the three ICT stories are registered', () => {
  for (const id of ['silver-bullet', 'unicorn', 'turtle-soup']) assert.ok(strategyIds().includes(id), `${id} should be registered`)
})
