import { NextResponse } from 'next/server'
import { getStripe, siteOrigin, stripeEnabled } from '@/lib/stripe'

export const runtime = 'nodejs'

// Create a Stripe Checkout Session for a CONFIRMED order.
//
// GCode charges on approval, not at the storefront: the customer places a
// request (no charge), the operator verifies ownership and confirms the flat
// price, and only then is a payment link minted here for that exact amount.
// This route is operator-only (gated by middleware on the operator session
// cookie); the amount is set by the operator, never by the customer's browser.
export async function POST(req: Request) {
  if (!stripeEnabled()) {
    return NextResponse.json(
      { preview: true, error: 'Payments are not configured yet. Set STRIPE_SECRET_KEY in Vercel.' },
      { status: 501 },
    )
  }

  let body: {
    ref?: string
    email?: string
    amount?: number // dollars, as the operator types it
    description?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }

  const ref = (body.ref ?? '').trim()
  const email = (body.email ?? '').trim()
  const description = (body.description ?? '').trim() || 'GCode Keys — confirmed key service'
  const dollars = Number(body.amount)

  if (!ref) return NextResponse.json({ error: 'Order reference is required.' }, { status: 400 })
  if (!/.+@.+\..+/.test(email)) return NextResponse.json({ error: 'A valid customer email is required.' }, { status: 400 })
  if (!Number.isFinite(dollars) || dollars <= 0) {
    return NextResponse.json({ error: 'Enter the confirmed amount in dollars.' }, { status: 400 })
  }
  // Guard against fat-finger five-figure charges; raise if a job ever needs it.
  if (dollars > 5000) {
    return NextResponse.json({ error: 'Amount over $5,000 — confirm and raise the cap if intended.' }, { status: 400 })
  }
  const amountCents = Math.round(dollars * 100)

  try {
    const stripe = getStripe()
    const origin = siteOrigin(req)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      client_reference_id: ref,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: `GCode Keys · ${ref}`,
              description,
            },
          },
        },
      ],
      payment_intent_data: {
        description: `GCode Keys ${ref}`,
        metadata: { ref },
      },
      metadata: { ref },
      success_url: `${origin}/paid/?ref=${encodeURIComponent(ref)}`,
      cancel_url: `${origin}/paid/?ref=${encodeURIComponent(ref)}&canceled=1`,
    })

    return NextResponse.json({ ok: true, url: session.url, id: session.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
