/**
 * THE TRADE PLANNER — maths for the owner's own trades, checked number by
 * number, and proof that the page sends nothing and places nothing.
 *
 * TEST FIXTURE: every price below is a made-up example, not market data.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error — a browser ES module without type declarations; the functions are plain JS.
import { sharePlan, optionPlan, strikeCompare, ticketText } from '../../web/js/plan-math.js'

test('shares: risk 1% of $10,000 between 50 and 48 buys 50 shares with 1R/2R/3R targets', () => {
  const p = sharePlan({ account: 10_000, riskPct: 1, entry: 50, stop: 48, target: 56 })
  assert.equal(p.ok, true)
  assert.equal(p.side, 'long')
  assert.equal(p.qty, 50)
  assert.equal(p.risk, 100)
  assert.equal(p.notional, 2500)
  assert.deepEqual(p.targets.map((t: { price: number }) => t.price), [52, 54, 56])
  assert.equal(p.rr, 3)
  assert.deepEqual(p.warnings, [])
})

test('shares: a stop above the entry is a short, with targets below', () => {
  const p = sharePlan({ account: 10_000, riskPct: 1, entry: 50, stop: 52 })
  assert.equal(p.side, 'short')
  assert.deepEqual(p.targets.map((t: { price: number }) => t.price), [48, 46, 44])
})

test('shares: never spends more cash than the account holds, and says so', () => {
  const p = sharePlan({ account: 1000, riskPct: 5, entry: 100, stop: 99.9 })
  assert.equal(p.qty, 10)
  assert.ok(p.warnings.some((w: string) => /Capped by cash/.test(w)))
  assert.ok(p.warnings.some((w: string) => /aggressive/.test(w)))
})

test('shares: fractional sizing for crypto, and an honest refusal when a whole share does not fit', () => {
  assert.equal(sharePlan({ account: 1000, riskPct: 1, entry: 60_000, stop: 59_000, whole: false }).qty, 0.01)
  const whole = sharePlan({ account: 1000, riskPct: 1, entry: 60_000, stop: 59_000, whole: true })
  assert.equal(whole.ok, false)
})

test('shares: refuses input it cannot honestly compute from', () => {
  assert.equal(sharePlan({ account: 0, riskPct: 1, entry: 50, stop: 48 }).ok, false)
  assert.equal(sharePlan({ account: 1000, riskPct: 1, entry: 50, stop: 50 }).ok, false)
  assert.equal(sharePlan({ account: 1000, riskPct: 150, entry: 50, stop: 48 }).ok, false)
  assert.ok(sharePlan({ account: 10_000, riskPct: 1, entry: 50, stop: 48, target: 45 }).warnings.some((w: string) => /wrong side/.test(w)))
})

test('options: sizes by the loss at the stop, and always shows the worst case (premium to zero)', () => {
  const p = optionPlan({ account: 10_000, riskPct: 2, premium: 2, stopPremium: 1, multiplier: 100, feePerContract: 0.65 })
  assert.equal(p.ok, true)
  assert.equal(p.contracts, 1)
  assert.equal(p.lossAtStop, 101.3)
  assert.equal(p.lossWorst, 200.65)
  assert.equal(p.cost, 200.65)
  assert.ok(p.warnings.some((w: string) => /fill well below/.test(w)))
})

test('options: with no stop, the whole premium is the risk', () => {
  const p = optionPlan({ account: 10_000, riskPct: 1, premium: 0.5 })
  assert.equal(p.contracts, 2)
  assert.equal(p.lossAtStop, 100)
  assert.equal(p.lossWorst, 100)
  assert.equal(optionPlan({ account: 10_000, riskPct: 1, premium: 1.5 }).ok, false, 'one contract would risk more than the budget')
  assert.equal(optionPlan({ account: 10_000, riskPct: 1, premium: 1, stopPremium: 1.2 }).ok, false, 'a stop above the premium is refused')
})

test('strikes: break-even, move needed and profit at the target, at expiration', () => {
  const r = strikeCompare({ type: 'call', underlying: 100, target: 110, strikes: [{ strike: 100, premium: 3 }, { strike: 105, premium: 1.5 }, { strike: 115, premium: 0.4 }] })
  assert.equal(r.ok, true)
  const [a, b, c] = r.rows
  assert.deepEqual([a.moneyness, a.breakeven, a.moveToBreakevenPct, a.pnlAtTarget, a.maxLoss], ['ATM', 103, 3, 700, 300])
  assert.deepEqual([b.moneyness, b.breakeven, b.pnlAtTarget], ['OTM', 106.5, 350])
  assert.deepEqual([c.pnlAtTarget, c.returnAtTargetPct], [-40, -100])
  assert.equal(r.bestAtTarget, 100)
})

test('strikes: puts read the other way, and a target that pays nothing says so', () => {
  const r = strikeCompare({ type: 'put', underlying: 100, target: 90, strikes: [{ strike: 95, premium: 2 }] })
  assert.deepEqual([r.rows[0].moneyness, r.rows[0].breakeven, r.rows[0].moveToBreakevenPct, r.rows[0].pnlAtTarget], ['OTM', 93, -7, 300])
  assert.equal(strikeCompare({ type: 'call', underlying: 100, target: 101, strikes: [{ strike: 105, premium: 1 }] }).bestAtTarget, null)
})

test('the ticket summary is plain text to paste next to the order ticket', () => {
  const p = sharePlan({ account: 10_000, riskPct: 1, entry: 50, stop: 48 })
  assert.equal(ticketText(p, { symbol: 'TEST', entry: 50, stop: 48 }), 'TEST LONG 50 @ 50\nStop 48  (risk $100)\nTargets 1R 52 · 2R 54 · 3R 56')
})

test('the planner sends nothing and places nothing: no network call and no API route in either file', () => {
  for (const f of ['plan-math.js', 'planner.js']) {
    const src = readFileSync(join(process.cwd(), 'web', 'js', f), 'utf8')
    assert.equal(/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|\/api\//.test(src), false, `${f} must not talk to any server`)
  }
})
