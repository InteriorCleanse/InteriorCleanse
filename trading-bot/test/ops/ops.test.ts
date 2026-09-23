/**
 * PHASE 25 OPS — the ops log (severity, correlation, repeat suppression,
 * error counters), the single-process lock, the heartbeat thresholds and the
 * feed-health verdicts. Everything here runs on a throwaway data directory.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tempDataDir } from '../helpers.ts'
import type { FeedCandle, StreamHealth } from '../../src/data/types.ts'
import type { FeedHealth } from '../../src/data/feed.ts'

const tmp = tempDataDir('mrcash-ops25-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const { store } = await import('../../src/store.ts')
const { bus } = await import('../../src/data/bus.ts')
const L = await import('../../src/ops/log.ts')
const K = await import('../../src/ops/lock.ts')
const HB = await import('../../src/ops/heartbeat.ts')
const FH = await import('../../src/ops/feedHealth.ts')
const { INTERVAL_MS } = await import('../../src/market.ts')
const { lastClosedOpenTime } = await import('../../src/data/candleStore.ts')
const { readOps, RESEARCH_TICK_MS } = await import('../../src/learning/ops.ts')
after(() => tmp.cleanup())

const STEP = INTERVAL_MS[config.interval]
const NOW = Date.UTC(2026, 0, 20, 15, 0)

type Line = { level: string; msg: string; fields?: Record<string, unknown> }
function fakeLogger(): { lines: Line[]; logger: import('../../src/log.ts').Logger } {
  const lines: Line[] = []
  const push = (level: string) => (msg: string, fields?: Record<string, unknown>) => { lines.push({ level, msg, fields }) }
  return { lines, logger: { debug: push('debug'), info: push('info'), warn: push('warn'), error: push('error'), path: 'fake' } }
}

// ---------------------------------------------------------------------------
// ops log
// ---------------------------------------------------------------------------

test('ops log: every line carries timestamp, component, event, severity and correlation id; symbol/strategy/result ride along', () => {
  const { lines, logger } = fakeLogger()
  L.resetOpsLog({ logger })
  const cid = L.newCorrelationId('cycle', NOW)
  const entry = L.withCorrelation(cid, () => L.ops.info('paper', 'queued', 'order queued', { symbol: 'BTCUSDT', strategy: 'silver-bullet', result: 'PENDING', now: NOW }))
  assert.equal(entry.t, NOW)
  assert.equal(entry.component, 'paper')
  assert.equal(entry.event, 'queued')
  assert.equal(entry.severity, 'INFO')
  assert.equal(entry.cid, cid)
  assert.equal(entry.symbol, 'BTCUSDT')
  assert.equal(entry.strategy, 'silver-bullet')
  assert.equal(entry.result, 'PENDING')
  assert.equal(lines.length, 1)
  assert.equal(lines[0].level, 'info')
  assert.equal(lines[0].fields?.cid, cid)
  assert.equal(lines[0].fields?.severity, 'INFO')
  assert.equal(L.currentCorrelationId(), null, 'the correlation id is scoped to the callback')
})

test('ops log: nested correlation keeps the outer id; async variant restores it', async () => {
  L.resetOpsLog({ logger: fakeLogger().logger })
  const inner = await L.withCorrelationAsync('outer', async () => L.withCorrelation('inner', () => L.currentCorrelationId()))
  assert.equal(inner, 'outer')
  assert.equal(L.currentCorrelationId(), null)
})

test('ops log: identical lines inside the window are counted, not written; the count flushes with the next distinct line', () => {
  const { lines, logger } = fakeLogger()
  L.resetOpsLog({ logger })
  for (let i = 0; i < 40; i++) L.ops.warn('feed', 'stream-down', 'socket closed', { now: NOW + i * 1000 })
  assert.equal(lines.length, 1, 'forty identical warnings produce one line')
  const sup = L.suppressedRepeats()
  assert.equal(sup.length, 1)
  assert.equal(sup[0].count, 40)
  // Past the window the same line is written again, carrying the repeat count.
  L.ops.warn('feed', 'stream-down', 'socket closed', { now: NOW + 11 * 60_000 })
  assert.equal(lines.length, 2)
  assert.match(lines[1].msg, /repeated 40×/)
  assert.equal(L.recentOps(10).length, 2, 'the ring holds distinct lines only')
})

test('ops log: ERROR and CRITICAL are counted per component, in the last hour, and survive a reset of the in-memory state via the kv mirror', () => {
  L.resetOpsLog({ logger: fakeLogger().logger })
  store().setJson('ops:errors', null)
  L.ops.error('knowledge', 'write-failed', 'disk said no', { now: NOW })
  L.ops.error('knowledge', 'write-failed', 'disk said no', { now: NOW + 1000 })
  L.ops.critical('security', 'live-flag', 'LIVE_TRADING_ENABLED is set', { now: NOW + 2000 })
  L.ops.warn('feed', 'gap', 'not an error', { now: NOW + 3000 })
  const c = L.errorCounts(NOW + 4000)
  assert.equal(c.total, 3, 'repeat-suppressed errors still count')
  assert.equal(c.byComponent.knowledge, 2)
  assert.equal(c.byComponent.security, 1)
  assert.equal(c.lastHour, 3)
  assert.equal(c.lastCritical?.event, 'live-flag')
  assert.equal(c.lastError?.severity, 'CRITICAL')
  const later = L.errorCounts(NOW + 2 * 3_600_000)
  assert.equal(later.lastHour, 0)
  assert.equal(later.total, 3)
  L.resetOpsLog({ logger: fakeLogger().logger })
  const restored = L.errorCounts(NOW + 5000)
  assert.equal(restored.total, 3, 'totals come back from the store')
  assert.equal(restored.byComponent.security, 1)
})

test('ops log: with no injected sink it writes JSON lines to <data dir>/ops.log', () => {
  L.resetOpsLog()
  L.ops.info('ops', 'boot', 'hello file', { now: NOW })
  const p = join(tmp.dir, 'ops.log')
  assert.ok(existsSync(p))
  const last = readFileSync(p, 'utf8').trim().split('\n').at(-1)!
  const row = JSON.parse(last)
  assert.equal(row.component, 'ops')
  assert.equal(row.event, 'boot')
  assert.equal(row.severity, 'INFO')
  L.resetOpsLog({ logger: fakeLogger().logger })
})

// ---------------------------------------------------------------------------
// single-process lock
// ---------------------------------------------------------------------------

test('lock: the first process acquires; a second live process is refused with the owner named; a dead or stale owner is taken over', () => {
  const dir = tmp.dir
  const alive = new Set([100])
  const isAlive = (pid: number) => alive.has(pid)
  const a = K.acquireLock({ dir, pid: 100, role: 'app', now: NOW, isAlive, host: 'h' })
  assert.equal(a.ok, true)
  assert.deepEqual(K.readLock(dir)?.pid, 100)
  const b = K.acquireLock({ dir, pid: 200, role: 'app', now: NOW + 1000, isAlive, host: 'h' })
  assert.equal(b.ok, false)
  if (!b.ok) { assert.equal(b.owner.pid, 100); assert.match(b.reason, /already owned by Mr. Cash pid 100/); assert.match(b.reason, /One process per data directory/) }
  assert.equal(K.readLock(dir)?.pid, 100, 'the refused process did not touch the lock')
  // Heartbeat refresh belongs to the owner only.
  assert.equal(K.refreshLock({ dir, pid: 200, now: NOW + 2000 }), false)
  assert.equal(K.refreshLock({ dir, pid: 100, now: NOW + 2000 }), true)
  assert.equal(K.readLock(dir)?.heartbeatAt, NOW + 2000)
  // Owner dies: takeover.
  alive.delete(100)
  const c = K.acquireLock({ dir, pid: 300, now: NOW + 3000, isAlive, host: 'h' })
  assert.equal(c.ok, true)
  if (c.ok) assert.equal(c.tookOver?.pid, 100)
  // Owner alive but heartbeat stale: takeover.
  alive.add(300)
  const d = K.acquireLock({ dir, pid: 400, now: NOW + 3000 + K.LOCK_STALE_MS + 1, isAlive, host: 'h' })
  assert.equal(d.ok, true)
  if (d.ok) assert.equal(d.tookOver?.pid, 300)
  // Another host: only the heartbeat can decide.
  assert.equal(K.lockIsLive({ pid: 1, host: 'elsewhere', startedAt: NOW, heartbeatAt: NOW, role: 'app' }, { now: NOW + 1000, host: 'h', isAlive: () => false }), true)
  assert.equal(K.lockIsLive({ pid: 1, host: 'elsewhere', startedAt: NOW, heartbeatAt: NOW, role: 'app' }, { now: NOW + K.LOCK_STALE_MS + 1, host: 'h', isAlive: () => true }), false)
  // Release belongs to the owner only.
  assert.equal(K.releaseLock({ dir, pid: 999 }), false)
  assert.equal(K.releaseLock({ dir, pid: 400 }), true)
  assert.equal(K.readLock(dir), null)
})

test('lock: a corrupt lock file is treated as absent, and force takes over a live owner', () => {
  const dir = tmp.dir
  writeFileSync(K.lockPath(dir), 'not json')
  assert.equal(K.readLock(dir), null)
  const a = K.acquireLock({ dir, pid: 1, now: NOW, isAlive: () => true, host: 'h' })
  assert.equal(a.ok, true)
  const refused = K.acquireLock({ dir, pid: 2, now: NOW, isAlive: () => true, host: 'h' })
  assert.equal(refused.ok, false)
  const forced = K.acquireLock({ dir, pid: 2, now: NOW, isAlive: () => true, host: 'h', force: true })
  assert.equal(forced.ok, true)
  if (forced.ok) assert.equal(forced.tookOver?.pid, 1)
  K.releaseLock({ dir, pid: 2 })
})

test('lock: holdLock acquires for this process, refreshes on a timer and releases on stop', async () => {
  const held = K.holdLock({ role: 'test', refreshMs: 20 })
  assert.equal(held.ok, true)
  const first = K.readLock()!
  assert.equal(first.pid, process.pid)
  await new Promise((r) => setTimeout(r, 60))
  assert.ok(K.readLock()!.heartbeatAt >= first.heartbeatAt)
  const second = K.holdLock({ role: 'test' })
  assert.equal(second.ok, true, 'the same pid re-acquires its own lock')
  second.stop?.()
  held.stop?.()
  assert.equal(K.readLock(), null)
})

// ---------------------------------------------------------------------------
// heartbeat
// ---------------------------------------------------------------------------

function feedAt(t: number, over: Partial<FeedHealth> = {}): FeedHealth {
  const stream: StreamHealth = { connected: true, host: 'ws.example', lastMessageAt: { kline: t, aggTrade: t, bookTicker: null, depth: null } as StreamHealth['lastMessageAt'], reconnects: 0, lastGap: null, fallbackActive: false }
  return { mode: 'stream', stream, lastClosed: { openTime: t - STEP, announcedAt: t, via: 'stream' }, heartbeat: { at: t, filled: 0 }, price: 100, priceAt: t, ...over }
}

test('heartbeat: nothing recorded → every essential mark STOPPED and the overall says so; the rule is printed on every mark', () => {
  store().setJson('research:ops', null)
  store().setJson('ops:persistence-probe', null)
  store().setJson('ops:last-health-check', null)
  // A process that started a day ago and recorded nothing is STOPPED; a fresh start is "pending", not STOPPED.
  const fresh = HB.heartbeat({ feed: null, now: NOW, probe: false, processStartedAt: NOW - 10_000 })
  assert.equal(fresh.marks.engineCycle.status, 'HEALTHY', 'ten seconds after start, no cycle yet is not a fault')
  assert.match(fresh.marks.engineCycle.detail, /never recorded; the process started 10s ago/)
  assert.equal(fresh.marks.researchTick.status, 'HEALTHY')
  const hb = HB.heartbeat({ feed: null, now: NOW, probe: false, processStartedAt: NOW - 86_400_000 })
  assert.equal(hb.overall, 'STOPPED')
  for (const m of Object.values(hb.marks)) { assert.ok(m.rule.length > 10, `${m.name} prints its rule`); assert.ok(['HEALTHY', 'DEGRADED', 'STALE', 'STOPPED'].includes(m.status)) }
  assert.equal(hb.marks.marketData.status, 'STOPPED')
  assert.equal(hb.marks.candle.status, 'STOPPED')
  assert.equal(hb.marks.engineCycle.status, 'STOPPED')
  assert.equal(hb.marks.researchTick.status, 'STOPPED')
  assert.equal(hb.marks.persistence.status, 'STOPPED')
  assert.equal(hb.marks.paperFill.status, 'STOPPED')
  assert.match(hb.marks.paperFill.rule, /quiet market is not a fault/)
})

test('heartbeat: fresh marks are HEALTHY; ages cross the printed thresholds into DEGRADED and STALE; the probe writes and reads back', () => {
  const probe = HB.persistenceProbe(NOW)
  assert.equal(probe.ok, true)
  assert.equal(HB.lastPersistence(), NOW)
  HB.markHealthCheck(NOW)
  const closeTime = NOW - 30_000
  store().upsertCandles(config.symbol, config.interval, [{ openTime: closeTime - STEP + 1, closeTime, open: 1, high: 1, low: 1, close: 1, volume: 1 }], 'test')
  store().setJson('research:ops', { ...readOps(), lastCycleAt: NOW - 10_000, cycles: 3, lastRun: NOW - 60_000, nextRun: NOW + RESEARCH_TICK_MS, runs: 2 })
  const hb = HB.heartbeat({ feed: feedAt(NOW), now: NOW, probe: false })
  assert.equal(hb.overall, 'HEALTHY', hb.note)
  assert.equal(hb.marks.marketData.status, 'HEALTHY')
  assert.equal(hb.marks.candle.status, 'HEALTHY')
  assert.equal(hb.marks.engineCycle.status, 'HEALTHY')
  assert.equal(hb.marks.researchTick.status, 'HEALTHY')
  assert.equal(hb.marks.persistence.status, 'HEALTHY')
  assert.equal(hb.marks.healthCheck.status, 'HEALTHY')
  assert.equal(hb.marks.paperDecision.status, 'HEALTHY', 'no decisions on record is not a fault while the engine cycles')
  // Three intervals later without a cycle: DEGRADED. Seven: STALE.
  const later = HB.heartbeat({ feed: feedAt(NOW), now: NOW + 3 * STEP, probe: false })
  assert.equal(later.marks.engineCycle.status, 'DEGRADED')
  assert.equal(later.marks.marketData.status, 'DEGRADED')
  assert.equal(later.overall, 'DEGRADED')
  const stale = HB.heartbeat({ feed: feedAt(NOW), now: NOW + 7 * STEP, probe: false })
  assert.equal(stale.marks.engineCycle.status, 'STALE')
  assert.equal(stale.marks.candle.status, 'STALE')
  assert.equal(stale.overall, 'STALE')
  assert.match(stale.note, /engine cycle STALE/)
  // Research: overdue by more than four ticks → STOPPED, and it dominates.
  const dead = HB.heartbeat({ feed: feedAt(NOW + 5 * RESEARCH_TICK_MS), now: NOW + 5 * RESEARCH_TICK_MS + 1, probe: false })
  assert.equal(dead.marks.researchTick.status, 'STOPPED')
  assert.equal(dead.overall, 'STOPPED')
})

// ---------------------------------------------------------------------------
// feed health
// ---------------------------------------------------------------------------

function candle(openTime: number, over: Partial<FeedCandle> = {}): FeedCandle {
  return { openTime, closeTime: openTime + STEP - 1, open: 1, high: 1, low: 1, close: 1, volume: 1, complete: true, receivedAt: openTime + STEP, source: 'stream' as FeedCandle['source'], ...over }
}

test('feed health: counters see closes, duplicates, timestamp anomalies, gaps and reconnects on the bus', () => {
  L.resetOpsLog({ logger: fakeLogger().logger })
  FH.resetFeedCounters()
  const unsub = FH.watchFeed()
  const t0 = Math.floor(Date.now() / STEP) * STEP - 5 * STEP
  bus.emit('candle:closed', candle(t0))
  bus.emit('candle:closed', candle(t0 + STEP))
  bus.emit('candle:closed', candle(t0 + STEP))
  bus.emit('candle:closed', candle(t0 + 2 * STEP + 7))
  bus.emit('candle:closed', candle(t0 + 3 * STEP, { closeTime: t0 + 3 * STEP - 1 }))
  bus.emit('candle:closed', candle(Date.now() + 10 * STEP))
  const h: StreamHealth = { connected: false, host: 'ws.example', lastMessageAt: { kline: null, aggTrade: null, bookTicker: null, depth: null } as StreamHealth['lastMessageAt'], reconnects: 1, lastGap: null, fallbackActive: true }
  bus.emit('stream:down', h, 'socket closed')
  bus.emit('stream:up', { ...h, connected: true })
  bus.emit('stream:gap', 'missed 1 candle', Date.now())
  unsub()
  bus.emit('candle:closed', candle(t0 + 4 * STEP))
  const c = FH.feedCounters()
  assert.equal(c.closes, 6, 'unsubscribed after six')
  assert.equal(c.duplicateCloses, 1)
  assert.equal(c.timestampAnomalies, 3, 'misaligned open, bad close, future open')
  assert.equal(c.streamDowns, 1)
  assert.equal(c.streamUps, 1)
  assert.equal(c.reconnectsSeen, 1)
  assert.equal(c.recentReconnects.length, 1)
  assert.equal(c.gapEvents, 1)
  assert.equal(c.lastDownReason, 'socket closed')
})

test('feed health: verdicts — OFF with no feed, STALE with no candle or far behind, DATA DEGRADED when behind/stream down/many reconnects/anomalies, OK when current', () => {
  FH.resetFeedCounters()
  const now = Math.floor(Date.now() / STEP) * STEP + 30_000
  const expected = lastClosedOpenTime(config.interval, now)
  // Isolate the candle table for this symbol.
  store().db.exec(`DELETE FROM candles WHERE symbol='${config.symbol}' AND interval='${config.interval}'`)
  assert.equal(FH.feedHealthReport(null, now).verdict, 'OFF')
  assert.equal(FH.feedHealthReport(feedAt(now, { mode: 'off' }), now).verdict, 'OFF')
  const noCandle = FH.feedHealthReport(feedAt(now), now)
  assert.equal(noCandle.verdict, 'STALE')
  assert.match(noCandle.note, /not showing the current market/)
  assert.equal(noCandle.freshness.behindBy, -1)
  // A full, current 24 h window.
  const rows = []
  for (let t = expected - 24 * 12 * STEP; t <= expected; t += STEP) rows.push({ openTime: t, closeTime: t + STEP - 1, open: 1, high: 1, low: 1, close: 1, volume: 1 })
  store().upsertCandles(config.symbol, config.interval, rows, 'test')
  const ok = FH.feedHealthReport(feedAt(now), now)
  assert.equal(ok.verdict, 'OK', ok.note)
  assert.equal(ok.freshness.behindBy, 0)
  assert.equal(ok.missing.missingCandles, 0)
  assert.equal(ok.rest.available, true)
  assert.equal(ok.websocket.connected, true)
  assert.equal(ok.staleForSec, null)
  // Three intervals behind → DEGRADED; seven → STALE; the stale duration is tracked.
  const deg = FH.feedHealthReport(feedAt(now), now + 3 * STEP)
  assert.equal(deg.verdict, 'DATA DEGRADED')
  assert.match(deg.note, /3 intervals behind/)
  assert.equal(deg.missing.missingCandles, 3)
  const stale = FH.feedHealthReport(feedAt(now), now + 7 * STEP)
  assert.equal(stale.verdict, 'STALE')
  assert.equal(stale.staleForSec, Math.round(4 * STEP / 1000), 'stale since the first degraded report')
  const back = FH.feedHealthReport(feedAt(now), now)
  assert.equal(back.verdict, 'OK')
  assert.equal(back.staleForSec, null)
  // Stream configured but down → DEGRADED even when the candles are current.
  const down = feedAt(now); down.stream!.connected = false
  const streamDown = FH.feedHealthReport(down, now)
  assert.equal(config.data.stream ? streamDown.verdict : 'DATA DEGRADED', 'DATA DEGRADED')
  // Five reconnects in the hour → DEGRADED.
  const unsub = FH.watchFeed()
  const h: StreamHealth = { connected: false, host: 'x', lastMessageAt: {} as StreamHealth['lastMessageAt'], reconnects: 5, lastGap: null, fallbackActive: true }
  for (let i = 0; i < 5; i++) bus.emit('stream:down', h, 'flap')
  unsub()
  const flapping = FH.feedHealthReport(feedAt(now), now)
  assert.equal(flapping.verdict, 'DATA DEGRADED')
  assert.match(flapping.note, /5 reconnects in the last hour/)
  FH.resetFeedCounters()
  assert.equal(FH.feedHealthReport(feedAt(now), now).verdict, 'OK')
})
