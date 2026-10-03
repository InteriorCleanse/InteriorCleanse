import { NextResponse, type NextRequest } from 'next/server'
import { onboardingLink } from '@/lib/server/payouts'
import { currentUser, signInRequired } from '@/lib/server/session'
import { paymentsLive, StripeError } from '@/lib/server/stripe'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem } from '@/lib/security/request'

export const runtime = 'nodejs'

/** Starts (or resumes) Stripe payout setup; returns the Stripe-hosted page. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.checkout, limitKey: 'payouts', requireJson: false })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  if (!paymentsLive()) return problem(409, 'Payouts open when payments go live. Your earnings are tracked in the meantime.')
  try {
    return NextResponse.json({ url: await onboardingLink(user.id, user.email) })
  } catch (err) {
    console.error(`payout setup: ${err instanceof StripeError ? err.message : 'failed'}`)
    return problem(502, 'Payout setup is unavailable right now. Try again shortly.')
  }
}
