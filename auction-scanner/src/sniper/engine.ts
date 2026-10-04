/**
 * THE SNIPER ENGINE — matches scanned cars to targets, ranks the picks, and
 * builds the fire plan for each: the most to bid (from the bid plan), when
 * to place it, and how, for that auction's rules.
 *
 * A "sniper" bid on a hard-end site (eBay) goes in during the last seconds;
 * on a soft-close site (Cars & Bids, Bring a Trailer, the salvage lanes) a
 * late bid only extends the clock, so the right move is a proxy bid at your
 * maximum, placed early. The fire plan says which.
 *
 * Firing is PAPER: an armed target records a paper bid and an alert. Nothing
 * is sent to an auction. The gate that would let a source place a real bid
 * lives in the server, and no source has that capability today.
 */
import type { BidPlan, Listing } from '../types.ts'
import type { Card } from '../server.ts'
import type { Target } from './targets.ts'
import { askingPrice } from '../valuation.ts'
import { gradeWord } from '../scoring.ts'

export type FirePlan = {
  method: 'snipe' | 'proxy' | 'live-lane' | 'buy-now' | 'unknown'
  maxBidUsd: number
  /** When to place it, epoch ms, for a snipe; undefined otherwise. */
  fireAt?: number
  why: string
  steps: string[]
}

export type Pick = {
  targetId: string
  targetName: string
  card: Card
  plan: BidPlan
  fire: FirePlan
  /** 0–100 fit for this target: score, budget headroom, freshness. */
  fit: number
  /** The target names a model, so this is a car the member asked for by name. */
  named: boolean
  reasons: string[]
}

/** Best first: a car the member asked for by model comes ahead of a broad target's find, then by fit. */
export function byPriority(a: Pick, b: Pick): number {
  return Number(b.named) - Number(a.named) || b.fit - a.fit
}

const HARD_END = new Set(['ebay'])
const SOFT_CLOSE = new Set(['carsandbids', 'bat', 'govdeals', 'acv', 'gsa', 'collectingcars', 'hagerty', 'dupont'])
const LIVE_LANE = new Set(['copart', 'iaa', 'manheim', 'adesa', 'local', 'collector', 'rmsothebys', 'gooding', 'bonhams', 'americasaa'])

function modelMatches(target: Target, l: Listing): boolean {
  if (!target.models.length) return true
  const md = (l.model ?? '').toLowerCase()
  const title = l.title.toLowerCase()
  return target.models.some((m) => {
    const t = m.toLowerCase()
    // The model field decides. The title is only a fallback for a source that did not fill it in.
    if (md) return md.startsWith(t) || t.startsWith(md.split(' ')[0])
    return title.includes(t)
  })
}

export function matchesTarget(target: Target, card: Card): { ok: boolean; why: string[] } {
  const l = card.listing
  const why: string[] = []
  if (target.makes.length && !target.makes.some((m) => m.toLowerCase() === (l.make ?? '').toLowerCase())) return { ok: false, why: ['make'] }
  if (!modelMatches(target, l)) return { ok: false, why: ['model'] }
  if (target.yearMin !== undefined && (l.year ?? 0) < target.yearMin) return { ok: false, why: ['too old'] }
  if (target.yearMax !== undefined && (l.year ?? 9999) > target.yearMax) return { ok: false, why: ['too new'] }
  if (target.maxMileage !== undefined && (l.mileage ?? 0) > target.maxMileage) return { ok: false, why: ['too many miles'] }
  if (target.states.length && !target.states.includes((l.location?.state ?? '').toUpperCase())) return { ok: false, why: ['wrong state'] }
  const price = askingPrice(l)
  if (price !== undefined && price > target.maxBudgetUsd) return { ok: false, why: ['over budget now'] }
  if (target.starterOnly && !card.score.starterOk) return { ok: false, why: ['fails starter rules'] }
  if (card.score.grade === 'unpriced') return { ok: false, why: ['not enough comps'] }
  if (card.score.total < target.minScore) return { ok: false, why: ['score too low'] }
  why.push(`Score ${card.score.total}, ${gradeWord(card.score.grade)}`)
  return { ok: true, why }
}

export function firePlan(l: Listing, plan: BidPlan, target: Target, now = Date.now()): FirePlan {
  const maxBidUsd = Math.max(0, Math.min(plan.maxBidUsd, target.maxBudgetUsd))
  const capped = plan.maxBidUsd > target.maxBudgetUsd
  const capNote = capped ? ` Your budget of $${target.maxBudgetUsd.toLocaleString('en-US')} caps it below the plan's $${plan.maxBidUsd.toLocaleString('en-US')}.` : ''
  if (l.kind === 'SAMPLE') {
    return { method: 'unknown', maxBidUsd, why: `Practice car: no real auction behind it.${capNote}`, steps: [`Practise: the number here would be $${maxBidUsd.toLocaleString('en-US')}. On a real eBay lot you would snipe it in the last seconds; on Cars & Bids or Bring a Trailer you would place it early; at Copart or IAA you would pre-bid it.`] }
  }
  if (l.saleType === 'buy-now' && l.buyNowUsd !== undefined) {
    return { method: 'buy-now', maxBidUsd, why: `It is a fixed price of $${l.buyNowUsd.toLocaleString('en-US')}; there is nothing to snipe.${capNote}`, steps: [l.buyNowUsd <= maxBidUsd ? `The price is at or under your number. Verify the car, then buy it on the site.` : `The price is above your number by $${(l.buyNowUsd - maxBidUsd).toLocaleString('en-US')}. Make an offer at your number if the listing allows offers; otherwise pass.`] }
  }
  if (HARD_END.has(l.source) && l.endsAt) {
    const fireAt = l.endsAt - 8_000
    return {
      method: 'snipe',
      maxBidUsd,
      fireAt,
      why: `${l.source === 'ebay' ? 'eBay' : l.source} ends at a fixed time with no extension, so a bid in the last seconds cannot be answered.${capNote}`,
      steps: [
        `Be on the lot page two minutes before the end (${new Date(l.endsAt).toLocaleString('en-US')}).`,
        `Type $${maxBidUsd.toLocaleString('en-US')} into the bid box before the last ten seconds, and place it with about eight seconds left.`,
        'If someone had a higher proxy bid you lose and you keep your money. That is the plan working.',
        'Never raise the number in the last seconds. The number was decided when you were calm.',
      ],
    }
  }
  if (SOFT_CLOSE.has(l.source)) {
    return {
      method: 'proxy',
      maxBidUsd,
      why: `This site extends the clock when a bid lands late, so sniping only starts a bidding war.${capNote}`,
      steps: [`Place your maximum of $${maxBidUsd.toLocaleString('en-US')} early${l.source === 'carsandbids' || l.source === 'bat' ? ', and be there for the final minutes because there is no proxy bidding' : ' as a proxy bid'}.`, 'Let it run. If the price passes your number, close the tab.', 'Remember the buyer fee is on top of the hammer; the plan already subtracted it.'],
    }
  }
  if (LIVE_LANE.has(l.source)) {
    return {
      method: 'live-lane',
      maxBidUsd,
      why: `Lots here close in a live lane, one after another, at a set time.${capNote}`,
      steps: [`Pre-bid your maximum of $${maxBidUsd.toLocaleString('en-US')} before the lane starts; the system bids for you.`, 'Do not sit in the lane and click. The pre-bid is your number, and clicking is how people overpay.', 'Add every fee (the plan used the published basis or your override) before you decide the number.'],
    }
  }
  return { method: 'unknown', maxBidUsd, why: `The plan does not know this auction's closing rule.${capNote}`, steps: [`Place at most $${maxBidUsd.toLocaleString('en-US')} on the auction's site, as a proxy bid if it offers one.`] }
}

export function fitScore(card: Card, plan: BidPlan, target: Target, now = Date.now()): number {
  let fit = card.score.total * 0.6
  const price = askingPrice(card.listing)
  if (price !== undefined && plan.maxBidUsd > 0) {
    const headroom = (Math.min(plan.maxBidUsd, target.maxBudgetUsd) - price) / Math.max(price, 1)
    fit += Math.max(-20, Math.min(25, headroom * 100 * 0.5))
  }
  if (card.listing.endsAt) {
    const hours = (card.listing.endsAt - now) / 3_600_000
    if (hours > 0 && hours < 24) fit += 6
    if (hours <= 0) fit -= 40
  }
  return Math.max(0, Math.min(100, Math.round(fit)))
}

export function pickFor(target: Target, card: Card, plan: BidPlan, now = Date.now()): Pick | null {
  const m = matchesTarget(target, card)
  if (!m.ok) return null
  const fire = firePlan(card.listing, plan, target, now)
  if (fire.maxBidUsd <= 0) return null
  // At or past your number: no room to bid, so not your car and not a pick.
  const price = askingPrice(card.listing)
  if (price !== undefined && price >= fire.maxBidUsd && card.listing.saleType !== 'buy-now') return null
  const fit = fitScore(card, plan, target, now)
  const reasons = [...m.why, `Never bid above $${fire.maxBidUsd.toLocaleString('en-US')} (${fire.method === 'snipe' ? 'snipe in the last seconds' : fire.method === 'proxy' ? 'proxy bid early' : fire.method === 'live-lane' ? 'pre-bid before the lane' : fire.method === 'buy-now' ? 'fixed price' : 'see the plan'}).`]
  return { targetId: target.id, targetName: target.name, card, plan, fire, fit, named: target.models.length > 0, reasons }
}
