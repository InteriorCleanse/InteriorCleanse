import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { cleanText } from '@/lib/server/accounts'
import { respondToClaim, withdrawClaim } from '@/lib/server/claims'
import { deliverNotificationEmails } from '@/lib/server/email'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z.union([
  z.object({ action: z.literal('respond'), accepts: z.boolean(), response: z.string().trim().max(2000) }).strict(),
  z.object({ action: z.literal('withdraw') }).strict(),
])

/** The other side responds to a report once; the person who made it can withdraw it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard(req, { limit: LIMITS.message, limitKey: 'claims' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Check your response.')
  const id = (await params).id
  const b = parsed.data
  if (b.action === 'respond' && !b.accepts && b.response.length < 10) return problem(400, 'Tell us your side in a sentence or two.')
  const result = b.action === 'respond' ? await respondToClaim(user.id, id, b.accepts, cleanText(b.response)) : await withdrawClaim(user.id, id)
  if (result === 'not-found') return problem(404, 'Report not found.')
  if (result === 'not-allowed') return problem(409, 'This report has already been answered.')
  after(() => deliverNotificationEmails())
  return NextResponse.json({ ok: true })
}
