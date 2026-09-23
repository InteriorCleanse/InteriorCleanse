/**
 * The AI explanation layer (Phase 22M).
 *
 * This is an interface AROUND the deterministic engine, not a second opinion in
 * front of it. Four hard rules, enforced in code rather than promised in a
 * prompt:
 *
 *  1. IT EXPLAINS EXISTING STATE. The context handed to the model is built only
 *     from annotations, engine reasons and risk checks that already exist.
 *  2. IT CANNOT INVENT A SIGNAL. `validateExplanation` rejects any answer that
 *     cites an annotation id not in the supplied context, or that claims a
 *     decision different from the engine's.
 *  3. IT CANNOT OVERRIDE OR MODIFY ANYTHING. There is no write path here — no
 *     risk call, no order call, no settings mutation. The module is pure.
 *  4. ON ANY DOUBT IT FALLS BACK. A rejected answer is replaced by a
 *     deterministic explanation assembled from the same engine facts, which is
 *     always correct because it is just the facts restated.
 *
 * The AI function is injected, so this stays testable offline and the whole
 * layer works with no API key at all.
 */

import type { ChartAnnotation } from './types.ts'
import type { WhyTrade, WhyNot } from './tradeIntel.ts'

/** The questions the panel offers. Each maps to a deterministic context slice. */
export type ExplainTopic =
  | 'why-this-trade'
  | 'why-not-this-setup'
  | 'current-structure'
  | 'who-agrees'
  | 'who-disagrees'
  | 'what-changed'
  | 'active-liquidity'
  | 'explain-annotation'
  | 'current-risk'

export type ExplainContext = {
  topic: ExplainTopic
  symbol: string
  timeframe: string
  /** The engine's decision, verbatim. The answer may not contradict this. */
  engineDecision: string
  /** Every annotation the answer is allowed to cite, by id. */
  annotations: Array<Pick<ChartAnnotation, 'id' | 'annotationType' | 'timeframe' | 'price' | 'priceHigh' | 'priceLow' | 'lifecycleStatus' | 'dataQuality' | 'rationale' | 'strategyIds' | 'eventTime'>>
  /** Engine-recorded facts, already assembled elsewhere. */
  facts: string[]
  whyTrade?: WhyTrade | null
  whyNot?: WhyNot | null
}

export type Explanation = {
  text: string
  source: 'ai' | 'deterministic'
  /** The annotation ids the answer cites. */
  citations: string[]
  valid: boolean
  problems: string[]
}

/** The ids an answer cites, in the `[[id]]` form the prompt asks for. */
export function extractCitations(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/\[\[([A-Za-z0-9._-]+)\]\]/g)) out.add(m[1])
  return [...out]
}

/**
 * Check an answer against the context. Rejects:
 *  - a citation for an annotation that is not in the context (invention);
 *  - a decision word that contradicts the engine's decision (override);
 *  - an empty answer.
 */
export function validateExplanation(text: string, ctx: ExplainContext): { valid: boolean; problems: string[]; citations: string[] } {
  const problems: string[] = []
  const citations = extractCitations(text)
  const known = new Set(ctx.annotations.map((a) => a.id))
  for (const c of citations) if (!known.has(c)) problems.push(`Cites an annotation that is not in the context: ${c}`)
  if (!text.trim()) problems.push('Empty explanation.')

  // The answer may describe the engine's decision but never assert a different one.
  const engine = ctx.engineDecision.toUpperCase()
  const claims = ['LONG', 'SHORT', 'BUY', 'SELL', 'NO TRADE'].filter((w) => new RegExp(`\\b${w}\\b`).test(text.toUpperCase()))
  const contradicts = claims.filter((w) => {
    if (engine.includes(w)) return false
    // A bare mention inside a quoted engine reason is fine; an assertion is not.
    return new RegExp(`(decision|call|signal|verdict|recommend\\w*|should)\\W+\\w*\\W*${w}\\b`, 'i').test(text)
  })
  for (const w of contradicts) problems.push(`Asserts a decision ("${w}") that differs from the engine's ("${ctx.engineDecision}").`)

  return { valid: problems.length === 0, problems, citations }
}

/** The system prompt. It states the boundaries the validator then enforces. */
export const EXPLAINER_SYSTEM = [
  'You explain the decisions of a deterministic trading engine to its operator.',
  'You do NOT make trading decisions, produce signals, size positions or judge risk.',
  'You may ONLY use the facts and annotations supplied in the context.',
  'Never state a decision different from the engine decision given to you.',
  'Cite the annotations you rely on using double brackets, e.g. [[fvg-bullish.abc1234]].',
  'If the context does not contain the answer, say exactly that. Never fill a gap with a guess.',
  'Be concise and concrete. Prices and times come from the context only.',
].join('\n')

/** Build the user prompt from the context. Everything the model sees is engine-derived. */
export function buildExplainPrompt(ctx: ExplainContext): string {
  const lines: string[] = []
  lines.push(`Question topic: ${ctx.topic}`)
  lines.push(`Market: ${ctx.symbol} ${ctx.timeframe}`)
  lines.push(`ENGINE DECISION (authoritative, do not contradict): ${ctx.engineDecision}`)
  lines.push('')
  if (ctx.facts.length) { lines.push('ENGINE FACTS:'); for (const f of ctx.facts) lines.push(`- ${f}`) ; lines.push('') }
  if (ctx.whyTrade) {
    lines.push('WHY THE TRADE EXISTS (engine-recorded):')
    for (const r of ctx.whyTrade.reasons) lines.push(`- [${r.passed ? 'ok' : 'NO'}] (${r.group}) ${r.label}: ${r.detail}`)
    lines.push('')
  }
  if (ctx.whyNot) {
    lines.push(`WHY IT WAS NOT TAKEN (categories: ${ctx.whyNot.categories.join(', ') || 'none'}):`)
    for (const r of ctx.whyNot.reasons) lines.push(`- (${r.group}) ${r.label}: ${r.detail}`)
    lines.push('')
  }
  lines.push('ANNOTATIONS YOU MAY CITE:')
  for (const a of ctx.annotations) {
    const px = a.price !== null ? `$${a.price.toFixed(2)}` : a.priceHigh !== null && a.priceLow !== null ? `$${a.priceLow.toFixed(2)}–$${a.priceHigh.toFixed(2)}` : '—'
    lines.push(`- [[${a.id}]] ${a.annotationType} (${a.timeframe}) ${px} ${a.lifecycleStatus} data:${a.dataQuality} — ${a.rationale}`)
  }
  return lines.join('\n')
}

/**
 * A deterministic explanation built straight from the context. Always valid,
 * because it only restates engine facts and cites only supplied ids. This is
 * both the offline answer and the fallback when an AI answer is rejected.
 */
export function deterministicExplanation(ctx: ExplainContext): string {
  const out: string[] = []
  out.push(`**${ctx.symbol} ${ctx.timeframe} — ${ctx.topic.replace(/-/g, ' ')}**`)
  out.push(`The engine's decision is: ${ctx.engineDecision}.`)
  if (ctx.facts.length) { out.push(''); for (const f of ctx.facts) out.push(`- ${f}`) }

  if (ctx.topic === 'why-this-trade' && ctx.whyTrade) {
    out.push('', 'What the engine recorded in favour:')
    const pass = ctx.whyTrade.reasons.filter((r) => r.passed)
    if (pass.length) for (const r of pass) out.push(`- ${r.label}: ${r.detail}`)
    else out.push('- The engine recorded no passing condition for this state.')
  }
  if (ctx.topic === 'why-not-this-setup' && ctx.whyNot) {
    out.push('', `Not taken. Categories: ${ctx.whyNot.categories.join(', ') || 'none recorded'}.`)
    if (ctx.whyNot.primary) out.push(`Primary blocker (${ctx.whyNot.primary.category}, from ${ctx.whyNot.primary.source}): ${ctx.whyNot.primary.detail}`)
    for (const r of ctx.whyNot.reasons.slice(0, 12)) out.push(`- ${r.label}: ${r.detail}`)
  }

  const cite = ctx.annotations.slice(0, 10)
  if (cite.length) {
    out.push('', 'Based on:')
    for (const a of cite) out.push(`- [[${a.id}]] ${a.annotationType} (${a.timeframe}, ${a.lifecycleStatus}, data ${a.dataQuality}) — ${a.rationale}`)
  } else {
    out.push('', 'No annotations were supplied for this question, so there is nothing further to cite.')
  }
  return out.join('\n')
}

/**
 * Produce an explanation. With no AI function, or when the AI answer fails
 * validation, the deterministic explanation is returned — which is never wrong,
 * because it is only the engine's own facts restated.
 */
export async function explain(ctx: ExplainContext, ai?: (prompt: string, system: string) => Promise<string>): Promise<Explanation> {
  const fallback = deterministicExplanation(ctx)
  const fallbackCheck = validateExplanation(fallback, ctx)
  if (!ai) return { text: fallback, source: 'deterministic', citations: fallbackCheck.citations, valid: true, problems: [] }
  try {
    const answer = await ai(buildExplainPrompt(ctx), EXPLAINER_SYSTEM)
    const check = validateExplanation(answer, ctx)
    if (check.valid) return { text: answer, source: 'ai', citations: check.citations, valid: true, problems: [] }
    return { text: fallback, source: 'deterministic', citations: fallbackCheck.citations, valid: true, problems: check.problems }
  } catch (err) {
    return { text: fallback, source: 'deterministic', citations: fallbackCheck.citations, valid: true, problems: [err instanceof Error ? err.message : String(err)] }
  }
}
