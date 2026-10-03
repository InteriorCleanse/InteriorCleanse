import { after, NextResponse } from 'next/server'
import { expireRequests, settleRefund, tripsFor } from '@/lib/server/bookings'
import { deliverNotificationEmails } from '@/lib/server/email'
import { currentUser, signInRequired } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function GET() {
  const user = await currentUser()
  if (!user) return signInRequired()
  // Requests are also expired by the daily cron; doing it here keeps the
  // 8-hour promise exact for whoever looks first.
  const expired = await expireRequests()
  if (expired.length) {
    after(async () => {
      for (const id of expired) await settleRefund(id)
      await deliverNotificationEmails()
    })
  }
  return NextResponse.json({ trips: await tripsFor(user.id) })
}
