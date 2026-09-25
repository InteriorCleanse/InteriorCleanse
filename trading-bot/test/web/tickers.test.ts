/**
 * TICKERS — reference knowledge for SPY, ES, NVDA, TSLA and AAPL: the date
 * rules are computed correctly, the reference holds no prices or forecasts,
 * and the page only reads the existing read-only market watch.
 *
 * TEST FIXTURE: every date below is a fixed example, chosen so the answer can
 * be checked by hand against a calendar.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error — a browser ES module without type declarations; the functions are plain JS.
import { TICKERS, ORDER, NEVER_SAY, thirdFriday, esCalendar, nextMonthlyExpiry, esSpy, underlyingNotes } from '../../web/js/tickers-data.js'
// @ts-expect-error — as above.
import { spreadPlan } from '../../web/js/spread-math.js'

const WEB = join(process.cwd(), 'web')
const d = (s: string) => new Date(s + 'T15:00:00Z')
const iso = (x: Date) => x.toISOString().slice(0, 10)

test('the five tickers asked for are all there, each with contract facts, a calendar, drivers and spread notes', () => {
  assert.deepEqual(ORDER, ['SPY', 'ES', 'NVDA', 'TSLA', 'AAPL'])
  for (const s of ORDER) {
    const t = TICKERS[s]
    assert.ok(t.name && t.what && t.session && t.earningsText && t.dividendText, s)
    assert.ok(t.drivers.length >= 3 && t.spreadNotes.length >= 2, s)
    assert.ok([50, 100].includes(t.options.multiplier), s)
  }
  assert.equal(TICKERS.ES.options.multiplier, 50)
  assert.equal(TICKERS.ES.contract.tickValue, TICKERS.ES.contract.tick * TICKERS.ES.contract.multiplier)
  assert.equal(TICKERS.ES.watched, false, 'no futures feed, and the page must say so')
})

test('reference only: no prices, no forecasts, no profitability language', () => {
  const src = readFileSync(join(WEB, 'js', 'tickers-data.js'), 'utf8')
  assert.doesNotMatch(src, /\bprice\s*:/, 'no stored prices')
  assert.doesNotMatch(src, /\btarget\b|will (rise|fall|go up|go down)/i, 'no forecasts')
  for (const s of ORDER) assert.doesNotMatch(JSON.stringify(TICKERS[s]), NEVER_SAY, s)
  assert.doesNotMatch(readFileSync(join(WEB, 'js', 'tickers.js'), 'utf8').replace(/NEVER_SAY/g, ''), NEVER_SAY)
})

test('third Fridays land where a calendar says', () => {
  assert.equal(iso(thirdFriday(2026, 9)), '2026-09-18')
  assert.equal(iso(thirdFriday(2026, 12)), '2026-12-18')
  assert.equal(iso(thirdFriday(2027, 3)), '2027-03-19')
  assert.equal(iso(thirdFriday(2026, 5)), '2026-05-15') // May 1, 2026 is a Friday
  for (let m = 1; m <= 12; m++) { const f = thirdFriday(2027, m); assert.equal(f.getUTCDay(), 5); assert.ok(f.getUTCDate() >= 15 && f.getUTCDate() <= 21) }
})

test('ES calendar: front contract, its last day, the roll eight days earlier, and the next contract', () => {
  const late = esCalendar(d('2026-09-25'))
  assert.deepEqual(late.front, { code: 'ESZ6', expiry: '2026-12-18', roll: '2026-12-10' })
  assert.deepEqual(late.next, { code: 'ESH7', expiry: '2027-03-19' })
  assert.equal(late.rolled, false)
  assert.equal(late.daysToExpiry, 84)
  const rollWeek = esCalendar(d('2026-09-14'))
  assert.equal(rollWeek.front.code, 'ESU6')
  assert.equal(rollWeek.front.roll, '2026-09-10')
  assert.equal(rollWeek.rolled, true, 'after the roll date most volume has moved to the next contract')
  assert.equal(esCalendar(d('2026-09-18')).front.code, 'ESU6', 'expiry day itself is still the front contract')
  assert.equal(esCalendar(d('2026-12-19')).front.code, 'ESH7')
})

test('next monthly expiry, flagged when it is a quarterly one', () => {
  assert.deepEqual(nextMonthlyExpiry(d('2026-09-25')), { date: '2026-10-16', quarterly: false })
  assert.deepEqual(nextMonthlyExpiry(d('2026-12-01')), { date: '2026-12-18', quarterly: true })
  assert.deepEqual(nextMonthlyExpiry(d('2026-12-19')), { date: '2027-01-15', quarterly: false })
})

test('ES and SPY side by side: one ES is about 500 SPY shares, and 10 ES points is about $1 in SPY', () => {
  assert.deepEqual(esSpy({ esContracts: 1, esPoints: 10 }), { spyShares: 500, spyOptionContracts: 5, esDollars: 500, spyMoveDollars: 1, approximate: true })
  assert.equal(esSpy({ esContracts: 2, esPoints: 4.25 }).esDollars, 425)
})

test('underlying notes: earnings months before expiry, ex-dividend risk on short calls, ES exercise style, days to expiry', () => {
  const now = d('2026-10-05')
  const nvda = underlyingNotes('nvda', { expiry: '2026-11-27', now })
  assert.equal(nvda.multiplier, 100)
  assert.equal(nvda.dte, 53)
  assert.ok(nvda.notes.some((n: string) => /usually reports earnings \(Nov\)/.test(n)))
  const tslaNoReport = underlyingNotes('TSLA', { expiry: '2026-12-18', now: d('2026-11-02') })
  assert.equal(tslaNoReport.notes.some((n: string) => /earnings/.test(n)), false, 'no TSLA report month between Nov and Dec')
  const spyCall = underlyingNotes('SPY', { expiry: '2026-12-31', now, shortCall: true })
  assert.ok(spyCall.notes.some((n: string) => /ex-dividend in Dec/.test(n)))
  assert.equal(underlyingNotes('SPY', { expiry: '2026-12-31', now, shortCall: false }).notes.some((n: string) => /ex-dividend/.test(n)), false)
  const es = underlyingNotes('ES', { now })
  assert.equal(es.multiplier, 50)
  assert.equal(es.exercise, 'check')
  assert.ok(es.notes.some((n: string) => /European-style/.test(n)))
  assert.ok(underlyingNotes('SPY', { expiry: '2026-10-05', now }).notes.some((n: string) => /Expires today/.test(n)))
  assert.equal(underlyingNotes('XYZ', { now }).known, false)
})

test('the spread warning follows the exercise style: American warns of early assignment, European does not, ES says check', () => {
  const args = { structure: 'bull-put', strikes: [95, 100], premiums: [2.5, 1] }
  const has = (w: string[], re: RegExp) => w.some((x) => re.test(x))
  assert.ok(has(spreadPlan(args).warnings, /assigned early/))
  assert.equal(has(spreadPlan({ ...args, exercise: 'european' }).warnings, /assigned early|American-style/), false)
  assert.ok(has(spreadPlan({ ...args, exercise: 'check' }).warnings, /Some series of this product are American-style/))
})

test('the Tickers tab reads only the existing read-only market watch, and places nothing', () => {
  const src = readFileSync(join(WEB, 'js', 'tickers.js'), 'utf8')
  const calls = [...src.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1])
  assert.deepEqual(calls, ["'/api/markets'"], 'one GET to /api/markets, nothing else')
  assert.doesNotMatch(src, /method\s*:\s*['"]POST|XMLHttpRequest|WebSocket|sendBeacon/)
  assert.doesNotMatch(readFileSync(join(WEB, 'js', 'tickers-data.js'), 'utf8'), /fetch\(|XMLHttpRequest|\/api\//)
})

test('Tickers has its own tab next to Spreads, and says when a market is not watched', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8')
  assert.match(html, /<section id="tab-tickers"[\s\S]*?id="tickers-out"[\s\S]*?<\/section>/)
  assert.match(html, /\['tickers','Tickers'/)
  assert.match(html, /<script type="module" src="\/js\/tickers\.js"><\/script>/)
  assert.match(readFileSync(join(WEB, 'js', 'tickers.js'), 'utf8'), /NOT WATCHED/)
})
