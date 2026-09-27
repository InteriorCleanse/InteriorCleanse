/**
 * The bid plan — the most you should ever bid for one car, and why.
 *
 *   resale − buyer fee − transport − repairs − cushion − your margin = max bid
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
  /** Margin you want left over, as a fraction of resale (0.15 = 15%). */
  margin?: number
  /** Which auction house's fee to use. Defaults to the listing's source. */
  houseId?: string
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

function nonNeg(n: number | undefined, fallback: number): number {
  return n !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Build the bid plan for one listing from its estimate and the member's inputs. */
export function buildPlan(l: Listing, est: Estimate, inputs: PlanInputs = {}): BidPlan {
  const lines: string[] = []
  const houseId = inputs.houseId ?? l.source

  // Resale.
  let resaleUsd: number
  if (inputs.resaleUsd !== undefined && Number.isFinite(inputs.resaleUsd) && inputs.resaleUsd >= 0) {
    resaleUsd = inputs.resaleUsd
    lines.push(`Resale target: ${money(resaleUsd)} (the number you typed in).`)
  } else if (est.ok) {
    resaleUsd = est.valueUsd
    lines.push(`Resale target: ${money(resaleUsd)} (from ${est.comps} comparable listings, mileage-adjusted; range ${money(est.low)} to ${money(est.high)}).`)
  } else {
    resaleUsd = 0
    lines.push('Resale target: not known. NOT ENOUGH COMPS, so a resale price must be typed in. Look up recent sold prices for this exact year, make and model and enter what you truly believe it will sell for.')
  }

  // Transport.
  const distance = nonNeg(inputs.distanceMiles, config.plan.defaultDistanceMiles)
  const transportUsd = Math.round(distance * config.plan.transportPerMileUsd)
  const distanceNote = inputs.distanceMiles !== undefined ? 'your distance' : 'an assumed distance because the exact one is not set'
  lines.push(`Transport: ${money(transportUsd)} (${distance.toLocaleString('en-US')} miles at $${config.plan.transportPerMileUsd.toFixed(2)} a mile, ${distanceNote}; a typical open-carrier rate, so get a real quote).`)

  // Repairs.
  const repairsUsd = nonNeg(inputs.repairsUsd, 0)
  if (inputs.repairsUsd === undefined) {
    lines.push('Repairs: $0 so far. Nothing entered yet; add what you expect to spend on fixes, tyres, brakes and a detail before you trust the max bid.')
  } else {
    lines.push(`Repairs: ${money(repairsUsd)} (your estimate for fixes and detailing).`)
  }

  // Cushion.
  const reserveUsd = config.plan.surpriseReserveUsd
  lines.push(`Cushion for surprises: ${money(reserveUsd)} (for the things you only find after the car arrives).`)

  // Margin.
  const marginFraction = nonNeg(inputs.margin, config.plan.targetMargin)
  const marginUsd = Math.round(marginFraction * resaleUsd)
  lines.push(`Your margin: ${money(marginUsd)} (${pct(marginFraction)} of the resale target, the amount you want left over).`)

  // Fee, solved against the bid it depends on.
  // A percent fee grows with the hammer price, so the max bid and the fee are
  // found together: start with the bid before fees, take the fee off, repeat
  // until the number stops moving. It settles within a handful of rounds.
  const fixedCosts = transportUsd + repairsUsd + reserveUsd + marginUsd
  const beforeFee = Math.max(0, resaleUsd - fixedCosts)
  let bid = beforeFee
  for (let i = 0; i < 12; i++) {
    const fee = buyerFee(houseId, bid, inputs.feePct).usd
    const next = Math.max(0, beforeFee - fee)
    const settled = Math.abs(next - bid) < 0.5
    bid = next
    if (settled) break
  }
  const maxBidUsd = Math.floor(Math.max(0, bid) / 100) * 100
  const fee = buyerFee(houseId, maxBidUsd, inputs.feePct)
  const buyerFeeUsd = fee.usd
  const feeUnknown = fee.basis.startsWith('unknown')

  if (feeUnknown) {
    lines.push(`Buyer fee: ${fee.basis}. Until you type it in, the fee counts as $0, so the max bid below is too high.${fee.verifyUrl ? ` Check it at ${fee.verifyUrl}.` : ''}`)
  } else {
    lines.push(`Buyer fee: ${money(buyerFeeUsd)} (${fee.basis}${fee.verifyUrl ? `; check ${fee.verifyUrl}` : ''}). This is what the house adds to your winning bid.`)
  }

  // The answer.
  lines.push(`Never bid above: ${money(maxBidUsd)} (resale minus fee, transport, repairs, cushion and margin, rounded down to the nearest $100).`)
  if (resaleUsd <= 0) {
    lines.push('The max bid is $0 because there is no resale target yet. Type one in and the plan will update.')
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

  return { resaleUsd, buyerFeeUsd, transportUsd, repairsUsd, reserveUsd, marginUsd, maxBidUsd, headroomUsd, lines }
}
