import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { endSessionById, sessionsFor } from '@/lib/server/account-settings'
import { authToken, currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

/** Where you're signed in. */
export async function GET() {
  const user = await currentUser()
  if (!user) return signInRequired()
  return NextResponse.json({ sessions: await sessionsFor(user.id, await authToken()) })
}

/** Sign one device out. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'sessions' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = z.object({ end: z.string().max(32) }).strict().safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Choose a device.')
  return (await endSessionById(user.id, parsed.data.end)) ? NextResponse.json({ ok: true }) : problem(404, 'That device is already signed out.')
}
