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
import { TICKERS, ORDER, GROUPS, PROXY_NOTE, NEVER_SAY, thirdFriday, esCalendar, futuresCalendar, lastTradeDay, moveValue, nextMonthlyExpiry, esSpy, underlyingNotes } from '../../web/js/tickers-data.js'
// @ts-expect-error — as above.
import { spreadPlan } from '../../web/js/spread-math.js'

const WEB = join(process.cwd(), 'web')
const d = (s: string) => new Date(s + 'T15:00:00Z')
const iso = (x: Date) => x.toISOString().slice(0, 10)

test('every ticker asked for is there (SPY, ES, NVDA, TSLA, AAPL, oil, gold, gas) plus NQ, SI and ZN, each fully described', () => {
  for (const s of ['SPY', 'ES', 'NVDA', 'TSLA', 'AAPL', 'CL', 'GC', 'NG', 'NQ', 'SI', 'ZN']) assert.ok(ORDER.includes(s), s)
  assert.deepEqual(GROUPS.flatMap((g: { symbols: string[] }) => g.symbols).sort(), [...ORDER].sort(), 'every ticker is in exactly one group')
  for (const s of ORDER) {
    const t = TICKERS[s]
    assert.ok(t.name && t.what && t.session && t.earningsText && t.dividendText, s)
    assert.ok(t.drivers.length >= 3 && t.spreadNotes.length >= 2, s)
    assert.ok(Number.isFinite(t.options.multiplier) && t.options.multiplier > 0, s)
    if (t.contract) {
      // One tick times the dollars per 1.00 move is the tick value.
      assert.ok(Math.abs(t.contract.tick * t.contract.multiplier - t.contract.tickValue) < 1e-9, `${s} tick value`)
      assert.equal(t.watched, false, `${s}: no futures feed`)
      assert.ok(t.proxy && PROXY_NOTE[t.proxy], `${s} names a labelled stand-in`)
    }
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

test('futures last trading days follow each exchange rule (weekdays; holidays not known)', () => {
  const day = (rule: string, y: number, m: number) => iso(lastTradeDay(rule, y, m))
  assert.equal(day('cl', 2026, 11), '2026-10-20', 'CL Nov-26: Oct 25 is a Sunday, so four business days back')
  assert.equal(day('cl', 2026, 12), '2026-11-20', 'CL Dec-26: Nov 25 is a Wednesday, so three business days back')
  assert.equal(day('ng', 2026, 11), '2026-10-28', 'NG Nov-26: three business days before Nov 1')
  assert.equal(day('third-last-business', 2026, 12), '2026-12-29', 'GC Dec-26: third-last business day')
  assert.equal(day('zn', 2026, 12), '2026-12-22', 'ZN Dec-26: seventh business day before Dec 31 (weekdays only)')
  assert.equal(day('third-friday', 2026, 12), '2026-12-18')
})

test('futures calendars: front and next contract, first notice for delivered metals and notes, and where traders actually are', () => {
  const now = d('2026-09-25')
  const cl = futuresCalendar('CL', now)
  assert.deepEqual([cl.front.code, cl.front.last, cl.next.code], ['CLX6', '2026-10-20', 'CLZ6'])
  assert.equal(cl.physical, true)
  const gc = futuresCalendar('GC', now)
  assert.deepEqual([gc.front.code, gc.outBy, gc.active], ['GCV6', '2026-09-30', 'GCV6'])
  const si = futuresCalendar('SI', now)
  assert.equal(si.front.code, 'SIU6')
  assert.equal(si.passedOutBy, true, 'September silver is past first notice')
  assert.equal(si.active, 'SIZ6', 'so traders are in December')
  const nq = futuresCalendar('NQ', now)
  assert.deepEqual([nq.front.code, nq.outBy], ['NQZ6', '2026-12-10'])
  assert.equal(futuresCalendar('ZN', now).front.code, 'ZNZ6')
  assert.equal(futuresCalendar('SPY', now), null, 'not a future')
})

test('what a move is worth: CL $1.50 on two contracts is $3,000; half a point of ZN is $500', () => {
  assert.deepEqual(moveValue('CL', { contracts: 2, move: 1.5 }), { dollars: 3000, ticks: 150, perTick: 10 })
  assert.deepEqual(moveValue('ZN', { contracts: 1, move: 0.5 }), { dollars: 500, ticks: 32, perTick: 15.625 })
  assert.equal(moveValue('NG', { contracts: 1, move: 0.1 }).dollars, 1000)
  assert.equal(moveValue('GC', { contracts: 1, move: 20 }).dollars, 2000)
  assert.equal(moveValue('AAPL', { contracts: 1, move: 1 }), null)
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
  const cl = underlyingNotes('CL', { now })
  assert.equal(cl.multiplier, 1000)
  assert.ok(cl.notes.some((n: string) => /physically delivered/.test(n)))
  assert.equal(underlyingNotes('NQ', { now }).notes.some((n: string) => /physically delivered/.test(n)), false, 'NQ is cash-settled')
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

test('the market watch covers each future\'s stand-in fund, labelled as a fund', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'markets', 'sources.ts'), 'utf8')
  for (const p of ['GLD', 'SLV', 'USO', 'UNG', 'IEF']) {
    assert.match(src, new RegExp(`index:${p}\\b`), `${p} is watched by default`)
    assert.match(src, new RegExp(`${p}: '[^']*\\(via ${p} fund\\)'`), `${p} is named as a fund`)
  }
  assert.match(readFileSync(join(WEB, 'js', 'tickers.js'), 'utf8'), /STAND-IN, NOT/)
})

test('Tickers has its own tab next to Spreads, and says when a market is not watched', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8')
  assert.match(html, /<section id="tab-tickers"[\s\S]*?id="tickers-out"[\s\S]*?<\/section>/)
  assert.match(html, /\['tickers','Tickers'/)
  assert.match(html, /<script type="module" src="\/js\/tickers\.js"><\/script>/)
  assert.match(readFileSync(join(WEB, 'js', 'tickers.js'), 'utf8'), /NOT WATCHED/)
})
