/**
 * THE NEWS BRAIN.
 *
 * Two things separate a measured news read from commentary, and both are
 * tested here as invariants rather than as features:
 *
 *   1. The surprise, not the print. A CPI exactly at forecast is a non-event
 *      however the feed labels it, and the module must say so.
 *   2. The measurement outranks the label. "High impact" is the feed's opinion
 *      about markets in general; whether THIS symbol moves at 08:30 is a fact
 *      about this symbol, and when the two disagree the read must say which one
 *      is about you.
 *
 * And the refusal that matters most: no output, in any state, may tell you which
 * way to trade. That is the line between a news read and a tip.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFigure, surpriseOf, clockWindowStudy, newsRead, renderNewsRead } from '../../src/news/brain.ts'
import type { Candle, CalendarEvent } from '../../src/types.ts'

const STEP = 300_000

/**
 * Days of 5-minute candles in which one clock window is deliberately wilder.
 * 13:30 UTC is 08:30 New York in winter — the slot the big US releases land in.
 */
function days(n: number, opts: { loudMinuteUTC?: number; loudness?: number } = {}): Candle[] {
  const loudAt = opts.loudMinuteUTC ?? 13 * 60 + 30
  const loudness = opts.loudness ?? 1
  const out: Candle[] = []
  let price = 30_000
  const start = Date.UTC(2026, 0, 5, 0, 0)
  for (let d = 0; d < n; d++) {
    for (let i = 0; i < 288; i++) {
      const openTime = start + d * 86_400_000 + i * STEP
      const minuteUTC = (i * 5) % 1440
      const loud = minuteUTC >= loudAt && minuteUTC < loudAt + 30
      const amp = price * 0.0004 * (loud ? loudness : 1)
      const open = price
      const close = open + (i % 2 ? amp : -amp) * 0.4
      out.push({ openTime, closeTime: openTime + STEP - 1, open, high: Math.max(open, close) + amp, low: Math.min(open, close) - amp, close, volume: 1 })
      price = close
    }
  }
  return out
}

function ev(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return { title: 'CPI m/m', country: 'USD', time: Date.UTC(2026, 0, 12, 13, 30), impact: 'High', forecast: '0.3%', previous: '0.2%', ...over }
}

// ---------------------------------------------------------------
// Reading the figures
// ---------------------------------------------------------------

test('calendar figures parse, including the units feeds actually use', () => {
  assert.equal(parseFigure('0.3%'), 0.3)
  assert.equal(parseFigure('-1.2M'), -1_200_000)
  assert.equal(parseFigure('225K'), 225_000)
  assert.equal(parseFigure('1.5B'), 1_500_000_000)
  assert.equal(parseFigure('1,234'), 1234)
  assert.equal(parseFigure(' 4.25 '), 4.25)
})

test('an unreadable figure is null, never a guess', () => {
  // A wrong number here becomes a wrong surprise downstream, which is worse
  // than no surprise at all.
  for (const bad of ['', '—', 'Tentative', 'n/a', undefined, null, '1.2.3']) {
    assert.equal(parseFigure(bad as string), null, `"${bad}" should not parse`)
  }
})

// ---------------------------------------------------------------
// The surprise, not the print
// ---------------------------------------------------------------

test('a print exactly at forecast is called a non-event, whatever the feed says', () => {
  const s = surpriseOf(ev({ actual: '0.3%', impact: 'High' }))
  assert.equal(s.verdict, 'IN LINE')
  assert.equal(s.surprise, 0)
  assert.match(s.note, /non-event however the feed labels it/)
})

test('a miss is sized relative to the forecast, not in raw units', () => {
  // 0.1 off a forecast of 0.3 is a third — large.
  const big = surpriseOf(ev({ actual: '0.4%', forecast: '0.3%' }))
  assert.equal(big.verdict, 'ABOVE FORECAST')
  assert.ok(Math.abs(big.surpriseRatio! - 1 / 3) < 1e-6)
  // The same 0.1 off 225000 is nothing, and must not read as a surprise.
  const tiny = surpriseOf(ev({ title: 'Payrolls', actual: '225000', forecast: '225000.1' }))
  assert.equal(tiny.verdict, 'IN LINE')
})

test('a forecast with no print says so rather than inventing a surprise', () => {
  const s = surpriseOf(ev({ actual: undefined }))
  assert.equal(s.verdict, 'NOT OUT YET')
  assert.equal(s.surprise, null)
})

test('a print with no forecast is unreadable, not a surprise of zero', () => {
  const s = surpriseOf(ev({ actual: '0.4%', forecast: '' }))
  assert.equal(s.verdict, 'UNREADABLE')
  assert.equal(s.surprise, null)
})

// ---------------------------------------------------------------
// Does this symbol actually move then?
// ---------------------------------------------------------------

test('a genuinely wild window is measured as bigger than an ordinary one', () => {
  const study = clockWindowStudy(days(20, { loudness: 6 }), 8, 30, 30)
  assert.ok(study.samples >= 5)
  assert.equal(study.verdict, 'MUCH BIGGER')
  assert.ok(study.multiple! > 2, `expected a large multiple, got ${study.multiple}`)
})

test('a window this symbol does NOT react in is called ordinary, even at a headline hour', () => {
  // The whole point: the feed can shout, and the instrument can be unmoved.
  const study = clockWindowStudy(days(20, { loudness: 1 }), 8, 30, 30)
  assert.equal(study.verdict, 'ORDINARY')
  assert.match(study.note, /has not historically cared/)
})

test('too little history refuses to characterise the window', () => {
  const study = clockWindowStudy(days(2, { loudness: 6 }), 8, 30, 30)
  assert.equal(study.verdict, 'TOO FEW')
  assert.match(study.note, /nothing is claimed/)
})

test('no candles at all is TOO FEW, not a quiet market', () => {
  const study = clockWindowStudy([], 8, 30, 30)
  assert.equal(study.verdict, 'TOO FEW')
  assert.equal(study.multiple, null)
  assert.equal(study.samples, 0)
})

// ---------------------------------------------------------------
// The read
// ---------------------------------------------------------------

test('when the feed and the measurement disagree, the read says which one is about you', () => {
  const r = newsRead({
    events: [ev({ impact: 'High', time: Date.UTC(2026, 0, 12, 13, 30) })],
    candles: days(20, { loudness: 1 }),
    symbol: 'BTCUSDT',
    now: Date.UTC(2026, 0, 12, 12, 0),
  })
  assert.equal(r.events.length, 1)
  assert.match(r.events[0].read, /feed calls it High impact/)
  assert.match(r.events[0].read, /the measurement is the one about BTCUSDT/)
})

test('the feed label is kept separate from the measurement, never merged', () => {
  const r = newsRead({ events: [ev()], candles: days(20, { loudness: 6 }), symbol: 'BTCUSDT', now: Date.UTC(2026, 0, 12, 12, 0) })
  const e = r.events[0]
  assert.equal(e.feedImpact, 'High', 'the feed claim is preserved verbatim')
  assert.equal(e.window.verdict, 'MUCH BIGGER', 'the measurement stands on its own')
})

/**
 * THE REFUSAL THAT MATTERS MOST.
 *
 * "Hot CPI so short it" requires knowing how this instrument maps a surprise to
 * a price move in the current regime. That mapping is unstable and inverts. Any
 * output that turns a headline into a side is selling confidence the data does
 * not support, so no string produced here may do it — in any state.
 */
test('no output, in any state, tells you which way to trade', () => {
  const banned = /\b(go long|go short|buy the|sell the|short it|long it|bullish|bearish|will rally|will drop|expect (?:a )?(?:rally|drop|pump|dump))\b/i
  const lines: string[] = []
  for (const loudness of [1, 6]) {
    for (const actual of [undefined, '0.3%', '0.9%', '-0.4%']) {
      const r = newsRead({
        events: [ev({ actual, impact: 'High' }), ev({ title: 'Crude Oil Inventories', impact: 'Medium', forecast: '-1.2M', actual, time: Date.UTC(2026, 0, 12, 15, 30) })],
        candles: days(20, { loudness }),
        symbol: 'BTCUSDT',
        now: Date.UTC(2026, 0, 12, 12, 0),
      })
      for (const e of r.events) lines.push(e.read, e.surprise.note, e.window.note)
      lines.push(renderNewsRead(r), ...r.caveats)
    }
  }
  for (const line of lines) {
    assert.equal(banned.test(line), false, `the news brain called a direction: ${line}`)
  }
})

test('the read states its own limits, including that it is a clock study', () => {
  const r = newsRead({ events: [ev()], candles: days(20), symbol: 'BTCUSDT', now: Date.UTC(2026, 0, 12, 12, 0) })
  const joined = r.caveats.join(' ')
  assert.match(joined, /No direction is called here/i)
  assert.match(joined, /measures the CLOCK, not the event/i)
  assert.match(joined, /Nothing here reaches the engine/i)
})

test('an empty calendar renders as nothing scheduled, not as an empty promise', () => {
  const r = newsRead({ events: [], candles: days(20), symbol: 'BTCUSDT', now: Date.UTC(2026, 0, 12, 12, 0) })
  assert.deepEqual(r.events, [])
  assert.match(renderNewsRead(r), /Nothing scheduled in the window/)
})
