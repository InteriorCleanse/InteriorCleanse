import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { resetEmail, sendEmail } from '@/lib/server/email'
import { createResetLink } from '@/lib/server/recovery'
import { siteUrl } from '@/lib/server/stripe'
import { LIMITS, take } from '@/lib/security/rate-limit'
import { clientIp, guard, problem, readJson } from '@/lib/security/request'
import { sharedLimit } from '@/lib/server/limits'

export const runtime = 'nodejs'

/**
 * Sends a reset link. Always answers the same way, whether or not the email
 * has an account, and sends after responding, so neither the reply nor its
 * timing says who is registered.
 */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'auth' })
  if (blocked) return blocked
  const parsed = z.object({ email: z.string().trim().email().max(200) }).strict().safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Enter the email on your account.')
  const email = parsed.data.email.toLowerCase()
  const limited = await sharedLimit(LIMITS.auth, `reset-ip:${clientIp(req)}`)
  if (limited) return limited
  // Per address: quietly stop sending, but answer the same way, so the limit reveals nothing.
  const fresh = take(`reset:${email}`, LIMITS.auth).ok && !(await sharedLimit({ capacity: 3, refillPerSec: 3 / 3600 }, `reset-email:${email}`))
  if (fresh) {
    after(async () => {
      const link = await createResetLink(email, siteUrl())
      if (!link) return
      const sent = await sendEmail({ to: link.to, ...resetEmail(link.name, link.link) })
      // Without an email provider, development prints the link instead.
      if (!sent && process.env.NODE_ENV !== 'production') console.info(`password reset link (dev only): ${link.link}`)
    })
  }
  return NextResponse.json({ ok: true })
}
