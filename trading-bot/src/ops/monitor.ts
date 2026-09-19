/**
 * THE OPS MONITOR — one bounded timer beside the engine, and one document.
 *
 * Every `intervalMs` (60 s) it: runs the heartbeat (which probes persistence),
 * reads the feed health, marks the health check, adds a soak tick, checks
 * for a new engine error, writes today's integrity report if the trading day
 * rolled, evaluates the alerts and raises the new ones through the bell, and
 * records its own duration. On every `watch:cycle` it logs the cycle with a
 * correlation id, measures the close-to-cycle latency and checks the paper
 * checkpoints. It subscribes the feed-health counters to the bus.
 *
 * `opsHealth()` builds the same document on demand for the health API, so a
 * request never depends on the timer having fired.
 *
 * The monitor reads. It never calls the engine, the paper trader or the
 * research runner, and the deps it takes are read-only functions plus the
 * app's own alert sink.
 */

import { config } from '../../config.ts'
import { bus } from '../data/bus.ts'
import type { FeedHealth } from '../data/feed.ts'
import { VERSION } from '../version.ts'
import { store } from '../store.ts'
import type { AppEvent } from '../types.ts'
import { evaluateAlerts, liveFlagSet, raiseAlerts } from './alerts.ts'
import type { AlertEmitter, OpsAlert } from './alerts.ts'
import { checkCheckpoints, listCheckpoints } from './checkpoints.ts'
import type { Checkpoint } from './checkpoints.ts'
import { feedCounters, feedHealthReport, watchFeed } from './feedHealth.ts'
import type { FeedHealthReport } from './feedHealth.ts'
import { heartbeat, markHealthCheck } from './heartbeat.ts'
import type { Heartbeat, MarkStatus } from './heartbeat.ts'
import { dailyIntegrity, listIntegrityReports } from './integrity.ts'
import type { IntegrityReport } from './integrity.ts'
import { readLock } from './lock.ts'
import type { LockInfo } from './lock.ts'
import { errorCounts, newCorrelationId, ops, opsLog } from './log.ts'
import type { ErrorCounts } from './log.ts'
import { lastReconciliation } from './reconcile.ts'
import type { ReconciliationReport } from './reconcile.ts'
import { listRetries } from './retry.ts'
import { soakReport, soakTick, startSoak } from './soak.ts'
import type { SoakReport } from './soak.ts'

export type DataSource = { label: 'PAPER' | 'MOCK' | 'LIVE'; execution: 'SIMULATED EXECUTION'; detail: string }

export type Performance = {
  tick: { last: number | null; p50: number | null; p95: number | null; max: number | null; samples: number }
  /** Candle close → cycle finished, in ms. */
  cycleLatency: { last: number | null; p50: number | null; p95: number | null; max: number | null; samples: number }
  memory: { rssMB: number; heapMB: number }
  db: { sizeBytes: number; growthBytesPerHour: number | null; since: number | null }
  eventLoop: { lagMs: number | null }
}

export type OpsHealth = {
  at: number
  version: string
  overall: MarkStatus
  verdict: string
  dataSource: DataSource
  heartbeat: Heartbeat
  feed: FeedHealthReport
  errors: ErrorCounts
  alerts: OpsAlert[]
  lock: { path: string | null; info: LockInfo | null; ours: boolean | null }
  soak: SoakReport
  checkpoints: { all: Checkpoint[]; next: { count: number; label: string; remaining: number } | null }
  reconciliation: ReconciliationReport | null
  integrity: IntegrityReport | null
  retries: { pending: number; oldest: number | null }
  security: { liveEnabledInConfig: boolean; liveEnvSet: boolean; shadowEnabled: boolean; ok: boolean; note: string }
  process: { pid: number; node: string; uptimeSec: number; startedAt: number }
  performance: Performance
  note: string
}

export type MonitorDeps = {
  feed: () => FeedHealth | null
  alert?: AlertEmitter
  engineError?: () => { time: number; message: string } | null
  /** The app's event log, so every bell event also lands on the ops log. */
  events?: { listeners: Array<(e: AppEvent) => void> }
  intervalMs?: number
  log?: (line: string) => void
}

const PERF_KEY = 'ops:performance'
const STARTED_AT = Date.now()
const tickMs: number[] = []
const latencyMs: number[] = []
let lastCloseAt: number | null = null
let dbSizeAtStart: { at: number; bytes: number } | null = null
let lastEngineErrorAt: number | null = null
let lastHealth: OpsHealth | null = null
let lastTickAt: number | null = null
let loopLag: number | null = null

const pct = (xs: number[], p: number): number | null => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const stats = (xs: number[]) => ({ last: xs.length ? xs[xs.length - 1] : null, p50: pct(xs, 0.5), p95: pct(xs, 0.95), max: xs.length ? Math.max(...xs) : null, samples: xs.length })

export function dataSource(): DataSource {
  const live = liveFlagSet()
  if (live.config || live.env) return { label: 'LIVE', execution: 'SIMULATED EXECUTION', detail: 'The live flag is set. Phase 25 must run in PAPER mode; see the security alert.' }
  if (process.env.MRCASH_MARKET_URL) return { label: 'MOCK', execution: 'SIMULATED EXECUTION', detail: `Market data comes from ${process.env.MRCASH_MARKET_URL} (MRCASH_MARKET_URL override): a recorded or synthetic feed. Nothing here is market evidence.` }
  return { label: 'PAPER', execution: 'SIMULATED EXECUTION', detail: `Live exchange market data (${config.data.stream ? 'stream with REST heartbeat' : 'REST polling'}); every fill is simulated by the fill model (next candle open plus spread and slippage).` }
}

export function performanceNow(): Performance {
  const mem = process.memoryUsage()
  const size = store().sizeBytes()
  const growth = dbSizeAtStart && Date.now() - dbSizeAtStart.at > 60_000 ? Math.round((size - dbSizeAtStart.bytes) / ((Date.now() - dbSizeAtStart.at) / 3_600_000)) : null
  return { tick: stats(tickMs), cycleLatency: stats(latencyMs), memory: { rssMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576) }, db: { sizeBytes: size, growthBytesPerHour: growth, since: dbSizeAtStart?.at ?? null }, eventLoop: { lagMs: loopLag } }
}

const worse = (a: MarkStatus, b: MarkStatus): MarkStatus => { const o: MarkStatus[] = ['HEALTHY', 'DEGRADED', 'STALE', 'STOPPED']; return o[Math.max(o.indexOf(a), o.indexOf(b))] }

/** The whole health document, computed now. `probe` writes the persistence probe row (the timer does; a GET need not). */
export function opsHealth(input: { feed: FeedHealth | null; engineError?: { time: number; message: string } | null; now?: number; probe?: boolean } ): OpsHealth {
  const now = input.now ?? Date.now()
  const hb = heartbeat({ feed: input.feed, now, probe: input.probe ?? false })
  const feed = feedHealthReport(input.feed, now)
  const errors = errorCounts(now)
  const lockInfo = readLock()
  const integrity = listIntegrityReports(1)[0] ?? null
  const alerts = evaluateAlerts({ hb, feed, errors, lock: lockInfo, pid: process.pid, engineError: input.engineError ?? null, integrity, now })
  const live = liveFlagSet()
  const security = { liveEnabledInConfig: live.config, liveEnvSet: live.env, shadowEnabled: Boolean(config.shadow.enabled), ok: !live.config && !live.env, note: !live.config && !live.env ? 'PAPER mode: live trading disabled in config and no LIVE_TRADING_ENABLED in the environment.' : 'SECURITY REGRESSION: the live flag is set.' }
  const feedStatus: MarkStatus = feed.verdict === 'OK' ? 'HEALTHY' : feed.verdict === 'DATA DEGRADED' ? 'DEGRADED' : feed.verdict === 'STALE' ? 'STALE' : 'STOPPED'
  const critical = alerts.some((a) => a.severity === 'CRITICAL')
  const overall = critical ? 'STOPPED' : worse(hb.overall, feedStatus)
  const retries = listRetries()
  const cps = listCheckpoints()
  const closed = hb.marks.paperClose.detail.match(/^(\d+) closed/)
  const closedCount = closed ? Number(closed[1]) : 0
  const nextCp = cps.length === 0 && hb.marks.paperFill.at === null ? { count: 0, label: 'first paper fill', remaining: 1 } : ([10, 25, 50, 100, 200].find((n) => closedCount < n) ?? null)
  const verdict = overall === 'HEALTHY' ? 'HEALTHY — every essential mark inside its window, feed OK, no alert.' : critical ? `CRITICAL — ${alerts.filter((a) => a.severity === 'CRITICAL').map((a) => a.id).join(', ')}.` : `${overall} — ${hb.note} Feed: ${feed.verdict}.`
  const doc: OpsHealth = {
    at: now, version: VERSION, overall, verdict, dataSource: dataSource(), heartbeat: hb, feed, errors, alerts,
    lock: { path: lockInfo ? 'mrcash.lock' : null, info: lockInfo, ours: lockInfo ? lockInfo.pid === process.pid : null },
    soak: soakReport(now), checkpoints: { all: cps, next: typeof nextCp === 'number' ? { count: nextCp, label: `${nextCp} closed paper trades`, remaining: nextCp - closedCount } : nextCp },
    reconciliation: lastReconciliation(), integrity, retries: { pending: retries.length, oldest: retries[0]?.firstFailedAt ?? null }, security,
    process: { pid: process.pid, node: process.version, uptimeSec: Math.round((now - STARTED_AT) / 1000), startedAt: STARTED_AT },
    performance: performanceNow(),
    note: `${dataSource().label} · ${dataSource().execution}. ${verdict}`,
  }
  return doc
}

export function lastOpsHealth(): OpsHealth | null { return lastHealth }

/** Start the monitor. Returns stop() and a tick() for tests. Idempotent per process. */
export function startOpsMonitor(deps: MonitorDeps): { stop: () => void; tick: () => OpsHealth; last: () => OpsHealth | null } {
  const log = deps.log ?? (() => {})
  const unsubFeed = watchFeed()
  startSoak()
  dbSizeAtStart = { at: Date.now(), bytes: store().sizeBytes() }
  ops.info('ops', 'monitor-start', `ops monitor started (pid ${process.pid}, ${dataSource().label}, interval ${config.interval})`, { cid: newCorrelationId('boot') })

  const offClose = bus.on('candle:closed', (c) => { lastCloseAt = c.receivedAt || Date.now() })
  const offCycle = bus.on('watch:cycle', (c) => {
    const cid = newCorrelationId('cycle', c.at)
    if (lastCloseAt !== null) { const l = Date.now() - lastCloseAt; if (l >= 0 && l < 3_600_000) { latencyMs.push(l); if (latencyMs.length > 200) latencyMs.shift() } lastCloseAt = null }
    ops.info('watch', 'cycle', `cycle finished at ${new Date(c.at).toISOString()}${c.snap.signal ? ` — ${c.snap.signal.action}` : ''}`, { cid, symbol: config.symbol, result: c.snap.signal?.action ?? 'HOLD' })
    try { const cp = checkCheckpoints(c.at); for (const r of cp.reached) { ops.info('paper', 'checkpoint', `${r.label} reached — human review requested`, { cid }); deps.alert?.(`PAPER CHECKPOINT: ${r.label}`, `${r.review[0]} (Operations tab → Paper engine.)`, 'action') } } catch (err) { ops.error('ops', 'checkpoint-failed', String((err as Error)?.message ?? err), { cid }) }
  })
  if (deps.events) deps.events.listeners.push((e) => { if (/^(OPS |PAPER CHECKPOINT)/.test(e.title)) return; opsLog(e.severity === 'warn' ? 'WARN' : 'INFO', 'watch', e.kind, `${e.title} — ${e.body.slice(0, 240)}`, { symbol: config.symbol }) })

  const tick = (): OpsHealth => {
    const t0 = performance.now()
    const now = Date.now()
    const cid = newCorrelationId('hb', now)
    if (lastTickAt !== null) { const expected = lastTickAt + (deps.intervalMs ?? 60_000); loopLag = Math.max(0, now - expected) }
    lastTickAt = now
    let doc: OpsHealth
    try {
      const feedH = deps.feed()
      const engineError = deps.engineError?.() ?? null
      if (engineError && engineError.time !== lastEngineErrorAt) { lastEngineErrorAt = engineError.time; ops.error('watch', 'cycle-failed', engineError.message, { cid, symbol: config.symbol }) }
      heartbeat({ feed: feedH, now, probe: true })
      markHealthCheck(now)
      try { const d = dailyIntegrity(now); if (d.fresh) ops.info('store', 'integrity', `daily integrity ${d.report.verdict}: ${d.report.issues.length} issue(s) in ${d.report.durationMs} ms`, { cid, result: d.report.verdict }) } catch (err) { ops.error('store', 'integrity-failed', String((err as Error)?.message ?? err), { cid }) }
      doc = opsHealth({ feed: feedH, engineError, now, probe: false })
      try { soakTick({ now, feed: feedCounters(), verdict: doc.feed.verdict, errors: doc.errors }) } catch (err) { ops.error('ops', 'soak-tick-failed', String((err as Error)?.message ?? err), { cid }) }
      const raised = raiseAlerts(doc.alerts, { emit: deps.alert, now })
      for (const a of raised) log(`${a.severity}: ${a.title}`)
      try { store().setJson(PERF_KEY, { at: now, ...doc.performance }) } catch { /* performance is a reading */ }
    } catch (err) {
      ops.critical('ops', 'monitor-tick-failed', String((err as Error)?.message ?? err), { cid })
      doc = lastHealth ?? opsHealth({ feed: null, now, probe: false })
    }
    const ms = Math.round(performance.now() - t0)
    tickMs.push(ms); if (tickMs.length > 200) tickMs.shift()
    // The document was built before this tick's duration was known; stamp it now so the API shows the tick it came from.
    doc = { ...doc, performance: performanceNow() }
    lastHealth = doc
    return doc
  }

  const timer = setInterval(() => { tick() }, deps.intervalMs ?? 60_000)
  timer.unref()
  const first = setTimeout(() => { tick() }, 1_500)
  first.unref()
  return {
    stop: () => { clearInterval(timer); clearTimeout(first); offClose(); offCycle(); unsubFeed(); ops.info('ops', 'monitor-stop', 'ops monitor stopped') },
    tick, last: () => lastHealth,
  }
}
