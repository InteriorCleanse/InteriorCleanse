import { NextResponse, type NextRequest } from 'next/server'
import { priceTrip, TripRequest } from '@/lib/checkout'
import { carTitle } from '@/lib/places'
import { loadRecord, toFacts } from '@/lib/driver-record'
import { createBooking, DatesTaken } from '@/lib/server/bookings'
import { cityNameFor, findCar, taxRateFor } from '@/lib/server/catalog'
import { currentUser, driverKey, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

/**
 * Books a trip. The server loads the car, re-checks dates and eligibility,
 * re-prices, and takes a hold on the dates inside a transaction. With
 * payments live, the hold lasts 30 minutes while Stripe Checkout runs.
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
  const user = await currentUser()
  if (!user) return signInRequired()
  const record = await loadRecord(driverKey(user))
  const car = await findCar(body.slug)
  const priced = priceTrip(car, body, toFacts(record), undefined, { taxRate: car ? taxRateFor(car) : 0 })
  if (!priced.ok) return NextResponse.json({ error: priced.error, reasons: priced.reasons }, { status: priced.status })
  if (car!.sample && process.env.NEXT_PUBLIC_AVANT_SAMPLE_FLEET === '0') return problem(404, 'That car is not available.')

  const stripe = process.env.STRIPE_SECRET_KEY
  if (stripe && record.method !== 'stripe_identity') {
    return NextResponse.json({ error: 'Verify your licence to book.', reasons: ['unverified'] }, { status: 403 })
  }

  let booking: { id: string; status: string }
  try {
    booking = await createBooking({ guestId: user.id, car: priced.car, cityName: cityNameFor(priced.car), request: body, quote: priced.quote, paid: stripe ? 'stripe' : 'demo' })
  } catch (err) {
    if (err instanceof DatesTaken) return problem(409, err.message)
    console.error('booking failed')
    return problem(500, 'Couldn’t book that. Nothing was charged.')
  }
  if (!stripe) return NextResponse.json({ mode: 'demo', bookingId: booking.id, status: booking.status, quote: priced.quote })

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
    'metadata[booking]': booking.id,
    'metadata[user]': user.id,
    expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
  })
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${stripe}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    console.error(`checkout: Stripe ${res.status}`)
    return problem(502, 'Payment is unavailable right now. Nothing was charged.')
  }
  const session = (await res.json()) as { url: string }
  return NextResponse.json({ mode: 'stripe', url: session.url, bookingId: booking.id, quote: priced.quote })
}
