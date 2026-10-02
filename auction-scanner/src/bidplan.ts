/**
 * The bid plan — the most you should ever bid for one car, and why.
 *
 *   resale − buyer fee − transport − repairs − cushion − your margin = max bid
 *
 * and, when the member has told Gavel their cash, never more than
 *
 *   cash − buyer fee − transport − repairs − cushion
 *
 * Every number is a default the member can override on the page. The plan is
 * written as plain rows so a beginner can read it top to bottom. When a fee is
 * unknown (a sliding-scale house with no fee typed in) the plan says so out
 * loud instead of guessing.
 */
import type { BidPlan, Estimate, Listing } from './types.ts'
import { config } from '../config.ts'
import { buyerFee } from './fees.ts'
import { askingPrice } from './valuation.ts'
import { money } from './ui.ts'

export type PlanInputs = {
  /** What you believe the car will sell for after fixes. Defaults to the estimate. */
  resaleUsd?: number
  /** What you expect to spend on repairs and detailing. Defaults to $0 with a prompt. */
  repairsUsd?: number
  /** Miles from the car to you. Defaults to config.plan.defaultDistanceMiles. */
  distanceMiles?: number
  /** Buyer fee as a percent (5 means 5%). Overrides the house schedule. */
  feePct?: number
  /** Margin you want left over, as a fraction of resale (0.15 = 15%). Defaults by goal. */
  margin?: number
  /** Which auction house's fee to use. Defaults to the listing's source. */
  houseId?: string
  /** All the cash the member has for one car. When set, the max bid is also capped so everything fits inside it. */
  cashUsd?: number
  /** What the car is for. A flip keeps a margin to sell at; a rental or a keeper is bought under market value. */
  goal?: 'rental' | 'flip' | 'keep'
  /** Sales tax plus title as a percent of the price (7 means 7%). Paid from your cash, so it counts inside the cash cap. */
  taxTitlePct?: number
  /** The car is on the demand list as a supercar: a bigger cushion and the checks before bidding. */
  supercar?: boolean
}

/** What to do before bidding on a supercar. Plain steps; no prices, because they vary by car and shop. */
export const SUPERCAR_CHECKS = [
  'A pre-purchase inspection by a specialist in this make, not a general mechanic. If the auction will not allow one, lower your number or pass.',
  'An insurance quote before you bid. Some insurers ask for an inspection, a garage address or a clean driving record for a car like this; know the yearly cost first.',
  'The service records. Missed major services are expensive on these cars, and buyers pay less for one without the paperwork.',
  'The tyres and brakes. Both cost far more than on an ordinary car, and tyres past their age should be replaced even with tread left.',
  'A history report on the VIN: accidents, title brands and the mileage record.',
]

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

function nonNeg(n: number | undefined, fallback: number): number {
  return n !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback
}

/**
 * The highest bid whose buyer fee still fits in `room` (bid + fee <= room). A
 * percent fee grows with the bid, so the two are found together: start with
 * all the room, take the fee off, repeat until the number stops moving.
 */
function bidWithin(room: number, houseId: string, feePct: number | undefined, taxFraction = 0): number {
  const top = Math.max(0, room)
  let bid = top
  for (let i = 0; i < 12; i++) {
    const next = Math.max(0, top - buyerFee(houseId, bid, feePct).usd - taxFraction * bid)
    const settled = Math.abs(next - bid) < 0.5
    bid = next
    if (settled) break
  }
  // At high fee and tax rates the rounds swing either side of the answer and can stop above it.
  // Step down until the bid, its fee and the tax really fit: a plan must never ask for more than the room.
  for (let i = 0; i < 50 && bid > 0; i++) {
    const over = bid + buyerFee(houseId, bid, feePct).usd + taxFraction * bid - top
    if (over <= 0) break
    bid = Math.max(0, bid - Math.max(1, over))
  }
  return bid
}

/** Build the bid plan for one listing from its estimate and the member's inputs. */
export function buildPlan(l: Listing, est: Estimate, inputs: PlanInputs = {}): BidPlan {
  const lines: string[] = []
  const houseId = inputs.houseId ?? l.source
  const goal = inputs.goal ?? 'flip'
  const flip = goal === 'flip'
  const valueWord = flip ? 'Resale target' : 'Market value'

  // Resale, or for a car you keep, what it is worth.
  let resaleUsd: number
  if (inputs.resaleUsd !== undefined && Number.isFinite(inputs.resaleUsd) && inputs.resaleUsd >= 0) {
    resaleUsd = inputs.resaleUsd
    lines.push(`${valueWord}: ${money(resaleUsd)} (the number you typed in).`)
  } else if (est.ok) {
    resaleUsd = est.valueUsd
    lines.push(`${valueWord}: ${money(resaleUsd)} (${est.method}; range ${money(est.low)} to ${money(est.high)}).`)
  } else {
    resaleUsd = 0
    lines.push(`${valueWord}: not known. NOT ENOUGH COMPS, so it must be typed in. Look up recent sold prices for this exact year, make and model and enter what it truly sells for.`)
  }

  // Transport.
  const distanceAssumed = inputs.distanceMiles === undefined
  const distance = nonNeg(inputs.distanceMiles, config.plan.defaultDistanceMiles)
  const transportUsd = Math.round(distance * config.plan.transportPerMileUsd)
  lines.push(`Transport: ${money(transportUsd)} (${distance.toLocaleString('en-US')} miles at $${config.plan.transportPerMileUsd.toFixed(2)} a mile, ${distanceAssumed ? 'an assumed distance because the exact one is not set' : 'your distance'}; a typical open-carrier rate, so get a real quote).`)

  // Repairs.
  const repairsUsd = nonNeg(inputs.repairsUsd, 0)
  if (inputs.repairsUsd === undefined) {
    lines.push('Repairs: $0 so far. Nothing entered yet; add what you expect to spend on fixes, tyres, brakes and a detail before you trust the max bid.')
  } else {
    lines.push(`Repairs: ${money(repairsUsd)} (your estimate for fixes and detailing).`)
  }

  // Cushion. A supercar's is a share of its value: one repair can cost more than the usual cushion.
  const supercar = inputs.supercar === true
  const supercarReserve = Math.round((resaleUsd * config.plan.supercarReservePct) / 50) * 50
  const reserveUsd = supercar ? Math.max(config.plan.surpriseReserveUsd, supercarReserve) : config.plan.surpriseReserveUsd
  lines.push(supercar && reserveUsd > config.plan.surpriseReserveUsd
    ? `Cushion for surprises: ${money(reserveUsd)} (${pct(config.plan.supercarReservePct)} of the value, Gavel's rule for supercars, instead of the usual ${money(config.plan.surpriseReserveUsd)}: one repair on a car like this can cost more than that).`
    : `Cushion for surprises: ${money(reserveUsd)} (for the things you only find after the car arrives).`)
  if (supercar) lines.push('Supercar: get a specialist inspection and an insurance quote before you bid. The checklist is on this page.')

  // Margin: for a flip, what you want left after selling; otherwise how far under market you buy.
  const marginFraction = nonNeg(inputs.margin, config.plan.targetMarginByGoal[goal] ?? config.plan.targetMargin)
  const marginUsd = Math.round(marginFraction * resaleUsd)
  lines.push(flip
    ? `Your margin: ${money(marginUsd)} (${pct(marginFraction)} of the resale target, the amount you want left over).`
    : `Under market by: ${money(marginUsd)} (${pct(marginFraction)} of market value, so you never pay retail for a car you are keeping).`)

  // Two limits. The car's value: value minus every cost and the margin.
  const costs = transportUsd + repairsUsd + reserveUsd
  const valueMax = bidWithin(resaleUsd - costs - marginUsd, houseId, inputs.feePct)
  // Your cash: the bid, its fee and every cost must fit inside it.
  const cashUsd = inputs.cashUsd !== undefined && Number.isFinite(inputs.cashUsd) && inputs.cashUsd > 0 ? inputs.cashUsd : undefined
  const taxPct = inputs.taxTitlePct !== undefined && Number.isFinite(inputs.taxTitlePct) && inputs.taxTitlePct >= 0 ? inputs.taxTitlePct : undefined
  // Tax and title are paid from your cash, so they count against it; they do not change what the car is worth.
  const cashMax = cashUsd === undefined ? Infinity : bidWithin(cashUsd - costs, houseId, inputs.feePct, (taxPct ?? 0) / 100)
  const limitedBy: 'value' | 'cash' = cashMax < valueMax ? 'cash' : 'value'
  const maxBidUsd = Math.floor(Math.max(0, Math.min(valueMax, cashMax)) / 100) * 100
  const fee = buyerFee(houseId, maxBidUsd, inputs.feePct)
  const buyerFeeUsd = fee.usd
  const feeUnknown = fee.basis.startsWith('unknown')

  if (feeUnknown) {
    lines.push(`Buyer fee: ${fee.basis}. Until you type it in, the fee counts as $0, so the max bid below is too high.${fee.verifyUrl ? ` Check it at ${fee.verifyUrl}.` : ''}`)
  } else {
    lines.push(`Buyer fee: ${money(buyerFeeUsd)} (${fee.basis}${fee.verifyUrl ? `; check ${fee.verifyUrl}` : ''}). This is what the house adds to your winning bid.`)
  }

  // The answer.
  lines.push(`Never bid above: ${money(maxBidUsd)} (${valueWord.toLowerCase()} minus fee, transport, repairs, cushion and ${flip ? 'margin' : 'the discount'}${limitedBy === 'cash' ? ', then lowered to fit your cash' : ''}, rounded down to the nearest $100).`)
  if (resaleUsd <= 0) {
    lines.push(`The max bid is $0 because there is no ${valueWord.toLowerCase()} yet. Type one in and the plan will update.`)
  }

  // Tax and title.
  const taxTitleUsd = taxPct === undefined ? undefined : Math.round((taxPct / 100) * maxBidUsd)
  if (taxTitleUsd !== undefined) lines.push(`Tax and title: ${money(taxTitleUsd)} (${taxPct}% of the bid, the rate you entered for your state and county).`)
  else lines.push('Tax and title: not set. Your state and county decide them; look up the sales tax on a car plus the title fee, type it as a percent, and every plan counts it.')

  // The cash it takes.
  const cashNeededUsd = maxBidUsd + buyerFeeUsd + (taxTitleUsd ?? 0) + costs
  lines.push(`Cash you need on the day: ${money(cashNeededUsd)} (the bid, the buyer fee${taxTitleUsd !== undefined ? ', tax and title' : ''}, transport, repairs and the cushion).${taxTitleUsd === undefined ? ' Tax, title and registration come on top.' : ' Registration comes on top.'}`)
  if (cashUsd !== undefined) {
    lines.push(limitedBy === 'cash'
      ? `Your cash is ${money(cashUsd)}, so the max bid is lowered to fit it. The car may be worth more, but you would run out of money for the fee and the rest.`
      : `Your cash is ${money(cashUsd)}: this plan fits, with ${money(Math.max(0, cashUsd - cashNeededUsd))} to spare${taxTitleUsd === undefined ? ' before tax and title' : ''}.`)
  }

  // Headroom.
  const asking = askingPrice(l)
  let headroomUsd: number | undefined
  if (asking !== undefined) {
    headroomUsd = maxBidUsd - asking
    const priceWord = l.currentBidUsd !== undefined && l.saleType !== 'buy-now' ? 'Current bid' : 'Price'
    if (headroomUsd >= 0) {
      lines.push(`${priceWord} is ${money(asking)}, ${money(headroomUsd)} under your max bid. There is room, but stop the moment bidding passes ${money(maxBidUsd)}.`)
    } else {
      lines.push(`${priceWord} is ${money(asking)}, ${money(-headroomUsd)} above your max bid. Walk away; there is no room left.`)
    }
    if (priceWord === 'Current bid') lines.push('Current bid, not the final price: expect it to rise.')
  } else {
    lines.push('No price is shown yet, so there is no headroom to report. Open the lot to see the starting price.')
  }

  if (l.kind === 'SAMPLE') lines.push('SAMPLE — not a real car. These numbers show the method, nothing more.')

  return { resaleUsd, buyerFeeUsd, transportUsd, repairsUsd, reserveUsd, marginUsd, maxBidUsd, headroomUsd, cashNeededUsd, taxTitleUsd, taxTitlePct: taxPct, cashUsd, limitedBy, feeUnknown, distanceMiles: distance, distanceAssumed, marginFraction, goal, supercar: supercar ? { checks: SUPERCAR_CHECKS } : undefined, lines }
}
