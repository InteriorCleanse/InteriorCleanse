import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticate, createSession, endAllSessions, setPassword } from '@/lib/server/accounts'
import { notify } from '@/lib/server/bookings'
import { db } from '@/lib/server/db'
import { deliverNotificationEmails } from '@/lib/server/email'
import { sharedLimit } from '@/lib/server/limits'
import { BREACHED_MESSAGE, passwordBreached } from '@/lib/server/pwned'
import { currentUser, setAuthCookie, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z.object({ current: z.string().max(200), next: z.string().min(10, 'Use at least 10 characters.').max(200) }).strict()

/** Changes the password after re-checking the current one; signs out every other device. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'password' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? 'Check the new password.')
  const limited = await sharedLimit(LIMITS.auth, `password:${user.id}`)
  if (limited) return limited
  if (!(await authenticate(user.email, parsed.data.current))) return problem(403, 'Your current password isn’t right.')
  if (await passwordBreached(parsed.data.next)) return problem(400, BREACHED_MESSAGE)
  await setPassword(user.id, parsed.data.next)
  await endAllSessions(user.id)
  const session = await createSession(user.id)
  await setAuthCookie(session.token, session.expires)
  await notify(await db(), user.id, 'Your password was changed', 'Your AVANT password was changed and every other device was signed out. If this wasn’t you, reset your password now and contact support.', '/account')
  after(() => deliverNotificationEmails())
  return NextResponse.json({ ok: true })
}
