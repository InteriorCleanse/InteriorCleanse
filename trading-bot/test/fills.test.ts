/**
 * The fill simulator, rule by rule, with the numbers worked out by hand.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mk, STEP } from './fixtures/candles.ts'
import { simulateEntry, simulateExit, exitOnCandle, IDEAL_ASSUMPTIONS, defaultAssumptions } from '../src/sim/fills.ts'
import type { ExecutionAssumptions, EntryFill } from '../src/sim/fills.ts'
import { tradeMetrics, rrAtFill } from '../src/sim/trades.ts'
import { config } from '../config.ts'

const A: ExecutionAssumptions = { spreadBps: 2, slippageBps: 2, targetTouchBps: 1, latencyCandles: 1, maxEntryDriftAtr: 0.5, takerFeePercent: 0.1, makerFeePercent: 0.05 }
const long = { direction: 'long' as const, intendedEntry: 100, stop: 99, target: 102, atr: 1 }
const short = { direction: 'short' as const, intendedEntry: 100, stop: 101, target: 98, atr: 1 }
const signal = mk(0, 99.5, 100.2, 99.4, 100)

test('a long entry fills on the next candle at its open plus half the spread plus slippage', () => {
  const next = mk(STEP, 100.1, 100.6, 99.9, 100.4)
  const r = simulateEntry(long, [signal, next], 0, A)
  assert.equal(r.filled, true)
  if (r.filled) {
    assert.ok(Math.abs(r.fill.price - 100.1 * (1 + 0.0003)) < 1e-9)
    assert.equal(r.fill.index, 1)
    assert.equal(r.fill.time, next.openTime)
    assert.ok(Math.abs(r.fill.costPerUnit - 100.1 * 0.0003) < 1e-9)
  }
})

test('a short entry fills BELOW the open by the same costs', () => {
  const next = mk(STEP, 100.1, 100.6, 99.9, 100.4)
  const r = simulateEntry(short, [signal, next], 0, A)
  assert.equal(r.filled, true)
  if (r.filled) assert.ok(Math.abs(r.fill.price - 100.1 * (1 - 0.0003)) < 1e-9)
})

test('an entry waits when the next candle has not closed yet, and is missed when price ran away', () => {
  const waiting = simulateEntry(long, [signal], 0, A)
  assert.equal(waiting.filled, false)
  if (!waiting.filled) assert.equal(waiting.reason, 'no-candle')
  const ran = simulateEntry(long, [signal, mk(STEP, 100.6, 101, 100.5, 100.9)], 0, A)
  assert.equal(ran.filled, false)
  if (!ran.filled) { assert.equal(ran.reason, 'missed'); assert.match(ran.detail, /0\.60 ATR/) }
  const justInside = simulateEntry(long, [signal, mk(STEP, 100.49, 101, 100.4, 100.9)], 0, A)
  assert.equal(justInside.filled, true)
})

test('the idealised model fills at the signal close for free, on the signal candle', () => {
  const r = simulateEntry(long, [signal], 0, IDEAL_ASSUMPTIONS)
  assert.equal(r.filled, true)
  if (r.filled) { assert.equal(r.fill.price, 100); assert.equal(r.fill.costPerUnit, 0); assert.equal(r.fill.index, 0) }
})

const fill: EntryFill = { price: 100.13, time: STEP, index: 1, costPerUnit: 0.03 }

test('a stop fills worse than the stop by half-spread plus slippage; a gap fills at the open', () => {
  const stopped = simulateExit(long, fill, [signal, mk(STEP, 100.1, 100.6, 99.9, 100.4), mk(2 * STEP, 100.3, 100.5, 98.9, 99.2)], A)
  assert.equal(stopped?.reason, 'stop')
  assert.ok(Math.abs(stopped!.price - (99 - 100.3 * 0.0003)) < 1e-9)
  assert.equal(stopped!.candlesHeld, 2)
  const gapped = simulateExit(long, fill, [signal, mk(STEP, 100.1, 100.6, 99.9, 100.4), mk(2 * STEP, 98.5, 98.8, 98.2, 98.6)], A)
  assert.equal(gapped?.reason, 'stop')
  assert.ok(Math.abs(gapped!.price - (98.5 - 98.5 * 0.0003)) < 1e-9)
  const shortStopped = simulateExit(short, { ...fill, price: 99.87 }, [signal, mk(STEP, 100, 101.2, 99.8, 100.4)], A)
  assert.equal(shortStopped?.reason, 'stop')
  assert.ok(shortStopped!.price > 101)
})

test('a target needs price to trade THROUGH it; a touch is not a fill', () => {
  const touched = simulateExit(long, fill, [signal, mk(STEP, 100.1, 102.005, 99.9, 101.8)], A)
  assert.equal(touched, null)
  const through = simulateExit(long, fill, [signal, mk(STEP, 100.1, 102.03, 99.9, 101.8)], A)
  assert.equal(through?.reason, 'target')
  assert.equal(through!.price, 102)
})

test('when a candle hits both the stop and the target, the stop wins', () => {
  const e = exitOnCandle(long, mk(STEP, 100.1, 102.5, 98.5, 100), 1, A)
  assert.equal(e?.reason, 'stop')
})

test('the time stop fires after maxHoldCandles and pays exit costs at the close', () => {
  const many = [signal, ...Array.from({ length: config.ict.maxHoldCandles + 3 }, (_, i) => mk(STEP + i * STEP, 100, 100.4, 99.6, 100.1))]
  const timed = simulateExit(long, fill, many, A)
  assert.equal(timed?.reason, 'time')
  assert.equal(timed!.candlesHeld, config.ict.maxHoldCandles)
  assert.ok(Math.abs(timed!.price - (100.1 - 100.1 * 0.0003)) < 1e-9)
})

test('trade metrics charge the taker fee on entry and the right fee on exit', () => {
  const target = tradeMetrics({ direction: 'long', fill: 100, stop: 99, exit: 102, exitReason: 'target', quantity: 2 }, A)
  // gross +2 %, fees 0.1 % + 0.05 %
  assert.ok(Math.abs(target.pnlPercent - (2 - 0.15)) < 1e-9)
  assert.ok(Math.abs(target.pnlUsd - (2 - 0.15) / 100 * 200) < 1e-9)
  assert.ok(Math.abs(target.feesUsd - 0.0015 * 200) < 1e-9)
  assert.ok(Math.abs(target.rMultiple - (2 - 0.15)) < 1e-9)
  assert.equal(target.riskUsd, 2)
  assert.equal(target.outcome, 'WIN')
  const stop = tradeMetrics({ direction: 'long', fill: 100, stop: 99, exit: 98.97, exitReason: 'stop', quantity: 1 }, A)
  assert.ok(stop.rMultiple < -1, 'a slipped stop loses more than 1R')
  assert.equal(stop.outcome, 'LOSS')
  const flat = tradeMetrics({ direction: 'short', fill: 100, stop: 101, exit: 99.8, exitReason: 'time', quantity: 1 }, A)
  assert.equal(flat.outcome, 'FLAT', '0.2 % gross minus 0.2 % of fees is flat')
})

test('reward-to-risk is measured from the fill, not the intended entry', () => {
  assert.equal(rrAtFill('long', 100, 99, 102), 2)
  assert.ok(rrAtFill('long', 100.5, 99, 102) < 1.5)
  assert.equal(rrAtFill('short', 100, 101, 98), 2)
})

test('the default assumptions come from config.ts', () => {
  assert.deepEqual(defaultAssumptions(), config.execution)
})
