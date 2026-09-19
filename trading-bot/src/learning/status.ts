/**
 * MR. CASH SYSTEM STATUS — one screen that says whether each layer is alive,
 * what it holds, when research last ran and when it runs next. Assembled on
 * request from the stores and the ops state; nothing here is a stored
 * conclusion, and nothing here is a performance figure.
 */

import { config } from '../../config.ts'
import { paperDataset } from '../analyst/records.ts'
import type { FeedHealth } from '../data/feed.ts'
import { INTERVAL_MS } from '../market.ts'
import { knowledgeRequiringReview } from '../knowledge/decayMonitor.ts'
import { failureSummary } from '../knowledge/failures.ts'
import { memorySummary } from '../knowledge/memory.ts'
import { listItems, vaultSummary } from '../knowledge/vault.ts'
import { observationCounts } from '../observer/events.ts'
import { readPositions } from '../paperTrader.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { listExperiments } from '../research/experiments.ts'
import { listHypotheses } from '../research/hypotheses.ts'
import { listProposals } from '../research/lab.ts'
import { queueSummary } from '../research/queue.ts'
import { reviewQueue } from '../research/review.ts'
import { dataGrowth } from '../school/lessons.ts'
import { tradingDayKey } from '../sessions.ts'
import { store } from '../store.ts'
import { VERSION } from '../version.ts'
import { listDigests } from './digest.ts'
import { RESEARCH_TICK_MS, readOps } from './ops.ts'
import type { OpsState } from './ops.ts'

export type LayerHealth = 'LIVE' | 'IDLE' | 'STALE' | 'NEVER' | 'OFF'

export type SystemStatus = {
  at: number
  engineVersion: string
  marketData: { health: LayerHealth; mode: string; lastClosedOpenTime: number | null; ageSec: number | null; candlesStored: number; symbol: string; interval: string; note: string }
  paperEngine: { health: LayerHealth; open: number; closed: number; tradesToday: number; missedToday: number; lastCloseAt: number | null; growth: ReturnType<typeof dataGrowth>; liveGate: boolean; shadow: boolean; note: string }
  researchEngine: { health: LayerHealth; lastRun: number | null; nextRun: number | null; running: boolean; runs: number; queue: ReturnType<typeof queueSummary>; experiments: { total: number; done: number; running: number; byResult: Record<string, number> }; hypotheses: number; proposalsAwaiting: number; lastExperimentId: string | null; lastError: OpsState['lastError']; note: string }
  learningLoop: { health: LayerHealth; lastCycleAt: number | null; cycles: number; observations: ReturnType<typeof observationCounts>; lastCycle: OpsState['lastCycle']; digests: { daily: number; weekly: number; monthly: number; lastDaily: string | null }; note: string }
  knowledgeStore: { health: LayerHealth; vault: ReturnType<typeof vaultSummary>; requiringReview: number; onWatch: number; failures: number; memories: number; note: string }
  dataQuality: { corruptRecords: number; refusedDecisions: number; unresolvable: number; storeWritable: boolean; note: string }
  lastResearchRun: number | null
  nextResearchRun: number | null
  /** The headline counts, in the order the status screen prints them. */
  counts: { paperTrades: number; caseStudies: number; hypotheses: number; experiments: number; itemsRequiringReview: number }
  summary: string
  notes: string[]
}

function ageSec(t: number | null, now: number): number | null { return t === null ? null : Math.round((now - t) / 1000) }

export function systemStatus(input: { feed?: FeedHealth | null; closed?: PaperPosition[]; open?: number; now?: number } = {}): SystemStatus {
  const now = input.now ?? Date.now()
  const ops = readOps()
  const positions = input.closed ? null : readPositions()
  const closed = input.closed ?? positions!.closed
  const open = input.open ?? positions?.open.length ?? 0
  const intervalMs = INTERVAL_MS[config.interval] ?? 300_000
  const feed = input.feed ?? null
  const lastClosed = feed?.lastClosed?.openTime ?? null
  const candles = store().candleCount(config.symbol, config.interval)
  const mdAge = lastClosed === null ? null : now - (lastClosed + intervalMs)
  const marketHealth: LayerHealth = feed === null ? (candles ? 'IDLE' : 'NEVER') : lastClosed === null ? 'NEVER' : mdAge !== null && mdAge <= 3 * intervalMs ? 'LIVE' : 'STALE'
  const dayKey = tradingDayKey(now)
  const today = closed.filter((p) => p.dayKey === dayKey)
  const trades = today.filter((p) => p.exitReason !== 'missed').length
  const missed = today.filter((p) => p.exitReason === 'missed').length
  const lastClose = closed.reduce<number | null>((m, p) => (p.closedAt && (m === null || p.closedAt > m) ? p.closedAt : m), null)
  const paper = paperDataset(closed)
  const paperHealth: LayerHealth = config.live.enabled ? 'OFF' : ops.lastCycleAt === null ? 'NEVER' : now - ops.lastCycleAt <= 3 * intervalMs ? 'LIVE' : 'STALE'
  const exps = listExperiments()
  const byResult: Record<string, number> = {}
  for (const e of exps.filter((x) => x.status === 'DONE')) byResult[e.result] = (byResult[e.result] ?? 0) + 1
  const researchHealth: LayerHealth = ops.lastRun === null ? 'NEVER' : ops.running ? 'LIVE' : now - ops.lastRun <= 2 * RESEARCH_TICK_MS ? 'LIVE' : 'STALE'
  const oc = observationCounts()
  const learningHealth: LayerHealth = ops.lastCycleAt === null ? 'NEVER' : now - ops.lastCycleAt <= 3 * intervalMs ? 'LIVE' : 'STALE'
  const vs = vaultSummary()
  const rr = knowledgeRequiringReview()
  const fs = failureSummary()
  const ms = memorySummary()
  const digests = { daily: listDigests('daily', 1000).length, weekly: listDigests('weekly', 1000).length, monthly: listDigests('monthly', 1000).length, lastDaily: listDigests('daily', 1)[0]?.key ?? null }
  const q = queueSummary()
  const awaiting = reviewQueue(now).awaiting.length
  const writable = (() => { try { store().setJson('research:ops:probe', now); return true } catch { return false } })()
  const summary = [
    `Market data ${marketHealth.toLowerCase()}`,
    `paper ${paperHealth.toLowerCase()} (${paper.provenance.trades} trade${paper.provenance.trades === 1 ? '' : 's'}, ${dataGrowth(paper.provenance.trades).band})`,
    `research ${researchHealth.toLowerCase()}${ops.nextRun ? `, next in ${Math.max(0, Math.round((ops.nextRun - now) / 60_000))} min` : ''}`,
    `${q.total} queue item(s), ${exps.length} experiment(s)`,
    `${vs.total} knowledge item(s), ${rr.contradicted.length + rr.reviewRequired.length + rr.stale.length} need review`,
    `live gate ${config.live.enabled ? 'ENABLED' : 'off'}`,
  ].join(' · ')
  return {
    at: now, engineVersion: VERSION,
    marketData: { health: marketHealth, mode: feed?.mode ?? 'not reported', lastClosedOpenTime: lastClosed, ageSec: ageSec(lastClosed === null ? null : lastClosed + intervalMs, now), candlesStored: candles, symbol: config.symbol, interval: config.interval, note: feed ? `Prices via ${feed.mode}; ${candles} candles stored.` : `${candles} candles stored; the feed did not report on this request.` },
    paperEngine: { health: paperHealth, open, closed: closed.length, tradesToday: trades, missedToday: missed, lastCloseAt: lastClose, growth: dataGrowth(paper.provenance.trades), liveGate: config.live.enabled, shadow: config.shadow.enabled, note: `PAPER — live market, simulated execution. ${trades} close(s) and ${missed} refusal(s) today (${dayKey}).` },
    researchEngine: { health: researchHealth, lastRun: ops.lastRun, nextRun: ops.nextRun, running: ops.running, runs: ops.runs, queue: q, experiments: { total: exps.length, done: exps.filter((e) => e.status === 'DONE').length, running: exps.filter((e) => e.status === 'RUNNING').length, byResult }, hypotheses: listHypotheses().length, proposalsAwaiting: awaiting, lastExperimentId: ops.lastExperimentId, lastError: ops.lastError, note: `One bounded tick every ${Math.round(RESEARCH_TICK_MS / 60_000)} min: at most one experiment, with its challenger. ${listProposals({ status: 'APPROVED' }).length} approved proposal(s) on record, none applied by this system.` },
    learningLoop: { health: learningHealth, lastCycleAt: ops.lastCycleAt, cycles: ops.cycles, observations: oc, lastCycle: ops.lastCycle, digests, note: `${oc.total} observation(s), ${oc.candidates} awaiting their horizon, ${oc.resolved} resolved into case studies.` },
    knowledgeStore: { health: vs.total ? 'LIVE' : 'NEVER', vault: vs, requiringReview: rr.contradicted.length + rr.reviewRequired.length + rr.stale.length, onWatch: rr.watch.length, failures: fs.total, memories: ms.total, note: rr.note },
    dataQuality: { corruptRecords: paper.provenance.corrupt, refusedDecisions: paper.provenance.missed, unresolvable: oc.unresolvable, storeWritable: writable, note: `${paper.provenance.corrupt} unreadable record(s) excluded from every statistic; ${oc.unresolvable} candidate(s) could not be rebuilt from stored candles.` },
    lastResearchRun: ops.lastRun, nextResearchRun: ops.nextRun,
    counts: { paperTrades: paper.provenance.trades, caseStudies: listItems({ kind: 'case-study' }).length, hypotheses: listHypotheses().length, experiments: exps.length, itemsRequiringReview: rr.contradicted.length + rr.reviewRequired.length + rr.stale.length },
    summary,
    notes: ['Status is assembled on request; nothing here is a performance figure.', 'The research layer reads the record and writes only its own stores. It cannot reach the signal engine, fusion, risk, sizing or the execution gates.'],
  }
}
