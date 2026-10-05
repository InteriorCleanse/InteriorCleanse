import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { block, blocksFor, unblockHandle } from '@/lib/server/safety'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

/** The people you've blocked. */
export async function GET() {
  const user = await currentUser()
  if (!user) return signInRequired()
  return NextResponse.json({ blocked: await blocksFor(user.id) })
}

const Body = z.union([
  z.object({ context: z.enum(['profile', 'message', 'review', 'listing', 'trip']), subjectId: z.string().min(1).max(120), on: z.boolean() }).strict(),
  z.object({ unblock: z.string().min(1).max(400) }).strict(),
])

/** Block or unblock someone, by something of theirs you can see (a trip, a message, a review) or by the handle from your list. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.message, limitKey: 'block' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Check the request.')
  const b = parsed.data
  if ('unblock' in b) return (await unblockHandle(user.id, b.unblock)) ? NextResponse.json({ ok: true }) : problem(404, 'Not found.')
  const result = await block(user.id, b.context, b.subjectId, b.on)
  if (result === 'not-found') return problem(404, 'We couldn’t find that.')
  if (result === 'self') return problem(400, 'That’s you.')
  return NextResponse.json({ ok: true })
}
