/**
 * "WHAT SHOULD WE STUDY NEXT?" — the research recommendation screen.
 *
 * Recommendations come from what the record cannot yet explain: unexplained
 * divergence in paper results, missing evidence (strategies and cells under
 * the bar), contradictory findings, high-interest events, stale knowledge,
 * regime transitions, strategy disagreement and paper/backtest drift. Every
 * recommendation answers four questions — WHY THIS QUESTION, WHAT DATA
 * EXISTS, WHAT IS MISSING, WHAT WOULD ANSWER IT — and, where one exists,
 * points at the queue item that would do the work.
 *
 * It suggests research. It never suggests a trade.
 */

import { SAMPLE_BARS, byDimension } from '../analyst/cohorts.ts'
import type { Dataset } from '../analyst/records.ts'
import { listItems } from '../knowledge/vault.ts'
import { listObservations } from '../observer/events.ts'
import { strategyIds } from '../strategies/registry.ts'
import { listHypotheses } from './hypotheses.ts'
import { listQueue, queueId } from './queue.ts'
import type { QueueItem } from './queue.ts'

export type Recommendation = {
  id: string
  topic: 'unexplained divergence' | 'missing evidence' | 'contradictory findings' | 'high-interest event' | 'stale knowledge' | 'regime transitions' | 'strategy disagreement' | 'paper/backtest drift' | 'large residual'
  question: string
  why: string
  dataExists: string
  missing: string
  wouldAnswer: string
  queueItemId: string | null
  weight: number
}

export type DriftInput = Array<{ dimension: string; value: string; verdict: string; note: string }>

export function recommendations(input: { paper: Dataset; backtest?: Dataset | null; drift?: DriftInput; now?: number; max?: number }): { items: Recommendation[]; note: string } {
  const now = input.now ?? Date.now()
  const out: Recommendation[] = []
  const queue = listQueue()
  const linked = (question: string, source: 'PAPER' | 'BACKTEST', filters: QueueItem['dataset']['filters']) => queue.find((q) => q.id === queueId(question, source, filters))?.id ?? queue.find((q) => q.question === question)?.id ?? null
  const paperN = input.paper.records.filter((r) => !r.missed && r.rMultiple !== null).length

  // Unexplained divergence: paper exits the significance engine flagged as far from their cohort.
  const diverging = listObservations({ type: 'PAPER EXIT', minSignificance: 50, limit: 200 }).filter((o) => o.significance.reasons.some((r) => /major divergence/.test(r)))
  if (diverging.length >= 2) {
    const q = `Why do ${diverging.length} recent paper exits sit two or more standard deviations from their strategy's cohort mean?`
    out.push({ id: 'rec-divergence', topic: 'unexplained divergence', question: q, why: `${diverging.length} exits were flagged by the significance engine as major divergence from the cohort; a cluster of outliers is either a regime the cohort does not describe or a data problem.`, dataExists: `${diverging.length} flagged exits with decision snapshots and reconciled excursions; the cohort statistics they diverge from.`, missing: 'A cohort definition that separates them — session, regime, volatility or news proximity — with enough trades on each side.', wouldAnswer: 'A cohort experiment splitting the strategy record by the candidate dimension, baseline = the rest.', queueItemId: linked(q, 'PAPER', []), weight: 70 })
  }
  // Missing evidence: strategies under the bar, cells under the bar.
  const byStrategy = byDimension(input.paper, 'strategyId', { includeEmpty: false })
  const thin = strategyIds().filter((id) => (byStrategy.rows.find((r) => r.name === id)?.stats.n ?? 0) < SAMPLE_BARS.insufficient)
  if (thin.length) {
    out.push({ id: 'rec-missing-strategy', topic: 'missing evidence', question: `What does the paper record say about ${thin.slice(0, 3).join(', ')}${thin.length > 3 ? ` and ${thin.length - 3} more` : ''}?`, why: `${thin.length} strateg${thin.length === 1 ? 'y has' : 'ies have'} fewer than ${SAMPLE_BARS.insufficient} closed paper trades; nothing can be said about them yet.`, dataExists: `${paperN} closed paper trades in total; cached backtests where they were run.`, missing: `${SAMPLE_BARS.insufficient}+ paper trades per strategy. This is a matter of time, not research; the queue cannot manufacture trades.`, wouldAnswer: 'Continued paper trading; the passport reports the count as it grows.', queueItemId: null, weight: 30 })
  }
  // Contradictory findings.
  const contradicted = listHypotheses().filter((h) => h.counterevidence.length > 0 && h.status !== 'REJECTED')
  for (const h of contradicted.slice(0, 3)) {
    out.push({ id: `rec-contra-${h.id}`, topic: 'contradictory findings', question: h.question, why: `The hypothesis is ${h.status} with ${h.counterevidence.length} piece(s) of counterevidence on record: ${h.counterevidence[h.counterevidence.length - 1]}`, dataExists: `In-sample ${h.inSample?.trades ?? 0}, out-of-sample ${h.outOfSample?.trades ?? 0} records; ${h.history.length} history entries.`, missing: h.outOfSample ? 'A larger out-of-sample sample, or a cohort split that separates the contradicting trades.' : 'An out-of-sample stage.', wouldAnswer: 'Re-running the registered experiment when its reassessment falls due, then the challenger.', queueItemId: linked(h.question, h.dataset.source, h.cohortFilters), weight: 65 })
  }
  // High-interest events: the most significant resolved or pending observations of the last 7 days.
  const recent = listObservations({ from: now - 7 * 86_400_000, minSignificance: 70, limit: 20 })
  if (recent.length) {
    const top = recent[0]
    out.push({ id: `rec-event-${top.id}`, topic: 'high-interest event', question: `What happened around the ${top.type.toLowerCase()} at ${new Date(top.time).toISOString()} (${top.significance.score}/100)?`, why: top.significance.note, dataExists: top.status === 'RESOLVED' ? 'A resolved case study with BEFORE / DURING / DECISION / AFTER frames.' : top.status === 'CANDIDATE' ? 'A candidate awaiting its horizon candles.' : 'The observation record and its evidence.', missing: top.status === 'RESOLVED' ? 'Similar events to compare it with — a counterexample pair needs at least one of each.' : 'The AFTER frame; it is revealed only when the horizon is stored.', wouldAnswer: 'The replay of the event, then a counterexample search across the same kind.', queueItemId: null, weight: 40 + Math.round(top.significance.score / 5) })
  }
  // Stale knowledge.
  const stale = listItems({ status: 'STALE' }).concat(listItems({ status: 'REVIEW REQUIRED' }))
  if (stale.length) {
    out.push({ id: 'rec-stale', topic: 'stale knowledge', question: `Do ${stale.length} knowledge item(s) still hold?`, why: `${stale.length} item(s) are STALE or REVIEW REQUIRED: ${stale.slice(0, 3).map((i) => i.title).join('; ')}${stale.length > 3 ? '; …' : ''}.`, dataExists: 'The items with their evidence counts and history; the paper record since they were written.', missing: 'A review decision (confirm, revise, retire) per item, and for directional items a re-run of the cohort they describe.', wouldAnswer: 'The knowledge review on the KNOWLEDGE tab; a cohort experiment for each directional item.', queueItemId: null, weight: 55 })
  }
  // Regime transitions.
  const regimeChanges = listObservations({ type: 'REGIME CHANGE', from: now - 14 * 86_400_000, limit: 200 })
  if (regimeChanges.length >= 5) {
    const q = 'Do paper results differ across regime transitions versus stable regimes?'
    out.push({ id: 'rec-regime', topic: 'regime transitions', question: q, why: `${regimeChanges.length} regime changes in 14 days. A record decided across many transitions may not describe any one regime.`, dataExists: `${regimeChanges.length} transition observations with the regime before and after; paper records carry the regime at decision.`, missing: 'Ten or more paper trades decided within a few candles of a transition.', wouldAnswer: 'A cohort experiment with regime = transition versus the rest.', queueItemId: linked(q, 'PAPER', [{ dimension: 'regime', values: ['transition'] }]), weight: 45 })
  }
  // Strategy disagreement.
  const disagreements = listObservations({ from: now - 14 * 86_400_000, limit: 500 }).filter((o) => o.significance.reasons.some((r) => /disagreement/.test(r)))
  if (disagreements.length >= 3) {
    out.push({ id: 'rec-disagree', topic: 'strategy disagreement', question: 'When strategies vote against each other on the same candle, what does the fused decision do, and how do those candles resolve?', why: `${disagreements.length} candles in 14 days had BUY and SELL votes at once.`, dataExists: `${disagreements.length} observations with the votes recorded; the fused decision on each.`, missing: 'Resolved case studies for those candles (the AFTER frame) — the observer resolves them as the horizon is stored.', wouldAnswer: 'The case-study tally for strategy-setup events on disagreement candles versus agreement candles.', queueItemId: null, weight: 50 })
  }
  // Paper / backtest drift.
  for (const d of (input.drift ?? []).filter((x) => x.verdict === 'DIFFERENT').slice(0, 3)) {
    const q = `Why does paper ${d.dimension} "${d.value}" differ from the historical population?`
    out.push({ id: `rec-drift-${d.dimension}-${d.value}`, topic: 'paper/backtest drift', question: q, why: d.note, dataExists: 'PAPER and BACKTEST records for the same strategy, kept apart, with the same dimension recorded on both.', missing: 'A cause: execution (spread, slippage), regime mix, or a change in the market. The drift monitor reports the difference, not the cause.', wouldAnswer: 'A cohort experiment on each side with the same filter; the execution-cost stress in the challenger.', queueItemId: linked(q, 'PAPER', [{ dimension: d.dimension as never, values: [d.value] }]), weight: 60 })
  }
  // Large residuals: cohorts at the developing bar with intervals still spanning zero — the "we still do not know" list.
  for (const row of byDimension(input.paper, 'session').rows.filter((r) => r.stats.n >= SAMPLE_BARS.early && r.stats.ci95 && r.stats.ci95.lo < 0 && r.stats.ci95.hi > 0).slice(0, 2)) {
    out.push({ id: `rec-residual-session-${row.name}`, topic: 'large residual', question: `Is the ${row.name} session's mean R different from zero, or is the spread simply large?`, why: `${row.stats.n} trades and the 95% interval still spans zero (${row.stats.ci95!.lo.toFixed(2)} to ${row.stats.ci95!.hi.toFixed(2)}); the sign is not settled.`, dataExists: `${row.stats.n} paper trades in the session.`, missing: row.stats.tradesNeeded ? `About ${row.stats.tradesNeeded} trades would be needed at this mean and spread.` : 'More trades.', wouldAnswer: 'Time, and a split by regime or volatility to see whether the spread is two populations.', queueItemId: null, weight: 35 })
  }
  const items = out.sort((a, b) => b.weight - a.weight).slice(0, input.max ?? 10)
  return { items, note: items.length ? `${items.length} recommendation(s), ordered by how much the record cannot yet explain. None is a trade idea.` : 'Nothing to recommend yet: the record is too small to have unexplained divergence, contradictions or drift. Paper trading builds the dataset; the queue fills as it grows.' }
}
