import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createSession, createUser, EmailTakenError, publicProfile } from '@/lib/server/accounts'
import { applyReferral } from '@/lib/server/advantage'
import { setAuthCookie } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z
  .object({
    name: z.string().trim().min(2, 'Add your name.').max(60),
    email: z.string().trim().email('Check your email address.').max(200),
    password: z.string().min(10, 'Use at least 10 characters.').max(200),
    /** A friend's referral code from an invite link. */
    ref: z.string().trim().max(12).optional(),
  })
  .strict()

export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'auth' })
  if (blocked) return blocked
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? 'Check the form.')
  try {
    const { ref, ...account } = parsed.data
    const user = await createUser(account)
    if (ref) await applyReferral(user.id, ref.toUpperCase()).catch(() => console.error('referral link failed'))
    const { token, expires } = await createSession(user.id)
    await setAuthCookie(token, expires)
    return NextResponse.json({ user: { ...publicProfile(user), email: user.email } })
  } catch (err) {
    if (err instanceof EmailTakenError) return problem(409, 'There’s already an account with that email. Sign in instead.')
    console.error('signup failed')
    return problem(500, 'Couldn’t create the account. Try again.')
  }
}
