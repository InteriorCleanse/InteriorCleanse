/**
 * THE KNOWLEDGE DECAY MONITOR — every knowledge item is checked against what
 * has happened since it was written, and moved to WATCH, REVIEW REQUIRED or
 * CONTRADICTED when the ground under it has shifted. It never deletes; it
 * never moves an item back to CURRENT (that is a review, and a review is a
 * person or the review job with a note).
 *
 * FLAGS (each names its evidence)
 *
 *   contradictions        contradictory evidence has been counted against it
 *   hypothesis-contradicted a linked hypothesis is NOT SUPPORTED or REJECTED
 *   paper-diverges        the drift monitor found paper DIFFERENT from the
 *                         historical population on the item's own cohort
 *   regime-change         the regime has changed several times since the
 *                         item was reviewed, or is no longer the one it names
 *   strategy-version      the engine / feature version the item was derived
 *                         under is not the one running
 *   dataset-age           the data the item rests on ends more than 90 days ago
 *   sample-grown          the cohort it describes has at least doubled since
 *
 * The first three are HARD; any one of them makes the item CONTRADICTED. The
 * rest are SOFT; one sets WATCH, two or more set REVIEW REQUIRED. Soft flags
 * hold their fire for a week after a review so a confirmation is not undone
 * by the same fact the next morning. Hard flags never wait.
 *
 * Idempotent: a status is written once; the flags are re-reported every run
 * so the screen is current, but history grows only when the status moves.
 */

import { SAMPLE_BARS, cohort, matches } from '../analyst/cohorts.ts'
import type { CohortFilter } from '../analyst/cohorts.ts'
import type { Dataset } from '../analyst/records.ts'
import { FEATURE_VERSION } from '../features/types.ts'
import { listObservations } from '../observer/events.ts'
import { getHypothesis } from '../research/hypotheses.ts'
import { VERSION } from '../version.ts'
import { OPEN_STATUSES, REVIEW, decayed, listItems, saveItem } from './vault.ts'
import type { KnowledgeItem, KnowledgeStatus } from './vault.ts'

export type DecayFlagCode = 'contradictions' | 'hypothesis-contradicted' | 'paper-diverges' | 'regime-change' | 'strategy-version' | 'dataset-age' | 'sample-grown'
export type DecayFlag = { code: DecayFlagCode; severity: 'HARD' | 'SOFT'; detail: string }

export type DecayContext = {
  now: number
  /** The paper record, for sample growth on directional items. */
  paper: Dataset
  /** The regime the engine currently reads, when known. */
  currentRegime: string | null
  /** Drift rows with verdict DIFFERENT, from the drift monitor. */
  drift: Array<{ dimension: string; value: string; verdict: string; note: string }>
  /** Overrides for tests. */
  strategyVersion?: string
  regimeChangesSince?: (t: number) => number
}

export type DecayReading = { itemId: string; title: string; kind: KnowledgeItem['kind']; before: KnowledgeStatus; after: KnowledgeStatus; flags: DecayFlag[]; changed: boolean }

export type DecayReport = {
  at: number
  scanned: number
  flagged: DecayReading[]
  changed: DecayReading[]
  byStatus: Record<string, number>
  note: string
}

export const DATASET_AGE_MS = 90 * 86_400_000
export const REVIEW_GRACE_MS = 7 * 86_400_000
export const REGIME_CHANGES_TO_FLAG = 3
const DATA_SOURCES = new Set(['PAPER', 'BACKTEST', 'HISTORICAL'])
const REGIMES = new Set(['trending-up', 'trending-down', 'ranging', 'breakout', 'transition'])

export function strategyVersion(): string { return `${VERSION}/f${FEATURE_VERSION}` }

type Directional = { direction: 'positive' | 'negative' | 'difference'; filters: CohortFilter[] }
function directionalOf(it: KnowledgeItem): Directional | null {
  const p = it.payload as Partial<Directional> | undefined
  if (!p || !Array.isArray(p.filters)) return null
  return { direction: p.direction ?? 'difference', filters: p.filters }
}

/** The flags for one item. Pure over the item and the context. */
export function decayFlags(it: KnowledgeItem, ctx: DecayContext): DecayFlag[] {
  const flags: DecayFlag[] = []
  const dataDerived = DATA_SOURCES.has(it.provenance.source)
  const d = directionalOf(it)
  const inGrace = ctx.now - it.last_reviewed < REVIEW_GRACE_MS && it.history.some((h) => h.event === 'review' && /^Confirmed|^Revised/.test(h.detail))
  const soft = (code: DecayFlagCode, detail: string) => { if (!inGrace) flags.push({ code, severity: 'SOFT', detail }) }

  // HARD
  if (it.contradictory_evidence_count >= REVIEW.afterContradictions && it.contradictory_evidence_count > it.new_evidence_count) {
    flags.push({ code: 'contradictions', severity: 'HARD', detail: `${it.contradictory_evidence_count} contradiction(s) against ${it.new_evidence_count} supporting observation(s) since the last review.` })
  }
  for (const link of it.links.filter((l) => l.startsWith('hyp-'))) {
    const h = getHypothesis(link)
    if (h && (h.status === 'NOT SUPPORTED' || h.status === 'REJECTED')) flags.push({ code: 'hypothesis-contradicted', severity: 'HARD', detail: `Linked hypothesis ${h.id} is ${h.status}: ${h.question}` })
  }
  if (d && (it.provenance.source === 'BACKTEST' || it.provenance.source === 'HISTORICAL')) {
    for (const row of ctx.drift.filter((x) => x.verdict === 'DIFFERENT')) {
      if (d.filters.some((f) => f.dimension === row.dimension && f.values.map(String).includes(row.value))) flags.push({ code: 'paper-diverges', severity: 'HARD', detail: row.note })
    }
  }
  // SOFT — only for items derived from data; a concept does not age with the market.
  if (dataDerived) {
    const regimeTags = it.tags.filter((t) => REGIMES.has(t))
    const changes = (ctx.regimeChangesSince ?? ((t) => listObservations({ type: 'REGIME CHANGE', from: t, limit: 1000 }).length))(it.last_reviewed)
    if (regimeTags.length && ctx.currentRegime && !regimeTags.includes(ctx.currentRegime)) soft('regime-change', `The item names regime ${regimeTags.join('/')}; the engine currently reads ${ctx.currentRegime}.`)
    else if (changes >= REGIME_CHANGES_TO_FLAG) soft('regime-change', `${changes} regime change(s) recorded since the item was last reviewed.`)
    const sv = it.provenance.strategyVersion ?? it.provenance.engineVersion
    const cur = ctx.strategyVersion ?? strategyVersion()
    if (sv && sv !== cur && sv !== cur.split('/')[0]) soft('strategy-version', `Derived under ${sv}; the running version is ${cur}.`)
    const dataEnd = it.provenance.period?.to ?? it.created_at
    if (ctx.now - dataEnd > DATASET_AGE_MS) soft('dataset-age', `The data it rests on ends ${Math.round((ctx.now - dataEnd) / 86_400_000)} days ago.`)
    if (d && it.provenance.source === 'PAPER' && it.provenance.sampleSize && it.provenance.sampleSize >= SAMPLE_BARS.insufficient) {
      const n = cohort(ctx.paper, { name: it.id, filters: d.filters }).stats.n
      if (n >= 2 * it.provenance.sampleSize) soft('sample-grown', `Written on ${it.provenance.sampleSize} paper trade(s); the cohort now has ${n}. The statement should be recomputed, not assumed.`)
    }
  }
  return flags
}

/** The status the flags imply — or null when they imply no move. Pure. */
export function decayTarget(flags: DecayFlag[]): 'WATCH' | 'REVIEW REQUIRED' | 'CONTRADICTED' | null {
  if (flags.some((f) => f.severity === 'HARD')) return 'CONTRADICTED'
  const soft = flags.filter((f) => f.severity === 'SOFT').length
  if (soft >= 2) return 'REVIEW REQUIRED'
  if (soft === 1) return 'WATCH'
  return null
}

/** Run over the vault. Writes only status moves; reports every flag. */
export function runDecayMonitor(ctx: DecayContext): DecayReport {
  const items = listItems()
  const flagged: DecayReading[] = []
  const changed: DecayReading[] = []
  for (const it of items) {
    if (!OPEN_STATUSES.includes(it.status)) continue
    const flags = decayFlags(it, ctx)
    if (!flags.length) continue
    const target = decayTarget(flags)
    const next = target ? decayed(it, target, flags.map((f) => `${f.code}: ${f.detail}`), ctx.now) : it
    const reading: DecayReading = { itemId: it.id, title: it.title, kind: it.kind, before: it.status, after: next.status, flags, changed: next !== it }
    flagged.push(reading)
    if (next !== it) { saveItem(next); changed.push(reading) }
  }
  const byStatus: Record<string, number> = {}
  for (const it of listItems()) byStatus[it.status] = (byStatus[it.status] ?? 0) + 1
  return {
    at: ctx.now, scanned: items.length, flagged, changed, byStatus,
    note: changed.length ? `${changed.length} item(s) moved (${changed.map((c) => `${c.before} → ${c.after}`).filter((v, i, a) => a.indexOf(v) === i).join(', ')}); ${flagged.length} carry a flag. Nothing was deleted; each move is in the item's history.` : flagged.length ? `${flagged.length} item(s) carry a flag already reflected in their status; nothing moved.` : `${items.length} item(s) scanned; nothing has shifted under any of them.`,
  }
}

/** What a reader would check about one item, without writing. */
export function decayReading(it: KnowledgeItem, ctx: DecayContext): DecayReading {
  const flags = decayFlags(it, ctx)
  const target = decayTarget(flags)
  const next = target && OPEN_STATUSES.includes(it.status) ? decayed(it, target, [], ctx.now) : it
  return { itemId: it.id, title: it.title, kind: it.kind, before: it.status, after: next.status, flags, changed: next !== it }
}

/** Items a person should look at, grouped the way the KNOWLEDGE REQUIRING REVIEW panel shows them. */
export function knowledgeRequiringReview(): { contradicted: KnowledgeItem[]; reviewRequired: KnowledgeItem[]; stale: KnowledgeItem[]; watch: KnowledgeItem[]; note: string } {
  const contradicted = listItems({ status: 'CONTRADICTED' })
  const reviewRequired = listItems({ status: 'REVIEW REQUIRED' })
  const stale = listItems({ status: 'STALE' })
  const watch = listItems({ status: 'WATCH' })
  const n = contradicted.length + reviewRequired.length + stale.length
  return { contradicted, reviewRequired, stale, watch, note: n ? `${n} item(s) need a review (${contradicted.length} contradicted, ${reviewRequired.length} review required, ${stale.length} stale); ${watch.length} on watch. A review confirms, revises or retires; it never deletes.` : `Nothing needs a review; ${watch.length} item(s) on watch.` }
}
