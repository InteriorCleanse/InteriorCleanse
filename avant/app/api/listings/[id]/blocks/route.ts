import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { addBlock, removeBlock } from '@/lib/server/listings'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/** Takes days off the calendar. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'listing-edit' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = z.object({ start: z.string().max(10), end: z.string().max(10) }).strict().safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Choose the first and last day.')
  const result = await addBlock(user.id, (await params).id, parsed.data.start, parsed.data.end)
  if (result === 'invalid') return problem(400, 'Choose dates from today on, the last day on or after the first, within a year.')
  if (result === 'has-trip') return problem(409, 'A trip is booked on some of those days. Block around it, or message the guest.')
  return result === 'ok' ? NextResponse.json({ ok: true }) : problem(404, 'Listing not found.')
}

/** Puts blocked days back on the calendar: ?block=<id>. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'listing-edit', requireJson: false })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const ok = await removeBlock(user.id, (await params).id, req.nextUrl.searchParams.get('block') ?? '')
  return ok ? NextResponse.json({ ok: true }) : problem(404, 'Not found.')
}
