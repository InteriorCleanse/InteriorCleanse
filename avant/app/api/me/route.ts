import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { tierFor } from '@/lib/circle'
import { NAME_PATTERN, ownProfile, updateProfile } from '@/lib/server/accounts'
import { completedTrips } from '@/lib/server/advantage'
import { outdatedConsents } from '@/lib/server/consent'
import { creditBalance } from '@/lib/server/credit'
import { unreadCounts } from '@/lib/server/inbox'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ user: null })
  const [unread, trips, creditCents, agreements] = await Promise.all([unreadCounts(user.id), completedTrips(user.id), creditBalance(user.id), outdatedConsents(user.id)])
  const tier = tierFor(trips)
  return NextResponse.json({
    user: ownProfile(user),
    unread,
    advantage: { tier: tier.name, feePct: tier.feePct, freeCancelHours: tier.freeCancelHours, creditCents },
    /** Updated documents this person hasn't accepted yet. */
    agreements,
  })
}

const Patch = z.object({ name: z.string().trim().min(2).max(60).regex(NAME_PATTERN).optional(), bio: z.string().trim().max(600).optional() }).strict()

export async function PATCH(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'me' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Patch.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Check your name and bio.')
  const next = await updateProfile(user.id, parsed.data)
  return NextResponse.json({ user: next ? ownProfile(next) : null })
}
