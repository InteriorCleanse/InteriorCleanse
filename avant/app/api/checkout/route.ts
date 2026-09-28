import { NextResponse, type NextRequest } from 'next/server'
import { priceTrip, TripRequest } from '@/lib/checkout'
import { carTitle } from '@/lib/data'
import { loadRecord, toFacts } from '@/lib/driver-record'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'
import { recordKey, requireSession } from '@/lib/security/session'

export const runtime = 'nodejs'

/**
 * Prices the trip on the server and either opens Stripe Checkout or, with no
 * payment keys, returns the confirmed demo trip. `quote` is always the
 * server's, so the client can show exactly what will be charged.
 */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.checkout, limitKey: 'checkout' })
  if (blocked) return blocked
  let body: TripRequest
  try {
    body = TripRequest.parse(await readJson(req))
  } catch {
    return problem(400, 'Something in the booking is invalid. Refresh and try again.')
  }
  const sid = await requireSession()
  const driver = toFacts(await loadRecord(sid))
  const priced = priceTrip(body, driver)
  if (!priced.ok) return NextResponse.json({ error: priced.error, reasons: priced.reasons }, { status: priced.status })

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ mode: 'demo', quote: priced.quote })
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`
  const form = new URLSearchParams({
    mode: 'payment',
    success_url: `${site}/trips/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/checkout/${priced.car.slug}?start=${body.start}&end=${body.end}`,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(priced.quote.totalCents),
    'line_items[0][price_data][product_data][name]': `${carTitle(priced.car)} · ${body.start} to ${body.end}`,
    'line_items[0][price_data][product_data][description]': priced.quote.lines.map((l) => l.label).join(', ').slice(0, 480),
    'metadata[record]': await recordKey(sid),
    'metadata[trip]': JSON.stringify(body).slice(0, 480),
    'payment_intent_data[metadata][car]': priced.car.id,
  })
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    console.error(`checkout: Stripe ${res.status}`)
    return problem(502, 'Payment is unavailable right now. Nothing was charged.')
  }
  const session = (await res.json()) as { url: string }
  return NextResponse.json({ mode: 'stripe', url: session.url, quote: priced.quote })
}
