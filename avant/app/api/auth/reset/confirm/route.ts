import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createSession, getUser, ownProfile } from '@/lib/server/accounts'
import { resetPassword } from '@/lib/server/recovery'
import { setAuthCookie } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { clientIp, guard, problem, readJson } from '@/lib/security/request'
import { notify } from '@/lib/server/bookings'
import { db } from '@/lib/server/db'
import { deliverNotificationEmails } from '@/lib/server/email'
import { sharedLimit } from '@/lib/server/limits'
import { BREACHED_MESSAGE, passwordBreached } from '@/lib/server/pwned'

export const runtime = 'nodejs'

const Body = z.object({ token: z.string().max(64), password: z.string().min(10, 'Use at least 10 characters.').max(200) }).strict()

/** Sets a new password from a reset link and signs in on this device only. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'auth' })
  if (blocked) return blocked
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? 'Check the new password.')
  const limited = await sharedLimit(LIMITS.auth, `reset-confirm-ip:${clientIp(req)}`)
  if (limited) return limited
  if (await passwordBreached(parsed.data.password)) return problem(400, BREACHED_MESSAGE)
  const userId = await resetPassword(parsed.data.token, parsed.data.password)
  if (!userId) return problem(400, 'This link has expired or was already used. Ask for a new one.')
  await notify(await db(), userId, 'Your password was changed', 'Your AVANT password was just reset and every other device was signed out. If this wasn’t you, reset it again now and contact support.', '/account')
  after(() => deliverNotificationEmails())
  const user = await getUser(userId)
  const session = await createSession(userId)
  await setAuthCookie(session.token, session.expires)
  return NextResponse.json({ user: user ? ownProfile(user) : null })
}
