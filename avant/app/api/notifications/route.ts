import { NextResponse, type NextRequest } from 'next/server'
import { markNotificationsRead, notificationsFor } from '@/lib/server/inbox'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard } from '@/lib/security/request'

export const runtime = 'nodejs'

export async function GET() {
  const user = await currentUser()
  if (!user) return signInRequired()
  return NextResponse.json({ notifications: await notificationsFor(user.id) })
}

/** Marks every notification read. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'notifications', requireJson: false })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  await markNotificationsRead(user.id)
  return NextResponse.json({ ok: true })
}
