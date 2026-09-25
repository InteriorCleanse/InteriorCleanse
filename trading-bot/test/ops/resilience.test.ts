/**
 * PHASE 25 RESILIENCE — the kill points, the retries, reconnect dedupe, the
 * alerts, the monitor, and determinism, all in-process on a throwaway data
 * directory. "Restart" here means: forget everything in memory and read the
 * store again, which is exactly what a process restart does.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import { mk, STEP } from '../fixtures/candles.ts'
import type { Signal, RiskDecision } from '../../src/types.ts'
import type { FeedCandle, StreamHealth } from '../../src/data/types.ts'
import type { FeedHealth } from '../../src/data/feed.ts'
import type { Snapshot } from '../../src/bot.ts'
import type { AppEvent } from '../../src/types.ts'

const tmp = tempDataDir('mrcash-ops25x-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const { store } = await import('../../src/store.ts')
const { bus } = await import('../../src/data/bus.ts')
const pt = await import('../../src/paperTrader.ts')
const { recoverOpenPositions, recordStart, bootLog } = await import('../../src/recovery.ts')
const RT = await import('../../src/ops/retry.ts')
const L = await import('../../src/ops/log.ts')
const A = await import('../../src/ops/alerts.ts')
const M = await import('../../src/ops/monitor.ts')
const FH = await import('../../src/ops/feedHealth.ts')
const HB = await import('../../src/ops/heartbeat.ts')
const C = await import('../../src/ops/checkpoints.ts')
const { RETRY_HANDLERS, readOps } = await import('../../src/learning/ops.ts')
const V = await import('../../src/knowledge/vault.ts')
const O = await import('../../src/observer/events.ts')
const X = await import('../../src/research/experiments.ts')
const Q = await import('../../src/research/queue.ts')
const { INTERVAL_MS } = await import('../../src/market.ts')
after(() => tmp.cleanup())

type Line = { level: string; msg: string }
const lines: Line[] = []
L.resetOpsLog({ logger: { debug() {}, info: (m) => lines.push({ level: 'info', msg: m }), warn: (m) => lines.push({ level: 'warn', msg: m }), error: (m) => lines.push({ level: 'error', msg: m }), path: 'fake' } })

const T0 = Date.UTC(2026, 0, 15, 14, 0)
const sigAt = (t: number): Signal => ({ action: 'BUY', reason: 'test', price: 100, time: t, setupKey: 'BTCUSDT|5m|ICT|london|long|asia-low|IFVG', evidence: [], quality: 70, plan: { direction: 'long', entry: 100, stop: 99, takeProfit: 102, rr: 2, entryLabel: '', stopLabel: '', targetLabel: '' } })
const risk: RiskDecision = { approved: true, finalAction: 'BUY', reason: 'ok', quantity: 0.2, positionValueUsd: 20, riskUsd: 0.2 }
const signalCandle = (t: number) => mk(t - STEP + 1, 99.8, 100.3, 99.5, 100)
const nextCandle = (t: number) => mk(t + 1, 100.05, 100.6, 99.9, 100.4)
const toTarget = (t: number) => mk(t + 1 + STEP, 100.4, 102.5, 100.3, 102.1)

// ---------------------------------------------------------------------------
// Kill points
// ---------------------------------------------------------------------------

test('kill point BEFORE the decision: the once-key is durable, so a restarted process cannot queue the same signal twice', () => {
  const key = `setup-${T0}`
  assert.equal(store().announceOnce(key, T0), true, 'first process announces')
  // "Restart": a new process has an empty in-memory set and asks the store.
  assert.equal(store().announceOnce(key, T0 + 60_000), false, 'the store remembers')
})

test('kill point AFTER the decision, BEFORE the fill: the pending order is re-adopted once and fills once; a second pass changes nothing', () => {
  pt.openPosition(sigAt(T0), risk, 'London', 1)
  // Crash here. Restart:
  const rec = recoverOpenPositions()
  assert.equal(rec.pendingRecovered, 1)
  assert.equal(rec.openRecovered, 0)
  const boots = recordStart(rec.positions.length > 0, T0 + 1000)
  assert.equal(boots.recoveries, 1)
  const filled = pt.managePositions([signalCandle(T0), nextCandle(T0)])
  assert.equal(filled.length, 1)
  assert.equal(filled[0].status, 'open')
  // The same candles again (a restart that replays the same close): no second fill, no change.
  assert.deepEqual(pt.managePositions([signalCandle(T0), nextCandle(T0)]), [])
  assert.equal(pt.readPositions().open.length, 1)
})

test('kill point AFTER the fill, BEFORE the exit: the open position is re-adopted and closed once; one ledger row, one equity row', () => {
  const rec = recoverOpenPositions()
  assert.equal(rec.openRecovered, 1)
  const closed = pt.managePositions([signalCandle(T0), nextCandle(T0), toTarget(T0)])
  assert.equal(closed.length, 1)
  assert.equal(closed[0].exitReason, 'target')
  // Crash after the exit; restart and replay the same candles: nothing to do.
  assert.deepEqual(pt.managePositions([signalCandle(T0), nextCandle(T0), toTarget(T0)]), [])
  assert.equal(pt.readPositions().closed.length, 1)
  assert.equal(store().readLedger().filter((r) => r.mode === 'live-paper').length, 1)
  assert.equal(recoverOpenPositions().positions.length, 0, 'clean after the close')
  assert.equal(bootLog()?.starts, 1)
})

test('kill point DURING a knowledge update: the failed write is recorded, visible, retried after its back-off, and never duplicated', async () => {
  const now = T0 + 3_600_000
  let calls = 0
  // A kind no handler knows: it must stay visible and be reported as skipped, never silently dropped.
  const w = RT.attemptWrite('no-handler', 'knowledge-item:test-1', { title: 'x' }, () => { calls++; throw new Error('disk full') }, now)
  assert.equal(w.ok, false)
  if (!w.ok) { assert.equal(w.item.attempts, 1); assert.ok(w.item.nextAttemptAt > now); assert.match(w.error, /disk full/) }
  assert.equal(RT.listRetries().length, 1, 'visible')
  assert.ok(lines.some((l) => l.level === 'error' && /write-failed/.test(l.msg)), 'on the ops log as ERROR')
  // Before the back-off elapses nothing is retried.
  const early = await RT.runRetries({ 'knowledge-item': () => 'ok' }, now + 1000)
  assert.equal(early.due, 0)
  assert.equal(RT.listRetries().length, 1)
  // A payload that fixes neither an id nor a created time would mint a second record on retry: the handler refuses it.
  const before = V.listItems().length
  RT.recordFailedWrite('knowledge-item', 'knowledge-item:loose', { kind: 'strategy-observation', title: 'loose', body: 'b', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER' } }, new Error('once'), now)
  const r0 = await RT.runRetries(RETRY_HANDLERS, now + 30 * 60_000)
  assert.ok(r0.failed.some((f) => f.key === 'knowledge-item:loose' && /fixed id or created time/.test(f.error)), r0.note)
  assert.equal(V.listItems().length, before, 'nothing was minted')
  RT.clearRetry('knowledge-item:loose')
  // The real handler with a fixed created time: a vault item written twice is one item.
  const item = { kind: 'strategy-observation', title: 'retry test', body: 'b', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER' }, now }
  RT.recordFailedWrite('knowledge-item', 'knowledge-item:test-2', item, new Error('once'), now)
  const r1 = await RT.runRetries(RETRY_HANDLERS, now + 30 * 60_000)
  assert.ok(r1.succeeded.includes('knowledge-item:test-2'), r1.note)
  assert.ok(r1.skipped.includes('knowledge-item:test-1'), 'no handler → skipped and still visible')
  assert.equal(V.listItems().length, before + 1)
  // Retry the same payload again (as if the first success had not been recorded): still one item.
  RT.recordFailedWrite('knowledge-item', 'knowledge-item:test-2', item, new Error('again'), now)
  await RT.runRetries(RETRY_HANDLERS, now + 60 * 60_000)
  assert.equal(V.listItems().length, before + 1, 'idempotent by id')
  // A handler that keeps failing backs off further and stays visible.
  RT.recordFailedWrite('knowledge-item', 'knowledge-item:test-3', { ...item, title: 'still broken' }, new Error('first'), now)
  const r2 = await RT.runRetries({ 'knowledge-item': () => { throw new Error('still broken') } }, now + 60 * 60_000)
  assert.deepEqual(r2.failed.map((f) => f.key), ['knowledge-item:test-3'])
  assert.deepEqual(r2.skipped, ['knowledge-item:test-1'])
  const again = RT.listRetries().find((x) => x.key === 'knowledge-item:test-3')!
  assert.equal(again.attempts, 2)
  assert.ok(again.nextAttemptAt - (now + 60 * 60_000) > 15 * 60_000, 'back-off grew')
  assert.equal(RT.clearRetry('knowledge-item:test-1'), true)
  assert.equal(RT.clearRetry('knowledge-item:test-3'), true)
  assert.equal(RT.listRetries().length, 0)
})

test('kill point DURING a paper-close learning write: the paper-close handler re-runs the post-mortem idempotently; an unknown position is a named failure', async () => {
  const p = pt.readPositions().closed[0]
  const now = T0 + 2 * 3_600_000
  const before = store().keysWithPrefix('knowledge:').length
  const note = await RETRY_HANDLERS['paper-close']({ positionId: p.id }, now)
  assert.match(note, new RegExp(p.id))
  const afterFirst = store().keysWithPrefix('knowledge:').length
  assert.ok(afterFirst >= before)
  await RETRY_HANDLERS['paper-close']({ positionId: p.id }, now + 1)
  assert.equal(store().keysWithPrefix('knowledge:').length, afterFirst, 'a second post-mortem for the same close writes nothing new')
  await assert.rejects(async () => RETRY_HANDLERS['paper-close']({ positionId: 'nope' }, now), /not on record/)
})

test('kill point DURING a research tick: a stranded running flag is recovered on the next tick (see learning/ops.test) — the ops state reads back sane', () => {
  const s = readOps()
  assert.equal(typeof s.runs, 'number')
  assert.equal(s.running, false)
})

// ---------------------------------------------------------------------------
// Reconnect and duplicate delivery
// ---------------------------------------------------------------------------

test('reconnect: a candle delivered twice (stream then REST back-fill) is stored once, counted as a duplicate, and reconnects are counted', () => {
  FH.resetFeedCounters()
  const unsub = FH.watchFeed()
  const step = INTERVAL_MS[config.interval]
  const t = Math.floor(Date.now() / step) * step - 3 * step
  const c: FeedCandle = { openTime: t, closeTime: t + step - 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 3, complete: true, receivedAt: t + step, source: 'stream' as FeedCandle['source'] }
  const h: StreamHealth = { connected: false, host: 'ws', lastMessageAt: {} as StreamHealth['lastMessageAt'], reconnects: 1, lastGap: null, fallbackActive: true }
  const before = store().candleCount(config.symbol, config.interval)
  store().upsertCandles(config.symbol, config.interval, [c], 'stream')
  bus.emit('candle:closed', c)
  bus.emit('stream:down', h, 'socket closed')
  bus.emit('stream:up', { ...h, connected: true })
  store().upsertCandles(config.symbol, config.interval, [{ ...c }], 'rest')
  bus.emit('candle:closed', { ...c, source: 'rest' as FeedCandle['source'] })
  unsub()
  assert.equal(store().candleCount(config.symbol, config.interval), before + 1, 'one row')
  const k = FH.feedCounters()
  assert.equal(k.closes, 2)
  assert.equal(k.duplicateCloses, 1)
  assert.equal(k.reconnectsSeen, 1)
  assert.ok(lines.some((l) => /duplicate-close/.test(l.msg)))
})

test('reconnect: observations, experiments and queue items are content-addressed, so a replayed event is one record', () => {
  const o = O.makeObservation({ type: 'SESSION CHANGE', time: T0, availableAt: T0, session: 'London', regime: null, volatility: null, source: 'engine-step', detail: 'x', direction: null, evidence: [], caseKind: null, recordId: null, significance: { score: 1, selected: false, reasons: ['r'], basis: {}, note: '' }, before: { structureTrend: null, liquidity: null, regime: null, session: null, strategiesActive: 0, strategiesNear: 0, risk: null, price: null }, refId: 'replay' })
  assert.equal(O.recordObservation(o).isNew, true)
  assert.equal(O.recordObservation(o).isNew, false)
  assert.equal(O.recordObservation(O.makeObservation({ ...o, refId: 'replay' })).isNew, false, 'rebuilt from the same content, same id')
  const spec = { hypothesisId: null, kind: 'cohort' as const, strategyId: 's', source: 'PAPER' as const, filters: [], method: 'welch', direction: 'difference' as const, params: null, splitAt: null }
  assert.equal(X.experimentId(spec as Parameters<typeof X.experimentId>[0], 'h1'), X.experimentId(spec as Parameters<typeof X.experimentId>[0], 'h1'))
  assert.notEqual(X.experimentId(spec as Parameters<typeof X.experimentId>[0], 'h1'), X.experimentId(spec as Parameters<typeof X.experimentId>[0], 'h2'), 'a different dataset is a different experiment')
  assert.equal(Q.queueId('q?', 'PAPER', []), Q.queueId('q?', 'PAPER', []))
  assert.equal(V.knowledgeId('lesson', 'T', 1), V.knowledgeId('lesson', 'T', 1))
})

// ---------------------------------------------------------------------------
// Alerts and security
// ---------------------------------------------------------------------------

function feedAt(t: number): FeedHealth {
  const stream: StreamHealth = { connected: true, host: 'ws', lastMessageAt: { kline: t } as StreamHealth['lastMessageAt'], reconnects: 0, lastGap: null, fallbackActive: false }
  return { mode: 'stream', stream, lastClosed: { openTime: t - STEP, announcedAt: t, via: 'stream' }, heartbeat: { at: t, filled: 0 }, price: 1, priceAt: t }
}

test('security regression: the live flag in the environment is a CRITICAL alert and flips the data source label; unset, PAPER', () => {
  const now = Date.now()
  const hb = HB.heartbeat({ feed: feedAt(now), now, probe: true })
  const feed = FH.feedHealthReport(feedAt(now), now)
  const base = { hb, feed, errors: L.errorCounts(now), lock: null, pid: process.pid, engineError: null, integrity: null, now }
  assert.equal(config.live.enabled, false)
  assert.equal(A.evaluateAlerts(base).some((a) => a.id === 'security-live-flag'), false)
  assert.equal(M.dataSource().label, process.env.MRCASH_MARKET_URL ? 'MOCK' : 'PAPER')
  process.env.LIVE_TRADING_ENABLED = '1'
  try {
    const alerts = A.evaluateAlerts(base)
    const sec = alerts.find((a) => a.id === 'security-live-flag')
    assert.ok(sec && sec.severity === 'CRITICAL', 'CRITICAL')
    assert.equal(M.dataSource().label, 'LIVE')
    assert.equal(A.liveFlagSet().env, true)
  } finally { delete process.env.LIVE_TRADING_ENABLED }
  process.env.MRCASH_MARKET_URL = 'http://127.0.0.1:1'
  try { assert.equal(M.dataSource().label, 'MOCK'); assert.match(M.dataSource().detail, /Nothing here is market evidence/) } finally { delete process.env.MRCASH_MARKET_URL }
  assert.equal(M.dataSource().execution, 'SIMULATED EXECUTION')
})

test('alerts: a duplicate process on the lock, stale data and a stopped watcher are named; each rings the bell once per hour and is counted on the ops log', () => {
  // Alerts ring once per CLOCK hour. Start just after the top of the current
  // hour, so the "a minute later" check below never crosses into the next one
  // (a run at hh:59:30 used to).
  const now = Math.floor(Date.now() / 3_600_000) * 3_600_000 + 1_000
  // No stored candle at all: the feed verdict is STALE regardless of what the socket says.
  store().db.exec(`DELETE FROM candles WHERE symbol='${config.symbol}' AND interval='${config.interval}'`)
  const hbOld = HB.heartbeat({ feed: feedAt(now - 10 * STEP), now, probe: false, processStartedAt: now - 86_400_000 })
  const feedStale = FH.feedHealthReport(feedAt(now - 10 * STEP), now)
  assert.equal(feedStale.verdict, 'STALE')
  const inputs = { hb: hbOld, feed: feedStale, errors: L.errorCounts(now), lock: { pid: process.pid + 1, host: 'h', startedAt: now, heartbeatAt: now, role: 'app' as const }, pid: process.pid, engineError: { time: now, message: 'boom' }, integrity: null, now }
  const alerts = A.evaluateAlerts(inputs)
  const ids = alerts.map((a) => a.id)
  assert.ok(ids.includes('duplicate-process'))
  assert.ok(ids.includes('engine-error'))
  assert.ok(ids.includes('stale-data') || ids.includes('degraded-data'), ids.join(','))
  assert.equal(ids.includes('watcher-stopped'), false, 'with no candles arriving the watcher is not blamed; the stale-data alert says why no cycle ran')
  assert.equal(alerts.find((a) => a.id === 'duplicate-process')?.severity, 'CRITICAL')
  const rung: Array<{ title: string; severity: string }> = []
  const emit = (title: string, _body: string, severity: string) => { rung.push({ title, severity }) }
  const first = A.raiseAlerts(alerts, { emit, now })
  assert.equal(first.length, alerts.length)
  const second = A.raiseAlerts(alerts, { emit, now: now + 60_000 })
  assert.equal(second.length, 0, 'within the hour nothing rings twice')
  const nextHour = A.raiseAlerts(alerts, { emit, now: now + 3_600_000 })
  assert.equal(nextHour.length, alerts.length)
  assert.equal(rung.length, 2 * alerts.length)
  const errs = L.errorCounts(now + 3_600_000)
  assert.match(errs.lastCritical?.event ?? '', /^alert-(duplicate-process|watcher-stopped)$/, 'a CRITICAL alert is counted as critical on the ops log')
})

// ---------------------------------------------------------------------------
// The monitor
// ---------------------------------------------------------------------------

test('monitor: a tick produces the health document, logs the watch cycle with a correlation id, reaches the first-fill checkpoint through the bell, and mirrors bell events onto the ops log', async () => {
  const bell: AppEvent[] = []
  const events = { listeners: [] as Array<(e: AppEvent) => void> }
  const push = (title: string, body: string, severity: AppEvent['severity']) => { const e: AppEvent = { id: bell.length + 1, time: Date.now(), kind: 'info', title, body, severity }; bell.push(e); for (const l of events.listeners) l(e) }
  const mon = M.startOpsMonitor({ feed: () => feedAt(Date.now()), alert: push, engineError: () => null, events, intervalMs: 3_600_000, log: () => {} })
  const doc = mon.tick()
  assert.ok(['HEALTHY', 'DEGRADED', 'STALE', 'STOPPED'].includes(doc.overall))
  assert.equal(doc.dataSource.execution, 'SIMULATED EXECUTION')
  assert.equal(doc.security.ok, true)
  assert.equal(doc.process.pid, process.pid)
  assert.ok(doc.performance.tick.last !== null && doc.performance.tick.last >= 0)
  assert.equal(doc.heartbeat.marks.persistence.status, 'HEALTHY', 'the tick probed persistence')
  assert.ok(doc.integrity, 'the first tick of the day wrote the integrity report')
  assert.equal(mon.last()?.at, doc.at)
  // A watch cycle on the bus: logged with a correlation id; the first fill (from the kill-point tests) reaches its checkpoint.
  const beforeCp = C.listCheckpoints().length
  const snap = { signal: null } as unknown as Snapshot
  bus.emit('watch:cycle', { at: Date.now(), snap })
  const cycleLine = [...lines].reverse().find((l) => /watch\.cycle/.test(l.msg))
  assert.ok(cycleLine, 'cycle logged')
  const entry = L.recentOps(50).find((e) => e.component === 'watch' && e.event === 'cycle')!
  assert.match(entry.cid ?? '', /^cycle-/)
  assert.ok(C.listCheckpoints().length >= beforeCp)
  assert.ok(C.listCheckpoints().some((c) => c.id === 'first-fill'))
  assert.ok(bell.some((e) => /PAPER CHECKPOINT: first paper fill/.test(e.title)), 'the checkpoint rang the bell')
  // A bell event from the app lands on the ops log under the watch component.
  push('Yesterday high swept', 'price ran the stops', 'info')
  assert.ok(L.recentOps(50).some((e) => e.component === 'watch' && /Yesterday high swept/.test(e.message)))
  mon.stop()
  assert.ok(lines.some((l) => /monitor-stop/.test(l.msg)))
})

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('determinism: the same store and the same clock give the same heartbeat statuses and the same health verdict', () => {
  const now = Date.now()
  const strip = (h: ReturnType<typeof HB.heartbeat>) => Object.fromEntries(Object.entries(h.marks).map(([k, m]) => [k, [m.status, m.at]]))
  const a = HB.heartbeat({ feed: feedAt(now), now, probe: false })
  const b = HB.heartbeat({ feed: feedAt(now), now, probe: false })
  assert.deepEqual(strip(a), strip(b))
  const ha = M.opsHealth({ feed: feedAt(now), now, probe: false })
  const hb = M.opsHealth({ feed: feedAt(now), now, probe: false })
  assert.equal(ha.overall, hb.overall)
  assert.equal(ha.verdict, hb.verdict)
  assert.deepEqual(ha.alerts.map((x) => x.id), hb.alerts.map((x) => x.id))
})
