import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'

/**
 * Every admin API handler calls this first, so the middleware is never the
 * only guard. A future middleware bypass, a matcher typo, or a route moved
 * outside /api/admin would otherwise expose it.
 *
 * Returns a 401 response when the caller has no valid session, else null:
 *
 *   const denied = await requireAdmin()
 *   if (denied) return denied
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const ok = await verifySessionToken(cookies().get(ADMIN_COOKIE)?.value)
  return ok ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
