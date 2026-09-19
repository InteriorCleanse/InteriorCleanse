/**
 * MR. CASH HEARTBEAT — every "last …" the operator needs, with a status
 * derived only from explicit, printed thresholds.
 *
 *   HEALTHY   the mark is within its healthy window
 *   DEGRADED  older than healthy but inside the degraded window
 *   STALE     older than the degraded window
 *   STOPPED   never happened, or the process that should produce it is not
 *             running (the research scheduler's next run is long overdue)
 *
 * Thresholds are multiples of the candle interval so the same rules hold on
 * 1-minute and 4-hour charts. Marks that legitimately go quiet for days
 * (a paper decision, a fill, a close) are reported with the age and the
 * threshold "none: a quiet market is not a fault" — their status follows the
 * engine cycle, because that is what would have produced them.
 *
 * Everything here is read from durable records or the feed's own health
 * object. Nothing is estimated, and the engine is not consulted.
 */

import { config } from '../../config.ts'
import type { FeedHealth } from '../data/feed.ts'
import { readOps } from '../learning/ops.ts'
import { INTERVAL_MS } from '../market.ts'
import { listObservations } from '../observer/events.ts'
import { readPositions } from '../paperTrader.ts'
import { RESEARCH_TICK_MS } from '../learning/ops.ts'
import { store } from '../store.ts'

export type MarkStatus = 'HEALTHY' | 'DEGRADED' | 'STALE' | 'STOPPED'

export type Mark = {
  name: string
  at: number | null
  ageSec: number | null
  status: MarkStatus
  /** The thresholds the status came from, in words. */
  rule: string
  detail: string
}

export type Heartbeat = {
  at: number
  interval: string
  intervalMs: number
  overall: MarkStatus
  marks: {
    marketData: Mark
    candle: Mark
    engineCycle: Mark
    observerEvent: Mark
    paperDecision: Mark
    paperFill: Mark
    paperClose: Mark
    researchTick: Mark
    persistence: Mark
    healthCheck: Mark
  }
  note: string
}

const PROBE_KEY = 'ops:persistence-probe'
const HEALTH_KEY = 'ops:last-health-check'
/** A mark that has never happened is measured from here, so a fresh start is not "STOPPED" before it has had the chance. */
const PROCESS_STARTED_AT = Date.now()

const worse = (a: MarkStatus, b: MarkStatus): MarkStatus => { const order: MarkStatus[] = ['HEALTHY', 'DEGRADED', 'STALE', 'STOPPED']; return order[Math.max(order.indexOf(a), order.indexOf(b))] }

function byAge(name: string, at: number | null, now: number, healthyMs: number, degradedMs: number, rule: string, detail: string, sinceStart?: number): Mark {
  if (at === null) {
    // Never recorded: the clock runs from process start, so the mark is HEALTHY ("pending") inside its own healthy
    // window after a start, DEGRADED inside the degraded window, and STOPPED only once it is genuinely overdue.
    if (sinceStart === undefined) return { name, at, ageSec: null, status: 'STOPPED', rule, detail: `${detail} — never recorded.` }
    const status: MarkStatus = sinceStart <= healthyMs ? 'HEALTHY' : sinceStart <= degradedMs ? 'DEGRADED' : 'STOPPED'
    return { name, at, ageSec: null, status, rule: `${rule}; never recorded yet, so measured from process start`, detail: `${detail} — never recorded; the process started ${Math.max(0, Math.round(sinceStart / 1000))}s ago.` }
  }
  const age = now - at
  const status: MarkStatus = age <= healthyMs ? 'HEALTHY' : age <= degradedMs ? 'DEGRADED' : 'STALE'
  return { name, at, ageSec: Math.round(age / 1000), status, rule, detail }
}

/** Write a probe row and read it back: the store accepted a write just now. */
export function persistenceProbe(now = Date.now()): { ok: boolean; at: number | null; error: string | null } {
  try {
    store().setJson(PROBE_KEY, { at: now })
    const back = store().getJson<{ at: number }>(PROBE_KEY)
    return back && back.at === now ? { ok: true, at: now, error: null } : { ok: false, at: back?.at ?? null, error: 'probe row did not read back' }
  } catch (err) { return { ok: false, at: null, error: String((err as Error)?.message ?? err) } }
}

export function lastPersistence(): number | null { return store().getJson<{ at: number }>(PROBE_KEY)?.at ?? null }
export function markHealthCheck(now = Date.now()): void { try { store().setJson(HEALTH_KEY, { at: now }) } catch { /* the mark is best-effort */ } }
export function lastHealthCheck(): number | null { return store().getJson<{ at: number }>(HEALTH_KEY)?.at ?? null }

export type HeartbeatInputs = { feed?: FeedHealth | null; now?: number; probe?: boolean; /** For tests: when this process started. */ processStartedAt?: number }

export function heartbeat(input: HeartbeatInputs = {}): Heartbeat {
  const now = input.now ?? Date.now()
  const sinceStart = now - (input.processStartedAt ?? PROCESS_STARTED_AT)
  const interval = config.interval
  const step = INTERVAL_MS[interval] ?? 300_000
  const feed = input.feed ?? null
  const ops = readOps()
  if (input.probe !== false) persistenceProbe(now)

  const lastMarket = Math.max(feed?.priceAt ?? -1, feed?.lastClosed?.announcedAt ?? -1, feed?.heartbeat?.at ?? -1)
  const marketData = byAge('last market-data update', lastMarket >= 0 ? lastMarket : null, now, 2 * step, 6 * step, `HEALTHY ≤ 2 intervals, DEGRADED ≤ 6, STALE beyond (interval ${interval})`, feed ? `Prices via ${feed.mode}${feed.stream ? `, stream ${feed.stream.connected ? 'connected' : 'down'}, ${feed.stream.reconnects} reconnect(s)` : ''}.` : 'The feed did not report.', sinceStart)
  const lastCandleRow = store().lastCandles(config.symbol, interval, 1)[0]
  const candle = byAge('last candle', lastCandleRow ? lastCandleRow.closeTime : null, now, 2 * step, 6 * step, `HEALTHY ≤ 2 intervals after the close, DEGRADED ≤ 6, STALE beyond`, lastCandleRow ? `Last stored close ${new Date(lastCandleRow.closeTime).toISOString()} via ${lastCandleRow.source}.` : 'No candle stored.', sinceStart)
  const engineCycle = byAge('last engine cycle', ops.lastCycleAt, now, 2 * step, 6 * step, 'HEALTHY ≤ 2 intervals, DEGRADED ≤ 6, STALE beyond', `${ops.cycles} cycle(s) observed since the ops state began.`, sinceStart)
  const lastObs = listObservations({ limit: 1 })[0]
  const observerEvent = { ...byAge('last observer event', lastObs ? lastObs.time : null, now, 24 * 3_600_000, 3 * 86_400_000, 'HEALTHY ≤ 24 h, DEGRADED ≤ 3 days, STALE beyond — a quiet tape records nothing', lastObs ? `${lastObs.type} at ${new Date(lastObs.time).toISOString()}.` : 'No observation yet.', sinceStart) }
  const positions = readPositions()
  const all = [...positions.open, ...positions.closed]
  const lastDecision = all.reduce<number | null>((m, p) => (m === null || p.openedAt > m ? p.openedAt : m), null)
  const lastFill = all.reduce<number | null>((m, p) => (p.filledAt !== undefined && (m === null || p.filledAt > m) ? p.filledAt : m), null)
  const lastClose = positions.closed.reduce<number | null>((m, p) => (p.exitReason !== 'missed' && p.closedAt !== undefined && (m === null || p.closedAt > m) ? p.closedAt : m), null)
  const follows = (name: string, at: number | null, detail: string): Mark => ({ name, at, ageSec: at === null ? null : Math.round((now - at) / 1000), status: engineCycle.status === 'STOPPED' && at === null ? 'STOPPED' : engineCycle.status, rule: 'none of its own: a quiet market is not a fault — the status follows the engine cycle that would produce it', detail })
  const paperDecision = follows('last paper decision', lastDecision, lastDecision === null ? 'No paper decision on record (a queued order or a refusal).' : `${all.length} decision(s) on record.`)
  const paperFill = follows('last paper fill', lastFill, lastFill === null ? 'No simulated fill on record.' : 'Simulated execution: next candle open plus spread and slippage.')
  const paperClose = follows('last paper close', lastClose, lastClose === null ? 'No closed paper trade on record.' : `${positions.closed.filter((p) => p.exitReason !== 'missed').length} closed trade(s).`)
  const researchTick: Mark = ops.lastRun === null
    ? { name: 'last research tick', at: null, ageSec: null, status: sinceStart <= 2 * RESEARCH_TICK_MS ? 'HEALTHY' : sinceStart <= 4 * RESEARCH_TICK_MS ? 'DEGRADED' : 'STOPPED', rule: `HEALTHY ≤ 2 ticks (${Math.round(RESEARCH_TICK_MS / 60_000)} min each), DEGRADED ≤ 4, STOPPED when the next run is more than 4 ticks overdue; never run yet, so measured from process start`, detail: `The research scheduler has not run yet; the process started ${Math.max(0, Math.round(sinceStart / 1000))}s ago.` }
    : (() => { const age = now - ops.lastRun; const overdue = ops.nextRun !== null ? now - ops.nextRun : 0; const status: MarkStatus = overdue > 4 * RESEARCH_TICK_MS ? 'STOPPED' : age <= 2 * RESEARCH_TICK_MS ? 'HEALTHY' : age <= 4 * RESEARCH_TICK_MS ? 'DEGRADED' : 'STALE'; return { name: 'last research tick', at: ops.lastRun, ageSec: Math.round(age / 1000), status, rule: `HEALTHY ≤ 2 ticks, DEGRADED ≤ 4, STOPPED when the next run is > 4 ticks overdue`, detail: `${ops.runs} run(s); next ${ops.nextRun ? new Date(ops.nextRun).toISOString() : '—'}${ops.lastError ? `; last error ${ops.lastError.message}` : ''}.` } })()
  const persistence = byAge('last successful persistence', lastPersistence(), now, 2 * 60_000 + step, 6 * step, 'HEALTHY ≤ 2 min + 1 interval, DEGRADED ≤ 6 intervals, STALE beyond', 'A probe row written to the store and read back.', sinceStart)
  const healthCheck = byAge('last successful health check', lastHealthCheck(), now, 6 * step, 24 * step, 'HEALTHY ≤ 6 intervals, DEGRADED ≤ 24, STALE beyond', 'The last time the health API or the monitor evaluated the system.', sinceStart)

  const essential = [marketData, candle, engineCycle, researchTick, persistence]
  const overall = essential.reduce<MarkStatus>((w, m) => worse(w, m.status), 'HEALTHY')
  return {
    at: now, interval, intervalMs: step, overall,
    marks: { marketData, candle, engineCycle, observerEvent, paperDecision, paperFill, paperClose, researchTick, persistence, healthCheck },
    note: overall === 'HEALTHY' ? 'Every essential mark is inside its healthy window.' : `Overall ${overall}: ${essential.filter((m) => m.status !== 'HEALTHY').map((m) => `${m.name} ${m.status}`).join(', ')}. The paper marks follow the engine; a quiet market is not a fault.`,
  }
}
