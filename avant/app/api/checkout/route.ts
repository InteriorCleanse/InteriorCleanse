import { after, NextResponse, type NextRequest } from 'next/server'
import { priceTrip, TripRequest } from '@/lib/checkout'
import { carTitle } from '@/lib/places'
import { loadRecord, toFacts } from '@/lib/driver-record'
import { createBooking, DatesTaken, expirePending } from '@/lib/server/bookings'
import { creditToApply } from '@/lib/circle'
import { circlePricing } from '@/lib/server/advantage'
import { cityNameFor, findCar, taxRateFor, tzFor } from '@/lib/server/catalog'
import { LEGAL_VERSIONS } from '@/lib/legal'
import { creditBalance } from '@/lib/server/credit'
import { siteUrl } from '@/lib/server/stripe'
import { deliverNotificationEmails } from '@/lib/server/email'
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
  if (body.agreeTerms !== true) return problem(400, 'Agree to the trip terms to book.')
  if (body.termsVersion && body.termsVersion !== LEGAL_VERSIONS.trip_terms) return problem(409, 'The trip terms were just updated. Refresh the page to read them.')
  const record = await loadRecord(driverKey(user))
  const car = await findCar(body.slug)
  // The guest's Circle rate comes from their own completed trips, on the server.
  const priced = priceTrip(car, body, toFacts(record), undefined, { taxRate: car ? taxRateFor(car) : 0, circle: await circlePricing(user.id) })
  if (!priced.ok) return NextResponse.json({ error: priced.error, reasons: priced.reasons }, { status: priced.status })
  if (car!.sample && process.env.NEXT_PUBLIC_AVANT_SAMPLE_FLEET === '0') return problem(404, 'That car is not available.')

  const stripe = process.env.STRIPE_SECRET_KEY
  if (stripe && record.method !== 'stripe_identity') {
    return NextResponse.json({ error: 'Verify your licence to book.', reasons: ['unverified'] }, { status: 403 })
  }

  const wantCredit = body.useCredit === false ? 0 : creditToApply(await creditBalance(user.id), priced.quote.totalCents, Boolean(stripe))
  let booking: { id: string; status: string; creditCents: number }
  try {
    booking = await createBooking({
      guestId: user.id,
      car: priced.car,
      cityName: cityNameFor(priced.car),
      tz: tzFor(priced.car),
      request: body,
      quote: priced.quote,
      paid: stripe ? 'stripe' : 'demo',
      creditCents: wantCredit,
      acceptedTerms: true,
    })
  } catch (err) {
    if (err instanceof DatesTaken) return problem(409, err.message)
    console.error('booking failed')
    return problem(500, 'Couldn’t book that. Nothing was charged.')
  }
  if (!stripe) {
    after(() => deliverNotificationEmails())
    return NextResponse.json({ mode: 'demo', bookingId: booking.id, status: booking.status, quote: priced.quote, creditCents: booking.creditCents })
  }

  const site = siteUrl()
  const form = new URLSearchParams({
    mode: 'payment',
    // Cards only: delayed methods (bank debits) could confirm after the hold ends.
    'payment_method_types[0]': 'card',
    success_url: `${site}/trips/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/checkout/${priced.car.slug}?start=${body.start}&end=${body.end}`,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    // AVANT credit is already taken off; the card pays the rest.
    'line_items[0][price_data][unit_amount]': String(priced.quote.totalCents - booking.creditCents),
    'line_items[0][price_data][product_data][name]': `${carTitle(priced.car)} · ${body.start} to ${body.end}`,
    'line_items[0][price_data][product_data][description]': [
      ...priced.quote.lines.map((l) => l.label),
      ...(booking.creditCents ? [`AVANT credit applied: $${(booking.creditCents / 100).toFixed(2)}`] : []),
    ]
      .join(', ')
      .slice(0, 480),
    'metadata[booking]': booking.id,
    'metadata[user]': user.id,
    // Stripe's minimum is 30 minutes; a minute of slack absorbs clock skew.
    expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
  })
  // Any failure here releases the hold at once and gives back any credit put towards it.
  const failed = async (why: string) => {
    console.error(`checkout: ${why}`)
    await expirePending(booking.id)
    return problem(502, 'Payment is unavailable right now. Nothing was charged.')
  }
  let res: Response
  try {
    res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { authorization: `Bearer ${stripe}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return failed('Stripe unreachable')
  }
  if (!res.ok) return failed(`Stripe ${res.status}`)
  const session = (await res.json()) as { url: string }
  return NextResponse.json({ mode: 'stripe', url: session.url, bookingId: booking.id, quote: priced.quote, creditCents: booking.creditCents })
}
