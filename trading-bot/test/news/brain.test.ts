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
import { parseFigure, surpriseOf, clockWindowStudy, eventStudy, newsRead, renderNewsRead } from '../../src/news/brain.ts'
import type { Candle, CalendarEvent } from '../../src/types.ts'

const STEP = 300_000
const DAY = 86_400_000
/** 13:30 UTC on the first day of the synthetic history — 08:30 New York in winter. */
const FIRST_LOUD = Date.UTC(2026, 0, 5, 13, 30)

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
// Does this symbol move on THIS RELEASE — the study the clock cannot do
// ---------------------------------------------------------------

/** Timestamps of n daily instances landing in the loud window. */
const instances = (n: number, from = 1) => Array.from({ length: n }, (_, i) => FIRST_LOUD + (from + i) * DAY)

test('with nothing remembered, the event study claims nothing and says why', () => {
  const s = eventStudy(days(20, { loudness: 6 }), [], { series: 'CPI m/m' })
  assert.equal(s.verdict, 'TOO FEW')
  assert.equal(s.samples, 0)
  assert.equal(s.onRecord, 0)
  assert.equal(s.multiple, null)
  assert.match(s.note, /No past instances of CPI m\/m are on record yet/)
})

test('past instances of a release this symbol reacts to are measured as bigger', () => {
  const s = eventStudy(days(20, { loudness: 6 }), instances(8), { series: 'CPI m/m' })
  assert.equal(s.samples, 8)
  assert.equal(s.verdict, 'MUCH BIGGER')
  assert.ok(s.multiple! > 2, `expected a large multiple, got ${s.multiple}`)
  assert.ok(s.worstRangePct! >= s.medianRangePct!, 'the tail must not be smaller than the median')
  assert.equal(s.lastMeasured, FIRST_LOUD + 8 * DAY)
})

test('a release this symbol has never reacted to is called ordinary, whatever the feed says', () => {
  const s = eventStudy(days(20, { loudness: 1 }), instances(8), { series: 'Crude Oil Inventories' })
  assert.equal(s.verdict, 'ORDINARY')
  assert.match(s.note, /has not historically reacted to this release/)
})

test('too few recorded instances refuses to characterise the release, and names both counts', () => {
  const s = eventStudy(days(20, { loudness: 6 }), instances(3), { series: 'CPI m/m' })
  assert.equal(s.verdict, 'TOO FEW')
  assert.equal(s.samples, 3)
  assert.equal(s.onRecord, 3)
  assert.match(s.note, /3 of 3 recorded instances of CPI m\/m/)
})

/**
 * A REFUSAL WITH A NUMBER BESIDE IT IS NOT A REFUSAL.
 *
 * Both studies computed a multiple and returned it even when the verdict was
 * TOO FEW, so a rendering printed "TOO FEW 6.00×" — the word that declines to
 * characterise the window, next to the characterisation. A ratio off three days
 * is not a measurement, and a reader takes the number. The raw medians stay,
 * because those ARE measurements; the ratio does not.
 */
test('below the sample bar, neither study reports a multiple', () => {
  const thin = eventStudy(days(20, { loudness: 6 }), instances(3), { series: 'CPI m/m' })
  assert.equal(thin.verdict, 'TOO FEW')
  assert.equal(thin.multiple, null, 'a TOO FEW event study printed a multiple beside its own refusal')
  assert.ok(thin.medianRangePct !== null, 'the raw measurement is still a measurement and should survive')

  const clock = clockWindowStudy(days(2, { loudness: 6 }), 8, 30, 30)
  assert.equal(clock.verdict, 'TOO FEW')
  assert.equal(clock.multiple, null, 'a TOO FEW clock study printed a multiple beside its own refusal')
})

test('instances outside the candle history are on record but are not samples', () => {
  // The distinction matters: "we remember six" and "we could measure six" are
  // different numbers, and reporting the first as the second would manufacture
  // a sample out of missing data.
  const old = Array.from({ length: 6 }, (_, i) => FIRST_LOUD - (i + 1) * 40 * DAY)
  const s = eventStudy(days(20, { loudness: 6 }), old, { series: 'CPI m/m' })
  assert.equal(s.onRecord, 6)
  assert.equal(s.samples, 0)
  assert.equal(s.verdict, 'TOO FEW')
  assert.match(s.note, /0 of 6 recorded instances/)
})

/**
 * A SLIVER OF DATA IS NOT A COVERED WINDOW.
 *
 * The coverage rule used to hardcode five-minute candles: a window counted as
 * measurable on `floor(minutes / 5) - 1` candles whatever the interval really
 * was. On 1-minute data that made a 30-minute window "covered" by five candles —
 * six minutes of data measured as if it were thirty, which reads as calm for
 * entirely the wrong reason and biases every study toward ORDINARY.
 */
test('a 30-minute window with six minutes of one-minute candles in it is not a sample', () => {
  const sparse: Candle[] = []
  let price = 30_000
  for (let d = 0; d < 20; d++) {
    for (let h = 0; h < 24; h++) {
      // Only the first five minutes of each hour exist.
      for (let m = 0; m < 5; m++) {
        const openTime = Date.UTC(2026, 0, 5, 0, 0) + d * DAY + h * 3_600_000 + m * 60_000
        const amp = price * 0.001
        sparse.push({ openTime, closeTime: openTime + 59_999, open: price, high: price + amp, low: price - amp, close: price, volume: 1 })
      }
    }
  }
  const at = Array.from({ length: 8 }, (_, i) => Date.UTC(2026, 0, 5, 13, 0) + (i + 1) * DAY)
  const s = eventStudy(sparse, at, { series: 'CPI m/m' })
  assert.equal(s.samples, 0, 'five one-minute candles were accepted as a covered 30-minute window')
  assert.equal(s.verdict, 'TOO FEW')
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
 * THE RELEASE OUTRANKS THE CLOCK — ONCE THERE IS ENOUGH OF IT.
 *
 * "08:30 ET is usually busy" and "CPI moves this instrument" are different
 * claims, and only the second is about the event. The read should lean on the
 * second whenever it has the sample, say that it is doing so, and fall back to
 * the clock — visibly — when it does not.
 */
test('with memory of the release, the read leans on the release rather than the clock', () => {
  const r = newsRead({
    events: [ev({ time: Date.UTC(2026, 0, 20, 13, 30) })],
    candles: days(20, { loudness: 6 }),
    symbol: 'BTCUSDT',
    now: Date.UTC(2026, 0, 20, 12, 0),
    pastInstances: () => instances(8),
  })
  const e = r.events[0]
  assert.equal(e.measuredOn, 'event')
  assert.equal(e.event!.verdict, 'MUCH BIGGER')
  assert.match(e.read, /measured on this release itself, not just the time of day/)
  assert.equal(r.measuredOnEvent, 1)
  // The clock study is still there — replaced as the headline, never discarded.
  assert.equal(e.window.verdict, 'MUCH BIGGER')
})

test('without memory, nothing changes: the clock study stands and says so', () => {
  const r = newsRead({ events: [ev()], candles: days(20, { loudness: 6 }), symbol: 'BTCUSDT', now: Date.UTC(2026, 0, 12, 12, 0) })
  assert.equal(r.events[0].event, null)
  assert.equal(r.events[0].measuredOn, 'clock')
  assert.equal(r.measuredOnEvent, 0)
  assert.match(r.caveats.join(' '), /None of these were measured on the release itself yet/)
})

test('thin memory falls back to the clock rather than claiming a release study', () => {
  const r = newsRead({
    events: [ev({ time: Date.UTC(2026, 0, 20, 13, 30) })],
    candles: days(20, { loudness: 6 }),
    symbol: 'BTCUSDT',
    now: Date.UTC(2026, 0, 20, 12, 0),
    pastInstances: () => instances(2),
  })
  assert.equal(r.events[0].measuredOn, 'clock')
  assert.equal(r.events[0].event!.verdict, 'TOO FEW')
  assert.match(r.events[0].read, /2 of 2 recorded instances/)
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
      // Every memory depth too: none, thin, and enough to carry a verdict.
      for (const memory of [undefined, () => instances(2), () => instances(8)]) {
        const r = newsRead({
          events: [ev({ actual, impact: 'High', time: Date.UTC(2026, 0, 20, 13, 30) }), ev({ title: 'Crude Oil Inventories', impact: 'Medium', forecast: '-1.2M', actual, time: Date.UTC(2026, 0, 20, 15, 30) })],
          candles: days(20, { loudness }),
          symbol: 'BTCUSDT',
          now: Date.UTC(2026, 0, 20, 12, 0),
          pastInstances: memory,
        })
        for (const e of r.events) lines.push(e.read, e.surprise.note, e.window.note, e.event?.note ?? '')
        lines.push(renderNewsRead(r), ...r.caveats)
      }
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
