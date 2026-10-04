/**
 * Money rules after checkout: what a cancellation refunds, what a host
 * earns, and how long a host has to answer. Pure, so the trip page, the
 * server and the tests all agree to the cent.
 */

import { FREE_CANCEL_HOURS, HOST_SHARE_PCT } from './catalog.ts'
import { pct } from './pricing.ts'
import type { Quote } from './types.ts'

/** A host answers a request within this many hours or it expires, uncharged. */
export const REQUEST_HOURS = 8

/** Reviews can be left for this many days after a trip ends. */
export const REVIEW_DAYS = 30

const HOUR = 3_600_000

function offsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - utcMs
}

/** Epoch ms of a wall-clock time ("2026-10-07", "10:00") in an IANA zone. */
export function zonedTime(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  const first = wall - offsetMs(wall, tz)
  // Once more, in case the guess crossed a daylight-saving change.
  return wall - offsetMs(first, tz)
}

export interface CancelOutcome {
  refundCents: number
  keptCents: number
  /** True when the whole trip is refunded. */
  free: boolean
}

/**
 * Free until FREE_CANCEL_HOURS before pickup (later for Circle Gold). Inside that window the first
 * day (a day's share of the total) is kept and the rest refunded. A host
 * cancelling always refunds the guest in full.
 */
export function cancellationOutcome(q: Pick<Quote, 'totalCents' | 'days' | 'circle'>, pickupMs: number, nowMs: number, by: 'guest' | 'host'): CancelOutcome {
  // Circle Gold earns a later free-cancellation window, frozen into the quote at booking.
  const freeHours = q.circle?.freeCancelHours ?? FREE_CANCEL_HOURS
  if (by === 'host' || pickupMs - nowMs >= freeHours * HOUR) return { refundCents: q.totalCents, keptCents: 0, free: true }
  const keptCents = Math.min(q.totalCents, Math.round(q.totalCents / Math.max(1, q.days)))
  return { refundCents: q.totalCents - keptCents, keptCents, free: false }
}

/**
 * The host's share: HOST_SHARE_PCT of the trip price after discounts, plus
 * delivery and extras in full. The trip fee, coverage, young driver fee and
 * taxes are never the host's. A late cancellation pays the host's share of
 * the kept first day only.
 */
export function hostEarnings(q: Pick<Quote, 'tripCents' | 'days' | 'deliveryCents' | 'extrasCents'>, outcome: 'completed' | 'late-cancel'): number {
  if (outcome === 'late-cancel') return pct(Math.round(q.tripCents / Math.max(1, q.days)), HOST_SHARE_PCT)
  return pct(q.tripCents, HOST_SHARE_PCT) + q.deliveryCents + q.extrasCents
}

export function requestExpired(createdAtMs: number, nowMs: number): boolean {
  return nowMs - createdAtMs >= REQUEST_HOURS * HOUR
}
