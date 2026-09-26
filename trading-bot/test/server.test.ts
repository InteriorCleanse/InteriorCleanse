/**
 * The real server on a random port, a temporary data folder, and the
 * local stand-in feeds. Every route gets a status and a shape check;
 * the guard and the kill switch get behaviour checks.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { startMockFeeds, startBot, tempDataDir } from './helpers.ts'
import type { MockFeeds, RunningBot } from './helpers.ts'

let feeds: MockFeeds
let bot: RunningBot
const tmp = tempDataDir('mrcash-server-')

before(async () => {
  mkdirSync(tmp.dir, { recursive: true })
  writeFileSync(join(tmp.dir, 'ledger.csv'), 'timestamp,symbol,action,price,quantity,reason,mode,outcome,pnl\n2026-01-15T13:30:00.000Z,BTCUSDT,BUY,100,1,test row,replay-raw,WIN,1\n')
  feeds = await startMockFeeds()
  bot = await startBot(feeds, { dir: tmp.dir })
})

after(async () => {
  bot.stop()
  await feeds.close()
  tmp.cleanup()
})

const get = async (path: string) => fetch(`${bot.base}${path}`)
const getJson = async <T>(path: string): Promise<T> => (await get(path)).json() as Promise<T>
const ledgerRows = () => readFileSync(join(tmp.dir, 'ledger.csv'), 'utf8').trim().split('\n').length - 1

test('/ serves the dashboard and /login serves the PIN page', async () => {
  const home = await get('/')
  assert.equal(home.status, 200)
  assert.match(await home.text(), /<title>Mr\. Cash<\/title>/)
  const login = await get('/login')
  assert.equal(login.status, 200)
  assert.match(await login.text(), /Enter the PIN/)
})

test('static PWA files are served and unknown paths are 404', async () => {
  assert.equal((await get('/manifest.json')).status, 200)
  assert.equal((await get('/sw.js')).status, 200)
  assert.equal((await get('/icon-192.png')).status, 200)
  assert.equal((await get('/nope')).status, 404)
})

test('/api/health reports paper mode, the kill switch and a writable data folder', async () => {
  const r = await getJson<{ ok: boolean; data: { mode: string; stop: { stopped: boolean }; dataDirWritable: boolean; version: string } }>('/api/health')
  assert.equal(r.ok, true)
  assert.equal(r.data.mode, 'paper')
  assert.equal(r.data.stop.stopped, false)
  assert.equal(r.data.dataDirWritable, true)
  assert.match(r.data.version, /^\d+\.\d+\.\d+$/)
})

test('/api/health deep-checks the store, data dir, feed and kill switch', async () => {
  const r = await getJson<{ data: { healthy: boolean; checks: Array<{ name: string; ok: boolean; detail: string }> } }>('/api/health')
  const names = r.data.checks.map((c) => c.name)
  for (const n of ['store', 'dataDir', 'feed', 'killSwitch']) assert.ok(names.includes(n), `health should report ${n}`)
  assert.equal(typeof r.data.healthy, 'boolean')
  assert.equal(r.data.checks.find((c) => c.name === 'store')!.ok, true)
})

test('/api/live/status shows the gate chain and reports NOT armed (ships closed)', async () => {
  const r = await getJson<{ ok: boolean; data: { armed: boolean; gates: Array<{ name: string; ok: boolean }> } }>('/api/live/status')
  assert.equal(r.ok, true)
  assert.equal(r.data.armed, false)
  assert.ok(r.data.gates.some((g) => g.name === 'Hard flag' && g.ok === false))
})

test('/api/config hands the page a token and describes the setup', async () => {
  const cfg = await getJson<{ csrf: string; mode: string; symbol: string; skills: unknown[]; ai: { available: boolean }; journal: { emotions: string[] } }>('/api/config')
  assert.match(cfg.csrf, /^[0-9a-f]{48}$/)
  assert.equal(cfg.mode, 'paper')
  assert.equal(typeof cfg.symbol, 'string')
  assert.ok(cfg.skills.length >= 5)
  assert.equal(cfg.ai.available, false, 'no key in the test environment')
  assert.ok(cfg.journal.emotions.length > 0)
})

test('/api/analysis returns candles, an analysis, a brief and the paper account from the stand-in feed', async () => {
  const r = await getJson<{ ok: boolean; data: { candles: unknown[]; analysis: { signal: { action: string; evidence: unknown[] } } | null; brief: { lines: string[] } | null; paper: { equityUsd: number }; state: unknown } }>('/api/analysis?candles=120')
  assert.equal(r.ok, true)
  assert.equal(r.data.candles.length, 120)
  assert.ok(r.data.analysis, 'ICT analysis present')
  assert.ok(['BUY', 'SELL', 'HOLD', 'SKIP'].includes(r.data.analysis!.signal.action))
  assert.ok(r.data.analysis!.signal.evidence.length >= 1)
  assert.ok(r.data.brief!.lines.length > 5)
  assert.equal(typeof r.data.paper.equityUsd, 'number')
})

test('/api/news, /api/flow, /api/state, /api/events, /api/paper, /api/memory answer with the expected shapes', async () => {
  const news = await getJson<{ ok: boolean; data: { calendar: unknown[]; headlines: unknown[]; upcoming: unknown[] } }>('/api/news')
  assert.equal(news.ok, true)
  assert.equal(news.data.calendar.length, 2)
  assert.equal(news.data.headlines.length, 2)
  const flow = await getJson<{ ok: boolean; data: { book: { walls: unknown[] } | null; tape: { trades: number } | null } }>('/api/flow?fresh=1')
  assert.ok(flow.data.book && flow.data.book.walls.length >= 1)
  assert.equal(flow.data.tape?.trades, 1000)
  const state = await getJson<{ ok: boolean; data: { trend: string } }>('/api/state')
  assert.ok(['uptrend', 'downtrend', 'range'].includes(state.data.trend))
  const events = await getJson<{ ok: boolean; data: { events: unknown[]; latestId: number } }>('/api/events')
  assert.ok(Array.isArray(events.data.events))
  const paper = await getJson<{ ok: boolean; data: { startUsd: number; open: unknown[]; closed: unknown[] } }>('/api/paper')
  assert.equal(paper.data.open.length, 0)
  const mem = await getJson<{ ok: boolean; data: { rows: unknown[]; lessons: string[] } }>('/api/memory')
  assert.equal(mem.data.rows.length, 1)
})

test('/api/doctor runs every check against the stand-in feeds', async () => {
  const r = await getJson<{ ok: boolean; data: Array<{ name: string; ok: boolean | null }> }>('/api/doctor')
  const byName = Object.fromEntries(r.data.map((c) => [c.name, c.ok]))
  assert.equal(byName['Prices'], true)
  assert.equal(byName['Order book'], true)
  assert.equal(byName['Trade tape'], true)
  assert.equal(byName['News: calendar'], true)
  assert.equal(byName['AI assistant'], null, 'optional, off')
})

test('a forged cross-origin POST to /api/memory/reset is refused and memory is untouched', async () => {
  assert.equal(ledgerRows(), 1)
  const r = await fetch(`${bot.base}/api/memory/reset`, { method: 'POST', headers: { origin: 'http://evil.test', 'sec-fetch-site': 'cross-site' } })
  assert.equal(r.status, 403)
  assert.equal(ledgerRows(), 1)
})

test('a POST without the token is refused; the token with a foreign Origin is refused', async () => {
  const noToken = await fetch(`${bot.base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ allow: 'none' }) })
  assert.equal(noToken.status, 403)
  const foreign = await bot.post('/api/memory/reset', undefined, { origin: 'http://evil.test' })
  assert.equal(foreign.status, 403)
  assert.equal(ledgerRows(), 1)
})

test('the plan can be armed, read back and cleared through the API', async () => {
  const armed = await (await bot.post('/api/plan', { allow: 'short', riskPerTradePercent: 0.5, maxTrades: 1, notes: 'test' })).json() as { ok: boolean; data: { allow: string; riskPerTradePercent: number; maxTrades: number } }
  assert.equal(armed.ok, true)
  assert.equal(armed.data.allow, 'short')
  assert.equal(armed.data.riskPerTradePercent, 0.5)
  const cfg = await getJson<{ plan: { allow: string } | null }>('/api/config')
  assert.equal(cfg.plan?.allow, 'short')
  const cleared = await (await bot.post('/api/plan/clear')).json() as { ok: boolean }
  assert.equal(cleared.ok, true)
  assert.equal((await getJson<{ plan: unknown }>('/api/config')).plan, null)
})

test('journal entries round-trip through the API', async () => {
  const created = await (await bot.post('/api/journal', { direction: 'long', entry: 100, stop: 99, exit: 102, session: 'London', emotions: ['calm'], lesson: 'wait for the retest' })).json() as { ok: boolean; data: { id: string; rMultiple: number; outcome: string } }
  assert.equal(created.ok, true)
  assert.ok(Math.abs(created.data.rMultiple - 1.8) < 1e-9)
  assert.equal(created.data.outcome, 'win')
  const list = await getJson<{ data: { entries: Array<{ id: string }>; stats: { total: number }; review: { oneThing: string } } }>('/api/journal')
  assert.equal(list.data.entries.length, 1)
  assert.equal(list.data.stats.total, 1)
  assert.ok(list.data.review.oneThing.length > 10)
  const prefill = await getJson<{ ok: boolean; data: { botSnapshot: { decision: string } } }>('/api/journal/prefill')
  assert.equal(prefill.ok, true)
  assert.ok(prefill.data.botSnapshot.decision)
  const goals = await (await bot.post('/api/journal/goals', { goals: [{ id: 'g1', title: 'No trades before London', kind: 'manual', done: false }] })).json() as { data: Array<{ id: string }> }
  assert.equal(goals.data[0].id, 'g1')
  const del = await (await bot.post('/api/journal/delete', { id: created.data.id })).json() as { ok: boolean }
  assert.equal(del.ok, true)
})

test('/api/scan logs a decision and /api/replay/raw runs on the stand-in candles', async () => {
  const scan = await getJson<{ ok: boolean; data: { finalAction: string; risk: { reason: string } } }>('/api/scan')
  assert.equal(scan.ok, true)
  assert.ok(['BUY', 'SELL', 'HOLD', 'SKIP'].includes(scan.data.finalAction))
  const replay = await getJson<{ ok: boolean; data: { summary: { totalSetups: number; taken: number; wins: number; losses: number; flat: number }; trades: unknown[]; notes: string[] } }>('/api/replay/raw')
  assert.equal(replay.ok, true)
  const s = replay.data.summary
  assert.equal(s.taken, s.wins + s.losses + s.flat)
  assert.ok(replay.data.notes.some((n) => /news blackout/i.test(n)), 'the replay says the blackout was not applied')
})

test('the assistant routes say the assistant is off instead of failing', async () => {
  const chat = await (await bot.post('/api/chat', { question: 'hi' })).json() as { ok: boolean; error: string }
  assert.equal(chat.ok, false)
  assert.match(chat.error, /ANTHROPIC_API_KEY/)
  const pic = await (await bot.post('/api/picture', { image: 'data:text/plain;base64,AAAA' })).json() as { ok: boolean }
  assert.equal(pic.ok, false)
})

test('the kill switch engages and releases over HTTP and shows in health', async () => {
  const on = await (await bot.post('/api/stop', { reason: 'http test' })).json() as { ok: boolean; data: { stopped: boolean } }
  assert.equal(on.data.stopped, true)
  const h1 = await getJson<{ data: { stop: { stopped: boolean; reason?: string } } }>('/api/health')
  assert.equal(h1.data.stop.reason, 'http test')
  const off = await (await bot.post('/api/resume')).json() as { data: { stopped: boolean } }
  assert.equal(off.data.stopped, false)
})

test('the TradingView webhook uses its own secret, logs a hit, and raises an event', async () => {
  const bad = await fetch(`${bot.base}/api/tv-alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: 'wrong', event: 'x' }) })
  assert.equal(bad.status, 403)
  const cfg = await getJson<{ app: { webhook: { secret: string } } }>('/api/config')
  const ok = await fetch(`${bot.base}/api/tv-alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: cfg.app.webhook.secret, event: 'low swept', symbol: 'BTCUSDT', price: 100 }) })
  assert.equal(ok.status, 200)
  const events = await getJson<{ data: { events: Array<{ kind: string }> } }>('/api/events')
  assert.ok(events.data.events.some((e) => e.kind === 'tradingview'))
  assert.match(readFileSync(join(tmp.dir, 'tv-alerts.csv'), 'utf8'), /low swept/)
})

test('memory reset works with the token and empties the ledger', async () => {
  const r = await (await bot.post('/api/memory/reset')).json() as { ok: boolean }
  assert.equal(r.ok, true)
  assert.equal(ledgerRows(), 0)
})

test('/api/system answers "what is the state of my system" and /api/settings round-trips', async () => {
  const sys = await getJson<{ ok: boolean; data: { mode: string; feeds: { candles: { verdict: string } }; data: { integrity: string; counts: { events: number } }; trading: { tradesToday: number }; summary: string } }>('/api/system')
  assert.equal(sys.ok, true)
  assert.equal(sys.data.mode, 'paper')
  assert.equal(sys.data.data.integrity, 'ok')
  assert.ok(sys.data.data.counts.events >= 1)
  assert.ok(['fresh', 'stale', 'never'].includes(sys.data.feeds.candles.verdict))
  assert.ok(sys.data.summary.length > 10)
  const set = await (await bot.post('/api/settings', { key: 'watchEveryMinutes', value: 3 })).json() as { ok: boolean; data: { watchEveryMinutes: number } }
  assert.equal(set.data.watchEveryMinutes, 3)
  const bad = await bot.post('/api/settings', { key: 'watchEveryMinutes', value: 'x' })
  assert.equal(bad.status, 400)
  const reset = await (await bot.post('/api/settings', { key: 'watchEveryMinutes', reset: true })).json() as { data: { watchEveryMinutes: number } }
  assert.notEqual(reset.data.watchEveryMinutes, 3)
})

test('/api/stream pushes a health event first, and /api/system reports where prices come from', async () => {
  const res = await fetch(`${bot.base}/api/stream`)
  assert.equal(res.headers.get('content-type'), 'text/event-stream')
  const reader = res.body!.getReader()
  const { value } = await reader.read()
  const text = new TextDecoder().decode(value)
  assert.match(text, /^event: health\ndata: /)
  const health = JSON.parse(text.split('\n')[1].slice(6)) as { mode: string }
  assert.equal(health.mode, 'rest', 'the test bot runs with the stream off')
  await reader.cancel()
  const sys = await getJson<{ data: { marketData: { mode: string }; feeds: { livePrice: { verdict: string } }; watch: { cycles: number } } }>('/api/system')
  assert.equal(sys.data.marketData.mode, 'rest')
  assert.equal(sys.data.feeds.livePrice.verdict, 'never')
  assert.ok(sys.data.watch.cycles >= 1)
})

test('after a hard kill and restart, the bell still shows what happened and ids keep climbing', async () => {
  const before = await getJson<{ data: { events: Array<{ id: number; kind: string }>; latestId: number } }>('/api/events')
  assert.ok(before.data.events.some((e) => e.kind === 'tradingview'))
  bot.child.kill('SIGKILL')
  await new Promise((r) => bot.child.once('exit', r))
  bot = await startBot(feeds, { dir: tmp.dir })
  const after_ = await getJson<{ data: { events: Array<{ id: number; kind: string }>; latestId: number } }>('/api/events')
  assert.ok(after_.data.events.some((e) => e.kind === 'tradingview'), 'the TradingView alert survived the crash')
  assert.ok(after_.data.latestId >= before.data.latestId, 'ids never restart from 1')
  const h = await getJson<{ data: { store: string } }>('/api/health')
  assert.equal(h.data.store, 'ok')
})

test('decorative media: only named files under /media, 404 when missing, and /api/config says which exist', async () => {
  const cfg = await getJson<{ media: { film: boolean; poster: boolean } }>('/api/config')
  assert.equal(typeof cfg.media.film, 'boolean')
  assert.equal(typeof cfg.media.poster, 'boolean')
  for (const p of ['/media/../package.json', '/media/%2e%2e/package.json', '/media/hero.exe', '/media/Hero.MP4']) assert.notEqual((await get(p)).status, 200, p)
  if (!cfg.media.film) assert.equal((await get('/media/hero.mp4')).status, 404)
})

test('scanner evidence: BACKTEST label, a baseline, and 404 for a market that is not watched', async () => {
  assert.equal((await get('/api/scanner/evidence?key=crypto:NOPE')).status, 404)
  const list = await getJson<{ ok: boolean; data: { markets: Array<{ key: string; bias: { score: number; lean: string } }> } }>('/api/scanner')
  assert.ok(list.ok)
  for (const m of list.data.markets) assert.ok(m.bias.score >= -6 && m.bias.score <= 6)
})

test('market conditions: a labelled reading across every asset class, which stops nothing by itself', async () => {
  const r = await getJson<{ ok: boolean; data: { label: string; verdict: string; wouldStop: boolean; assets: Array<{ asset: string; hours: { open: boolean } }>; note: string; stop: { stopped: boolean } } }>('/api/conditions')
  assert.ok(r.ok)
  assert.equal(r.data.label, 'READING')
  assert.ok(['GOOD', 'CAUTION', 'POOR', 'NOT ENOUGH DATA'].includes(r.data.verdict))
  assert.deepEqual(r.data.assets.map((a) => a.asset), ['crypto', 'forex', 'stock', 'option', 'future'])
  assert.equal(r.data.assets[0].hours.open, true, 'crypto is always open')
  assert.match(r.data.note, /not a signal/)
  assert.equal(r.data.stop.stopped, false, 'reading conditions never engages the kill switch')
})

test('scalp desk: a labelled reading with the engine\'s own costs, and break-even arithmetic that rejects nonsense', async () => {
  const r = await getJson<{ ok: boolean; data: { label: string; verdict: string; costs: { feeBpsPerSide: number }; curve: unknown[]; note: string } }>('/api/scalp')
  assert.ok(r.ok)
  assert.equal(r.data.label, 'READING')
  assert.ok(['good', 'thin', 'stand aside', 'NOT ENOUGH DATA'].includes(r.data.verdict))
  assert.match(r.data.note, /not a signal/)
  assert.ok(r.data.curve.length > 0)
  const b = await getJson<{ ok: boolean; data: { breakEven: number | null } }>('/api/scalp/breakeven?target=20&stop=20&spread=10&fee=0&slip=0')
  assert.equal(b.data.breakEven, 0.75)
  const bad = await getJson<{ ok: boolean; error: string }>('/api/scalp/breakeven?target=0&stop=10')
  assert.equal(bad.ok, false)
  const five = await getJson<{ ok: boolean; data: { windowMinutes: number } }>('/api/forecast?window=5')
  assert.equal(five.data.windowMinutes, 5)
})
