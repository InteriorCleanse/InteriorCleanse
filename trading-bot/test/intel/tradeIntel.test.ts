/**
 * Trade intelligence (Phase 22F/22G/22L/22N).
 *
 * The contract: every "why" and "why not" line comes from a reason the ENGINE
 * recorded — a strategy evidence step, a fusion confirm/invalidate, or a risk
 * check. Rejection categories are derived from the rule that actually blocked,
 * never guessed. And a paper trade's stages must say PAPER at every fill.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { whyTrade, whyNot, tradeStages } from '../../src/intel/tradeIntel.ts'
import { strategyLayers, agreement, confluenceChain } from '../../src/intel/confluence.ts'
import { diffFrames, describeDelta } from '../../src/intel/delta.ts'
import { makeAnnotation } from '../../src/intel/types.ts'
import type { ChartAnnotation } from '../../src/intel/types.ts'
import type { StrategyVote, StrategyMeta } from '../../src/strategies/types.ts'
import type { FusedDecision } from '../../src/fusion.ts'
import type { RiskVerdict } from '../../src/riskEngine.ts'

const NOW = 1_700_000_000_000

function vote(o: Partial<StrategyVote> & { id: string }): StrategyVote {
  return {
    action: 'HOLD', direction: null, confidence: 0, reason: 'r', evidence: [], setupKey: `k.${o.id}`,
    ...o,
  } as StrategyVote
}
function meta(id: string, o: Partial<StrategyMeta> = {}): StrategyMeta {
  return { id, name: id, family: 'session', summary: 's', needsTape: false, ...o }
}
function decision(o: Partial<FusedDecision> = {}): FusedDecision {
  return {
    action: 'NO TRADE', direction: null, score: 10, confirms: [], invalidates: [], contributors: [],
    reason: 'r', regime: 'ranging', enterScore: 60, ...o,
  } as FusedDecision
}
function risk(o: Partial<RiskVerdict> = {}): RiskVerdict {
  return { approved: true, action: 'BUY', reason: 'ok', quantity: 1, positionValueUsd: 1, riskUsd: 1, checks: [], vetoedBy: null, ...o }
}

test('why-this-trade collects the engine\'s own evidence, fusion lines and risk checks', () => {
  const v = vote({ id: 'session-ifvg', action: 'BUY', direction: 'long', confidence: 70, reason: 'sweep then inversion', evidence: [{ step: 'Liquidity sweep', passed: true, detail: 'Asia low raided' }, { step: 'Killzone', passed: true, detail: 'London open' }] })
  const w = whyTrade({ vote: v, decision: decision({ action: 'LONG', direction: 'long', confirms: ['session model agrees'] }), risk: risk({ checks: [{ rule: 'Exposure', passed: true, detail: 'nothing open' }] }) })
  assert.equal(w.exists, true)
  assert.equal(w.direction, 'long')
  assert.ok(w.reasons.some((r) => r.label === 'Liquidity sweep' && r.group === 'liquidity' && r.passed))
  assert.ok(w.reasons.some((r) => r.group === 'confluence' && r.detail === 'session model agrees'))
  assert.ok(w.reasons.some((r) => r.group === 'risk' && r.label === 'Exposure'))
  assert.equal(w.engineReason, 'sweep then inversion')
})

test('a risk veto is the primary rejection, and names the rule that blocked', () => {
  const n = whyNot({
    vote: vote({ id: 's', action: 'BUY', direction: 'long' }),
    decision: decision({ action: 'LONG', direction: 'long' }),
    risk: risk({ approved: false, vetoedBy: 'Kill switch', reason: 'entries are stopped', checks: [{ rule: 'Kill switch', passed: false, detail: 'engaged' }] }),
  })
  assert.equal(n.rejected, true)
  assert.equal(n.primary?.category, 'risk-veto')
  assert.equal(n.primary?.source, 'risk-engine')
  assert.match(n.primary!.detail, /Kill switch/)
  assert.ok(n.categories.includes('risk-veto'))
})

test('veto names map onto the right category', () => {
  const mk = (vetoedBy: string) => whyNot({ vote: null, decision: null, risk: risk({ approved: false, vetoedBy, reason: 'x' }) }).primary?.category
  assert.equal(mk('Exposure'), 'duplicate-exposure')
  assert.equal(mk('Fresh data'), 'insufficient-data')
  assert.equal(mk('Drawdown'), 'risk-veto')
})

test('a failing evidence step is categorised from the step itself', () => {
  const n = whyNot({
    vote: vote({ id: 's', evidence: [{ step: 'Killzone', passed: false, detail: 'outside the window' }, { step: 'Regime', passed: false, detail: 'ranging, not a breakout' }] }),
    decision: null, risk: null,
  })
  assert.ok(n.categories.includes('session-restriction'))
  assert.ok(n.categories.includes('regime-mismatch'))
  assert.ok(n.reasons.some((r) => r.label === 'Killzone' && !r.passed))
})

test('an unavailable required feature is reported as exactly that', () => {
  const n = whyNot({ vote: null, decision: null, risk: null, unavailableFeatures: ['order-flow-momentum needs the live tape, which is unavailable.'] })
  assert.ok(n.categories.includes('unavailable-required-feature'))
  assert.equal(n.primary?.category, 'unavailable-required-feature')
  assert.equal(n.primary?.source, 'feature-engine')
})

test('agreement below the enter threshold is insufficient confluence, and disagreement is named', () => {
  const votes = [
    vote({ id: 'a', action: 'BUY', direction: 'long' }),
    vote({ id: 'b', action: 'SELL', direction: 'short' }),
  ]
  const n = whyNot({ vote: votes[0], votes, decision: decision({ score: 30, enterScore: 60, regime: 'ranging' }), risk: null })
  assert.ok(n.categories.includes('insufficient-confluence'))
  assert.ok(n.categories.includes('strategy-disagreement'))
  assert.match(n.reasons.find((r) => r.label === 'Strategies disagree')!.detail, /1 strategy\(ies\) lean long and 1 lean short/)
})

test('with no setup at all, nothing is invented', () => {
  const n = whyNot({ vote: null, decision: null, risk: null })
  assert.deepEqual(n.categories, ['no-setup'])
  assert.equal(n.rejected, false, 'a quiet market is not a rejection')
})

test('strategy layers expose readiness and what each is waiting for', () => {
  const votes = [
    vote({ id: 'a', action: 'BUY', direction: 'long', confidence: 80, evidence: [{ step: 'X', passed: true, detail: '' }, { step: 'Y', passed: true, detail: '' }] }),
    vote({ id: 'b', evidence: [{ step: 'Retest', passed: false, detail: 'not yet' }, { step: 'Sweep', passed: true, detail: 'done' }] }),
  ]
  const metas = new Map([['a', meta('a')], ['b', meta('b', { needsTape: true })]])
  const layers = strategyLayers(votes, metas)
  assert.equal(layers[0].id, 'a')
  assert.equal(layers[0].readiness, 1)
  const b = layers.find((l) => l.id === 'b')!
  assert.equal(b.readiness, 0.5)
  assert.equal(b.missing[0].step, 'Retest')
  assert.equal(b.needsTape, true)
})

test('disagreement with the fused direction is surfaced, never hidden', () => {
  const votes = [vote({ id: 'a', action: 'BUY', direction: 'long' }), vote({ id: 'b', action: 'SELL', direction: 'short' })]
  const ag = agreement(votes, decision({ action: 'LONG', direction: 'long' }))
  assert.deepEqual(ag.disagreeing, ['b'])
  assert.equal(ag.contested, true)
  assert.match(ag.note, /vote the other way/)

  const united = agreement([votes[0]], decision({ action: 'LONG', direction: 'long' }))
  assert.equal(united.contested, false)
})

test('the confluence chain pictures the fusion decision and never recomputes it', () => {
  const d = decision({ action: 'LONG', direction: 'long', score: 72, enterScore: 60, regime: 'trending-up', confirms: ['Liquidity was swept below the Asia low'], invalidates: [] })
  const chain = confluenceChain({
    votes: [vote({ id: 'session-ifvg', action: 'BUY', direction: 'long' })],
    decision: d, metaById: new Map([['session-ifvg', meta('session-ifvg')]]),
    orderFlowAvailable: false, orderFlowNote: 'the stream is down',
  })
  assert.equal(chain.decision!.score, 72, 'the score must be the fusion engine\'s own')
  assert.equal(chain.links.find((l) => l.key === 'liquidity')!.supports, true)
  const flow = chain.links.find((l) => l.key === 'order-flow')!
  assert.equal(flow.supports, null)
  assert.match(flow.detail, /UNAVAILABLE/)
  assert.match(chain.note, /not a second opinion/)
})

test('an ingredient the engine said nothing about is "not stated", not "against"', () => {
  const chain = confluenceChain({
    votes: [], decision: decision({ action: 'NO TRADE', confirms: [], invalidates: [] }), metaById: new Map(),
    orderFlowAvailable: true, orderFlowNote: 'ok',
  })
  assert.equal(chain.links.find((l) => l.key === 'imbalance')!.supports, null)
})

test('the delta reports appearances and lifecycle moves, and the first frame is a baseline', () => {
  const base = { symbol: 'B', timeframe: '5m', engineVersion: 'v', source: 'fvg-tracker' as const, layer: 'imbalance' as const, dataQuality: 'REAL' as const }
  const a1 = makeAnnotation({ ...base, annotationType: 'fvg-bullish', eventTime: 1000, knownAt: 1000, priceHigh: 10, priceLow: 9, rationale: 'gap', lifecycleStatus: 'ACTIVE' }, NOW)
  const a2 = makeAnnotation({ ...base, annotationType: 'fvg-bullish', eventTime: 1000, knownAt: 1000, priceHigh: 10, priceLow: 9, rationale: 'gap', lifecycleStatus: 'MITIGATED' }, NOW)
  const other = makeAnnotation({ ...base, annotationType: 'fvg-bearish', eventTime: 2000, knownAt: 2000, priceHigh: 12, priceLow: 11, rationale: 'gap2', lifecycleStatus: 'ACTIVE' }, NOW)

  assert.equal(diffFrames(null, [a1], 1000).changes.length, 0)
  const appeared = diffFrames([a1], [a1, other], 2000)
  assert.equal(appeared.counts.appeared, 1)
  assert.equal(appeared.changes[0].id, other.id)

  // Same id, new lifecycle → a lifecycle change, not a new object.
  assert.equal(a1.id, a2.id, 'lifecycle must not be part of the id')
  const moved = diffFrames([a1], [a2], 3000)
  assert.equal(moved.counts.lifecycle, 1)
  assert.equal(moved.changes[0].from, 'ACTIVE')
  assert.equal(moved.changes[0].to, 'MITIGATED')

  const gone = diffFrames([a1, other], [a1], 4000)
  assert.equal(gone.counts.disappeared, 1)
  assert.match(describeDelta(diffFrames(null, [], 1))[0], /No change/)
})

test('a paper trade\'s stages are labelled PAPER at every step, and a missed fill says so', () => {
  const filled = tradeStages({
    id: 't1', openedAt: 1000, filledAt: 1300, closedAt: 2000, setupKey: 'BTCUSDT|5m|ICT|london|long',
    direction: 'long', intendedEntry: 100, entry: 100.2, stop: 99, target: 103, quantity: 1, riskUsd: 1,
    exitReason: 'target', exit: 103, rMultiple: 2.3, candlesHeld: 5, status: 'closed',
  })
  assert.deepEqual(filled.map((s) => s.stage), ['SETUP FORMED', 'CONDITIONS CONFIRMED', 'SIGNAL', 'RISK CHECK', 'ENTRY', 'MANAGEMENT', 'EXIT'])
  assert.ok(filled.every((s) => s.paper === true), 'every stage must be marked paper')
  assert.match(filled.find((s) => s.stage === 'ENTRY')!.detail, /PAPER fill/)
  assert.match(filled.find((s) => s.stage === 'EXIT')!.detail, /PAPER only — no money moved/)

  const missed = tradeStages({
    id: 't2', openedAt: 1000, closedAt: 1100, setupKey: 'k', direction: 'long', intendedEntry: 100,
    entry: 100, stop: 99, target: 103, quantity: 0, riskUsd: 0, exitReason: 'missed', status: 'closed', note: 'price ran away',
  })
  assert.equal(missed.find((s) => s.stage === 'ENTRY')!.at, null, 'a missed order has no fill time')
  assert.match(missed.find((s) => s.stage === 'ENTRY')!.detail, /NOT FILLED — price ran away/)
  assert.match(missed.find((s) => s.stage === 'EXIT')!.detail, /MISSED/)
})
