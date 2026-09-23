/**
 * PAPER DAY REPORT — one permanent record per trading day of what the paper
 * run actually did: when it ran, what the market data looked like, how many
 * candles, cycles, signals, fills, closes, reconnects, errors, research
 * ticks, observations, case studies and knowledge writes there were, the
 * day's data-integrity verdict and the system health at the close.
 *
 * Everything is read from durable records (positions, candles, observations,
 * knowledge items, the soak state, the ops state, the error counters, the
 * integrity report). Cumulative counters (cycles, research runs, reconnects,
 * errors) are reported as totals plus the change since the previous day's
 * report, so a day can be read on its own. Nothing is estimated; a day with
 * no signal says 0.
 */

import { config } from '../../config.ts'
import { readOps, tradingDayStart } from '../learning/ops.ts'
import type { KnowledgeItem } from '../knowledge/vault.ts'
import { isKnowledgeItem } from '../knowledge/vault.ts'
import { readPositions } from '../paperTrader.ts'
import { toET, tradingDayKey } from '../sessions.ts'
import { store } from '../store.ts'
import { bootLog } from '../recovery.ts'
import type { FeedVerdict } from './feedHealth.ts'
import type { MarkStatus } from './heartbeat.ts'
import type { IntegrityReport } from './integrity.ts'
import { errorCounts } from './log.ts'
import { readSoak } from './soak.ts'

export type PaperDayReport = {
  kind: 'PAPER DAY REPORT'
  dayKey: string
  generatedAt: number
  /** True when the report covers a whole trading day; false for a day still in progress. */
  ended: boolean
  window: { from: number; to: number }
  dataSource: string
  execution: 'SIMULATED EXECUTION'
  runtime: { observedUptimeSec: number; currentRunSec: number; runs: number; restarts: number; recoveries: number; processStarts: number }
  marketData: { verdict: FeedVerdict | 'not reported'; candlesInWindow: number; firstCandleAt: number | null; lastCandleAt: number | null; staleFeedSec: number; degradedFeedSec: number }
  engineCycles: { total: number; sinceLastReport: number | null }
  paper: { signals: number; fills: number; closed: number; missed: number; openAtClose: number; wins: number; losses: number; flats: number; sumR: number }
  reconnects: { total: number; sinceLastReport: number | null }
  errors: { total: number; sinceLastReport: number | null; byComponent: Record<string, number> }
  researchTicks: { total: number; sinceLastReport: number | null; lastError: string | null }
  observations: number
  caseStudies: number
  knowledgeUpdates: number
  dataQuality: { verdict: IntegrityReport['verdict'] | 'not run'; issues: string[] }
  systemHealth: { overall: MarkStatus | 'not reported'; note: string }
  /**
   * The first-fill acceptance verdict as it stood when the report was made, read
   * from the verifier's durable state (`ops:first-fill`, docs/FIRST_FILL_ACCEPTANCE.md).
   * `not evaluated` means the verifier has not run yet in this data directory.
   */
  firstFill: { status: 'ACCEPTED' | 'NOT ACCEPTED' | 'WAITING' | 'not evaluated'; positionId: string | null; acceptedAt: number | null; regressed: boolean; failed: string[]; missing: string[] }
  text: string
}

const PREFIX = 'paper-day:'
/** The verifier's durable state, read by key so this module does not import the verifier (which imports this report). */
type FirstFillDurable = { positionId: string | null; status: 'ACCEPTED' | 'NOT ACCEPTED' | 'WAITING'; acceptedAt: number | null; regressed: boolean; failed: string[]; missing: string[] }
function firstFillLine(): PaperDayReport['firstFill'] {
  const s = store().getJson<FirstFillDurable>('ops:first-fill')
  if (!s || typeof s !== 'object' || typeof s.status !== 'string') return { status: 'not evaluated', positionId: null, acceptedAt: null, regressed: false, failed: [], missing: [] }
  return { status: s.status, positionId: s.positionId ?? null, acceptedAt: s.acceptedAt ?? null, regressed: Boolean(s.regressed), failed: Array.isArray(s.failed) ? s.failed : [], missing: Array.isArray(s.missing) ? s.missing : [] }
}

export function getDayReport(dayKey: string): PaperDayReport | null { return store().getJson<PaperDayReport>(PREFIX + dayKey) }
export function listDayReports(limit = 30): PaperDayReport[] {
  return store().keysWithPrefix(PREFIX).sort().slice(-limit).map((k) => store().getJson<PaperDayReport>(k)).filter((r): r is PaperDayReport => Boolean(r))
}

function previousReport(dayKey: string): PaperDayReport | null {
  const keys = store().keysWithPrefix(PREFIX).filter((k) => k.slice(PREFIX.length) < dayKey).sort()
  return keys.length ? store().getJson<PaperDayReport>(keys[keys.length - 1]) : null
}

export type DayReportInputs = { now?: number; /** Report the trading day that ended before `now` instead of the one in progress. */ ended?: boolean; feedVerdict?: FeedVerdict | null; health?: { overall: MarkStatus; note: string } | null; dataSource?: string }

export function paperDayReport(input: DayReportInputs = {}): PaperDayReport {
  const now = input.now ?? Date.now()
  const startOfToday = tradingDayStart(now)
  const window = input.ended ? { from: tradingDayStart(startOfToday - 1), to: startOfToday - 1 } : { from: startOfToday, to: now }
  const dayKey = tradingDayKey(window.from)
  const prev = previousReport(dayKey)
  const delta = (cur: number, key: (r: PaperDayReport) => number) => (prev ? cur - key(prev) : null)

  const soak = readSoak()
  const ops = readOps()
  const boots = bootLog()
  const errs = errorCounts(now)
  const candles = store().candlesBetween(config.symbol, config.interval, window.from, window.to)
  const positions = readPositions()
  const all = [...positions.open, ...positions.closed]
  const inWin = (t: number | undefined) => t !== undefined && t >= window.from && t <= window.to
  const decided = all.filter((p) => inWin(p.openedAt))
  const filled = all.filter((p) => inWin(p.filledAt) && p.exitReason !== 'missed')
  const closed = positions.closed.filter((p) => inWin(p.closedAt) && p.exitReason !== 'missed')
  const missed = positions.closed.filter((p) => inWin(p.closedAt) && p.exitReason === 'missed')
  const observations = store().observations<{ time: number }>({ from: window.from, to: window.to, limit: 100_000 }).length
  let caseStudies = 0, knowledgeUpdates = 0
  for (const k of store().keysWithPrefix('knowledge:')) {
    const it = store().getJson<unknown>(k)
    if (!isKnowledgeItem(it)) continue
    const item = it as KnowledgeItem
    const touched = item.history.some((h) => h.at >= window.from && h.at <= window.to)
    if (touched) { knowledgeUpdates++; if (item.kind === 'case-study') caseStudies++ }
  }
  const integrity = store().getJson<IntegrityReport>(`integrity:${dayKey}`)
  const r: PaperDayReport = {
    kind: 'PAPER DAY REPORT', dayKey, generatedAt: now, ended: Boolean(input.ended), window,
    dataSource: input.dataSource ?? 'not reported', execution: 'SIMULATED EXECUTION',
    runtime: { observedUptimeSec: soak?.uptime.totalSec ?? 0, currentRunSec: soak?.uptime.currentRunSec ?? 0, runs: soak?.runs ?? 0, restarts: Math.max(0, (soak?.runs ?? 0) - 1), recoveries: boots?.recoveries ?? 0, processStarts: boots?.starts ?? 0 },
    marketData: { verdict: input.feedVerdict ?? soak?.lastVerdict ?? 'not reported', candlesInWindow: candles.length, firstCandleAt: candles[0]?.openTime ?? null, lastCandleAt: candles[candles.length - 1]?.openTime ?? null, staleFeedSec: soak?.accrued.staleFeedSec ?? 0, degradedFeedSec: soak?.accrued.degradedFeedSec ?? 0 },
    engineCycles: { total: ops.cycles, sinceLastReport: delta(ops.cycles, (p) => p.engineCycles.total) },
    paper: { signals: decided.length, fills: filled.length, closed: closed.length, missed: missed.length, openAtClose: positions.open.length, wins: closed.filter((p) => p.outcome === 'WIN').length, losses: closed.filter((p) => p.outcome === 'LOSS').length, flats: closed.filter((p) => p.outcome === 'FLAT').length, sumR: closed.reduce((s, p) => s + (p.rMultiple ?? 0), 0) },
    reconnects: { total: soak?.accrued.reconnects ?? 0, sinceLastReport: delta(soak?.accrued.reconnects ?? 0, (p) => p.reconnects.total) },
    errors: { total: errs.total, sinceLastReport: delta(errs.total, (p) => p.errors.total), byComponent: errs.byComponent },
    researchTicks: { total: ops.runs, sinceLastReport: delta(ops.runs, (p) => p.researchTicks.total), lastError: ops.lastError?.message ?? null },
    observations, caseStudies, knowledgeUpdates,
    dataQuality: integrity ? { verdict: integrity.verdict, issues: integrity.issues } : { verdict: 'not run', issues: [] },
    systemHealth: input.health ? { overall: input.health.overall, note: input.health.note } : { overall: 'not reported', note: 'The monitor did not supply a health verdict.' },
    firstFill: firstFillLine(),
    text: '',
  }
  r.text = renderDayReport(r)
  return r
}

const et = (ms: number | null) => (ms === null ? '—' : `${toET(ms).dateKey} ${toET(ms).clock} ET`)
const n = (x: number | null) => (x === null ? '—' : String(x))
function firstFillText(f: PaperDayReport['firstFill']): string {
  if (f.status === 'not evaluated') return 'not evaluated — the acceptance verifier has not run in this data directory'
  if (f.status === 'WAITING') return 'WAITING — no simulated fill on record yet'
  const id = f.positionId ? ` (position ${f.positionId})` : ''
  if (f.status === 'ACCEPTED') return `ACCEPTED${id}${f.acceptedAt !== null ? ` at ${et(f.acceptedAt)}` : ''}${f.regressed ? ' · REGRESSED since: a later evaluation disagreed' : ''}`
  const why = [...f.failed.map((c) => `${c} FAIL`), ...f.missing.map((c) => `${c} MISSING`)]
  return `NOT ACCEPTED${id}${why.length ? ` — ${why.join(', ')}` : ''}${f.acceptedAt !== null ? ' · previously ACCEPTED, now regressed' : ''}`
}

export function renderDayReport(r: PaperDayReport): string {
  return [
    `PAPER DAY REPORT — ${r.dayKey}${r.ended ? '' : ' (in progress)'}`,
    `data source: ${r.dataSource} · ${r.execution}`,
    `start: ${et(r.window.from)}   end: ${et(r.window.to)}`,
    `runtime: observed uptime ${Math.round(r.runtime.observedUptimeSec / 60)} min (current run ${Math.round(r.runtime.currentRunSec / 60)} min) · ${r.runtime.runs} run(s), ${r.runtime.restarts} restart(s), ${r.runtime.recoveries} recovered a live position`,
    `market data: ${r.marketData.verdict} · ${r.marketData.candlesInWindow} candle(s) in the window (${et(r.marketData.firstCandleAt)} → ${et(r.marketData.lastCandleAt)}) · stale ${Math.round(r.marketData.staleFeedSec / 60)} min, degraded ${Math.round(r.marketData.degradedFeedSec / 60)} min (soak totals)`,
    `engine cycles: ${r.engineCycles.total} total, ${n(r.engineCycles.sinceLastReport)} since the previous report`,
    `signals: ${r.paper.signals} · fills: ${r.paper.fills} · closed trades: ${r.paper.closed} (${r.paper.wins}W ${r.paper.losses}L ${r.paper.flats}F, ${r.paper.sumR.toFixed(2)}R) · missed: ${r.paper.missed} · open at close: ${r.paper.openAtClose}`,
    `reconnects: ${r.reconnects.total} total, ${n(r.reconnects.sinceLastReport)} since the previous report`,
    `errors: ${r.errors.total} total, ${n(r.errors.sinceLastReport)} since the previous report${Object.keys(r.errors.byComponent).length ? ` (${Object.entries(r.errors.byComponent).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`,
    `research ticks: ${r.researchTicks.total} total, ${n(r.researchTicks.sinceLastReport)} since the previous report${r.researchTicks.lastError ? ` · last error: ${r.researchTicks.lastError}` : ''}`,
    `observations: ${r.observations} · case studies: ${r.caseStudies} · knowledge updates: ${r.knowledgeUpdates}`,
    `data quality: ${r.dataQuality.verdict}${r.dataQuality.issues.length ? ` — ${r.dataQuality.issues.join('; ')}` : ''}`,
    `system health: ${r.systemHealth.overall} — ${r.systemHealth.note}`,
    `first paper fill: ${firstFillText(r.firstFill)}`,
    r.paper.signals === 0 && r.paper.fills === 0 && r.paper.closed === 0 ? 'NOT ENOUGH REAL PAPER DATA: no signal, fill or closed trade in this window. A lack of trades is data.' : 'Paper figures are SIMULATED EXECUTION; no conclusion about an edge is drawn from one day.',
  ].join('\n')
}

/** Store the report for the trading day that just ended, once. Called by the monitor each tick; a cheap read when nothing is due. */
export function dayRollReport(input: Omit<DayReportInputs, 'ended' | 'now'> & { now?: number }): { report: PaperDayReport | null; fresh: boolean } {
  const now = input.now ?? Date.now()
  const soak = readSoak()
  if (!soak) return { report: null, fresh: false }
  const endedKey = tradingDayKey(tradingDayStart(now) - 1)
  if (store().getJson<PaperDayReport>(PREFIX + endedKey)) return { report: null, fresh: false }
  // Only days the soak actually covered: the first report is for the day the soak began or later.
  if (tradingDayKey(soak.soakStartedAt) > endedKey) return { report: null, fresh: false }
  const report = paperDayReport({ ...input, now, ended: true })
  store().setJson(PREFIX + report.dayKey, report)
  return { report, fresh: true }
}

/** Store (or refresh) the report for the day in progress, for an operator who wants the record now. */
export function storeDayReport(report: PaperDayReport): PaperDayReport { store().setJson(PREFIX + report.dayKey, report); return report }
