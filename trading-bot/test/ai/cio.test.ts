/**
 * The CIO reports the fused decision after risk — exactly. It never invents a
 * side and never overrides the engine.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cioDecision } from '../../src/ai/cio.ts'
import type { FusedDecision } from '../../src/fusion.ts'

function decision(action: FusedDecision['action']): FusedDecision {
  return { action, direction: action.startsWith('LONG') ? 'long' : action.startsWith('SHORT') ? 'short' : null, score: 70, confirms: [], invalidates: [], contributors: [], reason: `panel says ${action}`, regime: null, enterScore: 60 }
}

test('an actionable side that risk approves stays actionable', () => {
  const c = cioDecision(decision('LONG'), { approved: true, reasons: [] })
  assert.equal(c.action, 'LONG')
  assert.equal(c.blockedByRisk, false)
})

test('an actionable side that risk vetoes becomes NO TRADE', () => {
  const c = cioDecision(decision('SHORT'), { approved: false, reasons: ['daily loss limit hit'] })
  assert.equal(c.action, 'NO TRADE')
  assert.equal(c.blockedByRisk, true)
  assert.match(c.reason, /daily loss limit hit/)
})

test('a WATCH passes through unchanged regardless of risk', () => {
  assert.equal(cioDecision(decision('LONG WATCH'), { approved: false, reasons: ['x'] }).action, 'LONG WATCH')
  assert.equal(cioDecision(decision('SHORT WATCH'), null).action, 'SHORT WATCH')
})

test('NO TRADE and a null decision both report NO TRADE', () => {
  assert.equal(cioDecision(decision('NO TRADE'), { approved: true, reasons: [] }).action, 'NO TRADE')
  assert.equal(cioDecision(null, null).action, 'NO TRADE')
})

test('the reported decision only differs from the fused action when risk vetoes an actionable side', () => {
  for (const a of ['LONG', 'SHORT', 'LONG WATCH', 'SHORT WATCH', 'NO TRADE'] as const) {
    const approved = cioDecision(decision(a), { approved: true, reasons: [] })
    assert.equal(approved.action, a, `approved risk must not change ${a}`)
    const vetoed = cioDecision(decision(a), { approved: false, reasons: ['veto'] })
    const expected = a === 'LONG' || a === 'SHORT' ? 'NO TRADE' : a
    assert.equal(vetoed.action, expected, `vetoed risk on ${a}`)
  }
})
