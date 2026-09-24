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

/**
 * NUMBERS COME FROM THE PAYLOAD, NOT FROM PARSING THE SENTENCE BESIDE THEM.
 *
 * The dashboard recovered the gate tally by running a regex over
 * `evidenceDetail` — a prose string — and paired the result with its own
 * hardcoded total of 9. Two failures in one line: reword the sentence and the
 * progress bar silently reads zero, add a gate and the denominator is silently
 * wrong. It agreed with config on the day it was written, which is exactly how
 * this class of bug survives.
 */
test('the gate tally is on the payload as numbers', () => {
  const d = buildDesk(input({ validation: { verdict: 'INSUFFICIENT SAMPLE', metCount: 3, total: 11, trades: 5, decaying: 1, retired: 0 } }))
  assert.equal(d.floor.gates.met, 3)
  assert.equal(d.floor.gates.total, 11, 'the total must follow config, not a constant in the UI')
  // And it must agree with the sentence, rather than the sentence being the source.
  assert.match(d.floor.evidenceDetail, /^3\/11 /)
})

test('an unreadable validation report reports no gates rather than a fake denominator', () => {
  const d = buildDesk(input({ validation: null }))
  assert.deepEqual(d.floor.gates, { met: 0, total: 0 })
  assert.equal(d.floor.evidence, 'NO EVIDENCE')
})

test('the dashboard never parses numbers back out of prose', () => {
  const js = readFileSync(join(ROOT, 'web', 'js', 'desk.js'), 'utf8')
  assert.equal(
    /evidenceDetail\s*\.\s*match|\.match\(\s*\/\^\(\\d/.test(js), false,
    'desk.js is scraping a figure out of a sentence again — put it on the payload instead',
  )
  assert.equal(
    /const total = \d+/.test(js), false,
    'desk.js has hardcoded a count that belongs to config',
  )
})

/**
 * A LIVE FLOOR HAS TO ACTUALLY BE LIVE — AND HAS TO STOP.
 *
 * The desk loaded once and then sat there. Every panel prints how old its
 * reading is, so a screen left open drifted to "300s old" while presenting
 * itself as a live floor: the numbers stayed honest, the impression did not.
 *
 * The fix has a second half that matters as much as the first. Polling that
 * never stops is how a dashboard earns a reputation for draining batteries, so
 * the timer is cleared when the tab is hidden or navigated away from. Verified
 * in a browser: two polls across 32 seconds while open, zero after leaving.
 */
test('the desk refreshes itself, and stops when nobody is looking', () => {
  const js = readFileSync(join(ROOT, 'web', 'js', 'desk.js'), 'utf8')
  assert.match(js, /setInterval/, 'the desk never refreshes — its "seconds ago" would grow for ever')
  assert.match(js, /clearInterval/, 'a timer with no clearInterval keeps polling a tab nobody is on')
  assert.match(js, /visibilitychange/, 'a hidden tab must stop polling')
  assert.match(js, /visibilityState/, 'the desk must check whether it is actually on screen')
})

/**
 * THE SIGNAL CORE — the moving picture may not know anything the agents do not.
 *
 * The wireframe, the stat strip and the four small charts are drawn from
 * `core`, computed here from the same inputs as the six agents. These tests
 * pin the honesty rules: an unread feed is null (drawn as UNAVAILABLE, never as
 * a zero or a flat line), figures from fewer than ten trades say INSUFFICIENT
 * SAMPLE, the strip is labelled EXPECTANCY and never "edge", and the panel's
 * geometry is the real votes.
 */
test('the signal core: unread feeds are null, an empty record is em dashes, and nothing is called an edge', () => {
  const d = buildDesk(input({ features: features({ flow: { delta: feature(null), cvd: feature(null), bookImbalance: feature(null), stream: { trusted: false, trustedSince: null } } }) }))
  const c = d.core
  assert.equal(c.flow.trusted, false)
  assert.equal(c.flow.imbalance, null)
  assert.equal(c.pulse.perMin, null)
  assert.equal(c.pulse.provenance, 'UNAVAILABLE')
  assert.equal(c.stats.book.value, '—')
  assert.match(c.stats.book.sub, /stream not trusted/)
  for (const s of Object.values(c.stats)) assert.equal(s.value, '—', `${s.label} must be an em dash with no record`)
  assert.equal(c.volume.provenance, 'UNAVAILABLE')
  assert.equal(c.range.high, null)
  assert.deepEqual(c.heat.days, [])
  assert.equal(c.panel.votes.length, 1, 'the panel is the fused contributors when there is a decision')
  assert.equal(c.panel.score, 72)
  const text = JSON.stringify(c).toLowerCase()
  assert.equal(/\bedge\b/.test(text), false, 'the core must never call anything an edge')
  assert.match(c.note, /forecast/i, 'the note must say plainly that the picture is not a forecast')
})

test('the signal core: the stat strip, the small charts and the heat grid are computed from the record and closed candles', () => {
  const T = 1_700_000_000_000
  const candles = Array.from({ length: 120 }, (_, i) => ({ openTime: T + i * 300_000, open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 10 + (i % 7) }))
  const d = buildDesk(input({
    candles,
    paper: { signals: 4, fills: 3, closed: 3, wins: 2, losses: 1, sumR: 1.5 },
    features: features({ flow: { delta: feature({ delta: 120, buyShare: 0.6 }), cvd: feature({ cvd: 900 }), bookImbalance: feature({ imbalance: 0.31 }), tapeSpeed: feature({ tradesPerMinute: 140, label: 'steady' }), stream: { trusted: true, trustedSince: 1 } } }),
  }))
  const c = d.core
  assert.equal(c.stats.fill.value, '75%')
  assert.equal(c.stats.hit.value, '67%')
  assert.match(c.stats.hit.sub, /INSUFFICIENT SAMPLE · 3 of 10/)
  assert.equal(c.stats.expectancy.value, '+0.50R')
  assert.equal(c.stats.expectancy.label, 'EXPECTANCY')
  assert.equal(c.stats.book.value, '31% bid')
  assert.equal(c.pulse.perMin, 140)
  assert.equal(c.pulse.label, 'steady')
  assert.equal(c.volume.bars.length, 48, 'the last 48 candles')
  assert.equal(c.volume.bars[47].t, T + 119 * 300_000)
  assert.equal(c.range.bars.length, 96)
  assert.equal(c.range.high, 101 + 119)
  assert.equal(c.range.low, 99 + 24)
  assert.ok(c.heat.days.length >= 1 && c.heat.days.length <= 7)
  assert.equal(c.heat.grid[0].length, 24)
  const total = c.heat.grid.flat().reduce((s, v) => s + v, 0)
  assert.equal(total, candles.reduce((s, x) => s + x.volume, 0), 'every candle\'s volume lands in exactly one hour cell')
  assert.equal(c.heat.max, Math.max(...c.heat.grid.flat()))
  assert.equal(c.volume.provenance, 'REAL')
})

test('the signal core is drawn from the payload only: no thresholds, fetches or order paths of its own', () => {
  const js = readFileSync(join(ROOT, 'web', 'js', 'desk.js'), 'utf8')
  assert.equal((js.match(/fetch\(/g) || []).length, 1, 'the desk fetches /api/desk and nothing else')
  assert.equal(/\/api\/(order|paper\/close|kill|live)/.test(js), false, 'the desk must not reach an order path')
  assert.match(js, /prefers-reduced-motion/, 'the animation must respect reduced motion')
  assert.match(js, /cancelAnimationFrame/, 'the animation must stop when the desk is not on screen')
  assert.equal(/Math\.random/.test(js), false, 'nothing on the desk may be invented: no random motion, no fake ticks')
})

test('the brain only draws: no fetches, no randomness, no order paths, and it names what is dressing', () => {
  const js = readFileSync(join(ROOT, 'web', 'js', 'brain.js'), 'utf8')
  assert.equal(/fetch\(|XMLHttpRequest|WebSocket|EventSource/.test(js), false, 'the brain draws what desk.js hands it and fetches nothing')
  assert.equal(/Math\.random/.test(js), false, 'every position in the brain comes from a seeded generator, never Math.random')
  assert.equal(/\/api\//.test(js), false, 'the brain must not reach any route, least of all an order path')
  assert.equal(/setInterval|setTimeout|requestAnimationFrame/.test(js), false, 'the frame loop belongs to desk.js, which stops it off screen')
  assert.match(js, /reduced/, 'the brain must draw a still frame under reduced motion')
  assert.match(js, /DRESSING/, 'the brain must say which parts carry no data')
  const desk = readFileSync(join(ROOT, 'web', 'js', 'desk.js'), 'utf8')
  assert.match(desk, /MrBrain\.draw\(/, 'desk.js runs the brain from its own loop')
})
