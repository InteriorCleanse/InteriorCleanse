import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Checkout. When STRIPE_SECRET_KEY is set, create a Stripe Checkout Session
// here and return its URL. Until then the store runs in preview mode and this
// endpoint reports that payments are not configured. No key ever lives in the
// repo; set it in Vercel project settings.
export async function POST(req: Request) {
  const hasStripe = !!process.env.STRIPE_SECRET_KEY
  if (!hasStripe) {
    return NextResponse.json(
      { preview: true, message: 'Payments are not configured yet. Add STRIPE_SECRET_KEY to enable checkout.' },
      { status: 501 },
    )
  }

  try {
    const { items } = (await req.json()) as { items?: Array<{ id: string; qty: number }> }
    if (!items?.length) return NextResponse.json({ error: 'Cart is empty.' }, { status: 400 })

    // TODO(launch): build line items from the server-side price table and call
    // stripe.checkout.sessions.create({ mode: 'payment', line_items, ... }).
    // Ownership verification (ID + registration + VIN match) is collected and
    // checked before any key is cut. Programming happens at the vehicle.
    return NextResponse.json({ error: 'Checkout wiring is pending.' }, { status: 501 })
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }
}
