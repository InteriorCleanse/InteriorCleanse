import { after, NextResponse, type NextRequest } from 'next/server'
import { cancel, settleRefund } from '@/lib/server/bookings'
import { deliverNotificationEmails } from '@/lib/server/email'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem } from '@/lib/security/request'

export const runtime = 'nodejs'

/** Cancels an upcoming trip; any refund is sent to Stripe after the response. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'trip-change', requireJson: false })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const id = (await params).id
  const { result, refundCents } = await cancel(user.id, id)
  if (result === 'not-allowed') return problem(409, 'This trip can’t be cancelled any more.')
  if (result !== 'ok') return problem(404, 'Trip not found.')
  after(async () => {
    await settleRefund(id)
    await deliverNotificationEmails()
  })
  return NextResponse.json({ ok: true, refundCents })
}
