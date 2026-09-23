/**
 * The market narrator. It says what the quantitative engine already knows, in
 * one fixed shape, every time:
 *
 *   Market read → What confirms → What invalidates → Current decision → Why not yet
 *
 * The "Current decision" is never the narrator's own — it is the CIO's, which
 * is the fused decision after risk. The narrator may quote only the numbers in
 * the context; a validator enforces both the shape and that rule, and there is
 * a deterministic narration that always satisfies them, so the feature works
 * with no AI key and offline.
 */

import type { NarrationContext } from './context.ts'
import { numbersIn } from './context.ts'
import { cioDecision, decisionLabel } from './cio.ts'

/** The five sections, in order. The whole contract of a narration. */
export const NARRATION_SECTIONS = ['Market read', 'What confirms', 'What invalidates', 'Current decision', 'Why not yet'] as const
export type NarrationSection = (typeof NARRATION_SECTIONS)[number]

const header = (s: NarrationSection) => `## ${s}`

/** The system rules that pin the format and the no-invention rule for the AI path. */
export const NARRATOR_SYSTEM = [
  'ACTIVE SKILL — Market Narrator.',
  'You explain what the engine already computed. You never decide, size, or approve a trade.',
  'Answer in EXACTLY these five sections, each under its "## " header, in this order:',
  NARRATION_SECTIONS.map((s) => `  ## ${s}`).join('\n'),
  'Rules: use ONLY the facts and numbers in the CONTEXT. Do not introduce any number that is not in the context. The "Current decision" section must state the decision exactly as CONTEXT gives it (the fused decision after risk); never override it. Keep each section to a few plain sentences.',
].join('\n')

/** Build the AI prompt: the required format, then the context as ground truth. */
export function buildNarrationPrompt(ctx: NarrationContext): string {
  const lines: string[] = []
  lines.push('CONTEXT — the engine\'s current reading (the only market information you have):')
  lines.push('')
  for (const f of ctx.facts) lines.push(`- ${f.label}: ${f.value}`)
  const call = cioDecision(ctx.decision, ctx.risk)
  lines.push('')
  lines.push(`- Decision after risk: ${decisionLabel(call)} — ${call.reason}`)
  if (ctx.decision) {
    if (ctx.decision.confirms.length) lines.push(`- Confirms: ${ctx.decision.confirms.join('; ')}`)
    if (ctx.decision.invalidates.length) lines.push(`- Invalidates / missing: ${ctx.decision.invalidates.join('; ')}`)
  }
  lines.push('')
  lines.push('Write the five sections now.')
  return lines.join('\n')
}

/** The always-available narration, built only from the context — no AI, no invented numbers. */
export function deterministicNarration(ctx: NarrationContext): string {
  const call = cioDecision(ctx.decision, ctx.risk)
  const out: string[] = []

  out.push(header('Market read'))
  out.push(ctx.facts.map((f) => `${f.label}: ${f.value}.`).join(' '))

  out.push('', header('What confirms'))
  out.push(ctx.decision && ctx.decision.confirms.length ? ctx.decision.confirms.map((c) => `- ${c}`).join('\n') : 'Nothing is confirming a trade right now.')

  out.push('', header('What invalidates'))
  out.push(ctx.decision && ctx.decision.invalidates.length ? ctx.decision.invalidates.map((c) => `- ${c}`).join('\n') : 'No specific invalidation is on the table beyond a change in the read above.')

  out.push('', header('Current decision'))
  out.push(`${decisionLabel(call)}. ${call.reason}`)

  out.push('', header('Why not yet'))
  if (call.action === 'LONG' || call.action === 'SHORT') {
    out.push('The conditions are met on paper. This is a paper decision only — no order is placed by the narrator.')
  } else if (call.blockedByRisk && ctx.risk) {
    out.push(`Risk is holding it back: ${ctx.risk.reasons.join('; ') || 'a risk rule vetoed it'}.`)
  } else if (ctx.decision && ctx.decision.invalidates.length) {
    out.push(`Still missing: ${ctx.decision.invalidates.join('; ')}.`)
  } else {
    out.push('The panel does not agree strongly enough for a trade yet.')
  }
  return out.join('\n')
}

export type NarrationValidation = {
  valid: boolean
  missingSections: NarrationSection[]
  foreignNumbers: number[]
}

/**
 * Check a narration follows the contract: every section present, in text, and
 * no number that is not in the context (a small set of always-allowed integers
 * aside). Used to reject a stray AI answer and fall back to the deterministic one.
 */
export function validateNarration(text: string, ctx: NarrationContext): NarrationValidation {
  const missingSections = NARRATION_SECTIONS.filter((s) => !text.includes(header(s)))
  const allowed = new Set<number>([...ctx.numbers, 0, 1, 2, 3, 4, 5]) // 0–5 cover section numbering and trivial counts
  const foreignNumbers = [...new Set(numbersIn(text))].filter((n) => !allowed.has(n))
  return { valid: missingSections.length === 0 && foreignNumbers.length === 0, missingSections, foreignNumbers }
}

export type Narration = { text: string; source: 'ai' | 'deterministic'; valid: boolean; validation: NarrationValidation }

/**
 * Produce a narration. If an AI function is supplied and its answer passes the
 * validator, use it; otherwise fall back to the deterministic narration (which
 * always passes). The AI function is injected so this stays pure and testable.
 */
export async function narrate(ctx: NarrationContext, ai?: (prompt: string, system: string) => Promise<string>): Promise<Narration> {
  const fallback = deterministicNarration(ctx)
  if (!ai) return { text: fallback, source: 'deterministic', valid: true, validation: validateNarration(fallback, ctx) }
  try {
    const answer = await ai(buildNarrationPrompt(ctx), NARRATOR_SYSTEM)
    const validation = validateNarration(answer, ctx)
    if (validation.valid) return { text: answer, source: 'ai', valid: true, validation }
    return { text: fallback, source: 'deterministic', valid: true, validation }
  } catch {
    return { text: fallback, source: 'deterministic', valid: true, validation: validateNarration(fallback, ctx) }
  }
}
