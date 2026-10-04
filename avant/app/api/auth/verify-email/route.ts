import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createSession, getUser, ownProfile } from '@/lib/server/accounts'
import { grantReferralWelcome } from '@/lib/server/advantage'
import { sharedLimit } from '@/lib/server/limits'
import { verifyEmail } from '@/lib/server/recovery'
import { setAuthCookie } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { clientIp, guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

/** Confirms an email from the link we sent, then signs in on this device. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'auth' })
  if (blocked) return blocked
  const parsed = z.object({ token: z.string().max(64) }).strict().safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'This link is incomplete.')
  const limited = await sharedLimit(LIMITS.auth, `verify-ip:${clientIp(req)}`)
  if (limited) return limited
  const userId = await verifyEmail(parsed.data.token)
  if (!userId) return problem(400, 'This link has expired or was already used. Sign in and we’ll send a new one.')
  await grantReferralWelcome(userId).catch(() => console.error('referral welcome failed'))
  const user = await getUser(userId)
  if (!user) return problem(400, 'This account is no longer active.')
  const session = await createSession(userId)
  await setAuthCookie(session.token, session.expires)
  return NextResponse.json({ user: ownProfile(user) })
}
