import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { confirmEmailChange } from '@/lib/server/account-settings'
import { sendEmail } from '@/lib/server/email'
import { sharedLimit } from '@/lib/server/limits'
import { siteUrl } from '@/lib/server/stripe'
import { LIMITS } from '@/lib/security/rate-limit'
import { clientIp, guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'email-confirm' })
  if (blocked) return blocked
  const limited = await sharedLimit(LIMITS.auth, `email-confirm-ip:${clientIp(req)}`)
  if (limited) return limited
  const parsed = z.object({ token: z.string().max(100) }).strict().safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'That link isn’t valid.')
  const done = await confirmEmailChange(parsed.data.token)
  if (!done) return problem(400, 'This link has expired or was already used.')
  // The old address hears about it directly: it's the owner's last line of defence.
  await sendEmail({
    to: done.oldEmail,
    subject: 'Your AVANT email was changed',
    text: `Hi ${done.name.split(/\s+/)[0]},\n\nThe email address on your AVANT account was just changed. If this was you, there's nothing to do.\n\nIf it wasn't, reset your password at ${siteUrl()}/forgot and contact support right away.`,
  })
  return NextResponse.json({ ok: true })
}
