/**
 * The narrator's contract, offline: the context carries every number the
 * narration may use, the deterministic narration follows the five-section
 * format and cites nothing outside the context, and the validator rejects a
 * missing section or a foreign number. No AI key, no network.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNarrationContext, numbersIn } from '../../src/ai/context.ts'
import { NARRATION_SECTIONS, NARRATOR_SYSTEM, buildNarrationPrompt, deterministicNarration, narrate, validateNarration } from '../../src/ai/narrator.ts'
import type { FusedDecision } from '../../src/fusion.ts'
import type { RiskVerdict } from '../../src/riskEngine.ts'

function decision(action: FusedDecision['action']): FusedDecision {
  return {
    action,
    direction: action.startsWith('LONG') ? 'long' : action.startsWith('SHORT') ? 'short' : null,
    score: 72,
    confirms: ['3 of 4 strategies back the long side', 'regime is trending-up'],
    invalidates: ['a close back below the day VWAP would cancel it'],
    contributors: [],
    reason: 'The panel leans long with a score of 72.',
    regime: null,
    enterScore: 60,
  }
}
function risk(approved: boolean): RiskVerdict {
  return { approved, action: approved ? 'BUY' : 'SKIP', reason: approved ? 'sized to 0.5% risk' : 'daily loss limit hit', quantity: 0.1, positionValueUsd: 100, riskUsd: 5, checks: [], vetoedBy: approved ? null : 'dailyLoss' }
}

test('the context carries every number the deterministic narration uses', () => {
  const ctx = buildNarrationContext({ price: 65000, features: null, decision: decision('LONG WATCH'), risk: risk(true) })
  const text = deterministicNarration(ctx)
  const allowed = new Set(ctx.numbers)
  const foreign = [...new Set(numbersIn(text))].filter((n) => !allowed.has(n) && ![0, 1, 2, 3, 4, 5].includes(n))
  assert.deepEqual(foreign, [], `narration cited numbers not in the context: ${foreign}`)
})

test('the deterministic narration follows the five-section format and validates', () => {
  const ctx = buildNarrationContext({ price: 65000, features: null, decision: decision('LONG WATCH'), risk: risk(true) })
  const text = deterministicNarration(ctx)
  for (const s of NARRATION_SECTIONS) assert.ok(text.includes(`## ${s}`), `missing section ${s}`)
  assert.equal(validateNarration(text, ctx).valid, true)
})

test('the validator rejects an answer missing a section', () => {
  const ctx = buildNarrationContext({ price: 65000, features: null, decision: decision('NO TRADE'), risk: null })
  const missing = ['## Market read', '## What confirms', '## What invalidates', '## Current decision'].join('\n\nx\n\n') // no "Why not yet"
  const v = validateNarration(missing, ctx)
  assert.equal(v.valid, false)
  assert.deepEqual(v.missingSections, ['Why not yet'])
})

test('the validator rejects a number that is not in the context', () => {
  const ctx = buildNarrationContext({ price: 65000, features: null, decision: decision('NO TRADE'), risk: null })
  const withForeign = NARRATION_SECTIONS.map((s) => `## ${s}\nsomething 99999 here`).join('\n')
  const v = validateNarration(withForeign, ctx)
  assert.equal(v.valid, false)
  assert.ok(v.foreignNumbers.includes(99999))
})

test('the system rules pin the format and forbid invented numbers', () => {
  for (const s of NARRATION_SECTIONS) assert.ok(NARRATOR_SYSTEM.includes(s), `system prompt should name section ${s}`)
  assert.match(NARRATOR_SYSTEM, /ONLY the facts and numbers in the CONTEXT/i)
  assert.match(NARRATOR_SYSTEM, /never decide, size, or approve/i)
})

test('the prompt hands over the context facts and the decision after risk', () => {
  const ctx = buildNarrationContext({ price: 65000, features: null, decision: decision('LONG'), risk: risk(false) })
  const prompt = buildNarrationPrompt(ctx)
  assert.match(prompt, /Decision after risk: NO TRADE/) // an actionable long, vetoed by risk
  assert.match(prompt, /Price: \$65000/)
})

test('narrate falls back to the deterministic narration when the AI throws (refusal/unavailable)', async () => {
  const ctx = buildNarrationContext({ price: 65000, features: null, decision: decision('LONG WATCH'), risk: risk(true) })
  const n = await narrate(ctx, async () => { throw new Error('refused') })
  assert.equal(n.source, 'deterministic')
  assert.equal(n.valid, true)
})

test('narrate rejects an AI answer that breaks the format and falls back', async () => {
  const ctx = buildNarrationContext({ price: 65000, features: null, decision: decision('LONG WATCH'), risk: risk(true) })
  const n = await narrate(ctx, async () => 'just a paragraph, no sections, and the number 42424')
  assert.equal(n.source, 'deterministic')
})

test('narrate keeps a well-formed AI answer', async () => {
  const ctx = buildNarrationContext({ price: 65000, features: null, decision: decision('LONG WATCH'), risk: risk(true) })
  const good = deterministicNarration(ctx) // a valid answer by construction
  const n = await narrate(ctx, async () => good)
  assert.equal(n.source, 'ai')
  assert.equal(n.valid, true)
})
