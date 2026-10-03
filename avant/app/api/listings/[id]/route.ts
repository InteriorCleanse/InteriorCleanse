import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { FEATURE_IDS } from '@/lib/catalog'
import { PHOTO_ANGLES } from '@/lib/listing'
import { deleteListing, listingForHost, ListingRejected, setListingStatus, updateListing } from '@/lib/server/listings'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'
import type { FeatureId } from '@/lib/types'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

const Changes = z
  .object({
    dailyRateCents: z.number().int(),
    weeklyDiscountPct: z.number().int(),
    monthlyDiscountPct: z.number().int(),
    milesPerDay: z.number().int(),
    instantBook: z.boolean(),
    deliveryOffered: z.boolean(),
    deliveryFeeCents: z.number().int(),
    description: z.string().max(1600),
    features: z.array(z.enum(FEATURE_IDS as [FeatureId, ...FeatureId[]])).max(30),
    rules: z.array(z.string().trim().max(160)).max(10),
    neighborhood: z.string().trim().max(60),
    efficiency: z.number(),
    color: z.string().max(20),
  })
  .strict()
  .partial()

const Patch = z.union([
  z.object({ status: z.enum(['live', 'paused']) }).strict(),
  z
    .object({
      changes: Changes,
      photo: z.object({ angle: z.enum(PHOTO_ANGLES.map((a) => a.id) as [string, ...string[]]), photoId: z.string().max(40) }).strict().optional(),
    })
    .strict(),
])

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await currentUser()
  if (!user) return signInRequired()
  const listing = await listingForHost(user.id, (await params).id)
  return listing ? NextResponse.json({ listing }) : problem(404, 'Listing not found.')
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'listing-edit' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Patch.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Unknown change.')
  const id = (await params).id
  if ('status' in parsed.data) {
    return (await setListingStatus(user.id, id, parsed.data.status)) ? NextResponse.json({ ok: true }) : problem(404, 'Listing not found.')
  }
  try {
    const ok = await updateListing(user.id, id, parsed.data.changes, parsed.data.photo)
    return ok ? NextResponse.json({ ok: true }) : problem(404, 'Listing not found.')
  } catch (err) {
    if (err instanceof ListingRejected) return NextResponse.json({ error: err.message, problems: err.problems }, { status: 422 })
    console.error('listing update failed')
    return problem(500, 'Couldn’t save that. Try again.')
  }
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
