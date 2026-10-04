import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { nudgeReviews, rewardReferrals } from '@/lib/server/advantage'
import { expireRequests, settlePendingRefunds } from '@/lib/server/bookings'
import { deliverNotificationEmails } from '@/lib/server/email'
import { queuePayouts, sendPayouts } from '@/lib/server/payouts'
import { purgeExpired } from '@/lib/server/retention'

export const runtime = 'nodejs'
export const maxDuration = 60

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Housekeeping, run by Vercel Cron (vercel.json) with CRON_SECRET:
 * expire unanswered requests, retry refunds Stripe didn't confirm, queue and
 * send host payouts, reward referrals, ask for reviews after trips, and send
 * notification emails. Each step is idempotent.
 */
export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  // A time budget: money steps stop starting new work well before the
  // function's limit, so nothing is ever cut off halfway through a payment.
  const deadline = Date.now() + 40_000
  const expired = await expireRequests()
  const refunds = await settlePendingRefunds(deadline)
  const queued = await queuePayouts()
  const paid = await sendPayouts(deadline)
  const referrals = await rewardReferrals()
  const nudged = await nudgeReviews()
  const emails = await deliverNotificationEmails(100)
  const purged = await purgeExpired()
  return NextResponse.json({ expired: expired.length, refunds, queued, paid, referrals, nudged, emails, purged })
}
