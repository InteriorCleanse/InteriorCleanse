/**
 * Politician watcher: names match whole words, the first check does not
 * flood, a trade is reported once, overlap and missed move are read, and the
 * plan follows its fixed rule with risk never above 1% or the owner's cap.
 * Congress rows, positions and prices here are TEST FIXTURE values.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as w from '../../src/bigmoney/watcher.ts'
import type { CongressTrade } from '../../src/bigmoney/parse.ts'
import { store } from '../../src/store.ts'

const NOW = Date.parse('2026-10-14T15:00:00Z')
const row = (p: Partial<CongressTrade>): CongressTrade => ({ source: 'QUIVER', who: 'Nancy Pelosi', chamber: 'House', party: 'D', ticker: 'NVDA', side: 'buy', transaction: 'Purchase', range: '$1,001 - $15,000', low: 1001, high: 15000, traded: '2026-09-20', reported: '2026-10-10', lagDays: 20, ...p })
const day = (d: string) => Date.parse(`${d}T04:00:00Z`)
const bars = (closes: Record<string, number>) => Object.entries(closes).map(([d, close]) => ({ openTime: day(d), close }))
const reset = () => { store().setJson('polwatch:seen', null); store().setJson('polwatch:reports', []); store().setJson('polwatch:settings', null) }
const noPf: w.PortfolioView = { connected: false, equity: null, positions: [], note: '' }

test('names match on whole words', () => {
  assert.equal(w.matches('Pelosi', 'Nancy Pelosi'), true)
  assert.equal(w.matches('nancy pelosi', 'Hon. Nancy Pelosi'), true)
  assert.equal(w.matches('Nancy Pelosi', 'Nancy Mace'), false)
  assert.equal(w.matches('Pel', 'Nancy Pelosi'), false)
})

test('settings are cleaned and the risk cap never goes above 5%', () => {
  const s = w.sanitiseSettings({ names: 'Nancy Pelosi, <script>x</script>, Tuberville, , Nancy Pelosi', riskCapPct: 40 })
  assert.deepEqual(s.names, ['Nancy Pelosi', 'scriptxscript', 'Tuberville'])
  assert.equal(s.riskCapPct, 5)
  assert.equal(w.sanitiseSettings({ names: [], riskCapPct: 'x' }).riskCapPct, 5)
  assert.equal(w.sanitiseSettings({ riskCapPct: 0.01 }).riskCapPct, 0.1)
})

test('the plan follows its fixed rule', () => {
  const held = { connected: true, held: true, qty: 10, side: 'long' as const, marketValue: 1000 }
  const notHeld = { connected: true, held: false, qty: null, side: null, marketValue: null }
  const px = (tradeDay: number, now: number) => ({ tradeDay, now, movePct: Math.round((now / tradeDay - 1) * 1000) / 10, note: '' })
  const t = { ticker: 'NVDA', side: 'buy' as const, traded: '2026-09-20' }
  assert.equal(w.planFor({ ...t, side: 'sell' }, held, px(100, 100), 10000, 5).action, 'REVIEW HOLDING')
  assert.equal(w.planFor({ ...t, side: 'sell' }, notHeld, px(100, 100), 10000, 5).action, 'NO ACTION')
  assert.equal(w.planFor({ ...t, side: 'other' }, notHeld, px(100, 100), 10000, 5).action, 'NO ACTION')
  assert.equal(w.planFor(t, notHeld, { tradeDay: null, now: null, movePct: null, note: '' }, 10000, 5).action, 'WATCH')
  const chased = w.planFor(t, notHeld, px(100, 115), 10000, 5)
  assert.equal(chased.action, 'WATCH'); assert.match(chased.lines[0], /don't chase/); assert.equal(chased.riskPct, 0)
  assert.match(w.planFor(t, notHeld, px(100, 85), 10000, 5).lines[0], /losing too/)
  const idea = w.planFor(t, notHeld, px(100, 104), 10000, 5)
  assert.equal(idea.action, 'PAPER IDEA')
  assert.equal(idea.riskPct, 1, 'the desk risk, under the 5% cap')
  assert.equal(idea.stop, 95)
  assert.equal(idea.riskUsd, 100)
  assert.equal(idea.shares, Math.floor(100 / (104 - 95)))
  assert.equal(idea.lines.length, 3)
  assert.match(idea.lines[2], /Wrong if/)
  assert.equal(w.planFor(t, notHeld, px(100, 104), 10000, 0.5).riskPct, 0.5, 'a lower cap wins')
  assert.equal(w.planFor(t, notHeld, px(100, 104), null, 5).shares, null, 'no balance, no share count')
  assert.match(w.planFor(t, held, px(100, 98), 10000, 5).lines[0], /already hold 10 NVDA/)
})

test('closeOn uses the last session on or before the trade date', () => {
  const b = bars({ '2026-09-18': 100, '2026-09-21': 104 })
  assert.equal(w.closeOn(b, '2026-09-20'), 100, 'a Sunday trade reads Friday')
  assert.equal(w.closeOn(b, '2026-09-21'), 104)
  assert.equal(w.closeOn(b, '2026-09-01'), null)
})

test('with nothing saved and no env setting, the watch list starts with Nancy Pelosi', () => {
  reset()
  assert.deepEqual(w.readSettings({}).names, ['Nancy Pelosi'])
  assert.deepEqual(w.readSettings({ MRCASH_WATCH_POLITICIANS: 'Tuberville' }).names, ['Tuberville'])
  w.saveSettings({ names: 'Someone Else', riskCapPct: 2 })
  assert.deepEqual(w.readSettings({}).names, ['Someone Else'], 'the list saved on the page wins')
  reset()
})

test('no names: a note, no report flood', async () => {
  reset()
  const r = await w.runCheck({ congress: () => [row({})], portfolio: async () => noPf, bars: async () => null, now: NOW }, { names: [], riskCapPct: 5 })
  assert.equal(r.nothingNew, true)
  assert.match(r.note, /No politicians/)
})

test('first check looks back 14 days, then reports each new trade once, with overlap and the missed move', async () => {
  reset()
  const settings = { names: ['Pelosi'], riskCapPct: 5 }
  let rows = [row({}), row({ ticker: 'AAPL', traded: '2026-07-01', reported: '2026-08-01' }), row({ who: 'Someone Else', ticker: 'TSLA' })]
  const pf: w.PortfolioView = { connected: true, equity: 20000, positions: [{ symbol: 'NVDA', qty: 5, side: 'long', marketValue: 900 }], note: '' }
  const deps = { congress: () => rows, portfolio: async () => pf, bars: async () => ({ NVDA: bars({ '2026-09-19': 180, '2026-10-13': 189 }), MSFT: bars({ '2026-10-01': 400, '2026-10-13': 470 }) }), now: NOW }
  const first = await w.runCheck(deps, settings)
  assert.equal(first.firstCheck, true)
  assert.deepEqual(first.items.map((i) => i.ticker), ['NVDA'], 'the old AAPL row is remembered silently; the other member is ignored')
  const it = first.items[0]
  assert.equal(it.overlap.held, true)
  assert.equal(it.prices.tradeDay, 180)
  assert.equal(it.prices.movePct, 5)
  assert.equal(it.plan.action, 'PAPER IDEA')
  assert.equal(it.reported, '2026-10-10')
  const again = await w.runCheck(deps, settings)
  assert.equal(again.nothingNew, true)
  assert.equal(again.note, 'Nothing new.')
  rows = [...rows, row({ ticker: 'MSFT', traded: '2026-10-01', reported: '2026-10-13' })]
  const third = await w.runCheck(deps, settings)
  assert.deepEqual(third.items.map((i) => i.ticker), ['MSFT'])
  assert.equal(third.items[0].plan.action, 'WATCH', '+17.5% since their trade')
  assert.equal(w.readReports().length, 3)
})

test('a confirmed paper plan becomes a journal entry and nothing else', () => {
  const item = { key: 'k', who: 'Nancy Pelosi', ticker: 'NVDA', side: 'buy', range: '$1,001 - $15,000', traded: '2026-09-20', reported: '2026-10-10', plan: { action: 'PAPER IDEA', entry: 189, stop: 171, lines: ['a', 'b', 'c'] } } as unknown as w.WatchItem
  const e = w.journalEntryFor(item)
  assert.equal(e.setupKey, 'politician-watch')
  assert.equal(e.outcome, 'open')
  assert.equal(e.entry, 189)
  assert.match(String(e.notes), /PAPER PLAN/)
})
