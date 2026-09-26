/**
 * THE PREDICTION DESK — parsers, the ten minds, the council, paper sizing,
 * settlement and the scoreboard. Every market here is a SYNTHETIC TEST
 * FIXTURE; the desk runs in the test's temp data directory and touches no venue.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parsePolymarket, parseKalshi } from '../../src/predict/sources.ts'
import type { PmMarket } from '../../src/predict/sources.ts'
import { PARAMS, council, keywords, paperSize, readMinds } from '../../src/predict/minds.ts'
import { PredictionDesk } from '../../src/predict/desk.ts'

const NOW = Date.parse('2026-09-28T14:00:00Z')
const DAY = 86_400_000
/** SYNTHETIC: a liquid, tight market closing in ten days. */
const mk = (over: Partial<PmMarket> = {}): PmMarket => ({ key: 'polymarket:t1', venue: 'polymarket', id: 't1', question: 'TEST FIXTURE: Will the widget index close above 5000 by October 10?', url: 'https://example.invalid', eventId: null, category: 'test', yes: 0.4, bid: 0.39, ask: 0.41, spread: 0.02, volume24h: 50_000, liquidity: 40_000, endsAt: NOW + 10 * DAY, change24h: 0, closed: false, outcome: null, ...over })
const read = (m: PmMarket, ctx: Parameters<typeof PredictionDesk.readOne>[1] = {}) => PredictionDesk.readOne(m, { now: NOW, ...ctx })

test('Polymarket and Kalshi rows parse into one shape, and a settled market carries its outcome', () => {
  const pm = parsePolymarket([
    { id: '11', question: 'TEST FIXTURE A', slug: 'test-a', outcomes: '["Yes","No"]', outcomePrices: '["0.62","0.38"]', bestBid: 0.61, bestAsk: 0.63, spread: 0.02, volume24hr: 12000, liquidityNum: 5000, endDate: '2026-10-10T00:00:00Z', closed: false, active: true, events: [{ id: 'e1', category: 'Test' }], oneDayPriceChange: 0.03 },
    { id: '12', question: 'TEST FIXTURE B (settled)', outcomes: '["Yes","No"]', outcomePrices: '["0","1"]', closed: true, active: false },
    { id: '13', question: 'no prices', outcomes: '["Yes","No"]' },
  ])
  assert.equal(pm.length, 2)
  assert.equal(pm[0].key, 'polymarket:11'); assert.equal(pm[0].yes, 0.62); assert.equal(pm[0].eventId, 'e1'); assert.equal(pm[0].change24h, 0.03); assert.equal(pm[0].outcome, null)
  assert.equal(pm[1].closed, true); assert.equal(pm[1].outcome, 'NO')
  const ka = parseKalshi({ markets: [
    { ticker: 'TEST-26OCT-T5', title: 'TEST FIXTURE C', yes_bid: 44, yes_ask: 46, last_price: 45, previous_price: 40, volume_24h: 900, liquidity: 250000, close_time: '2026-10-05T20:00:00Z', status: 'open', result: '', event_ticker: 'TEST-26OCT', category: 'Test' },
    { ticker: 'TEST-DONE', title: 'TEST FIXTURE D', yes_bid: 0, yes_ask: 0, last_price: 100, status: 'settled', result: 'yes' },
  ] })
  assert.equal(ka.length, 2)
  assert.equal(ka[0].key, 'kalshi:TEST-26OCT-T5'); assert.equal(ka[0].yes, 0.45); assert.equal(ka[0].spread, 0.02); assert.equal(ka[0].liquidity, 2500); assert.equal(ka[0].change24h, 0.05)
  assert.equal(ka[1].outcome, 'YES'); assert.equal(ka[1].closed, true)
})

test('keywords keep the words a headline would have to share', () => {
  const k = keywords('Will the Fed cut rates by 50bps before the December meeting?')
  assert.ok(k.includes('rates') && k.includes('december') && k.includes('meeting') && k.includes('50bps'))
  assert.ok(!k.includes('will') && !k.includes('before'))
})

test('ten minds read a market; a calm mid-priced market is not flagged, and the reasons say why', () => {
  const { council: c, minds } = read(mk())
  assert.equal(minds.length, 10)
  assert.equal(minds.find((m) => m.id === 'crowd')!.p, 0.4)
  assert.equal(minds.find((m) => m.id === 'longshot')!.status, 'QUIET')
  assert.equal(minds.find((m) => m.id === 'oracle')!.status, 'BLIND')
  assert.equal(minds.find((m) => m.id === 'headlines')!.status, 'BLIND', 'no news feed given')
  assert.equal(c.flagged, false)
  assert.ok(c.reasons.some((r) => /under the 8-point line/.test(r)), c.reasons.join(' | '))
  assert.ok(c.p !== null && Math.abs(c.p - 0.4) < 0.02)
})

test('the favourite–longshot mind speaks only at the edges; the family mind divides through an overround', () => {
  const cheap = read(mk({ yes: 0.08, bid: 0.07, ask: 0.09 })).minds.find((m) => m.id === 'longshot')!
  assert.equal(cheap.status, 'SPOKE'); assert.equal(cheap.lean, 'no'); assert.ok(cheap.p! < 0.08)
  const sibs = [mk({ key: 'polymarket:t2', id: 't2', yes: 0.5 }), mk({ key: 'polymarket:t3', id: 't3', yes: 0.3 })]
  const fam = read(mk({ eventId: 'e9', yes: 0.4 }), { siblings: sibs }).minds.find((m) => m.id === 'family')!
  assert.equal(fam.status, 'SPOKE')
  assert.ok(Math.abs(fam.p! - 0.4 / 1.2) < 1e-9, 'each outcome divided by the 120% total')
  assert.equal(read(mk()).minds.find((m) => m.id === 'family')!.status, 'QUIET')
})

test('the clock mind leans NO on a must-happen question with days left and a mid price', () => {
  const soon = read(mk({ endsAt: NOW + 20 * 3_600_000, yes: 0.35 })).minds.find((m) => m.id === 'clock')!
  assert.equal(soon.status, 'SPOKE'); assert.equal(soon.lean, 'no'); assert.ok(soon.p! < 0.35)
  assert.equal(read(mk({ endsAt: null })).minds.find((m) => m.id === 'clock')!.status, 'BLIND')
})

test('headlines and calendar minds report evidence without inventing a direction', () => {
  const headlines = [{ title: 'TEST FIXTURE: widget index nears 5000 as October rally builds', link: '', source: 'test', time: NOW - 3_600_000, score: 1, tags: [], whyItMatters: '' }]
  const h = read(mk(), { headlines }).minds.find((m) => m.id === 'headlines')!
  assert.equal(h.status, 'SPOKE'); assert.equal(h.p, null); assert.ok(h.for[0].includes('widget'))
  const calendar = [{ title: 'FOMC Rate Decision', country: 'USD', time: NOW + 2 * DAY, impact: 'High' as const, forecast: '', previous: '' }]
  const c = read(mk({ question: 'TEST FIXTURE: Will the Fed cut rates in October?' }), { calendar }).minds.find((m) => m.id === 'calendar')!
  assert.equal(c.status, 'SPOKE'); assert.equal(c.p, null); assert.ok(c.against[0].includes('FOMC'))
})

test('a wide gap is flagged; thin liquidity or a wide spread blocks it; paper size never passes 6% of the bankroll', () => {
  // SYNTHETIC: three outcomes adding to 150% and a day of drift push the council well under the price.
  const sibs = [mk({ key: 'polymarket:s1', id: 's1', yes: 0.9 }), mk({ key: 'polymarket:s2', id: 's2', yes: 0.7 })]
  const m = mk({ eventId: 'e1', yes: 0.4, change24h: -0.2, endsAt: NOW + 2 * DAY })
  const { council: c } = read(m, { siblings: sibs })
  assert.equal(c.flagged, true, c.reasons.join(' | '))
  assert.equal(c.side, 'NO')
  const size = paperSize(c, m, 100)!
  assert.ok(size.stake <= 100 * PARAMS.positionCap + 1e-9, `stake ${size.stake}`)
  assert.equal(size.side, 'NO'); assert.ok(Math.abs(size.price - (1 - 0.39)) < 1e-9, 'NO costs one minus the bid')
  assert.equal(read(mk({ ...m, liquidity: 200 }), { siblings: sibs }).council.flagged, false)
  assert.equal(read(mk({ ...m, spread: 0.12, bid: 0.34, ask: 0.46 }), { siblings: sibs }).council.flagged, false)
  assert.equal(read(mk({ ...m, yes: 0.02, bid: 0.01, ask: 0.03 }), { siblings: sibs }).council.flagged, false, 'near-certain prices are not worth the risk')
})

test('the desk opens a paper position on a flag, settles it only when the venue resolves, and scores every mind', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mrcash-predict-'))
  // The siblings are thin, so the liquidity guard keeps the desk from flagging them too.
  const sibs = [mk({ key: 'polymarket:s1', id: 's1', eventId: 'e1', yes: 0.9, liquidity: 200 }), mk({ key: 'polymarket:s2', id: 's2', eventId: 'e1', yes: 0.7, liquidity: 200 })]
  const target = mk({ eventId: 'e1', yes: 0.4, change24h: -0.2, endsAt: NOW + 2 * DAY })
  let clock = NOW
  let list: PmMarket[] = [target, ...sibs]
  let single: PmMarket | null = null
  const logs: string[] = []
  const desk = new PredictionDesk({ dir, now: () => clock, polymarket: async () => ({ ok: true, markets: list }), kalshi: async () => ({ ok: false, reason: 'Kalshi: TEST FIXTURE offline' }), one: async () => single, news: async () => null, log: (t) => logs.push(t) })
  let s = await desk.tick()
  assert.equal(s.status, 'LIVE')
  assert.equal(s.sources[1].ok, false)
  assert.equal(s.open.length, 1, 'one paper position on the flagged market')
  assert.equal(s.open[0].side, 'NO')
  assert.ok(s.sheet.cash < 100 && s.sheet.cash >= 94)
  assert.equal(s.sheet.wins + s.sheet.losses, 0, 'unresolved is open, not a result')
  assert.equal(s.sheet.status, 'DAY 1 OF 7')
  assert.equal(s.decisions[0].action, 'OPENED')
  // A second pass does not open the same market twice.
  s = await desk.tick()
  assert.equal(s.open.length, 1)
  // The market leaves the open list and is fetched on its own: closed but unresolved keeps it open.
  clock = NOW + 3 * DAY
  list = sibs
  single = { ...target, closed: true, outcome: null }
  s = await desk.tick()
  assert.equal(s.open.length, 1); assert.equal(s.open[0].awaitingResolution, true)
  // Resolved NO: the NO position wins its contracts, and each mind that spoke is scored.
  single = { ...target, closed: true, outcome: 'NO' }
  s = await desk.tick()
  assert.equal(s.open.length, 0); assert.equal(s.resolved.length, 1); assert.equal(s.resolved[0].status, 'WON')
  assert.ok(s.resolved[0].pnl! > 0)
  assert.equal(s.sheet.wins, 1); assert.ok(s.sheet.endingBalance > 100); assert.equal(s.sheet.status, 'IN PROGRESS')
  const crowd = s.brain.minds.find((m) => m.id === 'crowd')!
  assert.equal(crowd.n, 1); assert.equal(crowd.status, 'NOT ENOUGH DATA'); assert.ok(crowd.brier !== null)
  assert.equal(s.brain.minds.find((m) => m.id === 'oracle')!.n, 0, 'a blind mind is never scored')
  assert.ok(logs.some((t) => /paper position/.test(t)) && logs.some((t) => /paper win/.test(t)))
  // The record survives a restart.
  const again = new PredictionDesk({ dir, now: () => clock })
  assert.equal(again.snapshot().resolved.length, 1)
  assert.equal(again.snapshot().sheet.wins, 1)
})

test('with both venues unreachable the desk says NOT CONNECTED and opens nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mrcash-predict-'))
  const desk = new PredictionDesk({ dir, now: () => NOW, polymarket: async () => ({ ok: false, reason: 'Polymarket: TEST FIXTURE offline' }), kalshi: async () => ({ ok: false, reason: 'Kalshi: TEST FIXTURE offline' }) })
  const s = await desk.tick()
  assert.equal(s.status, 'NOT CONNECTED')
  assert.equal(s.sheet.status, 'NOT STARTED')
  assert.equal(s.open.length, 0)
  assert.match(s.claim, /NOT INDEPENDENTLY VERIFIED/)
})
