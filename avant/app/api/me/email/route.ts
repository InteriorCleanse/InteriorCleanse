import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { startEmailChange } from '@/lib/server/account-settings'
import { deliverNotificationEmails, emailConfigured, sendEmail } from '@/lib/server/email'
import { sharedLimit } from '@/lib/server/limits'
import { currentUser, signInRequired } from '@/lib/server/session'
import { siteUrl } from '@/lib/server/stripe'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z.object({ email: z.string().trim().email('Check the email address.').max(200), password: z.string().min(1).max(200) }).strict()

/** Change your email: confirm your password, then click the link we send to the new address. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'email-change' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const limited = await sharedLimit({ capacity: 5, refillPerSec: 5 / 3600 }, `email-change:${user.id}`)
  if (limited) return limited
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? 'Check the form.')
  if (!emailConfigured()) return problem(503, 'Changing your email needs email sending, which isn’t set up in this preview.')
  const out = await startEmailChange(user.id, parsed.data.password, parsed.data.email, siteUrl())
  if (out === 'wrong-password') return problem(403, 'That password isn’t right.')
  if (out === 'same') return problem(400, 'That’s already your email.')
  // An address that already has an account gets the same answer, so this can't be used to find out who uses AVANT.
  if (out !== 'taken') {
    after(async () => {
      await sendEmail({
        to: out.to,
        subject: 'Confirm your new email for AVANT',
        text: `Hi ${out.name.split(/\s+/)[0]},\n\nConfirm this is your new email address for AVANT. The link works once, for the next 24 hours:\n\n${out.link}\n\nIf you didn’t ask for this, ignore this email.`,
      })
      await deliverNotificationEmails()
    })
  }
  return NextResponse.json({ checkEmail: true })
}
