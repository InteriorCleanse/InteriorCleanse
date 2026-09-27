/**
 * The Steal score — how good a deal one car looks, 0 to 100, worked out in
 * the open so every point can be explained.
 *
 *   1. No estimate (NOT ENOUGH COMPS) or no price → score 0, grade "unpriced".
 *   2. Discount = 1 − asking price ÷ estimated value. A discount of
 *      config.scoring.noDealDiscount scores about 20; fullMarksDiscount scores
 *      100; in between is a straight line; outside is clamped 0–100.
 *   3. Named adjustments for title, damage, running, keys, mileage, timing and
 *      demand, each written out as a reason with its sign.
 *   4. Grade: 80+ steal · 60+ good deal · 40+ fair · below 40 pass.
 *
 * Red flags are the things a beginner must not miss. Starter mode blocks come
 * from filters.ts. Every sentence is meant for someone who has never bought a
 * car at auction.
 */
import type { Estimate, Listing, Score } from './types.ts'
import { config } from '../config.ts'
import type { DemandEntry } from './demand.ts'
import type { StarterRules } from './filters.ts'
import { starterCheck } from './filters.ts'
import { askingPrice } from './valuation.ts'
import { money } from './ui.ts'

const HOUR = 3_600_000
/** Miles a year that count as normal use. Above this the score loses up to 10 points. */
export const NORMAL_MILES_PER_YEAR = 15_000
/** A price this far under every comparable is a scam pattern more often than a bargain. */
export const TOO_GOOD_DISCOUNT = 0.6
/** The score at exactly config.scoring.noDealDiscount. */
const NO_DEAL_SCORE = 20

const TIER_POINTS: Record<DemandEntry['tier'], number> = { supercar: 6, enthusiast: 4, 'holds-value': 4, rental: 2 }

const TITLE_MEANING: Record<string, string> = {
  salvage: 'an insurer once declared this car a total loss',
  rebuilt: 'it was a salvage car that was repaired and re-inspected',
  flood: 'it has been under water, which ruins wiring and electronics',
  lemon: 'the maker bought it back for a fault it could not fix',
  'parts-only': 'it may not legally be put back on the road',
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function pct(fraction: number): string {
  return `${Math.round(Math.abs(fraction) * 100)}%`
}

function grade(total: number): Score['grade'] {
  if (total >= 80) return 'steal'
  if (total >= 60) return 'good deal'
  if (total >= 40) return 'fair'
  return 'pass'
}

/** Base score from the discount alone: a straight line from noDealDiscount (≈20) to fullMarksDiscount (100), clamped 0–100. */
export function discountScore(discount: number): number {
  const lo = config.scoring.noDealDiscount
  const hi = config.scoring.fullMarksDiscount
  const span = hi - lo || 1
  const raw = NO_DEAL_SCORE + ((discount - lo) / span) * (100 - NO_DEAL_SCORE)
  return clamp(Math.round(raw), 0, 100)
}

/** The red flags a beginner must see before bidding. Computed even when the car is unpriced. */
export function redFlagsFor(l: Listing, est: Estimate): string[] {
  const flags: string[] = []
  if (l.kind === 'SAMPLE') flags.push('SAMPLE — not a real car. It shows how Gavel works before a source is connected.')
  if (l.titleStatus !== 'clean' && l.titleStatus !== 'unknown') {
    flags.push(`Title is ${l.titleStatus} — ${TITLE_MEANING[l.titleStatus] ?? 'it is not a clean title'}. These cars are harder to insure, finance and resell.`)
  }
  if (l.damage === 'severe') flags.push('Damage is described as severe. Expect structural or airbag repairs that cost more than they look.')
  if (l.damage === 'moderate') flags.push('Damage is described as moderate. Get a repair quote before you set a max bid.')
  if (l.runsAndDrives === false) flags.push('Seller says it does not run and drive. Budget a tow and an unknown repair, or skip it.')
  if (!l.vin) flags.push('No VIN shown — ask the seller for it before you bid. The VIN is the 17-character number that lets you check the title history.')
  const asking = askingPrice(l)
  if (est.ok && asking !== undefined && est.valueUsd > 0 && 1 - asking / est.valueUsd > TOO_GOOD_DISCOUNT) {
    flags.push('Priced far below every comparable — too-good-to-be-true is a scam pattern; verify the seller and never wire a deposit.')
  }
  return flags
}

/**
 * Score one listing. `demand` comes from demandFor(); `rules` are the starter
 * rules in force; `now` is the clock, injectable so tests are stable.
 */
export function scoreListing(l: Listing, est: Estimate, demand?: DemandEntry, rules: StarterRules = config.starter, now: number = Date.now()): Score {
  const starterBlocks = starterCheck(l, rules)
  const starterOk = starterBlocks.length === 0
  const redFlags = redFlagsFor(l, est)
  const asking = askingPrice(l)

  if (!est.ok) {
    return {
      total: 0,
      grade: 'unpriced',
      reasons: [
        `${est.reason}`,
        'What would fix it: more listings of the same make, model and year in the feed, so widen the search, or look up sold prices for this exact car and judge the price yourself.',
      ],
      redFlags,
      starterOk,
      starterBlocks,
    }
  }

  if (asking === undefined || asking <= 0 || est.valueUsd <= 0) {
    return {
      total: 0,
      grade: 'unpriced',
      reasons: [
        `No price is shown yet, so there is nothing to compare with the estimate of ${money(est.valueUsd)} (${est.method}).`,
        'What would fix it: wait for the first bid, or open the lot to see the starting price, then come back.',
      ],
      redFlags,
      starterOk,
      starterBlocks,
    }
  }

  const discount = 1 - asking / est.valueUsd
  const base = discountScore(discount)
  const reasons: string[] = []

  if (discount >= 0) {
    reasons.push(`Priced ${pct(discount)} under the estimate of ${money(est.valueUsd)} (asking ${money(asking)}, ${est.method}): base score ${base}.`)
  } else {
    reasons.push(`Priced ${pct(discount)} above the estimate of ${money(est.valueUsd)} (asking ${money(asking)}, ${est.method}): base score ${base}. It is not a deal at this price.`)
  }
  reasons.push(`A car counts as no deal at ${pct(config.scoring.noDealDiscount)} under and earns full marks at ${pct(config.scoring.fullMarksDiscount)} under.`)

  let adjust = 0
  const add = (points: number, text: string): void => {
    adjust += points
    const sign = points > 0 ? `+${points}` : points < 0 ? `${points}` : '+0'
    reasons.push(`${text} ${sign}.`)
  }

  // Title.
  if (l.titleStatus === 'clean') add(0, 'Clean title, which starter mode requires:')
  else if (l.titleStatus === 'unknown') add(0, 'Title status is not stated; the score does not punish this, but starter mode blocks it until you know:')
  else add(0, `Title is ${l.titleStatus}; this is a red flag rather than a points change:`)

  // Damage.
  switch (l.damage) {
    case 'none': add(0, 'No damage reported:'); break
    case 'minor': add(-8, 'Minor damage (scratches, dings, cosmetic wear):'); break
    case 'unknown': add(-10, 'Caution: nobody says whether the car is damaged, so assume some is hidden until you see it or get photos:'); break
    case 'moderate': add(-25, 'Moderate damage, likely a body shop visit:'); break
    case 'severe': add(-45, 'Severe damage, likely structural or airbag work:'); break
  }

  // Runs and drives.
  if (l.runsAndDrives === true) add(0, 'Seller says it runs and drives:')
  else if (l.runsAndDrives === undefined) add(-8, 'Nobody says whether it runs and drives; ask before you bid:')
  else add(-30, 'Seller says it does not run and drive:')

  // Keys.
  if (l.hasKeys === false) add(-5, 'No keys with the car; a new key can cost a few hundred dollars on a modern car:')

  // Mileage per year.
  if (l.mileage === undefined) {
    add(0, 'Mileage is not stated; ask the seller for the odometer reading:')
  } else if (l.year !== undefined) {
    const age = Math.max(1, new Date(now).getUTCFullYear() - l.year + 1)
    const perYear = l.mileage / age
    if (perYear > NORMAL_MILES_PER_YEAR) {
      const penalty = -Math.min(10, Math.ceil((perYear - NORMAL_MILES_PER_YEAR) / 1_000))
      add(penalty, `Driven about ${Math.round(perYear).toLocaleString('en-US')} miles a year, above the ${NORMAL_MILES_PER_YEAR.toLocaleString('en-US')} that counts as normal use:`)
    }
  }

  // Timing.
  const msLeft = l.endsAt !== undefined ? l.endsAt - now : undefined
  if (msLeft !== undefined && msLeft <= 0) {
    add(0, 'This auction has already ended; the price shown is history, not an offer:')
  } else if (msLeft !== undefined && msLeft <= 2 * HOUR) {
    add(0, 'Ending soon: under 2 hours left. Set your max bid now, not in the last minute:')
  }
  if (l.bidCount === 0 && msLeft !== undefined && msLeft > 0 && msLeft < 6 * HOUR) {
    add(3, 'Few bidders so far: no bids yet with under 6 hours left:')
  }

  // Demand.
  if (demand) {
    add(TIER_POINTS[demand.tier], `On the demand list as ${demand.tier}: "${demand.why}"`)
  }

  // Auction prices move.
  if (l.currentBidUsd !== undefined && l.saleType !== 'buy-now') {
    reasons.push('Current bid, not the final price: expect it to rise.')
  } else if (l.buyNowUsd !== undefined && l.currentBidUsd === undefined) {
    reasons.push('Buy-now price: this is what you would pay, with no bidding.')
  }

  const total = clamp(Math.round(base + adjust), 0, 100)
  return {
    total,
    grade: grade(total),
    discount: Math.round(discount * 1000) / 1000,
    reasons,
    redFlags,
    starterOk,
    starterBlocks,
  }
}
