/**
 * THE STOCK DESK — the owner's momentum / relative-strength rules, checked one by
 * one on SYNTHETIC TEST FIXTURES (made-up bars, labelled as such; never real
 * prices, never written anywhere but the temp data directory).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Candle, Headline } from '../../src/types.ts'

const { ctParts, phase, nextWake, dailyStats, intraday, regime, themeBoard, evaluate, catalystDay, manage, size, findSetup } = await import('../../src/stocks/rules.ts')
const { StockDesk } = await import('../../src/stocks/desk.ts')
const { STOCK_OF, UNIVERSE } = await import('../../src/stocks/universe.ts')

const MIN = 60_000, DAY = 86_400_000
// Monday 28 September 2026; Chicago is on CDT (UTC-5), so 8:30 CT is 13:30Z.
const ct = (h: number, m = 0, day = 28) => Date.UTC(2026, 8, day, h + 5, m)

/** SYNTHETIC daily history: a steady climb to `last`, `growth` per day. */
function dailyUp(last: number, growth = 0.004, n = 60): Candle[] {
  const out: Candle[] = []
  for (let k = n; k >= 1; k--) {
    const close = last / Math.pow(1 + growth, k - 1)
    const t = ct(0, 0) - k * DAY
    out.push({ openTime: t, closeTime: t + DAY - 1, open: close * 0.998, high: close * 1.01, low: close * 0.99, close, volume: 2_000_000 })
  }
  return out
}
/** SYNTHETIC 15-minute bars from 8:30 CT: [open, high, low, close]. */
function session(rows: Array<[number, number, number, number]>, day = 28): Candle[] {
  return rows.map(([o, h, l, c], k) => ({ openTime: ct(8, 30, day) + k * 15 * MIN, closeTime: ct(8, 30, day) + (k + 1) * 15 * MIN - 1, open: o, high: h, low: l, close: c, volume: 100_000 }))
}
// opening range 100.2-101, break at bar 3, retest at bar 4, holds at bar 5
const RETEST: Array<[number, number, number, number]> = [[100.5, 101, 100.2, 100.8], [100.8, 100.9, 100.3, 100.6], [100.6, 101.7, 100.6, 101.6], [101.6, 101.7, 101.1, 101.5], [101.5, 101.9, 101.4, 101.8]]
const flat = (px: number): Array<[number, number, number, number]> => Array.from({ length: 5 }, () => [px, px * 1.002, px * 0.998, px * 1.001])

function quotes(now: number, extra: Record<string, { daily: Candle[]; bars: Candle[] }> = {}) {
  const base: Record<string, { daily: Candle[]; bars: Candle[] }> = {
    SPY: { daily: dailyUp(500, 0.002), bars: session(flat(500)) }, QQQ: { daily: dailyUp(400, 0.002), bars: session(flat(400)) },
    XLK: { daily: dailyUp(200, 0.002), bars: session(flat(200)) }, SMH: { daily: dailyUp(250, 0.002), bars: session(flat(250)) },
    IGV: { daily: dailyUp(90, 0.001), bars: session(flat(90)) }, VIXY: { daily: dailyUp(15, 0), bars: session(flat(15)) }, IEF: { daily: dailyUp(95, 0), bars: session(flat(95)) },
    NVDA: { daily: dailyUp(100, 0.006), bars: session(RETEST) },
    ...extra,
  }
  const q: Record<string, { symbol: string; d: ReturnType<typeof dailyStats>; i: ReturnType<typeof intraday> }> = {}
  for (const [s, v] of Object.entries(base)) { const d = dailyStats(v.daily); q[s] = { symbol: s, d, i: d ? intraday(v.bars, d.prevClose, now) : null } }
  return q
}
const ctxFor = (now: number, q: ReturnType<typeof quotes>, headlines: Headline[] = []) => {
  const uq = UNIVERSE.map((u) => q[u.symbol]).filter(Boolean)
  return { q, reg: regime(q, uq), board: themeBoard(q), cat: catalystDay(q, headlines, now), headlines, now, feed: 'sip' as const }
}
const acct = { equity: 10_000, cash: 10_000, positions: [] as Array<{ symbol: string; theme: never }> }
const H = (title: string, time: number): Headline => ({ title, link: 'https://example.invalid/fixture', source: 'Fixture Wire', time, score: 1, tags: [], whyItMatters: '' })

test('the clock runs on Central time: 8:15 premarket, 8:30-3:00 regular, weekends closed', () => {
  assert.equal(ctParts(ct(8, 20)).mins, 8 * 60 + 20)
  assert.equal(phase(ct(8, 20)), 'premarket')
  assert.equal(phase(ct(9, 7)), 'regular')
  assert.equal(phase(ct(15, 0)), 'closed')
  assert.equal(phase(Date.UTC(2026, 8, 27, 15)), 'closed', 'Sunday')
})

test('wakes every 15 minutes in session, at the open from premarket, and in about-hour steps toward 8:15 otherwise', () => {
  assert.equal(nextWake(ct(9, 7)).at, ct(9, 15))
  assert.equal(nextWake(ct(8, 20)).at, ct(8, 30))
  assert.equal(nextWake(ct(7, 30)).at, ct(8, 15), 'lands on the premarket scan')
  const fri = Date.UTC(2026, 9, 2, 21) // Friday 4:00 PM CT
  assert.equal(nextWake(fri).at, fri + 60 * MIN, 'an hour at a time over the weekend')
  assert.match(nextWake(fri).why, /hourly/)
})

test('a supportive market check reads RISK-ON; indexes below their averages with rising fear read RISK-OFF', () => {
  const now = ct(9, 46)
  assert.equal(ctxFor(now, quotes(now)).reg.state, 'RISK-ON')
  const down = (p: number) => { const d = dailyUp(p, -0.004); return { daily: d, bars: session([[p * 0.98, p * 0.985, p * 0.97, p * 0.975], ...flat(p * 0.975)]) } }
  const weak = quotes(now, { SPY: down(500), QQQ: down(400), XLK: down(200), SMH: down(250), VIXY: { daily: dailyUp(15, 0), bars: session([[16, 17, 16, 16.9], ...flat(16.9)]) } })
  const r = ctxFor(now, weak).reg
  assert.equal(r.state, 'RISK-OFF')
  assert.equal(r.aggression, 0)
})

test('a leader with a held breakout retest, sector strength and a RISK-ON market is a BUY, with every report field filled', () => {
  const now = ct(9, 46)
  const e = evaluate(STOCK_OF.NVDA, ctxFor(now, quotes(now), [H('Nvidia upgraded to buy, price target raised', now - 3_600_000)]), acct)
  assert.equal(e.verdict, 'BUY', e.reason)
  const r = e.report!
  for (const k of ['ticker', 'setup', 'marketRegime', 'relativeStrength', 'catalyst', 'fundamentals', 'entry', 'stop', 'target', 'rewardRisk', 'positionSize', 'mainRisks', 'confidence', 'finalDecision'] as const) assert.ok(r[k] !== undefined && r[k] !== '', `report has ${k}`)
  assert.ok(r.stop < r.entry && r.target > r.entry)
  assert.ok(r.rewardRisk >= 2)
  assert.ok((e.dollars ?? 0) <= 2_500 + 1e-6, 'never more than 25% of the account in one stock')
  assert.match(r.setup, /retest/i)
})

test('never at the bell, never a gap above 3%, never against negative news, never a 4th name in one theme', () => {
  const early = ct(8, 50)
  assert.equal(evaluate(STOCK_OF.NVDA, ctxFor(early, quotes(early)), acct).verdict, 'WAIT')
  const now = ct(9, 46)
  const gap = quotes(now, { NVDA: { daily: dailyUp(100, 0.006), bars: session(RETEST.map(([o, h, l, c]) => [o + 4, h + 4, l + 4, c + 4] as [number, number, number, number])) } })
  assert.match(evaluate(STOCK_OF.NVDA, ctxFor(now, gap), acct).reason, /not chasing/)
  assert.match(evaluate(STOCK_OF.NVDA, ctxFor(now, quotes(now), [H('Nvidia faces antitrust probe', now - 60_000)]), acct).reason, /negative news/)
  const full = { ...acct, positions: [{ symbol: 'AMD', theme: 'ai-chips' }, { symbol: 'AVGO', theme: 'ai-chips' }, { symbol: 'MRVL', theme: 'ai-chips' }] } as never
  assert.match(evaluate(STOCK_OF.NVDA, ctxFor(now, quotes(now)), full).reason, /already 3 positions/)
})

test('a setup alone is not enough: no catalyst, news or sector strength means PASS', () => {
  const now = ct(9, 46)
  // the sector ETF falls today, so the theme is not "strong", and there is no news
  const q = quotes(now, { SMH: { daily: dailyUp(250, 0.002), bars: session([[250, 250.2, 246, 246.5], ...flat(246.5)]) } })
  const e = evaluate(STOCK_OF.NVDA, ctxFor(now, q), acct)
  assert.equal(e.verdict, 'PASS')
  assert.match(e.reason, /technical setup alone is not enough/)
})

test('sector-catalyst day: first-order gappers found, second-order names ranked by own news, then the smallest gap', () => {
  const now = ct(8, 20)
  const pre = (px: number, gap: number): { daily: Candle[]; bars: Candle[] } => ({ daily: dailyUp(px, 0.003), bars: [{ openTime: ct(8, 0), closeTime: ct(8, 15) - 1, open: px, high: px * (1 + gap / 100), low: px, close: px * (1 + gap / 100), volume: 10_000 }] })
  const q = quotes(now, { NVDA: pre(100, 5), AMD: pre(100, 4), AVGO: pre(100, 6), MRVL: pre(100, 3.5), ANET: pre(100, 1.5), COHR: pre(100, 0.8), CSCO: pre(100, 0.4) })
  const hl = [H('Custom AI chip deal lifts Broadcom and Nvidia', now - 30 * MIN), H('Arista unveils new 800G switch', now - 20 * MIN)]
  const cat = catalystDay(q, hl, now)!
  assert.equal(cat.theme, 'ai-chips')
  assert.ok(cat.gappers.length >= 3)
  assert.equal(cat.secondOrder[0].symbol, 'ANET', 'own fresh news ranks first')
  assert.ok(cat.secondOrder.every((s) => s.gapPct > -1 && s.gapPct < 3), 'no gap-downs and no chased gaps among second-order names')
  const rest = cat.secondOrder.filter((s) => !s.ownNews).map((s) => s.gapPct)
  assert.deepEqual(rest, [...rest].sort((a, b) => a - b), 'then the smallest gap')
})

test('stops first: a breached stop sells everything at the stop or worse; 2R trims half; a filled catalyst gap exits', () => {
  const now = ct(10, 1)
  const q = quotes(now, { NVDA: { daily: dailyUp(100, 0.006), bars: session([...RETEST, [101.5, 101.6, 100.0, 100.3]]) } })
  const reg = regime(q, [q.NVDA])
  const pos = { symbol: 'NVDA', theme: 'ai-chips' as const, qty: 10, entry: 101.8, stop: 100.8, initialStop: 100.8, target: 104, openedAt: ct(9, 46), thesisLevel: null, trimmed: false, setup: 'retest' }
  const a = manage(pos, q.NVDA, q.SMH, reg, ct(9, 46))
  assert.equal(a.type, 'EXIT'); assert.equal(a.fraction, 1); assert.ok(a.price <= 100.8)
  const up = quotes(now, { NVDA: { daily: dailyUp(100, 0.006), bars: session([...RETEST, [101.8, 104.2, 101.8, 104.1]]) } })
  assert.equal(manage(pos, up.NVDA, up.SMH, reg, ct(9, 46)).type, 'TRIM')
  const gapFill = manage({ ...pos, thesisLevel: 101.95, stop: 99, trimmed: true }, up.NVDA, up.SMH, reg, ct(9, 46))
  assert.equal(gapFill.type, 'HOLD', 'above the thesis level it holds')
  const q2 = quotes(now, { NVDA: { daily: dailyUp(100, 0.006), bars: session([...RETEST, [101.5, 101.6, 101.2, 101.3]]) } })
  assert.equal(manage({ ...pos, thesisLevel: 101.4, stop: 99 }, q2.NVDA, q2.SMH, reg, ct(9, 46)).type, 'EXIT')
})

test('sizing: risk budget over the stop distance, capped at 25% of the account and at cash; zero in a risk-off market', () => {
  assert.equal(Math.round(size(10_000, 10_000, 100, 99, 'RISK-ON')), 2_500)
  assert.equal(Math.round(size(10_000, 10_000, 100, 90, 'RISK-ON')), 1_000)
  assert.equal(Math.round(size(10_000, 10_000, 100, 90, 'MIXED')), 500)
  assert.equal(size(10_000, 10_000, 100, 99, 'RISK-OFF'), 0)
  assert.equal(Math.round(size(10_000, 300, 100, 99, 'RISK-ON')), 300)
})

test('findSetup needs 30 minutes of session first', () => {
  const now = ct(8, 50)
  const q = quotes(now)
  assert.equal(findSetup(q.NVDA.i!, q.NVDA.d!), null)
})

test('the desk runs a paper cycle end to end: buys on a clean setup, then sells in full when the stop breaks', async () => {
  let now = ct(9, 46)
  const make = (extraBar?: [number, number, number, number]) => {
    const q = quotes(now)
    const bars: Record<string, Candle[]> = {}, daily: Record<string, Candle[]> = {}
    const src: Record<string, { daily: Candle[]; bars: Candle[] }> = {
      SPY: { daily: dailyUp(500, 0.002), bars: session(flat(500)) }, QQQ: { daily: dailyUp(400, 0.002), bars: session(flat(400)) },
      XLK: { daily: dailyUp(200, 0.002), bars: session(flat(200)) }, SMH: { daily: dailyUp(250, 0.002), bars: session(flat(250)) },
      IGV: { daily: dailyUp(90, 0.001), bars: session(flat(90)) }, VIXY: { daily: dailyUp(15, 0), bars: session(flat(15)) }, IEF: { daily: dailyUp(95, 0), bars: session(flat(95)) },
      NVDA: { daily: dailyUp(100, 0.006), bars: session(extraBar ? [...RETEST, extraBar] : RETEST) },
    }
    void q
    for (const [s, v] of Object.entries(src)) { daily[s] = v.daily; bars[s] = v.bars }
    return { daily, bars }
  }
  let data = make()
  const desk = new StockDesk({
    now: () => now,
    headlines: async () => [H('Nvidia upgraded to buy, price target raised', now - 3_600_000)],
    fetchBars: async (_s, tf) => ({ ok: true, feed: 'sip', bars: tf === '1Day' ? data.daily : data.bars }),
  })
  const c1 = await desk.cycle(true)
  assert.ok(c1.lines.some((l) => /^Bought NVDA/.test(l)), c1.lines.join(' | '))
  const s1 = desk.snapshot()
  assert.equal(s1.positions.length, 1)
  assert.equal(s1.mode, 'PAPER')
  assert.ok(s1.reports[0].finalDecision === 'BUY')
  now = ct(10, 1)
  data = make([101.5, 101.6, 100.0, 100.3])
  const c2 = await desk.cycle(true)
  assert.ok(c2.lines.some((l) => /^Sold NVDA: stop/.test(l)), c2.lines.join(' | '))
  const s2 = desk.snapshot()
  assert.equal(s2.positions.length, 0)
  assert.ok(s2.account.equity < 10_000 && s2.account.equity > 9_800, 'a stopped trade costs about the planned risk, not more')
})

test('paused means no new buys, even on Scan now; stops are still enforced while paused', async () => {
  const { store } = await import('../../src/store.ts')
  store().setJson('stocks:state', {}) // a fresh paper book for this test
  let now = ct(9, 46)
  const src = (nvda: Array<[number, number, number, number]>) => {
    const all: Record<string, { daily: Candle[]; bars: Candle[] }> = {
      SPY: { daily: dailyUp(500, 0.002), bars: session(flat(500)) }, QQQ: { daily: dailyUp(400, 0.002), bars: session(flat(400)) },
      XLK: { daily: dailyUp(200, 0.002), bars: session(flat(200)) }, SMH: { daily: dailyUp(250, 0.002), bars: session(flat(250)) },
      IGV: { daily: dailyUp(90, 0.001), bars: session(flat(90)) }, VIXY: { daily: dailyUp(15, 0), bars: session(flat(15)) }, IEF: { daily: dailyUp(95, 0), bars: session(flat(95)) },
      NVDA: { daily: dailyUp(100, 0.006), bars: session(nvda) },
    }
    return { daily: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.daily])), bars: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.bars])) }
  }
  let data = src(RETEST)
  const desk = new StockDesk({
    now: () => now,
    headlines: async () => [H('Nvidia upgraded to buy, price target raised', now - 3_600_000)],
    fetchBars: async (_s, tf) => ({ ok: true, feed: 'sip', bars: tf === '1Day' ? data.daily : data.bars }),
  })
  desk.setPaused(true)
  const c1 = await desk.cycle(true)
  assert.equal(desk.snapshot().positions.length, 0, 'a clean setup is not bought while paused')
  assert.ok(c1.lines.some((l) => /Paused by you: no new buys/.test(l)), c1.lines.join(' | '))
  desk.setPaused(false)
  await desk.cycle(true)
  assert.equal(desk.snapshot().positions.length, 1, 'resumed: the same setup is bought')
  desk.setPaused(true)
  now = ct(10, 1)
  data = src([...RETEST, [101.5, 101.6, 100.0, 100.3]])
  const c3 = await desk.cycle(false)
  assert.ok(c3.lines.some((l) => /^Sold NVDA: stop/.test(l)), c3.lines.join(' | '))
  assert.equal(desk.snapshot().positions.length, 0, 'the stop still sells while paused')
})

test('the stock desk never reaches the engine, a broker or an order path', async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { ROOT } = await import('../helpers.ts')
  for (const f of ['rules.ts', 'desk.ts', 'universe.ts']) {
    const src = readFileSync(join(ROOT, 'src', 'stocks', f), 'utf8')
    assert.doesNotMatch(src, /from '\.\.\/(paperTrader|watch|fusion|riskEngine|broker|live|execution)/, `${f} imports nothing that trades`)
    assert.doesNotMatch(src, /\b(profitable|guaranteed|proven)\b/i, `${f} makes no promises`)
  }
})
