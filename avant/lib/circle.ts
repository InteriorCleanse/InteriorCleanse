/**
 * The AVANT Advantage, as rules: Circle tiers, the AVANT Promise and
 * referrals. Every amount the business sets lives here, in one place, so
 * the owner can tune them; everything else reads from these.
 *
 * Pure, so the server, the checkout screen and the tests agree to the cent.
 */

import { FREE_CANCEL_HOURS, TRIP_FEE_PCT } from './catalog.ts'
import { pct } from './pricing.ts'

export type TierId = 'member' | 'silver' | 'gold'

export interface Tier {
  id: TierId
  name: string
  /** Completed trips as a guest to reach this tier. */
  minTrips: number
  /** The trip fee this tier pays, in percent of the trip price. */
  feePct: number
  /** Free cancellation until this many hours before pickup. */
  freeCancelHours: number
}

/** The trip fee falls the more you drive with AVANT. Hosts' share never changes. */
export const CIRCLE_TIERS: readonly Tier[] = [
  { id: 'member', name: 'Member', minTrips: 0, feePct: TRIP_FEE_PCT, freeCancelHours: FREE_CANCEL_HOURS },
  { id: 'silver', name: 'Silver', minTrips: 3, feePct: 10, freeCancelHours: FREE_CANCEL_HOURS },
  { id: 'gold', name: 'Gold', minTrips: 10, feePct: 8, freeCancelHours: 12 },
]

/** The AVANT Promise: when a host lets a guest down, AVANT makes it right. */
export const PROMISE = {
  /** On top of the full refund, when the host cancels a confirmed trip. */
  hostCancelCreditCents: 5_000,
  /** When a host lets a request expire unanswered. */
  requestExpiredCreditCents: 1_500,
} as const

/** Give $25, get $25. The friend's credit arrives at sign-up; yours after their first trip. */
export const REFERRAL = {
  friendCreditCents: 2_500,
  referrerCreditCents: 2_500,
} as const

/** Stripe's smallest card charge; credit always leaves at least this to pay by card. */
export const MIN_CARD_CHARGE_CENTS = 50

/**
 * With live payments, credit pays at most this share of a trip; the rest is
 * on a card. Keeps credit a thank-you rather than a currency that could be
 * farmed by booking and cancelling between friendly accounts.
 */
export const MAX_CREDIT_SHARE_PCT = 50

/** Referral rewards a referrer can earn in a rolling year. */
export const MAX_REFERRAL_REWARDS_PER_YEAR = 10

export function tierFor(completedTrips: number): Tier {
  let tier = CIRCLE_TIERS[0]
  for (const t of CIRCLE_TIERS) if (completedTrips >= t.minTrips) tier = t
  return tier
}

export function nextTier(completedTrips: number): { tier: Tier; tripsToGo: number } | null {
  const next = CIRCLE_TIERS.find((t) => t.minTrips > completedTrips)
  return next ? { tier: next, tripsToGo: next.minTrips - completedTrips } : null
}

/** What a tier saves on a trip price, against the standard trip fee. */
export function circleSavings(tripCents: number, tier: Tier): number {
  return pct(tripCents, TRIP_FEE_PCT) - pct(tripCents, tier.feePct)
}

/**
 * Credit to apply to a trip. With live payments, at most MAX_CREDIT_SHARE_PCT
 * of the total, and the card always pays at least MIN_CARD_CHARGE_CENTS.
 */
export function creditToApply(balanceCents: number, totalCents: number, paymentsLive: boolean): number {
  const cap = paymentsLive ? Math.min(Math.floor((totalCents * MAX_CREDIT_SHARE_PCT) / 100), totalCents - MIN_CARD_CHARGE_CENTS) : totalCents
  return Math.max(0, Math.min(balanceCents, cap))
}

/**
 * Splits a refund between the card and AVANT credit in proportion to how
 * the trip was paid, so credit comes back as credit and money as money.
 */
export function splitRefund(refundCents: number, totalCents: number, creditCents: number): { cardCents: number; creditCents: number } {
  if (refundCents <= 0 || totalCents <= 0) return { cardCents: 0, creditCents: 0 }
  const credit = Math.min(creditCents, Math.round((refundCents * creditCents) / totalCents))
  return { cardCents: refundCents - credit, creditCents: credit }
}

/** A short, readable code for sharing: no 0/O or 1/I to misread. */
export function referralCode(random: Uint8Array): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(random.slice(0, 7), (b) => alphabet[b % alphabet.length]).join('')
}
