import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { cleanText } from '@/lib/server/accounts'
import { sharedLimit } from '@/lib/server/limits'
import { report, REPORT_REASONS } from '@/lib/server/safety'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z
  .object({
    context: z.enum(['profile', 'message', 'review', 'listing', 'trip']),
    subjectId: z.string().min(1).max(120),
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(1000),
    alsoBlock: z.boolean(),
  })
  .strict()

/** Report a member, a message, a review or a listing to AVANT. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.message, limitKey: 'report' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const limited = await sharedLimit({ capacity: 10, refillPerSec: 10 / 3600 }, `report:${user.id}`)
  if (limited) return limited
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Choose a reason.')
  const result = await report(user.id, { ...parsed.data, details: cleanText(parsed.data.details) })
  if (result === 'not-found') return problem(404, 'We couldn’t find that.')
  if (result === 'self') return problem(400, 'That’s you.')
  return NextResponse.json({ ok: true })
}
