import { NextResponse, type NextRequest } from 'next/server'
import { cancel } from '@/lib/server/bookings'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem } from '@/lib/security/request'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'trip-change', requireJson: false })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const result = await cancel(user.id, (await params).id)
  if (result === 'not-allowed') return problem(409, 'This trip can’t be cancelled any more.')
  return result === 'ok' ? NextResponse.json({ ok: true }) : problem(404, 'Trip not found.')
}
