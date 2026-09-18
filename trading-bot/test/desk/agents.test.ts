/**
 * THE DESK — six agents, and none of them allowed to bluff.
 *
 * The failure mode of a dense trading dashboard is looking certain while its
 * feeds are dead: six panels of confident numbers, three of them stale or
 * fabricated, and nothing on screen admitting it. These tests exist to make
 * that failure impossible rather than unlikely.
 *
 * So they check the unglamorous half: that a blind agent says it is blind,
 * names what it is waiting on, and shows an em dash instead of a zero; that
 * the floor verdict is the fused action AFTER the veto chain rather than
 * before it; and that the desk cannot reach the order path at all.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../helpers.ts'
import { buildDesk, bookAgent, trustScore, renderDesk } from '../../src/desk/agents.ts'
import type { DeskInput, DeskAgent } from '../../src/desk/agents.ts'

function feature<T>(value: T | null, over: Record<string, unknown> = {}): never {
  return { value, available: value !== null, source: value === null ? 'none' : 'trades', asOf: 1_700_000_000_000, approximate: false, note: '', ...over } as never
}

function features(over: Record<string, unknown> = {}): never {
  return {
    version: 1, index: 5, openTime: 0, closeTime: 0, price: 30000, asOf: 1_700_000_000_000, dayKey: 'D', session: 'newYork',
    atr: feature(2), volatility: feature({ label: 'normal', ratio: 1 }), regime: feature({ state: 'trending-up', confidence: 70, reasons: ['higher highs'] }),
    tape: { exact: true, note: '' },
    flow: {
      delta: feature({ delta: 120 }), cvd: feature({ cvd: 900 }), bookImbalance: feature({ imbalance: 0.31 }),
      stream: { trusted: true, trustedSince: 1 },
    },
    ...over,
  } as never
}

function input(over: Partial<DeskInput> = {}): DeskInput {
  return {
    now: 1_700_000_060_000, symbol: 'BTCUSDT', interval: '5m',
    features: features(),
    votes: [{ action: 'BUY' } as never, { action: 'HOLD' } as never],
    decision: { action: 'LONG', direction: 'long', score: 72, confirms: ['Structure agrees.'], invalidates: [], contributors: [{ name: 'Silver bullet' }], reason: 'ok' } as never,
    risk: null,
    structure: { swings: 8, orderBlocks: 3, fvgs: 2, sweeps: 1, bias: 'bullish' },
    validation: { verdict: 'INSUFFICIENT SAMPLE', metCount: 0, total: 9, trades: 0, decaying: 0, retired: 0 },
    ...over,
  }
}

test('a blind BOOK agent says so, names what it needs, and shows no number', () => {
  const blind = bookAgent(input({ features: features({ flow: { delta: feature(null), cvd: feature(null), bookImbalance: feature(null), stream: { trusted: false, trustedSince: null } } }) }))
  assert.equal(blind.status, 'BLIND')
  assert.equal(blind.headline, '—', 'a blind agent must not show a number')
  assert.equal(blind.provenance, 'UNAVAILABLE')
  assert.match(blind.waitingOn ?? '', /stream/)
  for (const r of blind.rows) {
    assert.notEqual(r.value, '0', 'a missing reading must render as an em dash, never as a zero')
  }
})

test('a live BOOK agent carries REAL provenance and its age', () => {
  const live = bookAgent(input())
  assert.equal(live.status, 'LIVE')
  assert.equal(live.provenance, 'REAL')
  assert.equal(live.headline, '+0.310')
  assert.equal(live.ageSec, 60, 'the desk must show how old the reading is')
  assert.equal(live.waitingOn, null)
})

test('a candle-derived reading is PARTIAL, not LIVE — an estimate is never dressed as a tape read', () => {
  const partial = bookAgent(input({
    features: features({ flow: {
      delta: feature({ delta: 5 }), cvd: feature({ cvd: 10 }),
      bookImbalance: feature({ imbalance: 0.2 }, { source: 'candles', approximate: true }),
      stream: { trusted: true, trustedSince: 1 },
    } }),
  }))
  assert.equal(partial.status, 'PARTIAL')
  assert.equal(partial.provenance, 'APPROXIMATE')
})

test('trust is the share of the floor that can see, and PROOF is excluded from it', () => {
  const mk = (id: string, status: string): DeskAgent => ({ id, status } as never)
  assert.equal(trustScore([mk('book', 'LIVE'), mk('tape', 'LIVE'), mk('signal', 'LIVE'), mk('risk', 'LIVE'), mk('regime', 'LIVE')]), 100)
  assert.equal(trustScore([mk('book', 'BLIND'), mk('tape', 'LIVE'), mk('signal', 'LIVE'), mk('risk', 'LIVE'), mk('regime', 'LIVE')]), 80)
  assert.equal(trustScore([mk('book', 'PARTIAL'), mk('tape', 'LIVE'), mk('signal', 'LIVE'), mk('risk', 'LIVE'), mk('regime', 'LIVE')]), 90)
  // PROOF saying "no track record yet" is a different kind of ignorance from a
  // dead feed, and must not move the "can the desk see" number.
  assert.equal(
    trustScore([mk('book', 'LIVE'), mk('tape', 'LIVE'), mk('signal', 'LIVE'), mk('risk', 'LIVE'), mk('regime', 'LIVE'), mk('proof', 'WAITING')]),
    100,
  )
})

test('the floor verdict is the fused action AFTER the veto chain, not before it', () => {
  const vetoed = buildDesk(input({
    risk: { approved: false, vetoedBy: 'Kill switch', reason: 'The kill switch is on.', checks: [{ rule: 'Kill switch', passed: false, detail: 'on' }], quantity: 0, riskUsd: 0 } as never,
  }))
  assert.equal(vetoed.floor.verdict, 'VETOED', 'a LONG the risk chain refused must not read as LONG on the floor')
  assert.match(vetoed.floor.verdictDetail, /Kill switch/)

  const cleared = buildDesk(input({
    risk: { approved: true, vetoedBy: null, reason: 'ok', checks: [{ rule: 'Kill switch', passed: true, detail: '' }], quantity: 0.25, riskUsd: 0.1 } as never,
  }))
  assert.equal(cleared.floor.verdict, 'LONG')
})

test('an unchecked proposal is labelled unchecked rather than shown as a decision', () => {
  const d = buildDesk(input({ risk: null }))
  assert.match(d.floor.verdict, /UNCHECKED/)
})

test('PROOF carries the validation verdict onto the floor, so the desk cannot look proven', () => {
  const d = buildDesk(input())
  const proof = d.agents.find((a) => a.id === 'proof')!
  assert.equal(proof.headline, 'INSUFFICIENT SAMPLE')
  assert.equal(proof.status, 'WAITING')
  assert.match(proof.detail, /Nothing on this desk is evidence of an edge/i)
  assert.equal(d.floor.evidence, 'INSUFFICIENT SAMPLE')
  // And the whole desk is always explicit about being paper.
  assert.equal(d.mode, 'PAPER')
  assert.equal(d.liveTradingEnabled, false)
})

test('the desk always ships six agents and renders without inventing anything', () => {
  const d = buildDesk(input({ features: null, decision: null, risk: null, structure: null, validation: null }))
  assert.equal(d.agents.length, 6)
  assert.deepEqual(d.agents.map((a) => a.id), ['book', 'tape', 'signal', 'risk', 'regime', 'proof'])
  // With nothing readable, every market-watching agent must be blind and the
  // trust score must say so rather than defaulting to something reassuring.
  assert.equal(d.floor.trust <= 20, true, `trust was ${d.floor.trust} with no data at all`)
  const text = renderDesk(d)
  assert.match(text, /THE DESK/)
  assert.match(text, /TRUST: \d+\/100/)
  assert.match(text, /does not decide anything/)
})

/**
 * THE VISUALISATION LAYER MUST NEVER BECOME A SECOND TRADING ENGINE.
 *
 * The same rule Phase 22 put on the intelligence layer applies here: the desk
 * reports state and nothing else. It must not be able to place, size, shape or
 * veto an order, and the cheapest way to keep that true is to make it unable to
 * reach the code that could.
 */
test('the desk cannot reach the order path, the executor, or anything that mutates a position', () => {
  const src = readFileSync(join(ROOT, 'src', 'desk', 'agents.ts'), 'utf8')
  const forbidden = [
    'live/trader', 'live/orders', 'live/reconcile', 'exchange/binanceTrade', 'execution.ts',
    'openPosition', 'closeManually', 'savePosition', 'appendLedgerRow', 'writePlan',
  ]
  for (const f of forbidden) {
    assert.equal(src.includes(f), false, `src/desk/agents.ts references "${f}" — the desk must stay read-only`)
  }
  // Positive: it is allowed to read types and the day key, nothing that acts.
  assert.match(src, /READ-ONLY/)
})
