import { NextResponse, type NextRequest } from 'next/server'
import { endAllSessions } from '@/lib/server/accounts'
import { clearAuthCookie, currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard } from '@/lib/security/request'

export const runtime = 'nodejs'

/** Signs this account out on every device, this one included. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'logout-all', requireJson: false })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  await endAllSessions(user.id)
  await clearAuthCookie()
  return NextResponse.json({ ok: true })
}
