import { NextResponse, type NextRequest } from 'next/server'
import { endSession } from '@/lib/server/accounts'
import { authToken, clearAuthCookie } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard } from '@/lib/security/request'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'logout', requireJson: false })
  if (blocked) return blocked
  await endSession(await authToken())
  await clearAuthCookie()
  return NextResponse.json({ ok: true })
}
