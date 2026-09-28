import { NextResponse, type NextRequest } from 'next/server'
import { priceTrip, TripRequest } from '@/lib/checkout'
import { loadRecord, toFacts } from '@/lib/driver-record'
import { open } from '@/lib/security/crypto'
import { encryptionKeys } from '@/lib/security/keys'
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
  const s = (await res.json()) as { payment_status: string; amount_total: number; metadata: { record?: string; trip?: string; addr?: string } }
  const sid = await requireSession()
  const key = await recordKey(sid)
  if (s.metadata.record !== key) return problem(403, 'This checkout belongs to another session.')
  if (s.payment_status !== 'paid') return problem(402, 'Payment not completed.')

  const deliveryAddress = s.metadata.addr ? ((await open(s.metadata.addr, encryptionKeys(), key)) ?? '') : ''
  const parsed = TripRequest.safeParse({ ...JSON.parse(s.metadata.trip ?? '{}'), deliveryAddress })
  if (!parsed.success) return problem(500, 'Paid, but the booking details could not be read. Support has your payment reference.')
  const trip = parsed.data
  // Already paid: re-price for the receipt, without re-running checks that
  // could now fail only because time has passed.
  const priced = priceTrip(trip, toFacts(await loadRecord(sid)), undefined, { paid: true })
  if (!priced.ok) return problem(500, 'Paid, but the booking details could not be read. Support has your payment reference.')
  return NextResponse.json({ trip, quote: { ...priced.quote, totalCents: s.amount_total } })
}
