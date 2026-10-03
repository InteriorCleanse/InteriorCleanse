import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { respond, settleRefund } from '@/lib/server/bookings'
import { deliverNotificationEmails } from '@/lib/server/email'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

/** The host approves or declines a trip request. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'trip-change' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = z.object({ approve: z.boolean() }).strict().safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Approve or decline.')
  const id = (await params).id
  const result = await respond(user.id, id, parsed.data.approve)
  if (result === 'not-allowed') return problem(409, 'This request was already answered or has expired.')
  if (result !== 'ok') return problem(404, 'Request not found.')
  after(async () => {
    await settleRefund(id)
    await deliverNotificationEmails()
  })
  return NextResponse.json({ ok: true })
}
