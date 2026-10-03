import { after, NextResponse, type NextRequest } from 'next/server'
import { bookingOwner, markPaid, settleRefund } from '@/lib/server/bookings'
import { deliverNotificationEmails } from '@/lib/server/email'
import { currentUser, signInRequired } from '@/lib/server/session'
import { problem } from '@/lib/security/request'

export const runtime = 'nodejs'

/** After Stripe: confirms payment for THIS user's booking. Idempotent. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('session_id') ?? ''
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id) || !process.env.STRIPE_SECRET_KEY) return problem(400, 'Unknown checkout.')
  const user = await currentUser()
  if (!user) return signInRequired()
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`, {
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return problem(502, 'Could not confirm payment yet.')
  const s = (await res.json()) as { payment_status: string; payment_intent: string | null; metadata: { booking?: string; user?: string } }
  if (s.metadata.user !== user.id || !s.metadata.booking) return problem(403, 'This checkout belongs to another account.')
  const owner = await bookingOwner(s.metadata.booking)
  if (!owner || owner.guestId !== user.id) return problem(404, 'Booking not found.')
  if (s.payment_status !== 'paid') return problem(402, 'Payment not completed.')
  const booking = s.metadata.booking
  const status = await markPaid(booking, s.payment_intent ?? id)
  after(async () => {
    await settleRefund(booking)
    await deliverNotificationEmails()
  })
  return NextResponse.json({ bookingId: s.metadata.booking, status })
}
