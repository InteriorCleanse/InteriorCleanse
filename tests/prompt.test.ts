import { describe, expect, it } from 'vitest'
import { VOICE_ADDENDUM, systemPrompt } from '@/lib/assistant/prompt'
import { UNTRUSTED_CLOSE, UNTRUSTED_OPEN } from '@/lib/assistant/sanitise'

/**
 * The prompt is not a security control, but it is the default behaviour for
 * the ordinary case — and the rules that keep a demo number from being read
 * as real trading, or a note from being read as a figure, are cheap to pin
 * and expensive to lose in a rewrite.
 */

const base = {
  workspaceName: 'Northwind Supply Co',
  currency: 'GBP',
  isDemo: false,
  userName: 'Ada',
  tenantRole: 'admin',
  canApproveActions: true,
  today: '2026-09-10',
}

describe('system prompt', () => {
  it('names the workspace, the day and the currency', () => {
    const prompt = systemPrompt(base)
    expect(prompt).toContain('Northwind Supply Co')
    expect(prompt).toContain('2026-09-10')
    expect(prompt).toContain('Amounts are in GBP')
  })

  it('says demonstration only for a demonstration workspace', () => {
    expect(systemPrompt(base)).not.toMatch(/DEMONSTRATION/)
    expect(systemPrompt({ ...base, isDemo: true })).toMatch(/DEMONSTRATION workspace/)
  })

  it('separates notes from figures and pipeline from revenue', () => {
    const prompt = systemPrompt(base)
    // A note records an intention; the rule stops a plan's target being quoted
    // as a result.
    expect(prompt).toMatch(/not evidence of what happened/)
    expect(prompt).toMatch(/name the document/)
    // Pipeline is money that has not happened.
    expect(prompt).toMatch(/Never add it to revenue/)
    expect(prompt).toMatch(/never sum deals in different currencies/)
  })

  it('tells the model which tool answers which kind of question', () => {
    const prompt = systemPrompt(base)
    expect(prompt).toMatch(/search_knowledge when asked about policy, plans, decisions/)
    expect(prompt).toMatch(/figures tools when asked what happened/)
  })

  it('marks tool content as data using the same delimiters the sanitiser emits', () => {
    const prompt = systemPrompt(base)
    expect(prompt).toContain(UNTRUSTED_OPEN)
    expect(prompt).toContain(UNTRUSTED_CLOSE)
  })

  it('tells a person who cannot approve who can', () => {
    const viewer = systemPrompt({ ...base, tenantRole: 'viewer', canApproveActions: false })
    expect(viewer).toMatch(/cannot approve actions/)
    expect(viewer).toContain('viewer')
    expect(systemPrompt(base)).not.toMatch(/cannot approve actions/)
  })

  it('keeps the spoken addendum free of screen formatting', () => {
    expect(VOICE_ADDENDUM).toMatch(/No markdown/)
    expect(VOICE_ADDENDUM).not.toMatch(/^\s*[-*] /m)
  })
})
