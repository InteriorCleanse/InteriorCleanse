/**
 * THE LEARNING LOOP — what happens after a paper trade closes.
 *
 * The engine decided, the paper trader filled and closed, the record is
 * immutable. THEN this runs: it reads the closed position, writes a
 * post-mortem into the knowledge vault, and tells every knowledge item and
 * hypothesis that the trade bears on that new evidence arrived — supporting or
 * contradicting — so that conclusions expire into review instead of quietly
 * ageing. It never touches the engine, the position, or any parameter.
 *
 * Called from the watch loop AFTER managePositions, inside a try/catch, with
 * its result unused by the caller. That is the whole contract: the engine
 * would run identically if this file did not exist.
 *
 * A post-mortem is observations, not rules. "A loss on a full checklist" is a
 * fact about one trade; the lesson item it produces says so, carries the
 * record id, and is labelled OBSERVED with a sample of one.
 */

import { config } from '../../config.ts'
import { matches } from '../analyst/cohorts.ts'
import { fromPaperPosition } from '../analyst/records.ts'
import type { EvidenceRecord } from '../analyst/records.ts'
import { addItem, getItem, listItems, recordEvidence, sweepStale } from '../knowledge/vault.ts'
import type { KnowledgeItem, NewItem } from '../knowledge/vault.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { flagForReview, listHypotheses, saveHypothesis, sweepStaleHypotheses } from '../research/hypotheses.ts'
import type { Hypothesis } from '../research/hypotheses.ts'
import { sweepProposals } from '../research/lab.ts'
import { store } from '../store.ts'
import { VERSION } from '../version.ts'

export type PostMortemKind = 'win' | 'loss' | 'flat' | 'loss-on-full-checklist' | 'missed' | 'unreadable'

export type PostMortem = {
  tradeId: string
  kind: PostMortemKind
  strategyId: string
  rMultiple: number | null
  exitReason: string | null
  /** What the decision-time snapshot recorded — or that there was none. */
  atDecision: { recorded: boolean; fusedScore: number | null; quality: number | null; session: string; regime: string | null; volatility: string | null; newsMinutes: number | null }
  /** MAE / MFE as stored: NOT COMPUTED until reconciliation; never estimated here. */
  excursions: { mae: EvidenceRecord['mae']; mfe: EvidenceRecord['mfe'] }
  observations: string[]
  /** Things this trade CANNOT tell us — printed so the reader does not infer them. */
  cannotConclude: string[]
  vaultItemId: string
  hypothesesTouched: string[]
  itemsTouched: string[]
  evidenceLabel: 'OBSERVED'
  provenance: { source: 'PAPER'; recordIds: string[]; engineVersion: string }
}

const fx = (n: number | null, d = 2) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)

/** Pure: the post-mortem of one evidence record. */
export function postMortemOf(r: EvidenceRecord): Omit<PostMortem, 'vaultItemId' | 'hypothesesTouched' | 'itemsTouched'> {
  const fullChecklist = r.fusedScore !== null && r.fusedScore >= config.fusion.enterScore && r.quality !== null && r.quality >= 80
  const kind: PostMortemKind = r.corrupt ? 'unreadable' : r.missed ? 'missed' : r.rMultiple === null ? 'unreadable' : r.rMultiple > 0 ? 'win' : r.rMultiple < 0 ? (fullChecklist ? 'loss-on-full-checklist' : 'loss') : 'flat'
  const obs: string[] = []
  const cannot: string[] = []
  if (r.corrupt) obs.push(`The record could not be read: ${r.corruptReason ?? 'unknown reason'}. Nothing is learned from it, and it is counted as corrupt, not dropped.`)
  else if (r.missed) obs.push(`No position was opened${r.exitReason ? ` (${r.exitReason})` : ''}; there is no outcome to learn from, only the reason.`)
  else {
    obs.push(`${r.strategyId} ${r.direction} closed ${r.exitReason ?? '—'} at ${fx(r.rMultiple)}R${r.durationMs !== null ? ` after ${Math.round(r.durationMs / 60_000)} min` : ''}.`)
    obs.push(r.fusedScore === null ? 'No decision-time snapshot was stored for this trade; what the engine saw at decision is unknown and is not reconstructed.' : `At decision the fused score was ${r.fusedScore}/100${r.quality !== null ? ` and the checklist ${r.quality}/100` : ''}, in ${r.session === 'none' ? 'no session' : r.session}${r.regime ? `, regime ${r.regime}` : ', regime not recorded'}${r.volatility ? `, volatility ${r.volatility}` : ''}.`)
    if (kind === 'loss-on-full-checklist') obs.push('Every recorded condition was met and the trade still lost. That is one observation of the strategy\'s loss rate, not evidence that a condition is missing.')
    if (r.mae.status === 'OBSERVED' && r.mfe.status === 'OBSERVED') obs.push(`Excursions: MAE ${fx(r.mae.r)}R, MFE ${fx(r.mfe.r)}R.${r.rMultiple !== null && r.mfe.r !== null && r.mfe.r >= 1 && r.rMultiple <= 0 ? ' Price reached 1R in favour before the loss — a description of this trade, not a reason to change the target.' : ''}`)
    else obs.push(`Excursions: ${r.mae.status === 'NOT COMPUTED' ? 'not computed until reconciliation' : r.mae.status.toLowerCase()}.`)
    if (r.newsMinutes !== null && r.newsMinutes <= 60) obs.push(`A high-impact release was ${r.newsMinutes} min away at decision.`)
    if (r.spreadPct !== null && r.spreadPct > 0.05) obs.push(`Spread at fill was ${r.spreadPct.toFixed(3)}%.`)
  }
  cannot.push('Whether the strategy has an edge — one trade is a sample of one.')
  cannot.push('Whether a different stop or target would have done better — the record is immutable and nothing is re-simulated.')
  if (r.mtfAligned === null) cannot.push('Whether higher-timeframe alignment mattered — the engine does not record it.')
  return {
    tradeId: r.id, kind, strategyId: r.strategyId, rMultiple: r.rMultiple, exitReason: r.exitReason,
    atDecision: { recorded: r.fusedScore !== null, fusedScore: r.fusedScore, quality: r.quality, session: r.session, regime: r.regime, volatility: r.volatility, newsMinutes: r.newsMinutes },
    excursions: { mae: r.mae, mfe: r.mfe },
    observations: obs, cannotConclude: cannot,
    evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER', recordIds: [r.id], engineVersion: r.engineVersion ?? VERSION },
  }
}

export function postMortemItem(pm: ReturnType<typeof postMortemOf>, at: number): NewItem {
  return {
    kind: 'lesson', id: `lesson:post-mortem:${pm.tradeId}`,
    title: `Post-mortem · ${pm.strategyId} · ${pm.kind} · ${fx(pm.rMultiple)}R`,
    body: [...pm.observations, 'Cannot conclude: ' + pm.cannotConclude.join(' ')].join('\n'),
    evidenceLabel: 'OBSERVED', tags: [pm.strategyId, pm.kind, pm.atDecision.session, ...(pm.atDecision.regime ? [pm.atDecision.regime] : [])],
    provenance: { source: 'PAPER', recordIds: pm.provenance.recordIds, sampleSize: 1, method: 'post-mortem of one closed paper record', engineVersion: pm.provenance.engineVersion, symbol: config.symbol, timeframe: config.interval },
    payload: pm, now: at,
  }
}

/**
 * Knowledge items that state a direction for a cohort carry it in their
 * payload as { direction, filters }. A trade matching the filters is evidence:
 * supporting if its sign agrees, contradicting if it does not.
 */
export type DirectionalPayload = { direction: 'positive' | 'negative'; filters: Parameters<typeof matches>[1] }

function directionalOf(it: KnowledgeItem): DirectionalPayload | null {
  const p = it.payload as Partial<DirectionalPayload> | undefined
  if (!p || (p.direction !== 'positive' && p.direction !== 'negative') || !Array.isArray(p.filters)) return null
  return { direction: p.direction, filters: p.filters }
}

/** New paper evidence since a hypothesis was last reviewed — kept apart from the hypothesis so the record stays pure. */
const HYP_KEY = (id: string) => `learning:hyp-evidence:${id}`
export const HYPOTHESIS_REVIEW_AFTER = 10

function reassessHypotheses(r: EvidenceRecord, now: number): string[] {
  const touched: string[] = []
  if (r.rMultiple === null) return touched
  for (const h of listHypotheses()) {
    if (h.status === 'REJECTED' || h.status === 'STALE' || h.status === 'UNDER REVIEW') continue
    if (h.dataset.source !== 'PAPER' && h.status !== 'OOS SUPPORTED') continue
    if (!matches(r, h.cohortFilters)) continue
    const key = HYP_KEY(h.id)
    const cur = store().getJson<{ since: number; n: number; agree: number; disagree: number }>(key) ?? { since: h.lastReviewed, n: 0, agree: 0, disagree: 0 }
    if (cur.since !== h.lastReviewed) { cur.since = h.lastReviewed; cur.n = 0; cur.agree = 0; cur.disagree = 0 }
    const agrees = h.direction === 'difference' ? null : (r.rMultiple > 0) === (h.direction === 'positive')
    cur.n++
    if (agrees === true) cur.agree++
    if (agrees === false) cur.disagree++
    store().setJson(key, cur)
    touched.push(h.id)
    if (cur.n >= HYPOTHESIS_REVIEW_AFTER) {
      const flagged: Hypothesis = flagForReview(h, `${cur.n} new paper trade(s) in this cohort since the last review (${cur.agree} with the hypothesis, ${cur.disagree} against). Re-run the out-of-sample check.`, now)
      saveHypothesis(flagged)
    }
  }
  return touched
}

function reassessItems(r: EvidenceRecord, now: number): string[] {
  const touched: string[] = []
  if (r.rMultiple === null) return touched
  for (const it of listItems()) {
    if (it.status !== 'CURRENT' && it.status !== 'REVIEW REQUIRED') continue
    const d = directionalOf(it)
    if (!d || !matches(r, d.filters)) continue
    const contradictory = (r.rMultiple > 0) !== (d.direction === 'positive')
    recordEvidence(it.id, { contradictory, detail: `Paper trade ${r.id} closed at ${fx(r.rMultiple)}R (${contradictory ? 'against' : 'with'} the stated direction).`, now })
    touched.push(it.id)
  }
  return touched
}

/**
 * The entry point the watch loop calls after a paper position closes or is
 * missed. Idempotent per trade: the post-mortem item id is the trade id.
 */
export function observePaperClose(p: PaperPosition, now = Date.now()): PostMortem {
  const r = fromPaperPosition(p)
  const pm = postMortemOf(r)
  const draft = postMortemItem(pm, now)
  const alreadySeen = getItem(draft.id!) !== null
  const item = addItem(draft)
  // The same close observed twice (a restart replaying the loop) must not count as new evidence twice.
  const hypothesesTouched = alreadySeen ? [] : reassessHypotheses(r, now)
  const itemsTouched = alreadySeen ? [] : reassessItems(r, now)
  return { ...pm, vaultItemId: item.id, hypothesesTouched, itemsTouched }
}

export type Reassessment = { at: number; staleItems: string[]; staleHypotheses: string[]; expiredProposals: string[]; note: string }

/** The scheduled reassessment: expire what was not reviewed. Called by the daily review and on request. */
export function reassessAll(now = Date.now()): Reassessment {
  const staleItems = sweepStale(now).map((i) => i.id)
  const staleHypotheses = sweepStaleHypotheses(now).map((h) => h.id)
  const expiredProposals = sweepProposals(now).map((p) => p.id)
  return { at: now, staleItems, staleHypotheses, expiredProposals, note: `${staleItems.length} knowledge item(s), ${staleHypotheses.length} hypothesis/es and ${expiredProposals.length} proposal(s) expired into review. Nothing was deleted; the history of each is kept.` }
}
