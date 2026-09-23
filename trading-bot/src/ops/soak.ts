/**
 * PAPER SOAK MODE — the counters a weeks-long paper run is judged by,
 * persisted so a restart adds to the record instead of resetting it.
 *
 * Two kinds of number live here:
 *
 *   derived   read from the durable tables on every tick (decisions, fills,
 *             closes, observations, research runs, experiments, knowledge
 *             items, failures, error totals) — they cannot drift from the
 *             record because they ARE the record;
 *   accrued   process-local counters (candles closed on the bus, reconnects,
 *             stream drops, duplicate closes, timestamp anomalies, stale
 *             feed seconds) added to a persisted total by the delta since
 *             the previous tick, and re-based when the process starts.
 *
 * Uptime is the sum of tick-to-tick intervals actually observed, plus the
 * current run's age — never `now - firstStart`, which a restart would turn
 * into a lie. The number of restarts is the number of starts minus one.
 */

import { readOps } from '../learning/ops.ts'
import { readPositions } from '../paperTrader.ts'
import { bootLog } from '../recovery.ts'
import { store } from '../store.ts'
import type { FeedCounters, FeedVerdict } from './feedHealth.ts'
import type { ErrorCounts } from './log.ts'

export type SoakState = {
  version: 1
  mode: 'PAPER SOAK'
  soakStartedAt: number
  runStartedAt: number
  /** Process starts under soak; restarts = runs − 1. */
  runs: number
  lastTickAt: number | null
  uptime: { totalSec: number; longestRunSec: number; currentRunSec: number }
  accrued: { candlesClosed: number; reconnects: number; streamDowns: number; duplicateCloses: number; timestampAnomalies: number; gapEvents: number; staleFeedSec: number; degradedFeedSec: number }
  /** The in-process counter values at the last tick, so the next tick adds only the delta. */
  base: { candlesClosed: number; reconnects: number; streamDowns: number; duplicateCloses: number; timestampAnomalies: number; gapEvents: number }
  derived: { cycles: number; decisions: number; fills: number; closes: number; missed: number; openOrPending: number; observations: number; caseStudies: number; researchRuns: number; experiments: number; hypotheses: number; queueItems: number; knowledgeItems: number; failures: number; errors: number; criticals: number }
  lastVerdict: FeedVerdict | null
}

const KEY = 'ops:soak'
const ZERO_BASE = { candlesClosed: 0, reconnects: 0, streamDowns: 0, duplicateCloses: 0, timestampAnomalies: 0, gapEvents: 0 }

function fresh(now: number): SoakState {
  return {
    version: 1, mode: 'PAPER SOAK', soakStartedAt: now, runStartedAt: now, runs: 0, lastTickAt: null,
    uptime: { totalSec: 0, longestRunSec: 0, currentRunSec: 0 },
    accrued: { ...ZERO_BASE, staleFeedSec: 0, degradedFeedSec: 0 }, base: { ...ZERO_BASE },
    derived: { cycles: 0, decisions: 0, fills: 0, closes: 0, missed: 0, openOrPending: 0, observations: 0, caseStudies: 0, researchRuns: 0, experiments: 0, hypotheses: 0, queueItems: 0, knowledgeItems: 0, failures: 0, errors: 0, criticals: 0 },
    lastVerdict: null,
  }
}

export function readSoak(): SoakState | null {
  const s = store().getJson<SoakState>(KEY)
  return s && s.version === 1 ? s : null
}

/** Called once when the process starts: a new run, counters re-based, totals kept. */
export function startSoak(now = Date.now()): SoakState {
  const prior = readSoak()
  const next: SoakState = prior ? { ...prior, runStartedAt: now, runs: prior.runs + 1, lastTickAt: null, base: { ...ZERO_BASE }, uptime: { ...prior.uptime, currentRunSec: 0 } } : { ...fresh(now), runs: 1 }
  store().setJson(KEY, next)
  return next
}

function derive(errors: ErrorCounts | null): SoakState['derived'] {
  const positions = readPositions()
  const all = [...positions.open, ...positions.closed]
  const ops = readOps()
  const kv = (prefix: string) => store().keysWithPrefix(prefix).length
  return {
    cycles: ops.cycles,
    decisions: all.length,
    fills: all.filter((p) => p.filledAt !== undefined && p.exitReason !== 'missed').length,
    closes: positions.closed.filter((p) => p.exitReason !== 'missed').length,
    missed: positions.closed.filter((p) => p.exitReason === 'missed').length,
    openOrPending: positions.open.length,
    observations: store().observationCount(),
    caseStudies: kv('knowledge:case-study:'),
    researchRuns: ops.runs,
    experiments: kv('experiment:'),
    hypotheses: kv('hypothesis:'),
    queueItems: kv('queue:'),
    knowledgeItems: kv('knowledge:'),
    failures: kv('failure:'),
    errors: errors?.total ?? 0,
    criticals: errors?.lastCritical ? 1 : 0,
  }
}

export type SoakTickInput = { now?: number; feed?: FeedCounters | null; verdict?: FeedVerdict | null; errors?: ErrorCounts | null; candlesClosed?: number }

/** One accounting tick. Cheap; safe to call every minute. */
export function soakTick(input: SoakTickInput = {}): SoakState {
  const now = input.now ?? Date.now()
  const s = readSoak() ?? startSoak(now)
  const sinceLast = s.lastTickAt !== null && s.lastTickAt >= s.runStartedAt ? Math.max(0, now - s.lastTickAt) : Math.max(0, now - s.runStartedAt)
  const sinceSec = Math.round(sinceLast / 1000)
  const cur = { candlesClosed: input.candlesClosed ?? input.feed?.closes ?? s.base.candlesClosed, reconnects: input.feed?.reconnectsSeen ?? s.base.reconnects, streamDowns: input.feed?.streamDowns ?? s.base.streamDowns, duplicateCloses: input.feed?.duplicateCloses ?? s.base.duplicateCloses, timestampAnomalies: input.feed?.timestampAnomalies ?? s.base.timestampAnomalies, gapEvents: input.feed?.gapEvents ?? s.base.gapEvents }
  const delta = (k: keyof typeof ZERO_BASE) => Math.max(0, cur[k] - s.base[k])
  const verdict = input.verdict ?? null
  const accrued = {
    candlesClosed: s.accrued.candlesClosed + delta('candlesClosed'), reconnects: s.accrued.reconnects + delta('reconnects'), streamDowns: s.accrued.streamDowns + delta('streamDowns'),
    duplicateCloses: s.accrued.duplicateCloses + delta('duplicateCloses'), timestampAnomalies: s.accrued.timestampAnomalies + delta('timestampAnomalies'), gapEvents: s.accrued.gapEvents + delta('gapEvents'),
    staleFeedSec: s.accrued.staleFeedSec + (verdict === 'STALE' ? sinceSec : 0), degradedFeedSec: s.accrued.degradedFeedSec + (verdict === 'DATA DEGRADED' ? sinceSec : 0),
  }
  const currentRunSec = Math.round((now - s.runStartedAt) / 1000)
  const uptime = { totalSec: s.uptime.totalSec + sinceSec, longestRunSec: Math.max(s.uptime.longestRunSec, currentRunSec), currentRunSec }
  const next: SoakState = { ...s, lastTickAt: now, uptime, accrued, base: cur, derived: derive(input.errors ?? null), lastVerdict: verdict }
  store().setJson(KEY, next)
  return next
}

export type SoakReport = {
  mode: 'PAPER SOAK'
  at: number
  soakStartedAt: number | null
  runStartedAt: number | null
  runs: number
  restarts: number
  recoveries: number
  uptime: { totalSec: number; longestRunSec: number; currentRunSec: number; wallClockSec: number | null; note: string }
  counters: SoakState['derived'] & SoakState['accrued']
  lastVerdict: FeedVerdict | null
  note: string
}

export function soakReport(now = Date.now()): SoakReport {
  const s = readSoak()
  const boots = bootLog()
  if (!s) return { mode: 'PAPER SOAK', at: now, soakStartedAt: null, runStartedAt: null, runs: 0, restarts: 0, recoveries: boots?.recoveries ?? 0, uptime: { totalSec: 0, longestRunSec: 0, currentRunSec: 0, wallClockSec: null, note: 'Soak has not started.' }, counters: { ...fresh(now).derived, ...fresh(now).accrued }, lastVerdict: null, note: 'No soak state: the process has not started in paper soak mode yet.' }
  const wallClockSec = Math.round((now - s.soakStartedAt) / 1000)
  const coverage = wallClockSec > 0 ? s.uptime.totalSec / wallClockSec : null
  return {
    mode: 'PAPER SOAK', at: now, soakStartedAt: s.soakStartedAt, runStartedAt: s.runStartedAt, runs: s.runs, restarts: Math.max(0, s.runs - 1), recoveries: boots?.recoveries ?? 0,
    uptime: { ...s.uptime, wallClockSec, note: coverage === null ? 'Just started.' : `Observed uptime covers ${(coverage * 100).toFixed(1)}% of the wall clock since the soak began; the gap is downtime between runs.` },
    counters: { ...s.derived, ...s.accrued }, lastVerdict: s.lastVerdict,
    note: `${s.runs} run(s), ${Math.max(0, s.runs - 1)} restart(s); ${s.derived.closes} closed paper trade(s), ${s.derived.observations} observation(s), ${s.derived.researchRuns} research run(s), ${s.accrued.reconnects} reconnect(s), ${s.derived.errors} error(s) on the ops log.`,
  }
}
