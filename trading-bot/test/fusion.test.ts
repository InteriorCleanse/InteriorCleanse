/**
 * Signal fusion: unanimity scores high and enters; disagreement becomes a
 * WATCH; a strategy disallowed by the regime carries zero weight; a WATCH
 * names what is still missing; and the same votes always give the same
 * decision.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuse, fusedToSignal } from '../src/fusion.ts'
import { regimeWeight } from '../src/fusion/weights.ts'
import type { StrategyMeta, StrategyVote } from '../src/strategies/types.ts'
import type { TradePlan } from '../src/types.ts'

const plan = (dir: 'long' | 'short'): TradePlan => ({ direction: dir, entry: 100, stop: dir === 'long' ? 99 : 101, takeProfit: dir === 'long' ? 102 : 98, rr: 2, entryLabel: '', stopLabel: '', targetLabel: '' })

function vote(id: string, action: 'BUY' | 'SELL' | 'HOLD', confidence = 70, evidence: StrategyVote['evidence'] = []): StrategyVote {
  const direction = action === 'BUY' ? 'long' : action === 'SELL' ? 'short' : null
  return { id, action, direction, confidence, reason: `${id} says ${action}`, evidence, setupKey: id, plan: direction ? plan(direction) : undefined }
}

const META = new Map<string, StrategyMeta>([
  ['session-ifvg', { id: 'session-ifvg', name: 'ICT session model', family: 'session', summary: '', needsTape: false }],
  ['trend-pullback', { id: 'trend-pullback', name: 'Trend pullback', family: 'trend', summary: '', needsTape: false }],
  ['breakout', { id: 'breakout', name: 'Breakout', family: 'breakout', summary: '', needsTape: false }],
  ['mean-reversion', { id: 'mean-reversion', name: 'Mean reversion', family: 'mean-reversion', summary: '', needsTape: false }],
  ['vwap-reclaim', { id: 'vwap-reclaim', name: 'VWAP reclaim', family: 'vwap', summary: '', needsTape: false }],
])

test('unanimity scores high and enters LONG, with the winners named and a plan attached', () => {
  const votes = [vote('session-ifvg', 'BUY', 85), vote('trend-pullback', 'BUY', 80), vote('breakout', 'BUY', 70)]
  const d = fuse({ votes, metaById: META, regime: 'trending-up' })
  assert.equal(d.action, 'LONG')
  assert.equal(d.direction, 'long')
  assert.ok(d.score >= 60, `score ${d.score}`)
  assert.equal(d.confirms.length, 3)
  assert.equal(d.invalidates.length, 0)
  assert.ok(d.plan && d.plan.direction === 'long')
  // The strongest contributor leads.
  assert.equal(d.contributors[0].direction, 'long')
})

test('disagreement becomes a WATCH, not a trade, and lists what argues against it', () => {
  const votes = [vote('session-ifvg', 'BUY', 70), vote('trend-pullback', 'SELL', 70)]
  const d = fuse({ votes, metaById: META, regime: 'trending-up' })
  assert.match(d.action, /WATCH/)
  assert.ok(d.invalidates.length >= 1)
  assert.match(d.invalidates.join(' '), /too much weight|Agreement is only/)
})

test('a strategy the regime disallows carries zero weight and cannot swing the decision', () => {
  // In a trend, mean-reversion is disallowed (weight 0). Its lone SELL must not create a WATCH.
  assert.equal(regimeWeight('mean-reversion', 'trending-up'), 0)
  const votes = [vote('session-ifvg', 'BUY', 80), vote('trend-pullback', 'BUY', 80), vote('mean-reversion', 'SELL', 90)]
  const d = fuse({ votes, metaById: META, regime: 'trending-up' })
  assert.equal(d.action, 'LONG')
  const mr = d.contributors.find((c) => c.id === 'mean-reversion')!
  assert.equal(mr.weight, 0)
  assert.equal(mr.effective, 0)
  assert.ok(!d.invalidates.some((s) => s.includes('Mean reversion')), 'a zero-weight dissenter is not counted against')
})

test('no one wants a trade → NO TRADE, and it names what the session model is waiting on', () => {
  const votes = [vote('session-ifvg', 'HOLD', 0, [{ step: 'Displacement', passed: false, detail: 'no displacement yet' }]), vote('trend-pullback', 'HOLD')]
  const d = fuse({ votes, metaById: META, regime: 'ranging' })
  assert.equal(d.action, 'NO TRADE')
  assert.equal(d.score, 0)
  assert.match(d.invalidates.join(' '), /Displacement.*no displacement yet/)
})

test('a lean that is too weak to act is a WATCH that says what would confirm it', () => {
  // One weak buyer among a large allowed panel → low score → WATCH, and the abstaining session model names its gate.
  const votes = [
    vote('breakout', 'BUY', 30),
    vote('session-ifvg', 'HOLD', 0, [{ step: 'Retest', passed: false, detail: 'price has not returned to the zone' }]),
    vote('trend-pullback', 'HOLD'),
    vote('vwap-reclaim', 'HOLD'),
  ]
  const d = fuse({ votes, metaById: META, regime: 'trending-up' })
  assert.match(d.action, /WATCH/)
  assert.match(d.invalidates.join(' '), /would confirm once: Retest/)
})

test('fusion is deterministic: the same votes give the same decision', () => {
  const votes = [vote('session-ifvg', 'BUY', 80), vote('breakout', 'BUY', 60), vote('trend-pullback', 'SELL', 40)]
  const a = fuse({ votes, metaById: META, regime: 'trending-up' })
  const b = fuse({ votes: [...votes].reverse(), metaById: META, regime: 'trending-up' })
  assert.deepEqual(a, b)
})

test('fusedToSignal turns a LONG into a BUY signal with a plan, and returns null for a WATCH or NO TRADE', () => {
  const d = fuse({ votes: [vote('session-ifvg', 'BUY', 85), vote('trend-pullback', 'BUY', 80)], metaById: META, regime: 'trending-up' })
  const sig = fusedToSignal(d, 100, 123)!
  assert.equal(sig.action, 'BUY')
  assert.ok(sig.plan && sig.plan.direction === 'long')
  assert.match(sig.setupKey, /FUSION\|long/)
  assert.equal(sig.quality, d.score)
  const watch = fuse({ votes: [vote('session-ifvg', 'BUY', 70), vote('trend-pullback', 'SELL', 70)], metaById: META, regime: 'trending-up' })
  assert.equal(fusedToSignal(watch, 100, 1), null)
})
