import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticate, createSession, ownProfile } from '@/lib/server/accounts'
import { emailConfigured, sendEmail, verifyEmailMessage } from '@/lib/server/email'
import { sharedLimit } from '@/lib/server/limits'
import { createVerifyLink } from '@/lib/server/recovery'
import { setAuthCookie } from '@/lib/server/session'
import { siteUrl } from '@/lib/server/stripe'
import { LIMITS, take } from '@/lib/security/rate-limit'
import { clientIp, guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z.object({ email: z.string().trim().max(200), password: z.string().max(200) }).strict()

export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'auth' })
  if (blocked) return blocked
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Enter your email and password.')
  const email = parsed.data.email.toLowerCase()
  const ip = clientIp(req)
  // Strict per email+address, so a stranger can't lock someone out by
  // failing their password; looser per email and per address, shared by
  // every server instance, against guessing from many places at once.
  if (!take(`login:${email}:${ip}`, LIMITS.auth).ok) return problem(429, 'Too many attempts. Try again in a few minutes.')
  const limited =
    (await sharedLimit(LIMITS.auth, `login-email-ip:${email}:${ip}`)) ??
    (await sharedLimit({ capacity: 30, refillPerSec: 30 / 3600 }, `login-email:${email}`)) ??
    (await sharedLimit({ capacity: 30, refillPerSec: 30 / 600 }, `login-ip:${ip}`))
  if (limited) return limited
  const user = await authenticate(parsed.data.email, parsed.data.password)
  if (!user) return problem(401, 'That email and password don’t match.')
  if (emailConfigured() && !user.emailVerified) {
    // The right password proves it's them, so a fresh link is safe to send.
    after(async () => {
      const link = await createVerifyLink(user.id, siteUrl())
      await sendEmail({ to: user.email, ...verifyEmailMessage(user.name, link) })
    })
    return NextResponse.json({ error: 'Confirm your email first. We’ve sent you a new link.', verifyEmail: true }, { status: 403 })
  }
  const { token, expires } = await createSession(user.id)
  await setAuthCookie(token, expires)
  return NextResponse.json({ user: ownProfile(user) })
}
