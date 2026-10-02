import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticate, createSession, publicProfile } from '@/lib/server/accounts'
import { setAuthCookie } from '@/lib/server/session'
import { LIMITS, take } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z.object({ email: z.string().trim().max(200), password: z.string().max(200) }).strict()

export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'auth' })
  if (blocked) return blocked
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Enter your email and password.')
  // Per-account limit too, so one address cannot be guessed from many IPs.
  if (!take(`login:${parsed.data.email.toLowerCase()}`, LIMITS.auth).ok) return problem(429, 'Too many attempts. Try again in a few minutes.')
  const user = await authenticate(parsed.data.email, parsed.data.password)
  if (!user) return problem(401, 'That email and password don’t match.')
  const { token, expires } = await createSession(user.id)
  await setAuthCookie(token, expires)
  return NextResponse.json({ user: { ...publicProfile(user), email: user.email } })
}
