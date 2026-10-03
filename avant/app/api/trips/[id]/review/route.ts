import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { deliverNotificationEmails } from '@/lib/server/email'
import { leaveReview, MAX_REVIEW } from '@/lib/server/reviews'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z.object({ rating: z.number().int().min(1).max(5), body: z.string().max(MAX_REVIEW) }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard(req, { limit: LIMITS.message, limitKey: 'review' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Choose 1 to 5 stars.')
  const result = await leaveReview(user.id, (await params).id, parsed.data.rating, parsed.data.body)
  if (result === 'duplicate') return problem(409, 'You’ve already reviewed this trip.')
  if (result === 'not-allowed') return problem(409, 'Reviews open when a completed trip ends, for 30 days.')
  if (result === 'not-found') return problem(404, 'Trip not found.')
  after(() => deliverNotificationEmails())
  return NextResponse.json({ ok: true })
}
