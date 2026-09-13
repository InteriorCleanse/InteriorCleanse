/**
 * Self-test: proves the INSTALL and the LOGIC work. Runs offline.
 *
 * Read this carefully, because the distinction matters:
 *
 *   This file uses hand-written candles to check that the session
 *   clock, the gap detector, the sweep detector and the full setup
 *   checklist behave the way they are described. That is logic
 *   verification, the same way 2 + 2 = 4 is.
 *
 *   These candles are NOT market data, and this file NEVER produces a
 *   win rate, a profit figure, or anything resembling a backtest.
 *   Performance numbers only ever come from real prices, in replay.ts.
 *
 * If this passes, your setup is fine and any later failure is about
 * the internet, not the bot.
 */

import { config, LIVE_TRADING_ENABLED } from '../config.ts'
import { toET, tradingDayKey, sessionAt, isKillzone, SessionTracker } from './sessions.ts'
import { atrAt, SwingTracker, isDisplacement } from './structure.ts'
import { FvgTracker, ifvgRole } from './fvg.ts'
import { detectSweeps } from './liquidity.ts'
import { checkRisk } from './risk.ts'
import { parseCalendar, parseRss, scoreHeadline, buildReport, isBlackout } from './news.ts'
import { IctEngine } from './ictStrategy.ts'
import { sma } from './strategy.ts'
import { analyzeBook, analyzeTape } from './orderflow.ts'
import { assessMarket } from './regime.ts'
import { computeR, computeStats, buildReview } from './journal.ts'
import type { JournalEntry } from './journal.ts'
import type { Candle, Level, Signal } from './types.ts'
import * as ui from './ui.ts'

let passed = 0
let failed = 0
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++
    console.log(`  ${ui.good('PASS')}  ${name}`)
  } else {
    failed++
    console.log(`  ${ui.bad('FAIL')}  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const STEP = 300_000
function mk(openTime: number, o: number, h: number, l: number, c: number): Candle {
  return { openTime, closeTime: openTime + STEP - 1, open: o, high: h, low: l, close: c, volume: 1 }
}

ui.heading('SELF-TEST — checking the logic, no internet needed')
console.log('')
console.log(ui.dim('  These are checks on hand-written candles and sample feeds.'))
console.log(ui.dim('  No market data is involved and no performance is claimed.'))
console.log('')

// --- the session clock -------------------------------------------
console.log(ui.bold('  Session clock'))
{
  const winter = Date.UTC(2026, 0, 15, 14, 30) // 09:30 ET in January (UTC-5)
  const summer = Date.UTC(2026, 6, 15, 13, 30) // 09:30 ET in July (UTC-4)
  check('January 14:30 UTC is 09:30 New York', toET(winter).clock === '09:30', toET(winter).clock)
  check('July 13:30 UTC is 09:30 New York (daylight saving handled)', toET(summer).clock === '09:30', toET(summer).clock)
  const eveningET = Date.UTC(2026, 0, 15, 1, 0) // Jan 14, 20:00 ET
  check('8pm Wednesday belongs to Thursday\'s trading day', tradingDayKey(eveningET) === '2026-01-15', tradingDayKey(eveningET))
  check('8:30pm ET is the Asia session', sessionAt(Date.UTC(2026, 0, 15, 1, 30)) === 'asia')
  check('midnight ET is no longer Asia (window wraps correctly)', sessionAt(Date.UTC(2026, 0, 15, 5, 0)) === null)
  check('3am ET is London', sessionAt(Date.UTC(2026, 0, 15, 8, 0)) === 'london')
  check('9am ET is New York and a killzone', sessionAt(Date.UTC(2026, 0, 15, 14, 0)) === 'newYork' && isKillzone(Date.UTC(2026, 0, 15, 14, 0)))
  check('noon ET is between sessions', sessionAt(Date.UTC(2026, 0, 15, 17, 0)) === null)

  const t = new SessionTracker()
  const base = Date.UTC(2026, 0, 15, 1, 0)
  for (let i = 0; i < 60; i++) t.add(mk(base + i * STEP, 100, 101 + (i % 5), 99 - (i % 3), 100))
  const asia = t.day('2026-01-15')?.sessions.asia
  check('Asia range records its high and low', asia?.high === 105 && asia?.low === 97, `${asia?.high}/${asia?.low}`)
  check('Asia is marked complete once a candle lands outside its window', asia?.complete === true)
}

// --- indicators ----------------------------------------------------
console.log('')
console.log(ui.bold('  Indicators'))
{
  const cs = [10, 20, 30, 40].map((v, i) => mk(i * STEP, v, v, v, v))
  check('average of the last 2 prices (30, 40) is 35', sma(cs, 2, 3) === 35)
  check('asking for more history than exists returns nothing', sma(cs, 10, 3) === null)
  const flat = Array.from({ length: 20 }, (_, i) => mk(i * STEP, 100, 101, 99, 100))
  check('ATR of candles that each span $2 is $2', Math.abs(atrAt(flat, 19) - 2) < 1e-9, String(atrAt(flat, 19)))
  check('a candle with a $3 body is displacement when ATR is $2', isDisplacement(mk(0, 100, 103.2, 99.9, 103), 2))
  check('a candle with a $1 body is not', !isDisplacement(mk(0, 100, 101.5, 99.9, 101), 2))

  const sw = new SwingTracker()
  const hill = [100, 101, 102, 105, 102, 101, 100, 99, 98, 99, 100].map((v, i) => mk(i * STEP, v, v + 0.5, v - 0.5, v))
  const found: Array<{ i: number; kind: string }> = []
  for (let i = 0; i < hill.length; i++) {
    const s = sw.add(hill, i)
    if (s) found.push({ i: s.index, kind: s.kind })
  }
  check('the peak at index 3 is confirmed as a swing high — three candles later, not before', found.some((f) => f.i === 3 && f.kind === 'high'), JSON.stringify(found))
}

// --- fair value gaps and inversion ----------------------------------
console.log('')
console.log(ui.bold('  Fair value gaps'))
{
  const cs = [
    mk(0 * STEP, 100, 101, 99.5, 100.5),
    mk(1 * STEP, 100.5, 104, 100.4, 103.8), // the displacement candle
    mk(2 * STEP, 103.8, 104.5, 102.5, 104), // low 102.5 > candle 0 high 101 → bullish gap 101–102.5
    mk(3 * STEP, 104, 104.2, 102.8, 103),   // dips toward the gap, does not touch
    mk(4 * STEP, 103, 103.1, 101.8, 102.2), // trades into the gap → mitigated
    mk(5 * STEP, 102.2, 102.4, 100.2, 100.5), // CLOSES below the gap → inverted, now resistance
    mk(6 * STEP, 100.5, 102.0, 100.3, 101.2), // pokes back up into it and closes inside/below its top → retest
  ]
  const tracker = new FvgTracker()
  const atr = 1.5
  const states: string[] = []
  for (let i = 0; i < cs.length; i++) {
    tracker.update(cs, i, atr)
    states.push(tracker.fvgs[0]?.state ?? '-')
  }
  const f = tracker.fvgs[0]
  check('a bullish gap is detected at candle 2', !!f && f.direction === 'bullish' && f.createdIndex === 2, JSON.stringify(f))
  check('the gap edges are candle 0 high and candle 2 low', f?.bottom === 101 && f?.top === 102.5, `${f?.bottom}–${f?.top}`)
  check('it is marked as coming from displacement', f?.fromDisplacement === true)
  check('candle 4 mitigates it (touch)', states[4] === 'mitigated', states.join(','))
  check('candle 5 inverts it (close through)', states[5] === 'inverted' && f?.invertedIndex === 5, states.join(','))
  check('an inverted bullish gap now acts as resistance', f && ifvgRole(f) === 'resistance')
  check('candle 6 is recorded as the retest', f?.retestIndex === 6, String(f?.retestIndex))
}

// --- liquidity sweeps ------------------------------------------------
console.log('')
console.log(ui.bold('  Liquidity'))
{
  const lvl = (): Level[] => [{ kind: 'asia-low', price: 100, time: 0, label: 'Asia low' }, { kind: 'asia-high', price: 110, time: 0, label: 'Asia high' }]
  const a = lvl()
  const s1 = detectSweeps(mk(STEP, 100.5, 100.8, 99.3, 100.4), 1, a, 1)
  check('a wick below the low that closes back above it is a sweep', s1.length === 1 && s1[0].side === 'below' && a[0].sweptAt !== undefined)
  const b = lvl()
  const s2 = detectSweeps(mk(STEP, 100.5, 100.8, 99.3, 99.6), 1, b, 1)
  check('a close below the low is a break, not a sweep', s2.length === 0 && b[0].brokenAt !== undefined)
  const c = lvl()
  const s3 = detectSweeps(mk(STEP, 105, 106, 104, 105.5), 1, c, 1)
  check('a candle that touches nothing sweeps nothing', s3.length === 0)
}

// --- risk sizing -----------------------------------------------------
console.log('')
console.log(ui.bold('  Risk'))
{
  const sig = (entry: number, stop: number, tp: number): Signal => ({
    action: 'BUY', reason: 't', price: entry, time: 0, setupKey: 'T', evidence: [],
    plan: { direction: 'long', entry, stop, takeProfit: tp, rr: (tp - entry) / (entry - stop), entryLabel: '', stopLabel: '', targetLabel: '' },
  })
  const ok = checkRisk(sig(100, 99, 102))
  const wanted = config.accountSizeUsd * config.riskPerTradePercent / 100
  check('a 1% stop with 2:1 is approved', ok.approved, ok.reason)
  check('hitting the stop would cost about the configured risk (or less if the cap binds)', ok.riskUsd <= wanted + 1e-9 && ok.riskUsd > 0, `${ok.riskUsd} vs ${wanted}`)
  check('position value never exceeds the cap', ok.positionValueUsd <= Math.min(config.maxPositionValueUsd, config.accountSizeUsd) + 1e-9)
  const wide = checkRisk(sig(100, 95, 110))
  check('a 5% stop is refused as too wide', !wide.approved && wide.finalAction === 'SKIP')
  const poor = checkRisk(sig(100, 99, 101))
  check('a 1:1 reward-to-risk is refused', !poor.approved, poor.reason)
}

// --- news parsing ----------------------------------------------------
console.log('')
console.log(ui.bold('  News parsing'))
{
  const cal = parseCalendar(JSON.stringify([
    { title: 'CPI m/m', country: 'USD', date: '2026-01-15T08:30:00-05:00', impact: 'High', forecast: '0.3%', previous: '0.2%' },
    { title: 'Bank Holiday', country: 'JPY', date: '2026-01-15T00:00:00-05:00', impact: 'Holiday', forecast: '', previous: '' },
  ]))
  check('the calendar feed parses with times and impact', cal.length === 2 && cal[0].impact === 'High' && cal[0].time === Date.UTC(2026, 0, 15, 13, 30))
  const rss = parseRss(`<rss><channel><item><title><![CDATA[Fed holds rates &amp; signals cuts]]></title><link>https://x/1</link><pubDate>Thu, 15 Jan 2026 12:00:00 GMT</pubDate></item><item><title>Cat wins show</title><link>https://x/2</link></item></channel></rss>`, 'Test')
  check('RSS items parse, including CDATA and entities', rss.length === 2 && rss[0].title === 'Fed holds rates & signals cuts', JSON.stringify(rss[0]))
  const scored = scoreHeadline(rss[0], Date.UTC(2026, 0, 15, 13, 0))
  check('a Fed headline is tagged and scored high', scored.tags.includes('Fed') && scored.score > 3, `${scored.tags} ${scored.score}`)
  const dull = scoreHeadline(rss[1], Date.UTC(2026, 0, 15, 13, 0))
  check('a cat show is not', dull.score === 0)
  const report = buildReport(cal, rss, [], Date.UTC(2026, 0, 15, 12, 0))
  check('a high-impact USD event creates a stand-aside window', report.blackouts.length === 1)
  check('10 minutes before CPI is inside the blackout', isBlackout(Date.UTC(2026, 0, 15, 13, 20), report) !== null)
  check('an hour after CPI is not', isBlackout(Date.UTC(2026, 0, 15, 14, 30), report) === null)
}

// --- the full checklist on a hand-built day --------------------------
console.log('')
console.log(ui.bold('  The full setup, start to finish'))
{
  // Thursday 15 Jan 2026. Asia 20:00–00:00 ET builds a 100–110 range,
  // the early hours drift inside it, then London sweeps the Asia low,
  // displaces up, inverts the gap it left on the way down, and retests it.
  const cs: Candle[] = []
  let t = Date.UTC(2026, 0, 15, 1, 0) // 20:00 ET Wednesday → Thursday's trading day
  const push = (o: number, h: number, l: number, c: number) => { cs.push(mk(t, o, h, l, c)); t += STEP }

  for (let i = 0; i < 48; i++) {            // Asia: 20:00 → 00:00
    const mid = 105 + Math.sin(i / 4) * 4
    push(mid, i === 10 ? 110 : mid + 0.5, i === 30 ? 100 : mid - 0.5, mid)
  }
  for (let i = 0; i < 24; i++) push(105, 105.5, 104.5, 105) // 00:00 → 02:00, quiet

  push(105, 105.2, 103.8, 104)     // 02:00  c0
  push(104, 104.1, 102.9, 103)     // 02:05  c1  body 1 — the drop
  push(103, 103.1, 101.4, 101.5)   // 02:10  c2  bearish gap 103.1–103.8 forms
  push(101.5, 101.6, 100.4, 100.5) // 02:15  c3
  const sweepAt = cs.length
  push(100.5, 100.8, 99.3, 100.4)  // 02:20  c4  SWEEP of Asia low (100), closes back above
  push(100.4, 102.6, 100.3, 102.5) // 02:25  c5  displacement up
  push(102.5, 104.2, 102.4, 104.1) // 02:30  c6  bullish gap 100.8–102.4; closes ABOVE the bearish gap → inversion
  const retestAt = cs.length
  push(104.1, 104.2, 103.4, 103.9) // 02:35  c7  dips into 103.1–103.8 and closes above it → RETEST → entry

  const engine = new IctEngine(cs)
  let signals: Array<{ i: number; action: string; firstFail: string }> = []
  for (let i = 0; i < cs.length; i++) {
    const a = engine.step(i)
    signals.push({ i, action: a.signal.action, firstFail: a.signal.evidence.find((e) => !e.passed)?.step ?? '-' })
  }
  const atSweep = signals[sweepAt]
  const atRetest = signals[retestAt]
  const buys = signals.filter((s) => s.action === 'BUY')

  check('before the sweep the checklist stops at "Liquidity sweep"', signals[sweepAt - 1].firstFail === 'Liquidity sweep', signals[sweepAt - 1].firstFail)
  check('on the sweep candle it stops at "Displacement"', atSweep.firstFail === 'Displacement', atSweep.firstFail)
  check('before the retest it stops at "Retest"', signals[retestAt - 1].firstFail === 'Retest', signals[retestAt - 1].firstFail)
  check('the retest candle produces a BUY', atRetest.action === 'BUY', `${atRetest.action} (stuck at ${atRetest.firstFail})`)
  check('exactly one BUY for the whole day — a sweep is used once', buys.length === 1, String(buys.length))
  check('the trading day never produced a SELL', !signals.some((s) => s.action === 'SELL'))
}

// --- order flow ------------------------------------------------------
console.log('')
console.log(ui.bold('  Order flow'))
{
  const book = analyzeBook(
    [['100', '1'], ['99.5', '50'], ['99', '1']],
    [['100.5', '1'], ['101', '1'], ['101.2', '40']],
  )
  check('mid price sits between best bid and best ask', Math.abs(book.price - 100.25) < 1e-9, String(book.price))
  check('dollars within 1% are summed on each side', Math.abs(book.bidUsd1pct - 5075) < 1e-6 && Math.abs(book.askUsd1pct - 4249.5) < 1e-6, `${book.bidUsd1pct} / ${book.askUsd1pct}`)
  check('the two big clusters are found as walls, biggest first', book.walls.length === 2 && book.walls[0].side === 'bid' && Math.abs(book.walls[0].price - 99.5) < 0.15, JSON.stringify(book.walls))
  check('a wall below price has a negative distance', book.walls[0].distancePct < 0)

  const tape = analyzeTape([
    { a: 1, p: '100', q: '1', T: 1000, m: false },
    { a: 2, p: '100', q: '1', T: 2000, m: false },
    { a: 3, p: '100', q: '1', T: 3000, m: false },
    { a: 4, p: '100', q: '0.5', T: 4000, m: true },
    { a: 5, p: '100', q: '0.5', T: 5000, m: true },
    { a: 6, p: '100', q: '2000', T: 6000, m: false },
  ])
  check('buyer-initiated vs seller-initiated trades are told apart', tape.buys === 4 && tape.sells === 2, `${tape.buys}/${tape.sells}`)
  check('a $200k print is flagged as a big buy', tape.bigTrades.length === 1 && tape.bigTrades[0].side === 'buy' && tape.bigBuys === 1)
  check('net pressure is buy dollars minus sell dollars', Math.abs(tape.deltaUsd - 200200) < 1e-6, String(tape.deltaUsd))
}

// --- market state ----------------------------------------------------
console.log('')
console.log(ui.bold('  Market state'))
{
  // 800 candles with a steady drift and a small zigzag, so swings exist.
  const build = (drift: number) =>
    Array.from({ length: 800 }, (_, i) => {
      const base = 100 + i * drift + Math.sin(i / 3) * 0.2
      return mk(i * STEP, base, base + 0.15, base - 0.15, base + 0.05)
    })
  const up = assessMarket(build(0.05), null, null, null, Date.UTC(2026, 0, 14, 15, 0))
  const down = assessMarket(build(-0.05), null, null, null, Date.UTC(2026, 0, 14, 15, 0))
  const flat = assessMarket(build(0), null, null, null, Date.UTC(2026, 0, 14, 15, 0))
  check('a steadily rising series is called an uptrend', up.trend === 'uptrend', `${up.trend} ${JSON.stringify(up.evidence)}`)
  check('a steadily falling series is called a downtrend', down.trend === 'downtrend', down.trend)
  check('a flat series is called a range', flat.trend === 'range', flat.trend)
  check('the uptrend explains itself with evidence lines', up.evidence.length >= 3)
  check('a range says there is no trend to continue', flat.continuation.label.includes('no trend'), flat.continuation.label)
}

// --- journal ---------------------------------------------------------
console.log('')
console.log(ui.bold('  Journal'))
{
  const r = computeR('long', 100, 99, 102)
  check('a long from 100, stop 99, exit 102 is about +1.8R after fees', r !== null && Math.abs(r - 1.8) < 1e-9, String(r))
  check('a short from 100, stop 101, exit 98 is about +1.8R too', Math.abs((computeR('short', 100, 101, 98) ?? 0) - 1.8) < 1e-9)
  check('no R without an exit', computeR('long', 100, 99, null) === null)

  const now = Date.now()
  const mkE = (id: string, followed: boolean, rr: number, emotions: string[]): JournalEntry => ({
    id, createdAt: now, updatedAt: now, tradeTime: now - 3_600_000, symbol: 'BTCUSDT', direction: 'long', session: 'London', setupKey: '',
    entry: 100, stop: 99, target: 102, exit: 100 + rr, rMultiple: rr, outcome: rr > 0 ? 'win' : 'loss', execution: followed ? 5 : 2, followedPlan: followed,
    emotions, tags: [], wentWell: '', improve: '', lesson: '', notes: '',
  })
  const entries = [mkE('a', true, 1, ['calm']), mkE('b', true, 1.5, ['calm']), mkE('c', false, -1, ['revenge']), mkE('d', false, -1, ['fomo'])]
  const s = computeStats(entries, now)
  check('process score counts the share of trades that followed the plan', s.processScore === 50, String(s.processScore))
  check('followed-plan trades score better than broken-plan trades', (s.byPlan.followed.avgR ?? 0) > 0 && (s.byPlan.broke.avgR ?? 0) < 0)
  check('a day with an entry counts toward the streak', s.streakDays >= 1, String(s.streakDays))
  const rv = buildReview(entries, [], now)
  check('the review names improvising as the thing to fix', /improvis|obey/i.test(rv.oneThing), rv.oneThing)
  const empty = buildReview([], [], now)
  check('an empty journal gets a kind first step, not a lecture', empty.oneThing.toLowerCase().includes('write one entry'))
}

// --- the safety lock -----------------------------------------------
console.log('')
console.log(ui.bold('  Safety'))
check('live trading is switched off', LIVE_TRADING_ENABLED === false)

console.log('')
if (failed === 0) {
  console.log(ui.good(`  All ${passed} checks passed.`))
  ui.plainEnglish([
    'Your installation works. The session clock, the gap and sweep',
    'detectors, the risk maths and the full checklist all behave as',
    'described.',
    '',
    'Next: npm run brief — this one needs internet, because it gets',
    'real prices. If it fails after this test passed, the problem is',
    'your connection or a blocked feed, not the bot.',
  ])
} else {
  console.log(ui.bad(`  ${failed} check(s) failed, ${passed} passed.`))
  console.log('')
  console.log('  Read the FAIL lines above — each one names what went wrong.')
  process.exitCode = 1
}
console.log('')
