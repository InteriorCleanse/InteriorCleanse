/**
 * CALENDAR HISTORY — the memory that makes "the last six CPI prints" a thing
 * that can be measured rather than a thing that can be said.
 *
 * Three ways this could quietly be wrong, and one test each:
 *
 *   1. It pools unrelated releases into one series, inflating the sample count
 *      so a study claims five instances of something that never happened five
 *      times. Worse than no memory at all.
 *   2. It splits one release into many series, so nothing ever accumulates and
 *      every study says TOO FEW for ever.
 *   3. It loses a printed figure because a later refresh dropped the field —
 *      real data overwritten with a blank, which is the one thing the whole
 *      codebase refuses to do.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import type { CalendarEvent } from '../../src/types.ts'

const tmp = tempDataDir('mrcash-calhist-')
process.env.MRCASH_DATA_DIR = tmp.dir
after(() => tmp.cleanup())

const JAN = Date.UTC(2026, 0, 13, 13, 30)
const MONTH = 30 * 86_400_000

function ev(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return { title: 'CPI m/m', country: 'USD', time: JAN, impact: 'High', forecast: '0.3%', previous: '0.2%', ...over }
}

// ---------------------------------------------------------------
// Which release is this?
// ---------------------------------------------------------------

test('the month a release covers is not a different release', async () => {
  const { seriesKey } = await import('../../src/news/history.ts')
  const k = seriesKey('USD', 'CPI m/m')
  assert.equal(seriesKey('USD', 'CPI m/m (Aug)'), k)
  assert.equal(seriesKey('USD', 'CPI m/m (Sep 2026)'), k)
  assert.equal(seriesKey('usd', 'CPI M/M'), k)
  assert.equal(seriesKey('USD', 'CPI m/m  '), k)
  assert.equal(seriesKey('USD', 'GDP q/q (Q2)'), seriesKey('USD', 'GDP q/q (Q3)'))
})

test('releases that are genuinely different numbers stay different series', async () => {
  const { seriesKey } = await import('../../src/news/history.ts')
  // Pooling these would inflate every sample count with numbers that are not
  // the one being studied — the exact failure the sample discipline exists for.
  const distinct = [
    seriesKey('USD', 'CPI m/m'),
    seriesKey('USD', 'Core CPI m/m'),
    seriesKey('USD', 'CPI y/y'),
    seriesKey('USD', 'Prelim GDP q/q'),
    seriesKey('USD', 'Final GDP q/q'),
    seriesKey('EUR', 'CPI m/m'),
  ]
  assert.equal(new Set(distinct).size, distinct.length, 'two different releases collided into one series')
})

// ---------------------------------------------------------------
// Folding a refresh in
// ---------------------------------------------------------------

test('a release rescheduled by an hour is the same instance, not a second one', async () => {
  const { mergeInstance } = await import('../../src/news/history.ts')
  const now = JAN + 1000
  const a = mergeInstance([], ev(), now)
  const b = mergeInstance(a.instances, ev({ time: JAN + 3_600_000 }), now)
  assert.equal(b.instances.length, 1, 'a reschedule created a phantom second instance')
  assert.equal(b.instances[0].time, JAN + 3_600_000, 'the record should follow the new time')
})

test('next month is a second instance', async () => {
  const { mergeInstance } = await import('../../src/news/history.ts')
  const a = mergeInstance([], ev(), JAN)
  const b = mergeInstance(a.instances, ev({ time: JAN + MONTH }), JAN + MONTH)
  assert.equal(b.instances.length, 2)
  assert.deepEqual(b.instances.map((i) => i.time), [JAN, JAN + MONTH])
})

test('a printed figure is never overwritten with a blank one', async () => {
  const { mergeInstance } = await import('../../src/news/history.ts')
  const withActual = mergeInstance([], ev({ actual: '0.4%' }), JAN).instances
  assert.equal(withActual[0].actual, '0.4%')
  // A later refresh that simply drops the field is a gap in the feed, not a
  // retraction of the print.
  const after = mergeInstance(withActual, ev({ actual: undefined }), JAN + 1000)
  assert.equal(after.instances[0].actual, '0.4%', 'a recorded print was lost to an empty refresh')
  assert.equal(after.changed, false, 'nothing changed, so the row should not be rewritten')
})

test('a revision to the print is taken', async () => {
  const { mergeInstance } = await import('../../src/news/history.ts')
  const first = mergeInstance([], ev({ actual: '0.4%' }), JAN).instances
  const revised = mergeInstance(first, ev({ actual: '0.5%' }), JAN + 86_400_000)
  assert.equal(revised.instances[0].actual, '0.5%')
  assert.equal(revised.changed, true)
})

test('a refresh that says nothing new does not rewrite the row', async () => {
  const { mergeInstance } = await import('../../src/news/history.ts')
  const a = mergeInstance([], ev(), JAN)
  const b = mergeInstance(a.instances, ev(), JAN + 60_000)
  assert.equal(b.changed, false)
})

test('an unreadable time is dropped rather than recorded as NaN', async () => {
  const { mergeInstance } = await import('../../src/news/history.ts')
  const r = mergeInstance([], ev({ time: Number.NaN }), JAN)
  assert.deepEqual(r.instances, [])
  assert.equal(r.changed, false)
})

// ---------------------------------------------------------------
// The stored side
// ---------------------------------------------------------------

test('history accumulates across refreshes and reads back oldest first', async () => {
  const { recordCalendar, pastInstances, historyDepth } = await import('../../src/news/history.ts')
  for (let m = 0; m < 6; m++) {
    recordCalendar([ev({ time: JAN + m * MONTH, actual: '0.3%' })], JAN + m * MONTH)
  }
  const past = pastInstances('USD', 'CPI m/m', JAN + 6 * MONTH)
  assert.equal(past.length, 6)
  assert.deepEqual(past.map((i) => i.time), [0, 1, 2, 3, 4, 5].map((m) => JAN + m * MONTH))

  const depth = historyDepth()
  assert.ok(depth.instances >= 6)
  assert.equal(depth.withActual >= 6, true)
})

test('an event is never part of its own history', async () => {
  const { pastInstances } = await import('../../src/news/history.ts')
  // Asking about the March print must not count the March print.
  const third = JAN + 2 * MONTH
  const past = pastInstances('USD', 'CPI m/m', third)
  assert.equal(past.every((i) => i.time < third), true)
  assert.equal(past.length, 2)
})

test('a release with no memory reads as empty, not as an error', async () => {
  const { pastInstances } = await import('../../src/news/history.ts')
  assert.deepEqual(pastInstances('USD', 'Something Never Seen', Date.now()), [])
})

test('the limit keeps the most recent instances, not the oldest', async () => {
  const { recordCalendar, pastInstances } = await import('../../src/news/history.ts')
  for (let m = 0; m < 8; m++) {
    recordCalendar([ev({ title: 'Retail Sales m/m', time: JAN + m * MONTH })], JAN + m * MONTH)
  }
  const past = pastInstances('USD', 'Retail Sales m/m', JAN + 8 * MONTH, 3)
  assert.deepEqual(past.map((i) => i.time), [5, 6, 7].map((m) => JAN + m * MONTH))
})

/**
 * THE MEMORY IS A RECORD, NOT A PARTICIPANT.
 *
 * Same rule as the desk and the intelligence layer: a module that only reports
 * cannot be allowed to grow a route into the order path. The cheapest way to
 * keep that true is to make it unable to reach the code that could.
 */
test('the calendar memory cannot reach the order path', async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { ROOT } = await import('../helpers.ts')
  const src = readFileSync(join(ROOT, 'src', 'news', 'history.ts'), 'utf8')
  for (const f of ['live/trader', 'live/orders', 'execution.ts', 'openPosition', 'savePosition', 'risk.ts', 'fusion']) {
    assert.equal(src.includes(f), false, `src/news/history.ts references "${f}" — it must stay a record`)
  }
})
