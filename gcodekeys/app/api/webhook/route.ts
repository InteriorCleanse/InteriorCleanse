import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, stripeEnabled } from '@/lib/stripe'

export const runtime = 'nodejs'
// Stripe needs the raw, unparsed body to verify the signature.
export const dynamic = 'force-dynamic'

// Stripe webhook. Verifies the signature with STRIPE_WEBHOOK_SECRET, then acts
// on payment outcomes. Point a Stripe endpoint at https://gcodekeys.com/api/webhook/
// and paste its signing secret into Vercel.
export async function POST(req: Request) {
  if (!stripeEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 501 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 })

  const raw = await req.text()
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature.'
    return NextResponse.json({ error: `Signature verification failed: ${message}` }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const ref = session.metadata?.ref ?? session.client_reference_id ?? 'unknown'
      // TODO(launch): mark order `ref` paid in the order store and notify
      // dispatch to schedule the cut. For now the verified event is logged.
      console.log(`[stripe] paid · ref=${ref} · amount=${session.amount_total} ${session.currency} · email=${session.customer_details?.email ?? session.customer_email ?? ''}`)
      break
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session
      console.log(`[stripe] expired · ref=${session.metadata?.ref ?? session.client_reference_id ?? 'unknown'}`)
      break
    }
    default:
      // Other events are acknowledged without action.
      break
  }

  return NextResponse.json({ received: true })
}
