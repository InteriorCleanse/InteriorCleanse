import { after, NextResponse, type NextRequest } from 'next/server'
import { expirePending, markPaid, settleRefund } from '@/lib/server/bookings'
import { deliverNotificationEmails } from '@/lib/server/email'
import { refreshAccountByStripeId } from '@/lib/server/payouts'
import { stripe } from '@/lib/server/stripe'
import { readCapped } from '@/lib/security/request'
import { verifyStripeSignature } from '@/lib/verification/stripe-signature'

export const runtime = 'nodejs'

const MAX_EVENT_BYTES = 256 * 1024

interface Session {
  id: string
  payment_status: string
  payment_intent: string | null
  amount_total: number
  currency: string
  metadata: { booking?: string; user?: string }
}

/**
 * Payments and host-account events. The signature is checked on the raw
 * body, then the object is re-read from Stripe before it is trusted, so a
 * replayed or out-of-order event can only repeat what is already true.
 * Every handler is idempotent.
 *
 * Endpoint: https://<domain>/api/webhook/stripe, events
 * checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.expired, checkout.session.async_payment_failed and
 * (Connect) account.updated.
 */
export async function POST(req: NextRequest) {
  let raw: string
  try {
    raw = await readCapped(req, MAX_EVENT_BYTES)
  } catch {
    return NextResponse.json({ error: 'too large' }, { status: 413 })
  }
  const ok = await verifyStripeSignature(raw, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET ?? '')
  if (!ok) return NextResponse.json({ error: 'bad signature' }, { status: 400 })

  const event = JSON.parse(raw) as { type: string; data: { object: { id: string } } }
  const objectId = event.data.object.id
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(objectId)) return NextResponse.json({ ignored: true })
      const s = await stripe<Session>(`checkout/sessions/${objectId}`)
      const booking = s.metadata.booking
      if (!booking || s.payment_status !== 'paid' || !s.payment_intent) return NextResponse.json({ ignored: true })
      await markPaid(booking, s.payment_intent, { amountCents: s.amount_total, currency: s.currency })
      after(async () => {
        await settleRefund(booking)
        await deliverNotificationEmails()
      })
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(objectId)) return NextResponse.json({ ignored: true })
      const s = await stripe<Session>(`checkout/sessions/${objectId}`)
      if (s.metadata.booking && s.payment_status !== 'paid') await expirePending(s.metadata.booking)
    } else if (event.type === 'account.updated') {
      if (/^acct_[A-Za-z0-9]+$/.test(objectId)) await refreshAccountByStripeId(objectId)
    } else {
      return NextResponse.json({ ignored: true })
    }
  } catch (err) {
    // 5xx makes Stripe retry with backoff.
    // The error's name only: messages can carry database or provider detail.
    console.error(`stripe webhook ${event.type}: ${err instanceof Error ? err.name : 'failed'}`)
    return NextResponse.json({ error: 'retry' }, { status: 503 })
  }
  return NextResponse.json({ received: true })
}
