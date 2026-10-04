import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createSession, createUser, EmailTakenError, markEmailVerified, NAME_PATTERN, ownProfile, userByEmail } from '@/lib/server/accounts'
import { applyReferral, grantReferralWelcome } from '@/lib/server/advantage'
import { recordConsent } from '@/lib/server/consent'
import { emailConfigured, existingAccountMessage, sendEmail, verifyEmailMessage } from '@/lib/server/email'
import { sharedLimit } from '@/lib/server/limits'
import { BREACHED_MESSAGE, passwordBreached } from '@/lib/server/pwned'
import { createVerifyLink } from '@/lib/server/recovery'
import { setAuthCookie } from '@/lib/server/session'
import { siteUrl } from '@/lib/server/stripe'
import { LIMITS } from '@/lib/security/rate-limit'
import { clientIp, guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z
  .object({
    name: z.string().trim().min(2, 'Add your name.').max(60).regex(NAME_PATTERN, 'Use letters for your name.'),
    email: z.string().trim().email('Check your email address.').max(200),
    password: z.string().min(10, 'Use at least 10 characters.').max(200),
    /** A friend's referral code from an invite link. */
    ref: z.string().trim().max(12).optional(),
    /** The terms, the privacy notice, and being 18 or older: required, and recorded. */
    accept: z.literal(true, { errorMap: () => ({ message: 'Agree to the terms and confirm you’re 18 or older to continue.' }) }),
  })
  .strict()

/**
 * Creating an account.
 *
 * With email configured (production), the answer is always "check your
 * email", whether or not the address already has an account, so sign-up
 * can't be used to find out who uses AVANT. A new account can't sign in
 * until its owner clicks the link we send; an existing one gets a note
 * instead of a second account.
 *
 * Without email (preview), the account is treated as verified and signed in
 * straight away, since there is no inbox to confirm.
 */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'auth' })
  if (blocked) return blocked
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? 'Check the form.')
  const limited = await sharedLimit(LIMITS.auth, `signup-ip:${clientIp(req)}`)
  if (limited) return limited
  if (await passwordBreached(parsed.data.password)) return problem(400, BREACHED_MESSAGE)
  const { ref, accept: _accepted, ...account } = parsed.data
  const verifyByEmail = emailConfigured()
  try {
    const user = await createUser(account)
    await recordConsent(user.id, ['terms', 'privacy'], 'signup')
    if (ref) await applyReferral(user.id, ref.toUpperCase()).catch(() => console.error('referral link failed'))
    if (verifyByEmail) {
      after(async () => {
        const link = await createVerifyLink(user.id, siteUrl())
        await sendEmail({ to: user.email, ...verifyEmailMessage(user.name, link) })
      })
      return NextResponse.json({ checkEmail: true })
    }
    await markEmailVerified(user.id)
    await grantReferralWelcome(user.id).catch(() => console.error('referral welcome failed'))
    const { token, expires } = await createSession(user.id)
    await setAuthCookie(token, expires)
    return NextResponse.json({ user: ownProfile({ ...user, emailVerified: true }) })
  } catch (err) {
    if (err instanceof EmailTakenError) {
      if (!verifyByEmail) return problem(409, 'There’s already an account with that email. Sign in instead.')
      after(async () => {
        const existing = await userByEmail(account.email)
        if (existing) await sendEmail({ to: existing.email, ...existingAccountMessage(existing.name, siteUrl()) })
      })
      return NextResponse.json({ checkEmail: true })
    }
    console.error('signup failed')
    return problem(500, 'Couldn’t create the account. Try again.')
  }
}
