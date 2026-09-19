/**
 * OPERATIONAL ALERTS — through the bell that already exists.
 *
 * The conditions the soak must never hide: stale market data, the watcher
 * stopped, the research scheduler stopped, a database failure, repeated
 * reconnects, a paper-engine failure, a second process on the data
 * directory, a corrupted record, a failed persistence probe, and a security
 * regression (the live flag set anywhere). Each alert is evaluated from the
 * heartbeat, the feed report, the error counters, the lock and the last
 * integrity report; nothing here reads the engine.
 *
 * Delivery: the caller passes the app's own `eventLog.push` (the bell, the
 * events table, events.jsonl, the terminal). An alert is raised at most once
 * per hour per condition — the dedupe key lives in the store's `announced`
 * table, so a restart does not re-raise it — and every raise also lands on
 * the ops log at WARN or CRITICAL, where repeats are counted, not written.
 */

import { config } from '../../config.ts'
import { store } from '../store.ts'
import type { FeedHealthReport } from './feedHealth.ts'
import type { Heartbeat } from './heartbeat.ts'
import type { IntegrityReport } from './integrity.ts'
import type { LockInfo } from './lock.ts'
import { ops } from './log.ts'
import type { ErrorCounts } from './log.ts'

export type OpsAlert = { id: string; severity: 'WARN' | 'CRITICAL'; title: string; body: string }

export type AlertInputs = {
  hb: Heartbeat
  feed: FeedHealthReport
  errors: ErrorCounts
  lock: LockInfo | null
  pid: number
  engineError: { time: number; message: string } | null
  integrity: IntegrityReport | null
  now: number
}

/** The live flag, wherever it could be set. Read at evaluation time so a hot change is caught. */
export function liveFlagSet(): { config: boolean; env: boolean } {
  return { config: Boolean(config.live.enabled), env: process.env.LIVE_TRADING_ENABLED !== undefined && process.env.LIVE_TRADING_ENABLED !== '' && process.env.LIVE_TRADING_ENABLED !== '0' && process.env.LIVE_TRADING_ENABLED !== 'false' }
}

export function evaluateAlerts(i: AlertInputs): OpsAlert[] {
  const out: OpsAlert[] = []
  const m = i.hb.marks
  const live = liveFlagSet()
  if (live.config || live.env) out.push({ id: 'security-live-flag', severity: 'CRITICAL', title: 'OPS CRITICAL: live trading flag is set', body: `${live.config ? 'config.live.enabled is true' : ''}${live.config && live.env ? ' and ' : ''}${live.env ? 'LIVE_TRADING_ENABLED is set in the environment' : ''}. Phase 25 runs in PAPER mode only; this is a security regression, not a feature.` })
  if (i.lock && i.lock.pid !== i.pid) out.push({ id: 'duplicate-process', severity: 'CRITICAL', title: 'OPS CRITICAL: another process holds the data directory', body: `The lock is held by pid ${i.lock.pid} on ${i.lock.host} (heartbeat ${new Date(i.lock.heartbeatAt).toISOString()}); this process is pid ${i.pid}. Two engines on one store means duplicate decisions. Stop one.` })
  if (m.persistence.status !== 'HEALTHY') out.push({ id: 'persistence', severity: m.persistence.status === 'STOPPED' || m.persistence.status === 'STALE' ? 'CRITICAL' : 'WARN', title: `OPS ${m.persistence.status === 'DEGRADED' ? 'WARN' : 'CRITICAL'}: persistence ${m.persistence.status}`, body: `${m.persistence.detail} Last successful write ${m.persistence.ageSec === null ? 'never' : `${m.persistence.ageSec}s ago`}; rule: ${m.persistence.rule}.` })
  if (i.integrity && i.integrity.store.quickCheck !== 'ok') out.push({ id: 'database-failure', severity: 'CRITICAL', title: 'OPS CRITICAL: database integrity check failed', body: `SQLite quick_check returned "${i.integrity.store.quickCheck}". Stop writing and take a backup before anything else.` })
  if (i.errors.lastCritical && i.now - i.errors.lastCritical.t <= 3_600_000 && i.errors.lastCritical.component === 'store') out.push({ id: 'store-critical', severity: 'CRITICAL', title: 'OPS CRITICAL: the store reported a critical error', body: `${i.errors.lastCritical.event}: ${i.errors.lastCritical.message}` })
  if (i.feed.verdict === 'STALE') out.push({ id: 'stale-data', severity: 'WARN', title: 'OPS WARN: market data STALE', body: `${i.feed.note} Stale for ${i.feed.staleForSec ?? 0}s. The desk is not showing the current market; no paper decision made on stale data is trustworthy.` })
  else if (i.feed.verdict === 'DATA DEGRADED') out.push({ id: 'degraded-data', severity: 'WARN', title: 'OPS WARN: market data DEGRADED', body: i.feed.note })
  if (i.feed.counters.recentReconnects.length >= 5) out.push({ id: 'repeated-reconnects', severity: 'WARN', title: 'OPS WARN: repeated stream reconnects', body: `${i.feed.counters.recentReconnects.length} reconnects in the last hour (last reason: ${i.feed.counters.lastDownReason ?? '—'}). REST polling covers the gaps; check the network and the exchange status page.` })
  if (m.engineCycle.status === 'STALE' || m.engineCycle.status === 'STOPPED') {
    if (i.feed.verdict !== 'OFF') out.push({ id: 'watcher-stopped', severity: 'CRITICAL', title: `OPS CRITICAL: watch loop ${m.engineCycle.status}`, body: `${m.engineCycle.detail} Last cycle ${m.engineCycle.ageSec === null ? 'never' : `${m.engineCycle.ageSec}s ago`}; rule: ${m.engineCycle.rule}. Candles are arriving but no cycle ran.` })
  }
  if (m.researchTick.status === 'STALE' || m.researchTick.status === 'STOPPED') {
    if (m.engineCycle.status === 'HEALTHY' || m.engineCycle.status === 'DEGRADED') out.push({ id: 'research-stopped', severity: 'WARN', title: `OPS WARN: research scheduler ${m.researchTick.status}`, body: `${m.researchTick.detail} Rule: ${m.researchTick.rule}. The paper engine is unaffected; learning is downstream.` })
  }
  if (i.engineError && i.now - i.engineError.time <= 2 * i.hb.intervalMs) out.push({ id: 'engine-error', severity: 'WARN', title: 'OPS WARN: the last engine cycle failed', body: `${i.engineError.message} (${new Date(i.engineError.time).toISOString()}). The next candle close retries; if this repeats the ops log has the count.` })
  const corrupt = (i.integrity?.knowledge.counts.corrupt ?? 0) + (i.integrity?.observations.counts.idMismatch ?? 0) + (i.integrity?.paper.counts.duplicateSignals ?? 0) + (i.integrity?.paper.counts.duplicateIds ?? 0)
  if (corrupt > 0) out.push({ id: 'corrupted-record', severity: 'WARN', title: 'OPS WARN: corrupted or duplicate records on the store', body: `${i.integrity!.issues.filter((s) => /corrupt|duplicate|does not match/.test(s)).join('; ')}. Nothing was deleted; review the integrity report.` })
  if (i.errors.lastHour >= 20) out.push({ id: 'error-rate', severity: 'WARN', title: 'OPS WARN: error rate', body: `${i.errors.lastHour} errors on the ops log in the last hour (${Object.entries(i.errors.byComponent).map(([k, v]) => `${k} ${v}`).join(', ')}).` })
  return out
}

export type AlertEmitter = (title: string, body: string, severity: 'warn' | 'action' | 'info') => void

/** Raise each alert at most once per hour, through the app's bell and the ops log. Returns the ones actually raised now. */
export function raiseAlerts(alerts: OpsAlert[], deps: { emit?: AlertEmitter; now?: number }): OpsAlert[] {
  const now = deps.now ?? Date.now()
  const hour = Math.floor(now / 3_600_000)
  const raised: OpsAlert[] = []
  for (const a of alerts) {
    if (a.severity === 'CRITICAL') ops.critical('ops', `alert-${a.id}`, `${a.title}: ${a.body}`, { now })
    else ops.warn('ops', `alert-${a.id}`, `${a.title}: ${a.body}`, { now })
    let first = true
    try { first = store().announceOnce(`ops-alert:${a.id}:${hour}`, now) } catch { first = true }
    if (!first) continue
    try { deps.emit?.(a.title, a.body, 'warn') } catch { /* the bell failing must not stop the monitor */ }
    raised.push(a)
  }
  return raised
}
