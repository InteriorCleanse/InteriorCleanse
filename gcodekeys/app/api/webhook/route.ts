import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, stripeEnabled } from '@/lib/stripe'
import { getOrder, updateOrder } from '@/lib/orders'
import { OPERATOR_EMAIL, sendEmail, shell } from '@/lib/email'

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
      const email = session.customer_details?.email ?? session.customer_email ?? ''
      const amount = session.amount_total != null ? session.amount_total / 100 : null
      console.log(`[stripe] paid · ref=${ref} · amount=${session.amount_total} ${session.currency} · email=${email}`)

      // Mark the order paid (tolerant if it isn't in the store).
      try {
        await updateOrder(ref, {
          status: 'paid',
          paidAt: new Date().toISOString(),
          paymentAmount: amount,
          stripeSessionId: session.id,
        })
      } catch (err) {
        console.error('[stripe] order update failed', err)
      }

      // Notify dispatch to schedule the cut. (Stripe sends the customer their
      // own receipt; we don't duplicate it here.)
      if (OPERATOR_EMAIL) {
        const order = await getOrder(ref).catch(() => null)
        void sendEmail({
          to: OPERATOR_EMAIL,
          subject: `PAID ${ref}${amount != null ? ` · $${amount}` : ''} — schedule the cut`,
          html: shell(
            'Order paid',
            `<p><b>${ref}</b> is paid${amount != null ? ` (<b>$${amount}</b>)` : ''}.</p>
             ${order ? `<p><b>${order.contact.name}</b> · ${order.contact.email}${order.contact.phone ? ` · ${order.contact.phone}` : ''}<br><b>Vehicle:</b> ${order.vehicle} · ${order.service === 'mail' ? 'Mail-in' : 'Come-to-me'}${order.contact.city ? ` · ${order.contact.city}` : ''}</p>` : `<p>Paid by ${email}.</p>`}
             <p>Confirm the appointment and program at the vehicle.</p>`,
          ),
        })
      }
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
