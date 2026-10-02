import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { deleteListing, setListingStatus } from '@/lib/server/listings'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'listing-edit' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = z.object({ status: z.enum(['live', 'paused']) }).strict().safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Unknown change.')
  return (await setListingStatus(user.id, (await params).id, parsed.data.status)) ? NextResponse.json({ ok: true }) : problem(404, 'Listing not found.')
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'listing-edit', requireJson: false })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const result = await deleteListing(user.id, (await params).id)
  if (result === 'has-trips') return problem(409, 'This car has upcoming trips. Pause it instead; delete once they’re done.')
  return result === 'deleted' ? NextResponse.json({ ok: true }) : problem(404, 'Listing not found.')
}
