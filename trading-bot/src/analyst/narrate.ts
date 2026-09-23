/**
 * THE ANALYST NARRATOR — every sentence traceable to a row, or not said.
 *
 * The narrator summarises evidence. It never generates a signal, never
 * overrides risk, never invents a number, never infers a cause, and never
 * describes a small sample as an edge. The way that is enforced is not a
 * system prompt — it is a validator that every sentence passes through, AI
 * or not:
 *
 *   1. Every claim must cite the cohort or dataset it is about, in the form
 *      [[cohort:<name>]] or [[dataset:<SOURCE>]]. A citation to something not
 *      in the context rejects the text.
 *   2. Every number in a claim — "+0.30R", "18 trades", "53.7%" — must be a
 *      number the cited cohort actually holds. A figure that matches nothing
 *      rejects the text. This is the hallucination check, and it is a check on
 *      digits, not on tone.
 *   3. No quality word (profitable, edge, proven, guaranteed), no direction
 *      word (go long, bullish), no causal word (because, caused, due to). A
 *      correlation is not a cause and the narrator is not allowed to pretend.
 *   4. Zero trades is the sentence "NOT ENOUGH DATA" and nothing else.
 *
 * The deterministic narrator is the fallback and the reference: whatever an AI
 * writes has to survive the same validator, and if it does not, the reader
 * gets the deterministic text with the problems listed.
 */

import type { Cohort } from './cohorts.ts'
import type { Dataset } from './records.ts'
import type { Thesis } from './thesis.ts'

export type NarrationContext = {
  dataset: Dataset
  cohorts: Cohort[]
  theses?: Thesis[]
}

export type Claim = { text: string; citations: string[] }

export type Narration = {
  source: 'deterministic' | 'ai'
  provenance: string
  notEnoughData: boolean
  summary: string
  claims: Claim[]
  valid: boolean
  problems: string[]
}

const fx = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}`

// ---------------------------------------------------------------
// Validation — the part that makes the narrator safe to have
// ---------------------------------------------------------------

export const BANNED_QUALITY = /\b(profitable|high[- ]edge|edge confirmed|proven|guaranteed|certain(?:ly)?|best (?:strategy|session|setup)|will (?:make|work|continue|profit)|fail-?proof|perfect)\b/i
export const BANNED_DIRECTION = /\b(go long|go short|buy the|sell the|short it|long it|bullish|bearish|will rally|will drop|expect (?:a )?(?:rally|drop|pump|dump))\b/i
export const BANNED_CAUSAL = /\b(because of|caused by|due to|explains why|is why|drives|driven by|thanks to|as a result of)\b/i

export function extractCitations(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/\[\[((?:cohort|dataset|thesis):[^\]]+)\]\]/g)) out.add(m[1])
  return [...out]
}

/** The numbers a cohort is allowed to be described with, as the strings a sentence would print. */
export function allowedFigures(c: Cohort): Set<string> {
  const s = c.stats
  const out = new Set<string>()
  out.add(String(s.n))
  if (s.meanR !== null) { out.add(fx(s.meanR)); out.add(s.meanR.toFixed(2)) }
  if (s.medianR !== null) { out.add(fx(s.medianR)); out.add(s.medianR.toFixed(2)) }
  if (s.sdR !== null) out.add(s.sdR.toFixed(2))
  if (s.ci95) { out.add(fx(s.ci95.lo)); out.add(fx(s.ci95.hi)) }
  if (s.winRate !== null) out.add((s.winRate * 100).toFixed(1))
  out.add(String(s.wins)); out.add(String(s.losses)); out.add(String(s.flat))
  out.add(s.maxDrawdownR.toFixed(2))
  if (s.profitFactor !== null) out.add(s.profitFactor.toFixed(2))
  if (s.tradesNeeded !== null) out.add(String(s.tradesNeeded))
  if (s.mae.meanR !== null) out.add(fx(s.mae.meanR))
  if (s.mfe.meanR !== null) out.add(fx(s.mfe.meanR))
  return out
}

/** The numbers a thesis may be described with: its horizon, its threshold, and its cohort's observation. */
export function allowedThesisFigures(t: Thesis): Set<string> {
  const out = new Set<string>([String(t.n)])
  if (t.meanR !== null) out.add(fx(t.meanR))
  if (t.ci95) { out.add(fx(t.ci95.lo)); out.add(fx(t.ci95.hi)) }
  if (t.falsification) { out.add(String(t.falsification.nextTrades)); out.add(fx(t.falsification.meanThresholdR)) }
  return out
}

/** Numbers as a sentence prints them: signed R, percentages, plain counts. */
function figuresIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/[+−-]?\d+(?:\.\d+)?/g)) {
    const raw = m[0].replace('−', '-')
    out.push(raw)
  }
  return out
}

export function validateNarration(text: string, ctx: NarrationContext): { valid: boolean; problems: string[]; citations: string[] } {
  const problems: string[] = []
  const citations = extractCitations(text)
  const byName = new Map(ctx.cohorts.map((c) => [`cohort:${c.name}`, c]))
  const known = new Set<string>([...byName.keys(), `dataset:${ctx.dataset.provenance.source}`, ...(ctx.theses ?? []).map((t) => `thesis:${t.cohort}`)])

  if (!text.trim()) problems.push('Empty narration.')
  for (const c of citations) if (!known.has(c)) problems.push(`Cites something not in the evidence: ${c}`)
  if (BANNED_QUALITY.test(text)) problems.push(`Uses a quality word: "${text.match(BANNED_QUALITY)![0]}"`)
  if (BANNED_DIRECTION.test(text)) problems.push(`Calls a direction: "${text.match(BANNED_DIRECTION)![0]}"`)
  if (BANNED_CAUSAL.test(text)) problems.push(`Asserts a cause: "${text.match(BANNED_CAUSAL)![0]}"`)

  // A citation covers everything written since the previous citation. Text is
  // cut into segments at each citation group; every figure in a segment must be
  // one the segment's cited cohort, thesis or dataset actually holds. A segment
  // with figures and no citation is an unsourced claim.
  const p = ctx.dataset.provenance
  const datasetFigures = new Set([String(p.trades), String(p.missed), String(p.corrupt)])
  const byThesis = new Map((ctx.theses ?? []).map((t) => [`thesis:${t.cohort}`, t]))
  const segments: string[] = []
  const re = /[\s\S]*?(?:\[\[[^\]]+\]\]\s*)+/g
  let last = 0
  for (const m of text.matchAll(re)) { segments.push(m[0]); last = m.index! + m[0].length }
  if (last < text.length) segments.push(text.slice(last))
  for (const seg of segments) {
    const cites = extractCitations(seg)
    let body = seg.replace(/\[\[[^\]]+\]\]/g, '')
    // The interval's confidence level is a label, not a claim about the cohort.
    body = body.replace(/95%\s*(?:interval|level)/gi, '')
    // A cohort's own name may carry digits ("08:00", "80–100"); it is a name, not a figure.
    for (const c of cites) { const co = byName.get(c); if (co) body = body.split(co.name).join(' ') }
    const figs = figuresIn(body)
    if (!figs.length) continue
    if (!cites.length) { problems.push(`A number appears without a citation: "${seg.trim()}"`); continue }
    const allowed = new Set<string>()
    for (const c of cites) {
      if (c.startsWith('dataset:')) for (const f of datasetFigures) allowed.add(f)
      const co = byName.get(c); if (co) for (const f of allowedFigures(co)) allowed.add(f)
      const th = byThesis.get(c); if (th) for (const f of allowedThesisFigures(th)) allowed.add(f)
    }
    for (const f of figs) {
      const variants = [f, f.replace(/^\+/, ''), f.startsWith('-') || f.startsWith('+') ? f : `+${f}`]
      if (!variants.some((v) => allowed.has(v))) problems.push(`"${f}" is not a figure the cited evidence holds (${cites.join(', ')}).`)
    }
  }
  return { valid: problems.length === 0, problems, citations }
}

// ---------------------------------------------------------------
// The deterministic narrator
// ---------------------------------------------------------------

/** Compose a claim about one cohort using only its own figures. */
export function claimFor(c: Cohort): Claim {
  const s = c.stats
  const cite = `[[cohort:${c.name}]]`
  if (s.n === 0) return { text: `${c.name}: NOT ENOUGH DATA — 0 trades. ${cite}`, citations: [`cohort:${c.name}`] }
  const parts = [`${c.name}: ${s.n} ${c.provenance.source} trade${s.n === 1 ? '' : 's'}`]
  if (s.meanR !== null) parts.push(`with a mean of ${fx(s.meanR)}R`)
  if (s.medianR !== null && s.n >= 2) parts.push(`and a median of ${fx(s.medianR)}R`)
  if (s.ci95) parts.push(`(95% interval ${fx(s.ci95.lo)}R to ${fx(s.ci95.hi)}R)`)
  if (s.winRate !== null) parts.push(`, win rate ${(s.winRate * 100).toFixed(1)}% over ${s.wins} wins and ${s.losses} losses`)
  parts.push(`. Sample status: ${s.status}.`)
  return { text: `${parts.join(' ').replace(/\s+,/g, ',').replace(/\s+\./g, '.')} ${cite}`, citations: [`cohort:${c.name}`] }
}

export function narrateEvidence(ctx: NarrationContext): Narration {
  const p = ctx.dataset.provenance
  const provenance = p.label
  if (p.trades === 0) {
    const summary = `NOT ENOUGH DATA. 0 ${p.source} trades on record. [[dataset:${p.source}]]`
    const v = validateNarration(summary, ctx)
    return { source: 'deterministic', provenance, notEnoughData: true, summary, claims: [], valid: v.valid, problems: v.problems }
  }
  const claims = ctx.cohorts.filter((c) => c.stats.n > 0).map(claimFor)
  const empties = ctx.cohorts.filter((c) => c.stats.n === 0).length
  const summaryParts = [
    `${p.trades} ${p.source} trade${p.trades === 1 ? '' : 's'} on record (${p.dataType}). [[dataset:${p.source}]]`,
    ...claims.map((c) => c.text),
  ]
  if (empties) summaryParts.push(`${empties} cohort${empties === 1 ? ' has' : 's have'} no trades yet and ${empties === 1 ? 'is' : 'are'} not described. [[dataset:${p.source}]]`)
  for (const t of ctx.theses ?? []) {
    if (t.status !== 'NOT ESTABLISHED') summaryParts.push(`Thesis for ${t.cohort}: ${t.status}; ${t.wouldFalsify} [[thesis:${t.cohort}]] [[cohort:${t.cohort}]]`)
  }
  const summary = summaryParts.join(' ')
  const v = validateNarration(summary, ctx)
  return { source: 'deterministic', provenance, notEnoughData: false, summary, claims, valid: v.valid, problems: v.problems }
}

// ---------------------------------------------------------------
// The AI path — same validator, deterministic fallback
// ---------------------------------------------------------------

export const NARRATOR_SYSTEM = [
  'You summarise trading EVIDENCE for the operator of a deterministic engine.',
  'You do NOT make trading decisions, produce signals, size positions or judge risk.',
  'You may ONLY state figures that appear in the evidence given to you, and every sentence containing a figure must cite its cohort as [[cohort:<name>]].',
  'Never use the words profitable, edge, proven, guaranteed, best, or any direction word. Never say "because" — a correlation is not a cause.',
  'If a cohort has fewer than 10 trades, say its status and nothing about its result.',
  'If there are no trades, write exactly: NOT ENOUGH DATA.',
].join('\n')

export function buildNarratorPrompt(ctx: NarrationContext): string {
  const L: string[] = []
  L.push(`DATASET: ${ctx.dataset.provenance.label}`)
  for (const c of ctx.cohorts) {
    const s = c.stats
    L.push(`COHORT "${c.name}": n=${s.n} status=${s.status} meanR=${s.meanR === null ? '—' : fx(s.meanR)} medianR=${s.medianR === null ? '—' : fx(s.medianR)} ci95=${s.ci95 ? `${fx(s.ci95.lo)}..${fx(s.ci95.hi)}` : '—'} winRate=${s.winRate === null ? '—' : (s.winRate * 100).toFixed(1) + '%'} wins=${s.wins} losses=${s.losses}`)
  }
  L.push('Write a short summary. Cite every figure. Do not add figures that are not above.')
  return L.join('\n')
}

/** Ask an AI to narrate; if its text fails validation, return the deterministic narration with the problems attached. */
export async function narrateWithAi(ctx: NarrationContext, ai?: (prompt: string, system: string) => Promise<string>): Promise<Narration> {
  const fallback = narrateEvidence(ctx)
  if (!ai || fallback.notEnoughData) return fallback
  let text = ''
  try { text = await ai(buildNarratorPrompt(ctx), NARRATOR_SYSTEM) } catch (err) {
    return { ...fallback, problems: [...fallback.problems, `AI unavailable: ${err instanceof Error ? err.message : String(err)}`] }
  }
  const v = validateNarration(text, ctx)
  if (!v.valid) return { ...fallback, problems: [...fallback.problems, 'AI narration rejected:', ...v.problems] }
  return { source: 'ai', provenance: fallback.provenance, notEnoughData: false, summary: text, claims: fallback.claims, valid: true, problems: [] }
}
