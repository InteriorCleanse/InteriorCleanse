/**
 * THE AI TEACHER — bounded by construction.
 *
 * The teacher answers a question about a lesson, a case study or the current
 * market debate. It may only use what is in its context: the lesson's
 * sections, the case's frames, the debate's points and the engine's decision.
 * Its answer is validated before it is shown:
 *
 *   - every paragraph cites a context item it rests on: [[section:heading]],
 *     [[case:id]] or [[debate:BULL|BEAR|NEUTRAL|JUDGE]]; an unknown citation
 *     rejects the whole answer;
 *   - every number in the answer must appear in the context;
 *   - it may not state or imply a decision different from the engine's;
 *   - it may not use the banned quality, direction or causal words;
 *   - it may not use PROVEN / GUARANTEED / CERTAIN / BEST / PERFECT / FAIL-PROOF.
 *
 * A rejected answer is replaced by the deterministic one, with the problems
 * listed. An unavailable model gets the deterministic one too. The teacher
 * never creates, modifies or recommends a trade. Same pattern as the
 * explainer in intel/explain.ts and the narrator in analyst/narrate.ts.
 */

import { numbersIn } from '../ai/context.ts'
import { BANNED_CAUSAL, BANNED_DIRECTION, BANNED_QUALITY } from '../analyst/narrate.ts'
import { BANNED_WORDS } from '../research/hypotheses.ts'
import type { CaseStudy } from './caseStudies.ts'
import { renderDebate } from './debate.ts'
import type { MarketDebate } from './debate.ts'
import type { Lesson } from './lessons.ts'

export type TeacherContext = {
  question: string
  lesson?: Lesson | null
  caseStudy?: CaseStudy | null
  debate?: MarketDebate | null
  /** The engine's current decision, when the question is about now. */
  engineDecision?: string | null
}

export type TeacherAnswer = {
  text: string
  source: 'ai' | 'deterministic'
  valid: boolean
  problems: string[]
  citations: string[]
  note: string
}

export const TEACHER_SYSTEM = [
  'You are the Market School teacher for a paper-trading research system. You teach how THIS engine reads the market; you do NOT make trading decisions, recommend trades, or predict direction.',
  'Use only the context you are given. Every paragraph must end with a citation to the context item it rests on: [[section:<heading>]], [[case:<id>]] or [[debate:BULL]], [[debate:BEAR]], [[debate:NEUTRAL]], [[debate:JUDGE]].',
  'Every number you write must appear in the context. Never invent a figure, a probability or a win rate.',
  'Never state a decision different from the engine\'s. If the engine says NO TRADE, do not suggest a trade.',
  'Never use the words proven, guaranteed, certain, best, perfect or fail-proof. Never say bullish/bearish, go long/short, or "because of" as a causal claim.',
  'If the context does not contain what is needed, say NOT ENOUGH DATA and stop.',
].join('\n')

const CITATION = /\[\[(section|case|debate):([^\]]+)\]\]/g
/** The same pattern without the global flag — `RegExp.test` on a /g pattern carries state between calls. */
const HAS_CITATION = /\[\[(section|case|debate):([^\]]+)\]\]/

/** Everything the teacher was given, as one string, so verbatim quotes of it can be recognised. */
function contextText(ctx: TeacherContext): string {
  const parts: string[] = []
  for (const s of ctx.lesson?.sections ?? []) parts.push(s.body)
  for (const t of ctx.lesson?.tally ?? []) parts.push(t.note)
  if (ctx.caseStudy) parts.push(ctx.caseStudy.during.detail, ctx.caseStudy.after.note, ctx.caseStudy.decision.note, ctx.caseStudy.title)
  if (ctx.debate) parts.push(renderDebate(ctx.debate))
  return parts.join('\n')
}

/**
 * The answer with its verbatim quotes of the context removed. The curriculum
 * text legitimately says "bullish gap" or "the best-of-N result"; quoting it is
 * not a claim. Only the teacher's OWN sentences are held to the banned lists.
 */
function novelText(text: string, ctx: TeacherContext): string {
  const context = contextText(ctx)
  const sentences = text.replace(CITATION, '').split(/(?<=[.!?])\s+|\n+/)
  return sentences.filter((sen) => { const t = sen.trim(); return t.length > 0 && !context.includes(t) }).join(' ')
}

export function extractTeacherCitations(text: string): Array<{ kind: string; ref: string }> {
  return [...text.matchAll(CITATION)].map((m) => ({ kind: m[1], ref: m[2].trim() }))
}

function contextNumbers(ctx: TeacherContext): Set<string> {
  const out = new Set<string>()
  const add = (s: string) => { for (const n of numbersIn(s)) { out.add(String(n)); out.add(n.toFixed(2)); out.add(n.toFixed(1)); out.add(String(Math.round(n))) } }
  for (const s of ctx.lesson?.sections ?? []) add(s.body)
  for (const t of ctx.lesson?.tally ?? []) add(t.note)
  if (ctx.caseStudy) { add(ctx.caseStudy.during.detail); add(ctx.caseStudy.after.note); add(ctx.caseStudy.decision.note); add(String(ctx.caseStudy.before.price)) }
  if (ctx.debate) add(renderDebate(ctx.debate))
  return out
}

export function validateTeacherAnswer(text: string, ctx: TeacherContext): { valid: boolean; problems: string[]; citations: string[] } {
  const problems: string[] = []
  const headings = new Set((ctx.lesson?.sections ?? []).map((s) => s.heading))
  const cites = extractTeacherCitations(text)
  if (!cites.length && !/NOT ENOUGH DATA/.test(text)) problems.push('no citation to the context')
  for (const c of cites) {
    if (c.kind === 'section' && !headings.has(c.ref)) problems.push(`cites section "${c.ref}" which is not in the lesson`)
    if (c.kind === 'case' && c.ref !== ctx.caseStudy?.id) problems.push(`cites case "${c.ref}" which is not in the context`)
    if (c.kind === 'debate' && (!ctx.debate || !['BULL', 'BEAR', 'NEUTRAL', 'JUDGE'].includes(c.ref))) problems.push(`cites debate side "${c.ref}" which is not in the context`)
  }
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  for (const p of paragraphs) if (!HAS_CITATION.test(p) && !/NOT ENOUGH DATA/.test(p)) { problems.push(`a paragraph carries no citation: "${p.slice(0, 60)}…"`); break }
  const allowed = contextNumbers(ctx)
  // Figures and banned words are judged on the teacher's own sentences; verbatim quotes of the context are the context.
  const stripped = novelText(text, ctx)
  for (const n of numbersIn(stripped)) {
    if (!allowed.has(String(n)) && !allowed.has(n.toFixed(2)) && !allowed.has(n.toFixed(1))) { problems.push(`the figure ${n} is not in the context`); break }
  }
  const m = stripped.match(BANNED_WORDS); if (m) problems.push(`uses the banned word "${m[0]}"`)
  const q = stripped.match(BANNED_QUALITY); if (q) problems.push(`makes a quality claim: "${q[0]}"`)
  const d = stripped.match(BANNED_DIRECTION); if (d) problems.push(`states a direction: "${d[0]}"`)
  const c = stripped.match(BANNED_CAUSAL); if (c) problems.push(`makes a causal claim: "${c[0]}"`)
  const engine = ctx.engineDecision ?? ctx.debate?.judge.engineDecision ?? null
  if (engine) {
    const mentioned = stripped.match(/\b(LONG WATCH|SHORT WATCH|NO TRADE|LONG|SHORT)\b/g) ?? []
    for (const x of mentioned) if (x !== engine && !new RegExp(`engine (?:says|decided|decision is) ${engine}`).test(stripped)) { problems.push(`mentions ${x} while the engine's decision is ${engine}`); break }
  }
  if (/\b(you should|I recommend|take the trade|enter (?:a )?(?:long|short)|buy now|sell now)\b/i.test(stripped)) problems.push('recommends an action')
  return { valid: problems.length === 0, problems, citations: cites.map((x) => `${x.kind}:${x.ref}`) }
}

/** The answer that needs no model: the lesson's own sections, cited. */
export function deterministicTeaching(ctx: TeacherContext): string {
  const parts: string[] = []
  if (ctx.lesson) {
    for (const s of ctx.lesson.sections.slice(0, 3)) parts.push(`${s.heading}: ${s.body.split('\n')[0]} [[section:${s.heading}]]`)
  }
  if (ctx.caseStudy) parts.push(`${ctx.caseStudy.during.detail} ${ctx.caseStudy.after.note} [[case:${ctx.caseStudy.id}]]`)
  if (ctx.debate) parts.push(`The engine's decision is ${ctx.debate.judge.engineDecision}. ${ctx.debate.judge.reason} [[debate:JUDGE]]`)
  if (!parts.length) return 'NOT ENOUGH DATA — nothing in the context to teach from.'
  return parts.join('\n\n')
}

export function buildTeacherPrompt(ctx: TeacherContext): string {
  const lines = [`QUESTION: ${ctx.question}`, '']
  if (ctx.lesson) { lines.push(`LESSON: ${ctx.lesson.title}`); for (const s of ctx.lesson.sections) lines.push(`[[section:${s.heading}]] (${s.evidenceLabel}; ${s.provenance})\n${s.body}`) }
  if (ctx.caseStudy) lines.push(`[[case:${ctx.caseStudy.id}]] ${ctx.caseStudy.title}\nBEFORE: ${ctx.caseStudy.before.annotations.length} annotation(s) as of ${new Date(ctx.caseStudy.before.asOf).toISOString()}\nDURING: ${ctx.caseStudy.during.detail}\nDECISION: ${ctx.caseStudy.decision.note}\nAFTER: ${ctx.caseStudy.after.note}`)
  if (ctx.debate) lines.push(`DEBATE:\n${renderDebate(ctx.debate)}`)
  if (ctx.engineDecision) lines.push(`ENGINE DECISION: ${ctx.engineDecision}`)
  return lines.join('\n')
}

export async function teach(ctx: TeacherContext, ai?: (prompt: string, system: string) => Promise<string>): Promise<TeacherAnswer> {
  const fallback = deterministicTeaching(ctx)
  if (!ai) return { text: fallback, source: 'deterministic', valid: true, problems: [], citations: extractTeacherCitations(fallback).map((c) => `${c.kind}:${c.ref}`), note: 'No model available; the lesson\'s own text, cited.' }
  let text: string
  try { text = await ai(buildTeacherPrompt(ctx), TEACHER_SYSTEM) } catch (err) {
    return { text: fallback, source: 'deterministic', valid: true, problems: [`model error: ${(err as Error).message}`], citations: [], note: 'The model failed; the lesson\'s own text is shown.' }
  }
  const v = validateTeacherAnswer(text, ctx)
  if (v.valid) return { text, source: 'ai', valid: true, problems: [], citations: v.citations, note: 'Model answer, validated against the context: every figure and citation checked, no decision or direction stated.' }
  return { text: fallback, source: 'deterministic', valid: true, problems: v.problems, citations: extractTeacherCitations(fallback).map((c) => `${c.kind}:${c.ref}`), note: 'The model\'s answer was rejected by the validator and replaced with the lesson\'s own text.' }
}
