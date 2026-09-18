/**
 * THE EVIDENCE ROUTES — against a real server, zero paper trades.
 *
 * At launch the honest picture is NOT ENOUGH DATA on the paper side and a
 * backtest that populates only when asked. These tests hold that: every view
 * answers, none of them invents a number, the refresh is POST-only, and the
 * backtest refresh actually caches something.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startBot, startMockFeeds, tempDataDir } from './helpers.ts'
import type { MockFeeds } from './helpers.ts'

const tmp = tempDataDir('mrcash-evroutes-')
let feeds: MockFeeds
let bot: Awaited<ReturnType<typeof startBot>>
before(async () => { feeds = await startMockFeeds({ days: 40 }); bot = await startBot(feeds, { dir: tmp.dir }) })
after(async () => { bot.stop(); await feeds.close(); tmp.cleanup() })

const get = async (path: string) => (await fetch(`${bot.base}${path}`)).json() as Promise<{ ok: boolean; data?: any; error?: string }>

test('the overview at zero trades is NOT ENOUGH DATA, with provenance on both sides', async () => {
  const r = await get('/api/evidence')
  assert.equal(r.ok, true)
  assert.equal(r.data.paper.trades, 0)
  assert.equal(r.data.paper.status, 'NOT ENOUGH DATA')
  assert.equal(r.data.paper.provenance.source, 'PAPER')
  assert.equal(r.data.backtest.provenance.source, 'BACKTEST')
  assert.equal(r.data.comparison.verdict, 'INSUFFICIENT SAMPLE')
  assert.equal(r.data.paper.narration.summary.startsWith('NOT ENOUGH DATA'), true)
})

test('every view answers with its source stamped, and nothing is estimated', async () => {
  for (const path of ['/api/evidence/dimension?dim=session', '/api/evidence/dimension?source=backtest&dim=regime&all=1', '/api/evidence/cross?rows=session&cols=strategyId', '/api/evidence/trades', '/api/evidence/trades?source=backtest', '/api/evidence/cohort?filters=%5B%5D']) {
    const r = await get(path)
    assert.equal(r.ok, true, path)
  }
  const d = await get('/api/evidence/dimension?dim=session&all=1')
  assert.equal(d.data.table.provenance.source, 'PAPER')
  for (const row of d.data.table.rows) { assert.equal(row.stats.n, 0); assert.equal(row.stats.meanR, null); assert.equal(row.stats.winRate, null) }
  const c = await get('/api/evidence/cohort?filters=%5B%7B%22dimension%22%3A%22session%22%2C%22values%22%3A%5B%22london%22%5D%7D%5D')
  assert.equal(c.data.cohort.stats.n, 0)
  assert.equal(c.data.thesis.status, 'NOT ESTABLISHED')
})

test('an unknown dimension falls back safely, bad filters are refused, and an unknown trade is 404', async () => {
  const d = await get('/api/evidence/dimension?dim=__proto__')
  assert.equal(d.data.table.dimension, 'session')
  const bad = await fetch(`${bot.base}/api/evidence/cohort?filters=not-json`)
  assert.equal(bad.status, 400)
  const t = await fetch(`${bot.base}/api/evidence/trade?id=nope`)
  assert.equal(t.status, 404)
  const u = await fetch(`${bot.base}/api/evidence/whatever`)
  assert.equal(u.status, 404)
})

test('the backtest refresh is POST-only and, once run, populates the SIMULATED side', async () => {
  const getOnly = await fetch(`${bot.base}/api/evidence/backtest`)
  assert.equal(getOnly.status, 404, 'a GET must not run a replay')
  const r = await bot.post('/api/evidence/backtest', {})
  assert.equal(r.status, 200)
  const j = await r.json() as { ok: boolean; data: { strategyId: string; trades: number; computedAt: number } }
  assert.equal(j.ok, true)
  assert.equal(typeof j.data.computedAt, 'number')
  const o = await get('/api/evidence')
  assert.equal(o.data.backtest.cachedAt, j.data.computedAt)
  assert.equal(o.data.backtest.provenance.dataType, 'SIMULATED')
  assert.equal(o.data.paper.status, 'NOT ENOUGH DATA', 'a backtest changes nothing about the paper side')
})
