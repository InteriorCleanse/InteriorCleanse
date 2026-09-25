/**
 * OPTION SPREADS — defined-risk structures for the owner's own trades,
 * checked number by number, and proof that the page sends nothing and places
 * nothing and lives apart from the single-option Planner.
 *
 * TEST FIXTURE: every strike and price below is a made-up example, not market data.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error — a browser ES module without type declarations; the functions are plain JS.
import { STRUCTURES, VIEWS, spreadPlan, sizeSpreads, spreadTicket, payoffAt } from '../../web/js/spread-math.js'

const WEB = join(process.cwd(), 'web')

test('bull call 100/105 for a 2.00 debit: lose at most $200, make at most $300, break even at 102', () => {
  const p = spreadPlan({ structure: 'bull-call', strikes: [100, 105], premiums: [3, 1], underlying: 101 })
  assert.equal(p.ok, true)
  assert.equal(p.kind, 'debit')
  assert.equal(p.net, 2)
  assert.equal(p.maxLoss, 200)
  assert.equal(p.maxProfit, 300)
  assert.deepEqual(p.breakevens, [102])
  assert.equal(p.rr, 1.5)
  assert.equal(p.atSpot, -100)
  assert.deepEqual(p.legs.map((l: { action: string; strike: number; type: string }) => `${l.action} ${l.strike} ${l.type}`), ['BUY 100 call', 'SELL 105 call'])
})

test('bear put 95/100 for a 2.00 debit: break even at 98', () => {
  const p = spreadPlan({ structure: 'bear-put', strikes: [95, 100], premiums: [3.2, 1.2] })
  assert.equal(p.maxLoss, 200)
  assert.equal(p.maxProfit, 300)
  assert.deepEqual(p.breakevens, [98])
})

test('bull put 95/100 for a 1.50 credit: keep $150, lose at most $350, and the early-assignment warning is shown', () => {
  const p = spreadPlan({ structure: 'bull-put', strikes: [95, 100], premiums: [2.5, 1] })
  assert.equal(p.kind, 'credit')
  assert.equal(p.net, 1.5)
  assert.equal(p.maxProfit, 150)
  assert.equal(p.maxLoss, 350)
  assert.deepEqual(p.breakevens, [98.5])
  assert.ok(p.warnings.some((w: string) => /assigned early/.test(w)))
})

test('bear call 100/105 for a 1.40 credit: break even at 101.40', () => {
  const p = spreadPlan({ structure: 'bear-call', strikes: [100, 105], premiums: [2, 0.6] })
  assert.equal(p.maxProfit, 140)
  assert.equal(p.maxLoss, 360)
  assert.deepEqual(p.breakevens, [101.4])
})

test('a credit spread that risks far more than it makes says so plainly', () => {
  const p = spreadPlan({ structure: 'bull-put', strikes: [90, 100], premiums: [1.2, 0.2] })
  assert.equal(p.maxProfit, 100)
  assert.equal(p.maxLoss, 900)
  assert.ok(p.warnings.some((w: string) => /risk 9× what you can make/.test(w)))
})

test('long call butterfly 95/100/105: pays most at the body, two break-evens, loss capped at the debit', () => {
  const p = spreadPlan({ structure: 'call-butterfly', strikes: [95, 100, 105], premiums: [6.5, 3.2, 1.2] })
  assert.equal(p.contractsPerSpread, 4)
  assert.equal(p.net, 1.3)
  assert.equal(p.maxLoss, 130)
  assert.equal(p.maxProfit, 370)
  assert.deepEqual(p.breakevens, [96.3, 103.7])
  assert.equal(payoffAt([{ side: 1, qty: 1, type: 'call', strike: 95, premium: 6.5 }, { side: -1, qty: 2, type: 'call', strike: 100, premium: 3.2 }, { side: 1, qty: 1, type: 'call', strike: 105, premium: 1.2 }], 100), 370)
})

test('long put butterfly and iron butterfly land on the same shape from the other side', () => {
  const put = spreadPlan({ structure: 'put-butterfly', strikes: [95, 100, 105], premiums: [6.5, 3.2, 1.2] })
  assert.equal(put.maxLoss, 130)
  assert.deepEqual(put.breakevens, [96.3, 103.7])
  const iron = spreadPlan({ structure: 'iron-butterfly', strikes: [95, 100, 105], premiums: [1, 3, 3, 1] })
  assert.equal(iron.kind, 'credit')
  assert.equal(iron.maxProfit, 400)
  assert.equal(iron.maxLoss, 100)
  assert.deepEqual(iron.breakevens, [96, 104])
})

test('iron condor 90/95/105/110 for a 2.00 credit: keep $200 between 93 and 107, lose at most $300', () => {
  const p = spreadPlan({ structure: 'iron-condor', strikes: [90, 95, 105, 110], premiums: [0.5, 1.5, 1.4, 0.4] })
  assert.equal(p.maxProfit, 200)
  assert.equal(p.maxLoss, 300)
  assert.deepEqual(p.breakevens, [93, 107])
  assert.deepEqual(p.widths, [5, 10, 5])
})

test('fees are charged on every contract in the spread', () => {
  const p = spreadPlan({ structure: 'bull-call', strikes: [100, 105], premiums: [3, 1], feePerContract: 0.65 })
  assert.equal(p.openFees, 1.3)
  assert.equal(p.roundTripFees, 2.6)
  assert.equal(p.maxLoss, 201.3)
  assert.equal(p.maxProfit, 298.7)
})

test('an uneven butterfly is called a broken wing', () => {
  const p = spreadPlan({ structure: 'call-butterfly', strikes: [95, 100, 110], premiums: [6.5, 3.2, 0.6] })
  assert.ok(p.warnings.some((w: string) => /broken-wing/.test(w)))
})

test('it refuses input it cannot honestly compute from', () => {
  assert.equal(spreadPlan({ structure: 'nope', strikes: [1, 2], premiums: [1, 1] }).ok, false)
  assert.match(spreadPlan({ structure: 'bull-call', strikes: [105, 100], premiums: [3, 1] }).error, /lowest to highest/)
  assert.match(spreadPlan({ structure: 'bull-call', strikes: [100], premiums: [3, 1] }).error, /all 2 strikes/)
  assert.match(spreadPlan({ structure: 'bull-call', strikes: [100, 105], premiums: [3] }).error, /price of every leg/)
  assert.match(spreadPlan({ structure: 'bull-call', strikes: [100, 105], premiums: [1, 3] }).error, /give a credit/)
  assert.match(spreadPlan({ structure: 'bull-put', strikes: [95, 100], premiums: [1, 3] }).error, /cost money/)
  assert.match(spreadPlan({ structure: 'bull-put', strikes: [95, 100], premiums: [7, 1] }).error, /can never lose/)
  assert.match(spreadPlan({ structure: 'bull-call', strikes: [100, 105], premiums: [5.5, 0.1] }).error, /cannot make money/)
})

test('every structure is defined risk: flat past its outer strikes, worst case no bigger than its widest wing', () => {
  // A smooth, convex made-up price curve around 100, only so each structure gets sensible quotes.
  const price = (type: string, k: number) => Math.max(0, type === 'call' ? 100 - k : k - 100) + 2 * Math.exp(-Math.abs(k - 100) / 10)
  const strikesFor: Record<number, number[]> = { 2: [97, 103], 3: [95, 100, 105], 4: [90, 96, 104, 110] }
  for (const [id, st] of Object.entries(STRUCTURES) as [string, { slots: string[]; legs: { slot: number; type: string }[] }][]) {
    const ks = strikesFor[st.slots.length]
    const p = spreadPlan({ structure: id, strikes: ks, premiums: st.legs.map((l) => price(l.type, ks[l.slot])) })
    assert.equal(p.ok, true, `${id}: ${p.error}`)
    assert.ok(p.maxLoss > 0 && p.maxLoss <= Math.max(...p.widths) * 100 * 2, `${id} worst case ${p.maxLoss}`)
    const ys = p.curve.points.map((q: { y: number }) => q.y)
    assert.equal(ys[0], ys[1], `${id} is flat below its lowest strike`)
    assert.equal(ys[ys.length - 1], ys[ys.length - 2], `${id} is flat above its highest strike`)
  }
  for (const v of VIEWS) assert.ok(Object.values(STRUCTURES).some((s) => (s as { view: string }).view === v.id), `a structure for "${v.label}"`)
})

test('sizing uses the worst case, and says so when one spread does not fit the budget', () => {
  assert.deepEqual(sizeSpreads({ account: 10_000, riskPct: 5, maxLoss: 200 }), { ok: true, budget: 500, spreads: 2, totalMaxLoss: 400 })
  const no = sizeSpreads({ account: 10_000, riskPct: 1, maxLoss: 200 })
  assert.equal(no.ok, false)
  assert.match(no.error, /more than your 1% budget of \$100/)
  assert.equal(sizeSpreads({ account: null, riskPct: 1, maxLoss: 200 }).ok, false)
})

test('the ticket is one multi-leg order, with the worst case written on it', () => {
  const p = spreadPlan({ structure: 'bull-call', strikes: [100, 105], premiums: [3, 1] })
  assert.equal(spreadTicket(p, { symbol: 'TEST', expiry: '2026-10-16', spreads: 2 }), [
    'Bull call spread · TEST 2026-10-16 · 2 spreads',
    'BUY 2 100 CALL @ 3',
    'SELL 2 105 CALL @ 1',
    'One order, limit 2 DEBIT',
    'Max loss $400 · max profit $600 (at expiry, open fees included)',
  ].join('\n'))
})

test('spreads send nothing and place nothing: no network call and no API route', () => {
  for (const f of ['spread-math.js', 'spreads.js']) {
    const src = readFileSync(join(WEB, 'js', f), 'utf8')
    assert.equal(/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|\/api\//.test(src), false, `${f} must not talk to any server`)
  }
})

test('spreads have their own tab, apart from the single-option Planner', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8')
  const section = (id: string) => { const m = html.match(new RegExp(`<section id="tab-${id}"[\\s\\S]*?</section>`)); return m ? m[0] : '' }
  assert.match(section('spreads'), /id="spreads-out"/)
  assert.doesNotMatch(section('planner'), /spreads-out/)
  assert.match(html, /\['spreads','Spreads'/)
  assert.match(html, /<script type="module" src="\/js\/spreads\.js"><\/script>/)
  assert.doesNotMatch(readFileSync(join(WEB, 'js', 'planner.js'), 'utf8'), /spread-math/)
})
