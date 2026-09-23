/**
 * Multi-timeframe intelligence (Phase 22D).
 *
 * The rules being pinned: a higher timeframe is offered only when real candles
 * support it, an incomplete higher-timeframe bar is never emitted, and a
 * period's extreme is not knowable until that period has closed.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateCandles, availableTimeframes, annotateHigherTimeframes, bandFor, splitByBand, timeframeReport, INTERVAL_MINUTES, WEEK_ANCHOR_MS } from '../../src/intel/mtf.ts'
import { noLookahead } from '../../src/intel/types.ts'
import type { Candle } from '../../src/types.ts'

const M = 60_000
const NOW = 1_700_000_000_000

/**
 * `n` five-minute candles with a walking price, starting on a DAY boundary.
 * Buckets are epoch-anchored, so an unaligned start would split the first
 * higher-timeframe bar and make the roll-up assertions meaningless.
 */
const DAY_ALIGNED = Math.floor(1_700_000_000_000 / 86_400_000) * 86_400_000

function candles(n: number, start = DAY_ALIGNED): Candle[] {
  const out: Candle[] = []
  for (let i = 0; i < n; i++) {
    const openTime = start + i * 5 * M
    const base = 100 + Math.sin(i / 7) * 10
    out.push({ openTime, closeTime: openTime + 5 * M - 1, open: base, high: base + 2, low: base - 2, close: base + 0.5, volume: 10 })
  }
  return out
}

test('aggregation rolls candles up correctly', () => {
  const cs = candles(12) // one hour of 5m
  const h = aggregateCandles(cs, 60)
  assert.equal(h.length, 1)
  assert.equal(h[0].open, cs[0].open)
  assert.equal(h[0].close, cs[11].close)
  assert.equal(h[0].high, Math.max(...cs.map((c) => c.high)))
  assert.equal(h[0].low, Math.min(...cs.map((c) => c.low)))
  assert.equal(h[0].volume, cs.reduce((s, c) => s + c.volume, 0))
})

test('an INCOMPLETE higher-timeframe bar is never emitted', () => {
  // 18 five-minute candles = 1.5 hours: only the first hour is complete.
  const h = aggregateCandles(candles(18), 60)
  assert.equal(h.length, 1, 'the half-formed second hour must not be emitted')
})

test('aggregation is deterministic and epoch-anchored', () => {
  const cs = candles(48)
  assert.deepEqual(aggregateCandles(cs, 60), aggregateCandles(cs, 60))
  for (const bar of aggregateCandles(cs, 60)) assert.equal(bar.openTime % (60 * M), 0, 'buckets must be anchored to the epoch')
})

test('timeframes are discovered from the data, and a thin one is reported UNAVAILABLE', () => {
  const thin = availableTimeframes(candles(12), '5m')  // one hour only
  const day = thin.find((t) => t.timeframe === '1d')!
  assert.equal(day.available, false)
  assert.match(day.note, /UNAVAILABLE/)
  assert.match(day.note, /nothing is synthesised/i)

  const rich = availableTimeframes(candles(12 * 24 * 10), '5m') // ten days
  assert.equal(rich.find((t) => t.timeframe === '1d')!.available, true)
  assert.equal(rich.find((t) => t.timeframe === '1h')!.available, true)
})

test('a timeframe below the feed is never offered — nothing is upsampled', () => {
  const tfs = availableTimeframes(candles(100), '5m')
  assert.equal(tfs.some((t) => INTERVAL_MINUTES[t.timeframe] < 5), false)
})

test('higher-timeframe context is banded apart from execution structure', () => {
  assert.equal(bandFor('1d', '5m'), 'htf-context')
  assert.equal(bandFor('1h', '5m'), 'htf-context')
  assert.equal(bandFor('5m', '5m'), 'execution')
  assert.equal(bandFor('1m', '5m'), 'execution')
})

/**
 * AUDIT 1 regression. The MTF layer used to compute previous-day high/low from
 * UTC-midnight buckets while the ENGINE derives them on the ICT trading day that
 * rolls at 18:00 ET. Both were annotated `previous-day-high`, so the chart drew
 * two different lines for the same concept — measured $279.56 apart on real
 * data. The engine is authoritative; the MTF layer must not recompute it.
 */
test('the MTF layer NEVER emits a previous-day level — the engine owns that concept', () => {
  const cs = candles(12 * 24 * 40) // forty days: a 1d bar is easy, and ≥3 weeks exist too
  const asOf = cs[cs.length - 1].closeTime
  const list = annotateHigherTimeframes({ symbol: 'BTCUSDT', executionTimeframe: '5m', engineVersion: 'test', candles: cs, asOf, now: NOW })
  const daily = list.filter((a) => a.annotationType === 'previous-day-high' || a.annotationType === 'previous-day-low')
  assert.deepEqual(daily, [], 'previous-day levels must come from the engine (pdh/pdl), never from MTF aggregation')
  // The week IS the MTF layer's to own — the engine has no weekly concept.
  assert.ok(list.some((a) => a.annotationType === 'previous-week-high'), 'the weekly level is genuinely additive and should still be present')
})

test('weeks are anchored to Monday, not to the epoch (which was a Thursday)', () => {
  const cs = candles(12 * 24 * 40) // forty days
  const weeks = aggregateCandles(cs, INTERVAL_MINUTES['1w'], WEEK_ANCHOR_MS)
  assert.ok(weeks.length > 0)
  for (const w of weeks) {
    assert.equal(new Date(w.openTime).getUTCDay(), 1, `a week must start on a Monday, got ${new Date(w.openTime).toUTCString()}`)
  }
})

test('previous-period extremes are only knowable once the period has closed', () => {
  const cs = candles(12 * 24 * 40) // forty days, so ≥3 complete weeks exist
  const asOf = cs[cs.length - 1].closeTime
  const list = annotateHigherTimeframes({ symbol: 'BTCUSDT', executionTimeframe: '5m', engineVersion: 'test', candles: cs, asOf, now: NOW })
  assert.ok(list.length > 0)
  assert.equal(noLookahead(list), true)
  // The week is the only period extreme this layer owns (the engine owns the day).
  const pwh = list.find((a) => a.annotationType === 'previous-week-high')
  assert.ok(pwh, 'expected a previous-week high')
  assert.ok(pwh!.knownAt > pwh!.eventTime, 'the extreme is only knowable at the period close, after the period began')
  assert.ok(pwh!.knownAt <= asOf, 'nothing may be knowable after the moment being analysed')
  assert.equal(pwh!.timeframe, '1w')
  assert.match(pwh!.rationale, /aggregated for display, not an execution signal, and not an engine level/)
  assert.match(pwh!.rationale, /Monday 00:00 UTC/)
})

test('higher-timeframe swings use the engine tracker and are confirmed late, never early', () => {
  const cs = candles(12 * 24 * 12)
  const asOf = cs[cs.length - 1].closeTime
  const list = annotateHigherTimeframes({ symbol: 'BTCUSDT', executionTimeframe: '5m', engineVersion: 'test', candles: cs, asOf, now: NOW })
  const swings = list.filter((a) => a.source === 'swing-tracker')
  assert.ok(swings.length > 0, 'expected higher-timeframe swings')
  for (const s of swings) {
    assert.ok(s.knownAt > s.eventTime, 'a swing is confirmed only after later bars print')
    assert.ok(s.knownAt <= asOf)
    assert.match(s.rationale, /confirmed \d+ minutes after it printed/)
  }
})

test('nothing is produced for a timeframe with no data, and it never throws', () => {
  const list = annotateHigherTimeframes({ symbol: 'X', executionTimeframe: '5m', engineVersion: 'v', candles: [], asOf: NOW, now: NOW })
  assert.deepEqual(list, [])
  assert.doesNotThrow(() => timeframeReport([], '5m'))
})

test('splitByBand separates the two bands without losing anything', () => {
  const cs = candles(12 * 24 * 12)
  const asOf = cs[cs.length - 1].closeTime
  const htf = annotateHigherTimeframes({ symbol: 'B', executionTimeframe: '5m', engineVersion: 'v', candles: cs, asOf, now: NOW })
  const { htfContext, execution } = splitByBand(htf, '5m')
  assert.equal(htfContext.length + execution.length, htf.length)
  assert.ok(htfContext.length > 0)
  for (const a of htfContext) assert.ok(INTERVAL_MINUTES[a.timeframe] > 5)
})
