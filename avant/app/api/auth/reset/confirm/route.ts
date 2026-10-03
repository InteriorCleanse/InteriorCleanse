import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createSession, getUser, publicProfile } from '@/lib/server/accounts'
import { resetPassword } from '@/lib/server/recovery'
import { setAuthCookie } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z.object({ token: z.string().max(64), password: z.string().min(10, 'Use at least 10 characters.').max(200) }).strict()

/** Sets a new password from a reset link and signs in on this device only. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'auth' })
  if (blocked) return blocked
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? 'Check the new password.')
  const userId = await resetPassword(parsed.data.token, parsed.data.password)
  if (!userId) return problem(400, 'This link has expired or was already used. Ask for a new one.')
  const user = await getUser(userId)
  const session = await createSession(userId)
  await setAuthCookie(session.token, session.expires)
  return NextResponse.json({ user: user ? { ...publicProfile(user), email: user.email } : null })
}
