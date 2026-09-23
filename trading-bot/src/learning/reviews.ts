/**
 * THE REVIEWS — a daily brief for the learner, an end-of-day debrief, and a
 * weekly review. Each is assembled from the stored records at request time,
 * labels every figure with its source and sample status, and says NOT ENOUGH
 * DATA where that is the truth.
 *
 * None of these is a forecast. The daily brief says what is DUE (reviews,
 * hypotheses, proposals) and what to STUDY; it does not say what the market
 * will do. The weekly review runs the scheduled reassessment so that nothing
 * concluded a month ago is still standing unexamined.
 *
 * Read-only over the engine; writes only through the vault/hypothesis/
 * proposal sweeps that expire records into review.
 */

import { config } from '../../config.ts'
import { SAMPLE_BARS, statsOf } from '../analyst/cohorts.ts'
import type { CohortStats } from '../analyst/cohorts.ts'
import { fromPaperPosition } from '../analyst/records.ts'
import { listItems, vaultSummary } from '../knowledge/vault.ts'
import { noTradeJournal } from '../paper/validation.ts'
import type { NoTradeRow } from '../paper/validation.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { listHypotheses } from '../research/hypotheses.ts'
import type { HypothesisStatus } from '../research/hypotheses.ts'
import { listProposals } from '../research/lab.ts'
import { trialRegistry } from '../research/overfitting.ts'
import { dataGrowth } from '../school/lessons.ts'
import type { DataGrowth } from '../school/lessons.ts'
import { progressSummary } from '../school/progress.ts'
import { tradingDayKey } from '../sessions.ts'
import { VERSION } from '../version.ts'
import { postMortemOf, reassessAll } from './observer.ts'
import type { PostMortem, Reassessment } from './observer.ts'

const DAY = 86_400_000
const fx = (n: number | null, d = 2) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)

type Labelled<T> = T & { evidenceLabel: 'OBSERVED' | 'INSUFFICIENT DATA' | 'INFERRED'; source: string }

export type DailyBrief = {
  kind: 'DAILY BRIEF'
  at: number
  dayKey: string
  engineVersion: string
  due: Labelled<{ vaultReviews: number; staleItems: number; hypothesesUnderReview: number; hypothesesPastReview: number; proposalsAwaiting: number; items: string[] }>
  study: Labelled<{ suggestions: Array<{ conceptId: string; reason: string }>; familiar: number; unseen: number }>
  record: Labelled<{ closedTrades: number; growth: DataGrowth; last7: CohortStats | null; last7Note: string }>
  yesterday: Labelled<{ dayKey: string; closes: number; postMortems: string[] }>
  notes: string[]
}

export function dailyBrief(closed: PaperPosition[], now = Date.now()): DailyBrief {
  const dayKey = tradingDayKey(now)
  const yKey = tradingDayKey(now - DAY)
  const vs = vaultSummary()
  const hyps = listHypotheses()
  const props = listProposals({ status: 'PROPOSED' })
  const review = listItems({ status: 'REVIEW REQUIRED' })
  const stale = listItems({ status: 'STALE' })
  const underReview = hyps.filter((h) => h.status === 'UNDER REVIEW')
  const pastReview = hyps.filter((h) => h.status !== 'REJECTED' && h.status !== 'STALE' && h.nextReview <= now)
  const prog = progressSummary()
  const records = closed.filter((p) => p.exitReason !== 'missed').map(fromPaperPosition).filter((r) => !r.corrupt && r.rMultiple !== null)
  const week = records.filter((r) => (r.closedAt ?? r.decidedAt) >= now - 7 * DAY)
  const last7 = week.length >= SAMPLE_BARS.insufficient ? statsOf(week) : null
  const yesterday = closed.filter((p) => p.dayKey === yKey && p.exitReason !== 'missed')
  return {
    kind: 'DAILY BRIEF', at: now, dayKey, engineVersion: VERSION,
    due: { vaultReviews: review.length, staleItems: stale.length, hypothesesUnderReview: underReview.length, hypothesesPastReview: pastReview.length, proposalsAwaiting: props.length, items: [...review.slice(0, 5).map((i) => `Review: ${i.title}`), ...underReview.slice(0, 5).map((h) => `Hypothesis under review: ${h.question}`), ...props.slice(0, 5).map((p) => `Proposal awaiting a human: ${p.title}`)], evidenceLabel: 'OBSERVED', source: 'knowledge vault, hypothesis store, proposal store' },
    study: { suggestions: prog.suggestions, familiar: prog.totals.familiar, unseen: prog.totals.unseen, evidenceLabel: 'OBSERVED', source: 'learning engagement (engagement only, not skill)' },
    record: { closedTrades: records.length, growth: dataGrowth(records.length), last7, last7Note: last7 ? `${week.length} closed paper trades in the last 7 days: mean ${fx(last7.meanR)}R${last7.ci95 ? ` (95% ${fx(last7.ci95.lo)} to ${fx(last7.ci95.hi)})` : ''}, ${last7.statusNote}` : `${week.length} closed paper trade${week.length === 1 ? '' : 's'} in the last 7 days — under the ${SAMPLE_BARS.insufficient}-trade bar, no weekly figure is stated.`, evidenceLabel: last7 ? 'OBSERVED' : 'INSUFFICIENT DATA', source: 'PAPER — live market, simulated execution' },
    yesterday: { dayKey: yKey, closes: yesterday.length, postMortems: yesterday.map((p) => { const pm = postMortemOf(fromPaperPosition(p)); return `${pm.strategyId}: ${pm.kind} at ${fx(pm.rMultiple)}R` }), evidenceLabel: yesterday.length ? 'OBSERVED' : 'INSUFFICIENT DATA', source: 'PAPER' },
    notes: [
      'This brief lists what is due and what to study. It does not say what the market will do today.',
      `Vault: ${vs.total} item(s), ${vs.failed} of them records of what did not work.`,
      'The engine reads none of this.',
    ],
  }
}

export type EndOfDay = {
  kind: 'END OF DAY'
  at: number
  dayKey: string
  engineVersion: string
  trades: Labelled<{ closes: Array<Omit<PostMortem, 'vaultItemId' | 'hypothesesTouched' | 'itemsTouched'>>; totalR: number | null; note: string }>
  noTrades: Labelled<{ rows: NoTradeRow[]; byCategory: Record<string, number> }>
  learned: Labelled<{ newItems: number; titles: string[] }>
  notes: string[]
}

export function endOfDay(closed: PaperPosition[], now = Date.now()): EndOfDay {
  const dayKey = tradingDayKey(now)
  const today = closed.filter((p) => p.dayKey === dayKey)
  const closes = today.filter((p) => p.exitReason !== 'missed').map((p) => postMortemOf(fromPaperPosition(p)))
  const rs = closes.map((c) => c.rMultiple).filter((r): r is number => r !== null)
  const noTrades = noTradeJournal(today)
  const byCategory: Record<string, number> = {}
  for (const n of noTrades) byCategory[n.category] = (byCategory[n.category] ?? 0) + 1
  const dayStart = now - DAY
  const newItems = listItems().filter((i) => i.created_at >= dayStart)
  return {
    kind: 'END OF DAY', at: now, dayKey, engineVersion: VERSION,
    trades: { closes, totalR: rs.length ? rs.reduce((a, b) => a + b, 0) : null, note: closes.length ? `${closes.length} paper close(s) today, ${fx(rs.reduce((a, b) => a + b, 0))}R in total. ${closes.length} is a day, not a sample.` : 'No paper trade closed today. A quiet day is data too: the engine found nothing that met its conditions, or the risk chain refused what it found.', evidenceLabel: closes.length ? 'OBSERVED' : 'INSUFFICIENT DATA', source: 'PAPER' },
    noTrades: { rows: noTrades, byCategory, evidenceLabel: 'OBSERVED', source: 'paper no-trade journal (setups refused before they could run)' },
    learned: { newItems: newItems.length, titles: newItems.slice(0, 10).map((i) => `${i.kind}: ${i.title}`), evidenceLabel: 'OBSERVED', source: 'knowledge vault' },
    notes: ['A post-mortem is a description of one trade. Nothing in it changes a rule.', 'The engine reads none of this.'],
  }
}

export type WeeklyReview = {
  kind: 'WEEKLY REVIEW'
  at: number
  from: number
  to: number
  engineVersion: string
  record: Labelled<{ thisWeek: { n: number; stats: CohortStats | null }; priorWeek: { n: number; stats: CohortStats | null }; byStrategy: Array<{ strategyId: string; n: number; meanR: number | null; status: CohortStats['status'] }>; growth: DataGrowth; note: string }>
  knowledge: Labelled<{ vault: ReturnType<typeof vaultSummary>; hypotheses: Record<HypothesisStatus, number>; proposals: Record<string, number>; trials: number }>
  reassessment: Reassessment
  learning: Labelled<{ familiar: number; practising: number; introduced: number; unseen: number; engagements: number }>
  notes: string[]
}

/**
 * `reassess` runs the scheduled sweep (a write: records expire into review).
 * A plain read of the weekly review does not; the API's POST /api/knowledge/reassess does.
 */
export function weeklyReview(closed: PaperPosition[], now = Date.now(), opts: { reassess?: boolean } = {}): WeeklyReview {
  const from = now - 7 * DAY
  const records = closed.filter((p) => p.exitReason !== 'missed').map(fromPaperPosition).filter((r) => !r.corrupt && r.rMultiple !== null)
  const week = records.filter((r) => (r.closedAt ?? r.decidedAt) >= from && (r.closedAt ?? r.decidedAt) < now)
  const prior = records.filter((r) => (r.closedAt ?? r.decidedAt) >= from - 7 * DAY && (r.closedAt ?? r.decidedAt) < from)
  const stats = (rs: typeof week) => (rs.length >= SAMPLE_BARS.insufficient ? statsOf(rs) : null)
  const byStrategy = [...new Set(week.map((r) => r.strategyId))].map((id) => { const rs = week.filter((r) => r.strategyId === id); const s = statsOf(rs); return { strategyId: id, n: rs.length, meanR: rs.length >= SAMPLE_BARS.insufficient ? s.meanR : null, status: s.status } }).sort((a, b) => b.n - a.n)
  const hyps = listHypotheses()
  const hypCounts = {} as Record<HypothesisStatus, number>
  for (const h of hyps) hypCounts[h.status] = (hypCounts[h.status] ?? 0) + 1
  const propCounts: Record<string, number> = {}
  for (const p of listProposals()) propCounts[p.status] = (propCounts[p.status] ?? 0) + 1
  const reassessment: Reassessment = opts.reassess ? reassessAll(now) : { at: now, staleItems: [], staleHypotheses: [], expiredProposals: [], note: 'Reassessment not run on a read. POST /api/knowledge/reassess (or the weekly job) runs it and reports what expired into review.' }
  const prog = progressSummary()
  const w = stats(week), p = stats(prior)
  return {
    kind: 'WEEKLY REVIEW', at: now, from, to: now, engineVersion: VERSION,
    record: {
      thisWeek: { n: week.length, stats: w }, priorWeek: { n: prior.length, stats: p }, byStrategy, growth: dataGrowth(records.length),
      note: w && p ? `This week ${fx(w.meanR)}R mean over ${week.length} vs prior week ${fx(p.meanR)}R over ${prior.length}. Two weekly means are two small samples; the intervals overlap unless stated otherwise, and a week-on-week change is not a trend.` : `${week.length} trade(s) this week, ${prior.length} the week before — under the ${SAMPLE_BARS.insufficient}-trade bar on at least one side, so no comparison is stated.`,
      evidenceLabel: w ? 'OBSERVED' : 'INSUFFICIENT DATA', source: 'PAPER — live market, simulated execution',
    },
    knowledge: { vault: vaultSummary(), hypotheses: hypCounts, proposals: propCounts, trials: trialRegistry().total, evidenceLabel: 'OBSERVED', source: 'knowledge vault, hypothesis store, proposal store, trial registry' },
    reassessment,
    learning: { familiar: prog.totals.familiar, practising: prog.totals.practising, introduced: prog.totals.introduced, unseen: prog.totals.unseen, engagements: prog.totals.engagements, evidenceLabel: 'OBSERVED', source: 'learning engagement (engagement only, not skill)' },
    notes: [
      `Strategies enabled: ${config.strategies.enabled.length ? config.strategies.enabled.join(', ') : 'all'}. Parameters unchanged by this review; changes go through a proposal a human decides.`,
      'Records that were not reviewed this month have been expired into review, not deleted.',
      'The engine reads none of this.',
    ],
  }
}
