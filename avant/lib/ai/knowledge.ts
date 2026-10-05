/**
 * Policy answers in plain English. One source for the concierge (online and
 * offline), the help page and the checkout copy, so they never disagree.
 */

import { COVERAGE_PLANS, COVERAGE_TERMS_FINAL, FREE_CANCEL_HOURS, TRIP_FEE_PCT, YOUNG_DRIVER_FEES, CLEAN_RECORD_DISCOUNT_PCT } from '../catalog'
import { CIRCLE_TIERS, PROMISE, REFERRAL } from '../circle'
import { REQUEST_HOURS } from '../policy'

const dollars = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`

export const POLICY_TOPICS = [
  'cancellation',
  'young_drivers',
  'verification',
  'deposit',
  'fees',
  'damage_claims',
  'privacy',
  'delivery',
  'mileage',
  'fuel_and_charging',
  'tolls_and_tickets',
  'circle_and_promise',
  'accident',
] as const

export type PolicyTopic = (typeof POLICY_TOPICS)[number]

const youngLines = YOUNG_DRIVER_FEES.map(
  (b) => `ages ${b.minAge}–${b.maxAge}: ${dollars(b.perDayCents)}/day, never more than ${dollars(b.capCents)} a trip`,
).join('; ')

export const POLICIES: Record<PolicyTopic, string> = {
  cancellation: `Free cancellation until ${FREE_CANCEL_HOURS} hours before pickup (${CIRCLE_TIERS[CIRCLE_TIERS.length - 1].freeCancelHours} hours for Circle ${CIRCLE_TIERS[CIRCLE_TIERS.length - 1].name}), from the trip page; the exact refund is shown before you confirm. Inside that window the first day is kept and the rest is refunded. If the host cancels, you get a full refund plus ${dollars(PROMISE.hostCancelCreditCents)} of AVANT credit.`,
  young_drivers: `Drivers 18 and up can book everyday cars; 21+ adds premium cars; 25+ adds luxury and exotic. Under-25 drivers pay a young driver fee (${youngLines}). A verified clean driving record cuts it by ${CLEAN_RECORD_DISCOUNT_PCT}%.`,
  verification: `Verify once, book forever: a photo of your licence and a quick selfie on our verification partner's secure page, about two minutes. AVANT keeps only your age in years, how long you've been licensed, when the licence expires and whether it's valid. Never your name, date of birth, licence number or photos, and we ask the partner to delete the images once the check is done.`,
  deposit: `A refundable hold is placed on your card at pickup: ${COVERAGE_PLANS.map((p) => `${p.name} ${p.depositCents ? dollars(p.depositCents) : 'none'}`).join(', ')}. It is released within 48 hours after the trip if nothing needs sorting out.`,
  fees: `What you see on the card is the all-in daily price: rate, the ${TRIP_FEE_PCT}% trip fee and default coverage. AVANT Circle members pay less: ${CIRCLE_TIERS.map((t) => `${t.name} ${t.feePct}%`).join(', ')}. At checkout only things you chose are added (delivery, extras), plus local tax and, for under-25 drivers, the young driver fee. No dynamic surcharges.`,
  damage_claims: `Take the timestamped check-in and check-out photos in the app; they are the evidence for both sides. If a host reports damage, you see their photos, an itemised estimate and have 72 hours to respond before anything is charged, and you never pay more than your coverage plan's maximum.`,
  privacy: `Browsing needs no account; booking, hosting and messages do, so your trips follow you to any device. Your verification record is encrypted before it is stored and can be exported or deleted from Profile at any time, and you can close your whole account there too. AVANT does not sell personal data or use it for advertising.`,
  delivery: `Many hosts deliver to your address or hotel for a flat fee (not to airports yet) shown on the car page. Choose it at checkout and add the address.`,
  mileage: `Each car includes a daily mileage allowance shown on its page. Add Unlimited miles at checkout if you're not sure, otherwise the host may charge per extra mile after the trip.`,
  fuel_and_charging: `Return with the same fuel or charge level you picked it up with, or add Prepaid refuel at checkout and return it at any level.`,
  tolls_and_tickets: `Tolls, parking tickets and camera fines during your trip are yours. The host submits them with evidence and you're charged the actual amount plus nothing else.`,
  accident: `If anyone is hurt, call 911 first. Then make sure everyone is safe, take photos, swap details with the other driver, and report it from your trip page (Report an accident or problem). Roadside assistance is included on Zero and Plus.`,
  circle_and_promise: `AVANT Circle is free: your trip fee falls as you complete trips (${CIRCLE_TIERS.map((t) => `${t.name} ${t.feePct}% from ${t.minTrips} trips`).join(', ')}). AVANT credit comes off your next trip automatically and can't be cashed out. Invite a friend: they get ${dollars(REFERRAL.friendCreditCents)} off their first car, you get ${dollars(REFERRAL.referrerCreditCents)} when they finish it. The AVANT Promise: if a host cancels you get a full refund plus ${dollars(PROMISE.hostCancelCreditCents)} credit; if a host doesn't answer within ${REQUEST_HOURS} hours the request expires with a full refund plus ${dollars(PROMISE.requestExpiredCreditCents)} credit. See the Circle page.`,
}

export const COVERAGE_SUMMARY = [
  COVERAGE_TERMS_FINAL ? '' : 'Coverage terms are illustrative until AVANT’s insurance partner finalises them.',
  ...COVERAGE_PLANS.map(
    (p) => `${p.name}: ${p.oneLiner} Costs ${p.pctOfTrip}% of the trip price (at least ${dollars(p.minPerDayCents)}/day). ${p.liability}. Best for: ${p.recommendedFor}`,
  ),
]
  .filter(Boolean)
  .join('\n')
