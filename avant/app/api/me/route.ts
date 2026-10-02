import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { publicProfile, updateProfile } from '@/lib/server/accounts'
import { unreadCounts } from '@/lib/server/inbox'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ user: null })
  return NextResponse.json({ user: { ...publicProfile(user), email: user.email }, unread: await unreadCounts(user.id) })
}

const Patch = z.object({ name: z.string().trim().min(2).max(60).optional(), bio: z.string().trim().max(600).optional() }).strict()

export async function PATCH(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'me' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Patch.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Check your name and bio.')
  const next = await updateProfile(user.id, parsed.data)
  return NextResponse.json({ user: next ? { ...publicProfile(next), email: next.email } : null })
}
