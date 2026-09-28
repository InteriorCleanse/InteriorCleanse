/**
 * THE RESEARCH DESK — six roles, the owner's rules, and at most three cards a day.
 * Every market, headline and filing here is a SYNTHETIC TEST FIXTURE; the store
 * is the test's temp data directory.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, sanitizeConfig, scout, reporter, hunter, whale, skeptic, chief, dryRun, closeAfter, tally, termsFor } from '../../src/researchdesk/roles.ts'
import type { MarketInput, Idea } from '../../src/researchdesk/roles.ts'
import { ResearchDesk, dueSlots, nyClock } from '../../src/researchdesk/service.ts'
import type { Candle, Headline } from '../../src/types.ts'

const HOUR = 3_600_000
const NOW = Date.parse('2026-09-29T14:00:00Z') // Tuesday 10:00 New York
/** SYNTHETIC hourly candles over `days` days, ending at NOW, with a last-day jump and volume burst. */
function candles(days: number, base = 100, jumpPct = 0, volBurst = 1, drift = 0): Candle[] {
  const out: Candle[] = []
  const n = days * 24
  let p = base
  for (let i = 0; i < n; i++) {
    const t = NOW - (n - i) * HOUR
    const last = i >= n - 24
    const c = last ? p * (1 + jumpPct / 100 / 24) : p * (1 + drift / 100 / 24 + Math.sin(i / 5) * 0.001)
    out.push({ openTime: t, closeTime: t + HOUR - 1, open: p, high: Math.max(p, c) * 1.001, low: Math.min(p, c) * 0.999, close: c, volume: last ? 100 * volBurst : 100 })
    p = c
  }
  return out
}
const mk = (over: Partial<MarketInput> & { candles: Candle[] }): MarketInput => {
  const c = over.candles
  const change = ((c[c.length - 1].close - c[c.length - 25].close) / c[c.length - 25].close) * 100
  return { key: 'stock:TEST', kind: 'stock', symbol: 'TEST', label: 'Test Corp', status: 'live', price: c[c.length - 1].close, changePct24h: change, provenance: 'TEST FIXTURE', ...over }
}
const head = (title: string, source: string, hoursAgo = 2): Headline => ({ title, source, link: `https://example.invalid/${source}`, time: NOW - hoursAgo * HOUR, score: 1, tags: [], whyItMatters: '' })

test('the owner\'s settings are bounded and never throw', () => {
  const c = sanitizeConfig({ rules: { stockMovePct: 999, volumeMult: -3 }, minPass: 12, watchlist: ['stock:AAPL', 'bad key', 'crypto:BTCUSDT'], limits: { maxCardsPerDay: 'x', excludeKinds: ['crypto', 'nonsense'] } })
  assert.equal(c.rules.stockMovePct, 50); assert.equal(c.rules.volumeMult, 1.1); assert.equal(c.minPass, 6)
  assert.deepEqual(c.watchlist, ['stock:AAPL', 'crypto:BTCUSDT'])
  assert.equal(c.limits.maxCardsPerDay, DEFAULT_CONFIG.limits.maxCardsPerDay); assert.deepEqual(c.limits.excludeKinds, ['crypto'])
  assert.deepEqual(sanitizeConfig(null), DEFAULT_CONFIG)
})

test('Scout flags only what breaks a rule, skips closed or stale markets, and invents nothing', () => {
  const calm = mk({ key: 'stock:CALM', symbol: 'CALM', label: 'Calm Inc', candles: candles(10) })
  const jump = mk({ candles: candles(10, 100, -7, 3) })
  const shut = mk({ key: 'stock:SHUT', symbol: 'SHUT', label: 'Shut Co', candles: candles(10, 100, -9), status: 'closed' })
  const { flags, skipped } = scout([calm, jump, shut], DEFAULT_CONFIG, NOW)
  assert.ok(flags.every((f) => f.key === 'stock:TEST'))
  assert.ok(flags.some((f) => f.rule === 'move' && f.direction === 'down'))
  assert.ok(flags.some((f) => f.rule === 'volume'))
  assert.ok(flags.some((f) => f.rule === 'low'), 'below the stored window low')
  assert.ok(skipped.some((s) => /Shut Co: market closed/.test(s)))
  assert.equal(scout([calm], DEFAULT_CONFIG, NOW).flags.length, 0)
  assert.equal(scout([jump], { ...DEFAULT_CONFIG, watchlist: ['stock:OTHER'] }, NOW).flags.length, 0, 'the watchlist is respected')
})

test('Reporter: two outlets confirm, one is a RUMOUR, none is "no clear cause", and old news does not count', () => {
  const f = { kind: 'stock' as const, symbol: 'AAPL', label: 'Apple' }
  assert.deepEqual(termsFor('crypto', 'BTCUSDT', 'BTC/USDT').includes('bitcoin'), true)
  const two = reporter(f, [head('Apple recalls a product line', 'Reuters'), head('Apple shares slump on recall', 'CNBC')], NOW)
  assert.equal(two.verdict, 'CONFIRMED'); assert.equal(two.confirmedBy, 2); assert.equal(two.sentiment, 'Negative')
  assert.equal(reporter(f, [head('Apple to be bought out tomorrow', 'reddit')], NOW).verdict, 'RUMOUR')
  assert.equal(reporter(f, [head('Apple recalls a product line', 'Reuters', 80)], NOW).verdict, 'NO CLEAR CAUSE', 'older than 48 hours')
  assert.equal(reporter(f, null, NOW).verdict, 'NO CLEAR CAUSE')
})

test('Hunter scores six lines with evidence, marks the owner\'s lines UNKNOWN, and never passes on a hunch', () => {
  const m = mk({ candles: candles(10, 100, -7, 3, -0.5) })
  const f = scout([m], DEFAULT_CONFIG, NOW).flags.find((x) => x.rule === 'move')!
  const news = reporter(m, [head('Test Corp recall', 'Reuters'), head('Test Corp falls on recall', 'AP')], NOW)
  const h = hunter(f, m, news, [], DEFAULT_CONFIG, NOW)
  assert.equal(h.lines.length, 6)
  assert.equal(h.lines[0].result, 'PASS'); assert.equal(h.lines[1].result, 'UNKNOWN'); assert.equal(h.lines[5].result, 'UNKNOWN')
  assert.equal(h.lines[3].result, 'UNKNOWN', 'earnings dates are not in the feed for a single stock')
  assert.equal(h.lines[4].result, 'PASS')
  assert.equal(h.score, h.lines.filter((l) => l.result === 'PASS').length)
  const marked = hunter(f, m, news, [{ title: 'CPI m/m', country: 'USD', time: NOW + 2 * 86_400_000, impact: 'High', forecast: '', previous: '' }], { ...DEFAULT_CONFIG, understood: ['stock:TEST'] }, NOW)
  assert.equal(marked.lines[1].result, 'PASS'); assert.equal(marked.lines[3].result, 'FAIL')
})

test('Whale reports filings, calls plan sales routine, and says NOT CONNECTED for coins', () => {
  const buy = { source: 'SEC EDGAR' as const, ticker: 'TEST', who: 'TEST FIXTURE CEO', role: 'CEO', date: '2026-09-25', filed: '2026-09-26', code: 'P', codeText: 'buy', side: 'buy' as const, shares: 1000, price: 90, value: 2_100_000, ownedAfter: null, plan: false, accession: null }
  assert.equal(whale({ kind: 'stock', symbol: 'TEST' }, [buy], NOW).status, 'UNUSUAL')
  assert.equal(whale({ kind: 'stock', symbol: 'TEST' }, [{ ...buy, side: 'sell', plan: true }], NOW).status, 'NOTHING UNUSUAL')
  assert.equal(whale({ kind: 'crypto', symbol: 'BTCUSDT' }, [buy], NOW).status, 'NOT CONNECTED')
})

test('Skeptic argues against, names what proves it wrong, and breaks the owner\'s limits', () => {
  const m = mk({ candles: candles(10, 100, -7, 3) })
  const f = scout([m], DEFAULT_CONFIG, NOW).flags[0]
  const n = reporter(m, [head('Test Corp rumour', 'reddit')], NOW)
  const h = hunter(f, m, n, [], DEFAULT_CONFIG, NOW)
  const s = skeptic(f, m, n, h, { status: 'NOTHING UNUSUAL', lines: [] }, DEFAULT_CONFIG, 0, NOW)
  assert.equal(s.reasons.length, 3); assert.match(s.provesWrong, /stored low|stored days/); assert.equal(s.limits, 'PASSES LIMITS')
  assert.ok(s.flags.includes('single source or none'))
  assert.equal(skeptic(f, m, n, h, { status: 'NOTHING UNUSUAL', lines: [] }, DEFAULT_CONFIG, 2, NOW).limits, 'BREAKS LIMITS', 'two ideas already this week')
  assert.equal(skeptic(f, m, n, h, { status: 'NOTHING UNUSUAL', lines: [] }, { ...DEFAULT_CONFIG, limits: { ...DEFAULT_CONFIG.limits, excludeKinds: ['stock'] } }, 0, NOW).broken, 'no stock ideas')
})

test('Chief sends only what passes all three gates, best first, never above the daily cap', () => {
  const m = mk({ candles: candles(10, 100, -7, 3) })
  const f = scout([m], DEFAULT_CONFIG, NOW).flags[0]
  const mkIdea = (id: string, score: number, verdict: 'CONFIRMED' | 'RUMOUR', limits: 'PASSES LIMITS' | 'BREAKS LIMITS'): Idea => ({ id, at: NOW, flag: { ...f, label: id }, flags: [f], news: { verdict, cause: 'c', confirmedBy: verdict === 'CONFIRMED' ? 2 : 1, sentiment: 'Mixed', sources: [], oldest: null }, hunt: { lines: [], score }, whale: { status: 'NOTHING UNUSUAL', lines: [] }, skeptic: { limits, broken: limits === 'BREAKS LIMITS' ? 'x' : null, reasons: ['r'], provesWrong: 'p', flags: [] } })
  const ideas = [mkIdea('a', 5, 'CONFIRMED', 'PASSES LIMITS'), mkIdea('b', 3, 'CONFIRMED', 'PASSES LIMITS'), mkIdea('c', 5, 'RUMOUR', 'PASSES LIMITS'), mkIdea('d', 6, 'CONFIRMED', 'BREAKS LIMITS'), mkIdea('e', 4, 'CONFIRMED', 'PASSES LIMITS'), mkIdea('g', 6, 'CONFIRMED', 'PASSES LIMITS')]
  const r = chief(ideas, DEFAULT_CONFIG, 1)
  assert.deepEqual(r.cards.map((c) => c.label), ['g', 'a'], 'two of three left today, best fit first')
  assert.ok(r.held.some((h) => h.idea.id === 'e' && /daily cap/.test(h.why)))
  assert.ok(r.held.some((h) => h.idea.id === 'b' && /3\/6/.test(h.why)))
  assert.ok(r.held.some((h) => h.idea.id === 'c' && /rumour/.test(h.why)))
  assert.ok(r.held.some((h) => h.idea.id === 'd' && /breaks limits/.test(h.why)))
  assert.equal(r.cards[0].limits, 'PASSES LIMITS')
})

test('the schedule runs on New York time, weekdays for stocks and every day for coins, once per slot', () => {
  assert.deepEqual(nyClock(NOW), { date: '2026-09-29', weekday: 2, minutes: 600 })
  assert.deepEqual(dueSlots(Date.parse('2026-09-29T13:50:00Z'), {}), ['scan-am'])
  assert.deepEqual(dueSlots(Date.parse('2026-09-29T13:50:00Z'), { '2026-09-29:scan-am': 1 }), [])
  assert.deepEqual(dueSlots(Date.parse('2026-09-27T12:05:00Z'), {}), ['coins-8'], 'Sunday: coins only')
  assert.deepEqual(dueSlots(Date.parse('2026-09-27T22:10:00Z'), {}), ['review'])
})

test('the scorecard waits for the 5th and 20th market day, and the dry run says whether the rules are noisy', () => {
  const c = candles(30)
  assert.equal(closeAfter(c, 'crypto', NOW - 10 * 86_400_000, 5) !== null, true)
  assert.equal(closeAfter(c, 'crypto', NOW - 10 * 86_400_000, 20), null, 'not happened yet')
  const rows = tally([{ rule: 'move', direction: 'down', price: 100, after5: 95, after20: null }, { rule: 'move', direction: 'down', price: 100, after5: 105, after20: null }])
  const move = rows.find((r) => r.rule === 'move')!
  assert.equal(move.checked5, 2); assert.equal(move.followed5, 1); assert.equal(move.status, 'NOT ENOUGH DATA')
  const quiet = dryRun([mk({ candles: candles(12) })], DEFAULT_CONFIG)
  assert.ok(quiet.daysChecked >= 10); assert.match(quiet.advice, /too tight|within/)
  const noisy = dryRun([mk({ candles: candles(12) })], { ...DEFAULT_CONFIG, rules: { ...DEFAULT_CONFIG.rules, stockMovePct: 0.5, volumeMult: 1.1 } })
  assert.ok(noisy.perDay >= quiet.perDay)
})

test('the desk end to end: a scan logs every role in order, Chief sends a card or "Nothing needs you today", and choices stick', async () => {
  const m = mk({ candles: candles(10, 100, -7, 3) })
  const alerts: string[] = []
  const desk = new ResearchDesk({ markets: () => [m], news: async () => ({ headlines: [head('Test Corp recall announced', 'Reuters'), head('Test Corp recall hits shares', 'AP')], calendar: [] }), insiders: () => [], candles: () => m.candles, alert: (t) => alerts.push(t), now: () => NOW })
  desk.setConfig({ understood: ['stock:TEST'], minPass: 3 })
  const ideas = await desk.scan('all')
  assert.equal(ideas.length, 1)
  assert.equal((await desk.scan('all')).length, 0, 'one idea per market per day')
  const who = desk.snapshot().log.map((p) => p.who).reverse()
  const order = ['Scout', 'Reporter', 'Hunter', 'Skeptic'].map((w) => who.indexOf(w as never))
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'Scout, then Reporter, Hunter, Skeptic')
  const { cards } = desk.chiefRun()
  assert.equal(cards.length, 1); assert.equal(alerts.length, 1)
  assert.match(cards[0].why, /Reuters|AP/)
  assert.equal(desk.choose(cards[0].id, 'watch')!.choice, 'watch')
  desk.chiefRun()
  assert.match(desk.snapshot().log[0].text, /Nothing needs you today/)
  const quiet = new ResearchDesk({ markets: () => [mk({ candles: candles(10) })], news: async () => null, insiders: () => null, candles: () => [], now: () => NOW + 86_400_000 })
  await quiet.scan('all')
  assert.match(quiet.snapshot().log[0].text, /No flags/)
})
