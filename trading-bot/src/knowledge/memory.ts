/**
 * MR. CASH MEMORY — one index over everything remembered, in eight classes:
 *
 *   MARKET       what the market did (resolved observations, market-wide items)
 *   STRATEGY     what each strategy did (observations, post-mortems, passports)
 *   REGIME       what held in which regime
 *   SESSION      what held in which session
 *   RESEARCH     hypotheses, experiments, research results, reassessments
 *   CASE-STUDY   case studies and their counterexamples
 *   TEACHING     concepts and lessons
 *   FAILURE      what did not work
 *
 * This is an index, not another store. The vault, the hypothesis store, the
 * experiment registry, the observations table and the failure memory each keep
 * their own records; a memory entry points back at the record it came from,
 * with the status and evidence label that record carries. Recall is a text and
 * tag search over the same records. Writing goes through `remember`, which is
 * the vault's `addItem` with the class written into the tags — so a memory is
 * versioned, expires into review, and is never deleted, exactly like any
 * other knowledge item.
 */

import { listObservations } from '../observer/events.ts'
import type { Observation } from '../observer/events.ts'
import { listExperiments } from '../research/experiments.ts'
import type { Experiment } from '../research/experiments.ts'
import { listHypotheses } from '../research/hypotheses.ts'
import type { Hypothesis } from '../research/hypotheses.ts'
import { listFailures } from './failures.ts'
import type { FailureRecord } from './failures.ts'
import { addItem, listItems } from './vault.ts'
import type { KnowledgeItem, KnowledgeStatus, NewItem } from './vault.ts'

export const MEMORY_CLASSES = ['MARKET', 'STRATEGY', 'REGIME', 'SESSION', 'RESEARCH', 'CASE-STUDY', 'TEACHING', 'FAILURE'] as const
export type MemoryClass = (typeof MEMORY_CLASSES)[number]

export type MemoryEntry = {
  class: MemoryClass
  /** Where the record lives. */
  record: 'knowledge' | 'hypothesis' | 'experiment' | 'observation' | 'failure'
  id: string
  title: string
  summary: string
  status: string
  evidenceLabel: string
  source: string
  at: number
  tags: string[]
}

const SESSIONS = new Set(['asia', 'london', 'newYork', 'nyPM'])
const REGIMES = new Set(['trending-up', 'trending-down', 'ranging', 'breakout', 'transition'])
const classTag = (c: MemoryClass) => `memory:${c.toLowerCase()}`

/** Which classes a knowledge item belongs to — by kind, then by tags. An item may be in several. Pure. */
export function classifyItem(it: KnowledgeItem): MemoryClass[] {
  const out = new Set<MemoryClass>()
  for (const c of MEMORY_CLASSES) if (it.tags.includes(classTag(c))) out.add(c)
  switch (it.kind) {
    case 'concept': out.add('TEACHING'); break
    case 'lesson': out.add(it.tags.some((t) => /^(win|loss|flat|loss-on-full-checklist|missed|unreadable)$/.test(t)) ? 'STRATEGY' : 'TEACHING'); break
    case 'case-study': out.add('CASE-STUDY'); break
    case 'counterexample': out.add('CASE-STUDY'); out.add('FAILURE'); break
    case 'research-result': case 'hypothesis': case 'reassessment': out.add('RESEARCH'); break
    case 'strategy-observation': out.add('STRATEGY'); break
    case 'regime-observation': out.add('REGIME'); break
    case 'session-observation': out.add('SESSION'); break
    case 'data-quality-warning': out.add(it.tags.includes('failure') ? 'FAILURE' : 'MARKET'); break
    case 'failed-hypothesis': out.add('FAILURE'); break
  }
  if (it.tags.some((t) => REGIMES.has(t))) out.add('REGIME')
  if (it.tags.some((t) => SESSIONS.has(t))) out.add('SESSION')
  if (!out.size) out.add('MARKET')
  return [...out]
}

function fromItem(it: KnowledgeItem, cls: MemoryClass): MemoryEntry {
  return { class: cls, record: 'knowledge', id: it.id, title: it.title, summary: it.body.split('\n')[0].slice(0, 240), status: it.status, evidenceLabel: it.evidenceLabel, source: it.provenance.source, at: it.created_at, tags: it.tags }
}
function fromHypothesis(h: Hypothesis): MemoryEntry {
  return { class: 'RESEARCH', record: 'hypothesis', id: h.id, title: h.question, summary: h.hypothesis.slice(0, 240), status: h.status, evidenceLabel: 'HYPOTHESIS', source: h.dataset.source, at: h.created, tags: [h.strategy ?? '', h.session ?? '', h.regime ?? ''].filter(Boolean) }
}
function fromExperiment(e: Experiment): MemoryEntry {
  return { class: 'RESEARCH', record: 'experiment', id: e.experimentId, title: e.method, summary: `${e.kind} on ${e.strategyId}, ${e.source}; result ${e.result}${e.robustnessResult ? `, robustness ${e.robustnessResult.verdict}` : ''}.`, status: e.status === 'DONE' ? e.result : e.status, evidenceLabel: e.source === 'PAPER' ? 'OBSERVED' : 'SIMULATED', source: e.source, at: e.createdAt, tags: [e.strategyId, e.kind] }
}
function fromObservation(o: Observation, cls: MemoryClass): MemoryEntry {
  return { class: cls, record: 'observation', id: o.id, title: `${o.type} · ${new Date(o.time).toISOString().slice(0, 16).replace('T', ' ')}`, summary: o.detail.slice(0, 240), status: o.status, evidenceLabel: 'OBSERVED', source: 'ENGINE', at: o.time, tags: [o.type.toLowerCase().replace(/\s+/g, '-'), ...(o.session ? [o.session] : []), ...(o.regime ? [o.regime] : [])] }
}
function fromFailure(f: FailureRecord): MemoryEntry {
  return { class: 'FAILURE', record: 'failure', id: f.id, title: f.title, summary: f.lesson.slice(0, 240), status: f.kind, evidenceLabel: f.sampleSize ? 'OBSERVED' : 'INSUFFICIENT DATA', source: f.source, at: f.at, tags: f.tags }
}

const OBS_CLASS: Partial<Record<Observation['type'], MemoryClass>> = {
  'REGIME CHANGE': 'REGIME', 'VOLATILITY CHANGE': 'REGIME', 'SESSION CHANGE': 'SESSION',
  'STRATEGY ACTIVATION': 'STRATEGY', 'STRATEGY REJECTION': 'STRATEGY', 'RISK VETO': 'STRATEGY', 'PAPER ENTRY': 'STRATEGY', 'PAPER EXIT': 'STRATEGY', 'UNUSUAL MAE': 'STRATEGY', 'UNUSUAL MFE': 'STRATEGY',
}

/** Everything in one class, newest first. Observations enter MARKET (and REGIME / SESSION / STRATEGY by type) only once they are selected or resolved; the raw stream stays in the observer. */
export function memory(cls: MemoryClass, opts: { limit?: number; status?: KnowledgeStatus; tag?: string } = {}): { class: MemoryClass; entries: MemoryEntry[]; total: number; note: string } {
  const entries: MemoryEntry[] = []
  for (const it of listItems({ status: opts.status, tag: opts.tag })) if (classifyItem(it).includes(cls)) entries.push(fromItem(it, cls))
  if (cls === 'RESEARCH' && !opts.status) {
    for (const h of listHypotheses()) entries.push(fromHypothesis(h))
    for (const e of listExperiments()) entries.push(fromExperiment(e))
  }
  if (cls === 'FAILURE' && !opts.status) for (const f of listFailures()) if (!entries.some((e) => e.id === f.vaultItemId)) entries.push(fromFailure(f))
  if ((cls === 'MARKET' || cls === 'REGIME' || cls === 'SESSION' || cls === 'STRATEGY') && !opts.status) {
    for (const o of listObservations({ minSignificance: 50, limit: 300 })) {
      const c = OBS_CLASS[o.type] ?? 'MARKET'
      if (c === cls) entries.push(fromObservation(o, c))
    }
  }
  const filtered = opts.tag ? entries.filter((e) => e.tags.includes(opts.tag!)) : entries
  filtered.sort((a, b) => b.at - a.at)
  return { class: cls, entries: filtered.slice(0, opts.limit ?? 100), total: filtered.length, note: filtered.length ? `${filtered.length} ${cls} memor${filtered.length === 1 ? 'y' : 'ies'}; each points at the record it came from and carries that record's status.` : `No ${cls} memories yet.` }
}

/** Text search across every class: every word must appear in the title, summary or tags. */
export function recall(query: string, opts: { limit?: number; classes?: MemoryClass[] } = {}): { query: string; entries: MemoryEntry[]; note: string } {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
  if (!words.length) return { query, entries: [], note: 'A recall needs at least one word.' }
  const seen = new Set<string>()
  const out: MemoryEntry[] = []
  for (const cls of opts.classes ?? MEMORY_CLASSES) {
    for (const e of memory(cls, { limit: 1000 }).entries) {
      const key = `${e.record}:${e.id}`
      if (seen.has(key)) continue
      const hay = `${e.title} ${e.summary} ${e.tags.join(' ')}`.toLowerCase()
      if (words.every((w) => hay.includes(w))) { seen.add(key); out.push(e) }
    }
  }
  out.sort((a, b) => b.at - a.at)
  return { query, entries: out.slice(0, opts.limit ?? 50), note: out.length ? `${out.length} record(s) mention "${query}". A recall is a lookup; it ranks by recency, not by result.` : `Nothing on record mentions "${query}".` }
}

export function memorySummary(): { classes: Array<{ class: MemoryClass; total: number; byStatus: Record<string, number> }>; total: number; note: string } {
  const classes = MEMORY_CLASSES.map((cls) => {
    const m = memory(cls, { limit: 100000 })
    const byStatus: Record<string, number> = {}
    for (const e of m.entries) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1
    return { class: cls, total: m.total, byStatus }
  })
  const total = classes.reduce((s, c) => s + c.total, 0)
  return { classes, total, note: `${total} memories across ${MEMORY_CLASSES.length} classes (an item can sit in more than one). FAILURE memory is ${classes.find((c) => c.class === 'FAILURE')?.total ?? 0} of them.` }
}

/** The write path: a knowledge item with its class in the tags. Same rules as every item — versioned, reviewed, never deleted. */
export function remember(cls: MemoryClass, input: Omit<NewItem, 'tags'> & { tags?: string[] }): KnowledgeItem {
  return addItem({ ...input, tags: [...(input.tags ?? []), classTag(cls)] })
}
