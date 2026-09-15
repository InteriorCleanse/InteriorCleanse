/**
 * The moving-average, momentum and volatility readings against hand
 * computations — the same numbers the market-state vote has always used.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mk, STEP } from '../fixtures/candles.ts'
import { ema, resampleCloses, barsPerHour, hourlyAverages } from '../../src/features/ema.ts'
import { momentum } from '../../src/features/momentum.ts'
import { volatility } from '../../src/features/volatility.ts'
import { typicalAtr, atrAt } from '../../src/features/atr.ts'
import { config } from '../../config.ts'

test('an EMA is the textbook recursion: seed with the first value, then k·x + (1−k)·previous', () => {
  const e = ema([10, 11, 12, 13], 3) // k = 0.5
  assert.deepEqual(e, [10, 10.5, 11.25, 12.125])
})

test('hourly resampling takes every 12th close of 5-minute candles, aligned to the last one', () => {
  const cs = Array.from({ length: 30 }, (_, i) => mk(i * STEP, i, i, i, i))
  assert.equal(barsPerHour(cs), 12)
  assert.deepEqual(resampleCloses(cs, 12), [17, 29])
  assert.deepEqual(resampleCloses(cs, 12, 25), [13, 25], 'ending at an earlier candle shifts the whole grid')
})

test('the hourly averages need about 60 hours and then report the 20, the 50 and the 20 six bars ago', () => {
  const short = Array.from({ length: 12 * 59 }, (_, i) => mk(i * STEP, 100, 100, 100, 100))
  assert.equal(hourlyAverages(short, short.length - 1), null)
  const cs = Array.from({ length: 12 * 80 }, (_, i) => mk(i * STEP, 100 + i * 0.01, 100 + i * 0.01, 100 + i * 0.01, 100 + i * 0.01))
  const h = hourlyAverages(cs, cs.length - 1)!
  assert.equal(h.hours, 80)
  const hourly = resampleCloses(cs, 12)
  const e20 = ema(hourly, 20)
  assert.equal(h.ema20, e20[e20.length - 1])
  assert.equal(h.ema20Prev, e20[e20.length - 7])
  assert.equal(h.ema50, ema(hourly, 50)[hourly.length - 1])
  assert.ok(h.ema20 > h.ema50, 'a rising series has the fast average above the slow one')
  assert.equal(config.features.hourlyAveragesMinHours, 60)
})

test('momentum is the close-to-close move over three hours, in ATRs', () => {
  const cs = Array.from({ length: 50 }, (_, i) => mk(i * STEP, 100 + i, 100.5 + i, 99.5 + i, 100 + i))
  const m = momentum(cs, 49, 2)
  assert.equal(m.hours, 3)
  assert.equal(m.moveAtr, (cs[49].close - cs[49 - 36].close) / 2)
})

test('volatility compares this candle\'s ATR with the median ATR sampled across the last day', () => {
  const quiet = Array.from({ length: 400 }, (_, i) => mk(i * STEP, 100, 101, 99, 100))
  const v = volatility(quiet, 399, atrAt(quiet, 399))
  assert.equal(v.label, 'normal')
  assert.ok(Math.abs(v.ratio - 1) < 1e-9)
  assert.equal(v.typicalAtr, typicalAtr(quiet, 399))
  // The last 14 candles triple their range: the current ATR climbs well above the typical one.
  const wild = quiet.map((c, i) => (i >= 386 ? mk(c.openTime, 100, 103, 97, 100) : c))
  assert.equal(volatility(wild, 399, atrAt(wild, 399)).label, 'wild')
  // Short history: the typical ATR falls back to the current one, so the ratio is 1.
  const tiny = quiet.slice(0, 5)
  assert.equal(volatility(tiny, 4, atrAt(tiny, 4)).ratio, 1)
})
