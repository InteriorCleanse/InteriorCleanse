/**
 * THE KNOWLEDGE VAULT — what Mr. Cash remembers, including what did not work.
 *
 * A knowledge item is a durable, versioned record of something observed,
 * taught, hypothesised or refuted: a concept, a case study, a research result,
 * a counterexample, a data-quality warning, a lesson, a failed hypothesis, a
 * reassessment. Every item carries its provenance and an evidence label, and
 * every item EXPIRES INTO REVIEW: a conclusion drawn on day one is not assumed
 * to hold on day ninety.
 *
 * THREE RULES
 *
 *   1. Append, never rewrite. A revision bumps the version and keeps the prior
 *      body in the item's history. The record of what was believed, and when,
 *      is part of the knowledge.
 *   2. Contradiction counts. New evidence that AGREES and new evidence that
 *      CONTRADICTS are counted separately, and enough of either sends the item
 *      to REVIEW REQUIRED. A vault that only remembered confirmations would be
 *      a confirmation-bias machine, which is the one thing this must not be.
 *   3. Nothing here decides anything. The vault is memory. It is read by the
 *      school, the research lab and the reviews; it is never read by the engine.
 *
 * The core is pure over `KnowledgeItem` values; the store wrappers at the
 * bottom are the only thing that touches the kv table.
 */

import { store } from '../store.ts'
import { VERSION } from '../version.ts'

export type KnowledgeKind =
  | 'concept' | 'case-study' | 'research-result' | 'hypothesis' | 'counterexample'
  | 'strategy-observation' | 'regime-observation' | 'session-observation'
  | 'data-quality-warning' | 'lesson' | 'failed-hypothesis' | 'reassessment'

/**
 * CURRENT          nothing has called the item into question
 * WATCH            one soft decay flag (the decay monitor's first warning)
 * REVIEW REQUIRED  evidence counts or several decay flags ask for a look
 * STALE            past its review date without a review
 * CONTRADICTED     a hard flag: contradictions outnumber support, a linked
 *                  hypothesis was not supported, or paper diverged from the
 *                  historical population the item rests on
 * SUPERSEDED / RETIRED  closed by a newer item or a review; kept, never deleted
 */
export type KnowledgeStatus = 'CURRENT' | 'WATCH' | 'REVIEW REQUIRED' | 'STALE' | 'CONTRADICTED' | 'SUPERSEDED' | 'RETIRED'

/** Statuses an item still "speaks" in — it can receive evidence and be decayed further. */
export const OPEN_STATUSES: readonly KnowledgeStatus[] = ['CURRENT', 'WATCH', 'REVIEW REQUIRED', 'STALE', 'CONTRADICTED']

/** The discipline every claim on screen carries. */
export type EvidenceLabel = 'OBSERVED' | 'INFERRED' | 'HYPOTHESIS' | 'SIMULATED' | 'INSUFFICIENT DATA'

export type KnowledgeProvenance = {
  source: 'PAPER' | 'BACKTEST' | 'HISTORICAL' | 'ENGINE' | 'USER' | 'NONE'
  engineVersion: string
  symbol?: string
  timeframe?: string
  period?: { from: number; to: number } | null
  /** Trade or record ids the item was derived from — the traceability spec asks for. */
  recordIds?: string[]
  sampleSize?: number
  method?: string
  strategyVersion?: string
}

export type KnowledgeHistory = { at: number; event: 'created' | 'evidence' | 'contradiction' | 'review' | 'revised' | 'stale' | 'superseded' | 'retired' | 'watch' | 'contradicted'; detail: string; version: number }

export type KnowledgeItem = {
  id: string
  kind: KnowledgeKind
  title: string
  body: string
  tags: string[]
  evidenceLabel: EvidenceLabel
  provenance: KnowledgeProvenance
  /** Ids of related items (a case study's counterexample, a lesson's concept, …). */
  links: string[]
  created_at: number
  last_reviewed: number
  review_due: number
  new_evidence_count: number
  contradictory_evidence_count: number
  status: KnowledgeStatus
  version: number
  history: KnowledgeHistory[]
  /** Free-form structured payload the producing module owns (a case study's frames, a lesson's quiz). */
  payload?: unknown
}

/** Review cadence. Exported so the docs print the same numbers this code uses. */
export const REVIEW = {
  /** An item unreviewed for this long expires into review. */
  afterMs: 30 * 86_400_000,
  /** This many new supporting observations send it to review. */
  afterNewEvidence: 25,
  /** This many contradictions send it to review — far fewer, on purpose. */
  afterContradictions: 5,
} as const

const clean = (s: string) => s.trim()

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

/** A deterministic id from kind + title + creation time: the same event recorded twice gets the same id. */
export function knowledgeId(kind: KnowledgeKind, title: string, createdAt: number): string {
  let h = 2166136261
  for (const ch of `${kind}|${title}|${createdAt}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return `${kind}:${slug(title)}:${h.toString(36)}`
}

// ---------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------

export type NewItem = {
  kind: KnowledgeKind
  title: string
  body: string
  evidenceLabel: EvidenceLabel
  provenance: Omit<KnowledgeProvenance, 'engineVersion'> & { engineVersion?: string }
  tags?: string[]
  links?: string[]
  payload?: unknown
  /** Overrides for deterministic tests. */
  now?: number
  id?: string
}

export function makeItem(input: NewItem): KnowledgeItem {
  const now = input.now ?? Date.now()
  const title = clean(input.title)
  if (!title) throw new Error('a knowledge item needs a title')
  if (!clean(input.body)) throw new Error('a knowledge item needs a body')
  const id = input.id ?? knowledgeId(input.kind, title, now)
  return {
    id, kind: input.kind, title, body: input.body, tags: [...new Set(input.tags ?? [])].sort(),
    evidenceLabel: input.evidenceLabel,
    provenance: { ...input.provenance, engineVersion: input.provenance.engineVersion ?? VERSION },
    links: [...new Set(input.links ?? [])],
    created_at: now, last_reviewed: now, review_due: now + REVIEW.afterMs,
    new_evidence_count: 0, contradictory_evidence_count: 0,
    status: 'CURRENT', version: 1,
    history: [{ at: now, event: 'created', detail: `Created as ${input.evidenceLabel} from ${input.provenance.source}.`, version: 1 }],
    payload: input.payload,
  }
}

/** New evidence arrived. Supporting and contradicting are counted apart; either can force a review. */
export function withEvidence(item: KnowledgeItem, e: { contradictory: boolean; detail: string; now?: number }): KnowledgeItem {
  const now = e.now ?? Date.now()
  const next: KnowledgeItem = {
    ...item,
    new_evidence_count: item.new_evidence_count + (e.contradictory ? 0 : 1),
    contradictory_evidence_count: item.contradictory_evidence_count + (e.contradictory ? 1 : 0),
    history: [...item.history, { at: now, event: e.contradictory ? 'contradiction' : 'evidence', detail: e.detail, version: item.version }],
  }
  if ((next.status === 'CURRENT' || next.status === 'WATCH') && (next.new_evidence_count >= REVIEW.afterNewEvidence || next.contradictory_evidence_count >= REVIEW.afterContradictions)) {
    next.status = 'REVIEW REQUIRED'
    next.history.push({ at: now, event: 'review', detail: `Review required: ${next.new_evidence_count} new observation(s), ${next.contradictory_evidence_count} contradiction(s) since the last review.`, version: item.version })
  }
  return next
}

export type ReviewOutcome =
  | { outcome: 'CONFIRMED'; note: string }
  | { outcome: 'REVISED'; note: string; body: string; evidenceLabel?: EvidenceLabel }
  | { outcome: 'RETIRED'; note: string }

/**
 * A human or a review job looked at the item. CONFIRMED resets the counters
 * and the clock; REVISED bumps the version and keeps the old body in history;
 * RETIRED closes it. The prior state is never lost.
 */
export function reviewed(item: KnowledgeItem, r: ReviewOutcome, now = Date.now()): KnowledgeItem {
  const base: KnowledgeItem = { ...item, last_reviewed: now, review_due: now + REVIEW.afterMs, new_evidence_count: 0, contradictory_evidence_count: 0 }
  if (r.outcome === 'CONFIRMED') {
    return { ...base, status: 'CURRENT', history: [...item.history, { at: now, event: 'review', detail: `Confirmed: ${r.note}`, version: item.version }] }
  }
  if (r.outcome === 'RETIRED') {
    return { ...base, status: 'RETIRED', history: [...item.history, { at: now, event: 'retired', detail: r.note, version: item.version }] }
  }
  const version = item.version + 1
  return {
    ...base, status: 'CURRENT', version, body: r.body, evidenceLabel: r.evidenceLabel ?? item.evidenceLabel,
    history: [...item.history, { at: now, event: 'revised', detail: `Revised (v${item.version} → v${version}): ${r.note}\n— previous body —\n${item.body}`, version }],
  }
}

/** Past its review date and not yet looked at: STALE, with the fact recorded. */
export function staleness(item: KnowledgeItem, now = Date.now()): KnowledgeItem {
  if (item.status !== 'CURRENT' && item.status !== 'WATCH' && item.status !== 'REVIEW REQUIRED') return item
  if (now < item.review_due) return item
  return { ...item, status: 'STALE', history: [...item.history, { at: now, event: 'stale', detail: `Not reviewed since ${new Date(item.last_reviewed).toISOString()}; the conclusion is not assumed to still hold.`, version: item.version }] }
}

/**
 * The decay monitor's transitions. Each is a status change with the flags that
 * caused it written into history; none removes anything. WATCH is reachable
 * only from CURRENT; REVIEW REQUIRED from CURRENT or WATCH; CONTRADICTED from
 * any open status except CONTRADICTED itself, because a hard contradiction is
 * stronger information than age. A closed item (SUPERSEDED, RETIRED) is left
 * alone — it has already been decided.
 */
export function decayed(item: KnowledgeItem, to: 'WATCH' | 'REVIEW REQUIRED' | 'CONTRADICTED', reasons: string[], now = Date.now()): KnowledgeItem {
  if (!OPEN_STATUSES.includes(item.status)) return item
  if (item.status === to) return item
  if (to === 'WATCH' && item.status !== 'CURRENT') return item
  if (to === 'REVIEW REQUIRED' && item.status !== 'CURRENT' && item.status !== 'WATCH') return item
  const event: KnowledgeHistory['event'] = to === 'WATCH' ? 'watch' : to === 'CONTRADICTED' ? 'contradicted' : 'review'
  return { ...item, status: to, history: [...item.history, { at: now, event, detail: `${to}: ${reasons.join('; ')}`, version: item.version }] }
}

export function superseded(item: KnowledgeItem, byId: string, now = Date.now()): KnowledgeItem {
  return { ...item, status: 'SUPERSEDED', links: [...new Set([...item.links, byId])], history: [...item.history, { at: now, event: 'superseded', detail: `Superseded by ${byId}.`, version: item.version }] }
}

// ---------------------------------------------------------------
// The store
// ---------------------------------------------------------------

const PREFIX = 'knowledge:'

/**
 * A stored value is a knowledge item only if it has the shape of one. A row
 * that does not (a truncated write, a hand edit, an older schema) is left in
 * place — never deleted — and skipped by every reader, and counted as corrupt
 * in the summary so the gap is visible instead of silently absent.
 */
export function isKnowledgeItem(x: unknown): x is KnowledgeItem {
  if (!x || typeof x !== 'object') return false
  const it = x as Partial<KnowledgeItem>
  return typeof it.id === 'string' && typeof it.kind === 'string' && typeof it.title === 'string' && typeof it.body === 'string' && typeof it.status === 'string'
    && Array.isArray(it.tags) && Array.isArray(it.history) && Array.isArray(it.links) && typeof it.created_at === 'number' && typeof it.version === 'number'
    && !!it.provenance && typeof it.provenance === 'object'
}

export function getItem(id: string): KnowledgeItem | null {
  const raw = store().getJson<unknown>(PREFIX + id)
  return isKnowledgeItem(raw) ? raw : null
}

/** Rows under the knowledge prefix that are not readable as items. Kept, listed, never deleted. */
export function corruptItems(): string[] {
  const out: string[] = []
  for (const key of store().keysWithPrefix(PREFIX)) if (!isKnowledgeItem(store().getJson<unknown>(key))) out.push(key.slice(PREFIX.length))
  return out
}

export function saveItem(item: KnowledgeItem): KnowledgeItem {
  store().setJson(PREFIX + item.id, item)
  return item
}

export function addItem(input: NewItem): KnowledgeItem {
  const item = makeItem(input)
  const prior = getItem(item.id)
  if (prior) return prior // the same event recorded twice is one record
  return saveItem(item)
}

export function listItems(filter: { kind?: KnowledgeKind; status?: KnowledgeStatus; tag?: string } = {}): KnowledgeItem[] {
  const out: KnowledgeItem[] = []
  for (const key of store().keysWithPrefix(PREFIX)) {
    const it = store().getJson<unknown>(key)
    if (!isKnowledgeItem(it)) continue
    if (filter.kind && it.kind !== filter.kind) continue
    if (filter.status && it.status !== filter.status) continue
    if (filter.tag && !it.tags.includes(filter.tag)) continue
    out.push(it)
  }
  return out.sort((a, b) => b.created_at - a.created_at)
}

export function recordEvidence(id: string, e: { contradictory: boolean; detail: string; now?: number }): KnowledgeItem | null {
  const it = getItem(id)
  return it ? saveItem(withEvidence(it, e)) : null
}

export function reviewItem(id: string, r: ReviewOutcome, now = Date.now()): KnowledgeItem | null {
  const it = getItem(id)
  return it ? saveItem(reviewed(it, r, now)) : null
}

/** Expire overdue items into STALE. Returns what changed. Meant for the daily review. */
export function sweepStale(now = Date.now()): KnowledgeItem[] {
  const changed: KnowledgeItem[] = []
  for (const it of listItems()) {
    const next = staleness(it, now)
    if (next !== it) changed.push(saveItem(next))
  }
  return changed
}

/** What the vault remembers, by kind and status — including what did not work. */
export function vaultSummary(): { total: number; byKind: Record<string, number>; byStatus: Record<string, number>; dueForReview: number; failed: number; corrupt: number } {
  const items = listItems()
  const byKind: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const it of items) { byKind[it.kind] = (byKind[it.kind] ?? 0) + 1; byStatus[it.status] = (byStatus[it.status] ?? 0) + 1 }
  return {
    total: items.length, byKind, byStatus, corrupt: corruptItems().length,
    dueForReview: items.filter((i) => i.status === 'REVIEW REQUIRED' || i.status === 'STALE' || i.status === 'CONTRADICTED').length,
    failed: items.filter((i) => i.kind === 'failed-hypothesis' || i.kind === 'counterexample').length,
  }
}
