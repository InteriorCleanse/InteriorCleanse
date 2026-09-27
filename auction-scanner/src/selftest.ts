/**
 * `node src/selftest.ts` — proves the install and the logic work, offline.
 *
 * Every car below is a TEST FIXTURE, hand-written to check the estimator, the
 * score, the starter rules, the fees, the bid maths, the walkthrough, the
 * session and the Stripe signature. None of it is market data and nothing
 * here is a price you could act on.
 */
import { createHmac } from 'node:crypto'
import type { Listing } from './types.ts'
import { estimateValue } from './valuation.ts'
import { scoreListing } from './scoring.ts'
import { starterCheck } from './filters.ts'
import { buyerFee } from './fees.ts'
import { buildPlan } from './bidplan.ts'
import { walkthrough } from './explain.ts'
import { demandFor } from './demand.ts'
import { sampleListings, sampleComps } from './sources/sample.ts'
import { houseById } from './sources/directory.ts'
import { Sessions } from './security/session.ts'
import { verifyStripeSignature } from './security/members.ts'
import { GUIDES } from './playbook/content.ts'
import { rentalPicks } from './rental.ts'
import * as ui from './ui.ts'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { passed++; console.log(`  ${ui.good('PASS')}  ${name}`) } else { failed++; console.log(`  ${ui.bad('FAIL')}  ${name}${detail ? ` — ${detail}` : ''}`) }
}

const NOW = Date.UTC(2026, 0, 15, 12)
function fx(over: Partial<Listing> & { id: string }): Listing {
  return {
    source: 'ebay', externalId: over.id, url: 'https://example.com/lot/' + over.id, title: 'TEST FIXTURE', titleStatus: 'clean', damage: 'none', runsAndDrives: true,
    saleType: 'auction', photos: [], kind: 'LIVE', fetchedAt: NOW, make: 'Honda', model: 'Civic', year: 2018, mileage: 50_000, ...over,
  }
}

ui.heading('SELF-TEST — logic checks on hand-written fixtures, no internet')
console.log('')

console.log(ui.bold('  The estimator'))
{
  const target = fx({ id: 't', currentBidUsd: 12_000 })
  const pool = [fx({ id: 'c1', buyNowUsd: 20_000 }), fx({ id: 'c2', buyNowUsd: 21_000, mileage: 40_000 }), fx({ id: 'c3', buyNowUsd: 19_000, mileage: 60_000 })]
  const est = estimateValue(target, pool)
  check('three comparables give an estimate', est.ok && est.comps === 3)
  check('the estimate is a median near the comps', est.ok && est.valueUsd > 18_000 && est.valueUsd < 22_000, est.ok ? String(est.valueUsd) : '')
  const few = estimateValue(target, pool.slice(0, 2))
  check('two comparables is NOT ENOUGH COMPS', !few.ok && few.reason.startsWith('NOT ENOUGH COMPS'))
  const mixed = estimateValue(target, pool.map((c) => ({ ...c, kind: 'SAMPLE' as const })))
  check('SAMPLE comparables never price a LIVE car', !mixed.ok)
  const salvagePool = pool.map((c) => ({ ...c, titleStatus: 'salvage' as const }))
  check('salvage cars are not comparables for a clean car', !estimateValue(target, salvagePool).ok)
}

console.log(ui.bold('  The score'))
{
  const pool = [fx({ id: 'c1', buyNowUsd: 20_000 }), fx({ id: 'c2', buyNowUsd: 20_000 }), fx({ id: 'c3', buyNowUsd: 20_000 })]
  const steal = fx({ id: 's', currentBidUsd: 12_000, vin: '1HGCV1F30JA000000', endsAt: NOW + 3 * 86_400_000 })
  const sc = scoreListing(steal, estimateValue(steal, pool), undefined, undefined, NOW)
  check('40% under the comps is a steal', sc.grade === 'steal' && sc.total >= 80, `${sc.total} ${sc.grade}`)
  check('the score says why, in sentences', sc.reasons.length >= 2 && sc.reasons.every((r) => r.length > 20))
  const fair = fx({ id: 'f', currentBidUsd: 18_000, vin: '1HGCV1F30JA000000' })
  const fs = scoreListing(fair, estimateValue(fair, pool), undefined, undefined, NOW)
  check('10% under is not a steal', fs.grade !== 'steal', fs.grade)
  const un = scoreListing(steal, { ok: false, comps: 1, reason: 'NOT ENOUGH COMPS' }, undefined, undefined, NOW)
  check('no estimate means unpriced, score 0', un.grade === 'unpriced' && un.total === 0)
  const salvage = fx({ id: 'sv', currentBidUsd: 12_000, titleStatus: 'salvage' })
  const ss = scoreListing(salvage, estimateValue(salvage, pool), undefined, undefined, NOW)
  check('a salvage title is a red flag and a starter block', ss.redFlags.some((f) => /salvage/i.test(f)) && !ss.starterOk)
  const noVin = scoreListing(fx({ id: 'nv', currentBidUsd: 12_000 }), estimateValue(steal, pool), undefined, undefined, NOW)
  check('no VIN is a red flag', noVin.redFlags.some((f) => /VIN/.test(f)))
  const tooGood = fx({ id: 'tg', currentBidUsd: 4_000, vin: '1HGCV1F30JA000000' })
  const tgs = scoreListing(tooGood, estimateValue(tooGood, pool), undefined, undefined, NOW)
  check('80% under everything is flagged as too good to be true', tgs.redFlags.some((f) => /too-good|scam/i.test(f)))
  const d = demandFor('Lamborghini', 'Huracan LP610-4')
  check('the demand list knows a Lamborghini Huracán as a supercar', !!d && d.tier === 'supercar')
  check('a 911 GT3 outranks the plain 911 entry', demandFor('Porsche', '911 GT3')?.tier === 'supercar' && demandFor('Porsche', '911 Carrera S')?.tier === 'enthusiast')
  check('demand "why" lines never promise profit', !/guaranteed|proven|risk-free/i.test(JSON.stringify(d)))
}

console.log(ui.bold('  Starter mode'))
{
  check('a clean, running, minor-damage car passes', starterCheck(fx({ id: 'ok', damage: 'minor', currentBidUsd: 15_000 })).length === 0)
  check('a rebuilt title is blocked with a sentence', starterCheck(fx({ id: 'rb', titleStatus: 'rebuilt' })).some((b) => /rebuilt/i.test(b)))
  check('an unstated title is blocked', starterCheck(fx({ id: 'ut', titleStatus: 'unknown' })).length === 1)
  check('a non-runner is blocked', starterCheck(fx({ id: 'nr', runsAndDrives: false })).some((b) => /not run/i.test(b)))
  check('a car over the price cap is blocked', starterCheck(fx({ id: 'pc', currentBidUsd: 90_000 })).some((b) => /cap/i.test(b)))
  check('a 2005 car is blocked by the year floor', starterCheck(fx({ id: 'yr', year: 2005 })).some((b) => /2008/.test(b)))
}

console.log(ui.bold('  Fees and the bid plan'))
{
  check('eBay Motors charges the buyer nothing', buyerFee('ebay', 20_000).usd === 0)
  const cb = buyerFee('carsandbids', 20_000)
  check('Cars & Bids: 5% of $20,000 is $1,000', cb.usd === 1_000, String(cb.usd))
  check('Cars & Bids minimum $250 applies to a $2,000 car', buyerFee('carsandbids', 2_000).usd === 250)
  check('Cars & Bids maximum $7,500 applies to a $300,000 car', buyerFee('carsandbids', 300_000).usd === 7_500)
  const cp = buyerFee('copart', 20_000)
  check('Copart is a sliding scale: no number is invented', cp.usd === 0 && /unknown|sliding/i.test(cp.basis))
  check('an override percent wins', buyerFee('copart', 20_000, 10).usd === 2_000)
  const l = fx({ id: 'p', currentBidUsd: 12_000 })
  const plan = buildPlan(l, { ok: true, valueUsd: 20_000, low: 19_000, high: 21_000, comps: 3, method: 'test' }, { distanceMiles: 0, repairsUsd: 0, houseId: 'ebay' })
  check('max bid = resale − fee − transport − repairs − cushion − margin, rounded to $100', plan.maxBidUsd === Math.floor((20_000 - 0 - 0 - 0 - 750 - 3_000) / 100) * 100, String(plan.maxBidUsd))
  check('headroom is max bid minus the price now', plan.headroomUsd === plan.maxBidUsd - 12_000)
  const worse = buildPlan(l, { ok: true, valueUsd: 20_000, low: 19_000, high: 21_000, comps: 3, method: 'test' }, { distanceMiles: 0, repairsUsd: 2_000, houseId: 'ebay' })
  check('$2,000 of repairs lowers the max bid by $2,000', plan.maxBidUsd - worse.maxBidUsd === 2_000)
  const noEst = buildPlan(l, { ok: false, comps: 0, reason: 'NOT ENOUGH COMPS' }, { houseId: 'ebay' })
  check('no estimate means a max bid of $0 until a resale price is typed', noEst.maxBidUsd === 0 && noEst.lines.some((x) => /resale/i.test(x)))
}

console.log(ui.bold('  The walkthrough'))
{
  const l = fx({ id: 'w', currentBidUsd: 12_000, vin: '1HGCV1F30JA000000' })
  const est = { ok: true as const, valueUsd: 20_000, low: 19_000, high: 21_000, comps: 3, method: 'test' }
  const plan = buildPlan(l, est, { houseId: 'ebay' })
  const w = walkthrough({ listing: l, estimate: est, score: scoreListing(l, est, undefined, undefined, NOW), plan }, houseById('ebay'))
  check('seven numbered steps', w.steps.length === 7)
  check('the max bid is quoted in the steps', w.steps.some((s) => s.body.includes(String(plan.maxBidUsd).replace(/\B(?=(\d{3})+(?!\d))/g, ','))))
  const dealer = walkthrough({ listing: fx({ id: 'd', source: 'manheim', currentBidUsd: 12_000 }), estimate: est, score: scoreListing(l, est, undefined, undefined, NOW), plan }, houseById('manheim'))
  check('a dealer-only house warns about the licence', dealer.warnings.some((x) => /licence|license/i.test(x)))
  const sample = sampleListings(NOW)[0]
  const sw = walkthrough({ listing: sample, estimate: est, score: scoreListing(sample, est, undefined, undefined, NOW), plan }, undefined)
  check('a SAMPLE car warns that nothing can be bought', sw.warnings.some((x) => /SAMPLE/.test(x)))
}

console.log(ui.bold('  Samples are labelled'))
{
  const all = [...sampleListings(NOW), ...sampleComps(NOW)]
  check('every sample listing is kind SAMPLE', all.every((l) => l.kind === 'SAMPLE'))
  check('every sample VIN starts with SAMPLE or is absent', sampleListings(NOW).every((l) => !l.vin || l.vin.startsWith('SAMPLE')))
  check('no sample URL leads anywhere', all.every((l) => l.url === '#sample'))
}

console.log(ui.bold('  The door'))
{
  const s = new Sessions(Buffer.alloc(32, 7), 60_000, () => NOW)
  const { token, session } = s.issue({ email: 'Owner@Example.com', role: 'owner' })
  check('a session round-trips through its cookie', s.read(`gavel_session=${token}`)?.email === 'owner@example.com' && session.csrf.length > 10)
  check('a tampered token is refused', s.read(`gavel_session=${token.slice(0, -2)}xx`) === null)
  const later = new Sessions(Buffer.alloc(32, 7), 60_000, () => NOW + 61_000)
  check('an expired token is refused', later.read(`gavel_session=${token}`) === null)
  const secret = 'whsec_TESTFIXTURE'
  const body = '{"id":"evt_1","type":"checkout.session.completed"}'
  const t = Math.floor(NOW / 1000)
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  check('a correctly signed Stripe event verifies', verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, NOW))
  check('a forged Stripe signature is refused', !verifyStripeSignature(body, `t=${t},v1=${'0'.repeat(64)}`, secret, NOW))
  check('a stale Stripe signature is refused', !verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, NOW + 3600_000))
}

console.log(ui.bold('  The playbook and the finder'))
{
  check(`${GUIDES.length} guides, each with a checklist`, GUIDES.length >= 7 && GUIDES.every((g) => g.checklist.length >= 5))
  check('no promise words in the playbook', !/guaranteed|risk[- ]free|proven profit|get rich/i.test(JSON.stringify(GUIDES)))
  const r = rentalPicks(15_000, 'p2p')
  check('the finder ranks candidates for a $15,000 peer-to-peer car', r.picks.length >= 5 && r.picks[0].budgetFit === 'in')
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
process.exit(failed ? 1 : 0)
