import { NextResponse, type NextRequest } from 'next/server'
import { priceTrip, TripRequest } from '@/lib/checkout'
import { loadRecord, toFacts } from '@/lib/driver-record'
import { problem } from '@/lib/security/request'
import { recordKey, requireSession } from '@/lib/security/session'

export const runtime = 'nodejs'

/** After Stripe: confirms payment for THIS session and returns the trip. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('session_id') ?? ''
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id) || !process.env.STRIPE_SECRET_KEY) return problem(400, 'Unknown checkout.')
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`, {
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return problem(502, 'Could not confirm payment yet.')
  const s = (await res.json()) as { payment_status: string; amount_total: number; metadata: { record?: string; trip?: string } }
  const sid = await requireSession()
  if (s.metadata.record !== (await recordKey(sid))) return problem(403, 'This checkout belongs to another session.')
  if (s.payment_status !== 'paid') return problem(402, 'Payment not completed.')
  const trip = TripRequest.parse(JSON.parse(s.metadata.trip ?? '{}'))
  const priced = priceTrip(trip, toFacts(await loadRecord(sid)))
  if (!priced.ok) return problem(409, priced.error)
  return NextResponse.json({ trip, quote: { ...priced.quote, totalCents: s.amount_total } })
}
