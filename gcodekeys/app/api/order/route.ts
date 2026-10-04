import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Order request intake. In preview this validates and returns a reference so
// the flow is real end-to-end; at launch, persist the order, store the
// ownership documents in encrypted storage, create the Stripe payment intent
// after the operator confirms the flat price, and notify dispatch.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      items?: Array<{ name: string; qty: number }>
      contact?: { name?: string; email?: string; phone?: string }
      vehicle?: string
      ownershipConfirmed?: boolean
    }
    if (!body.items?.length) return NextResponse.json({ error: 'Your bag is empty.' }, { status: 400 })
    if (!body.contact?.name || !body.contact?.email) return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 })
    if (!body.vehicle) return NextResponse.json({ error: 'Tell us the vehicle.' }, { status: 400 })
    if (!body.ownershipConfirmed) return NextResponse.json({ error: 'Ownership must be confirmed.' }, { status: 400 })

    const ref = 'GCK-' + Math.random().toString(36).slice(2, 7).toUpperCase() + '-' + Date.now().toString(36).slice(-4).toUpperCase()
    // TODO(launch): persist order + documents; confirm price; create payment.
    return NextResponse.json({ ok: true, ref, preview: true })
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }
}
