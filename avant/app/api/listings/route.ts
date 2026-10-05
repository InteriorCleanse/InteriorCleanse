import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { BODY_TYPES, FEATURE_IDS, FUELS, TRANSMISSIONS } from '@/lib/catalog'
import { LEGAL_VERSIONS } from '@/lib/legal'
import { createListing, ListingRejected } from '@/lib/server/listings'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'
import type { BodyType, FeatureId, Fuel, Transmission } from '@/lib/types'

export const runtime = 'nodejs'

const Draft = z
  .object({
    vin: z.string().max(24),
    year: z.number().int(),
    make: z.string().trim().max(40),
    model: z.string().trim().max(60),
    body: z.enum(BODY_TYPES.map((b) => b.id) as [BodyType, ...BodyType[]]),
    fuel: z.enum(FUELS.map((f) => f.id) as [Fuel, ...Fuel[]]),
    transmission: z.enum(TRANSMISSIONS.map((t) => t.id) as [Transmission, ...Transmission[]]),
    seats: z.number().int(),
    miles: z.number().int(),
    city: z.string().max(40),
    neighborhood: z.string().trim().max(60),
    deliveryOffered: z.boolean(),
    deliveryFeeCents: z.number().int(),
    dailyRateCents: z.number().int(),
    weeklyDiscountPct: z.number().int(),
    monthlyDiscountPct: z.number().int(),
    milesPerDay: z.number().int(),
    instantBook: z.boolean(),
    noOpenRecalls: z.boolean(),
    insuredAndRegistered: z.boolean(),
    color: z.string().max(20),
    description: z.string().max(1600),
    features: z.array(z.enum(FEATURE_IDS as [FeatureId, ...FeatureId[]])).max(30),
    rules: z.array(z.string().trim().max(160)).max(10),
    efficiency: z.number(),
    welcome: z.string().trim().max(600).optional(),
    pickup: z.string().trim().max(600).optional(),
  })
  .strict()

const Body = z
  .object({
    draft: Draft,
    photoIds: z.array(z.string().max(40)).max(12),
    /** The Host Agreement, accepted on the review step: required, and recorded. */
    acceptHostAgreement: z.literal(true),
    /** The version of the Host Agreement the host's page showed. */
    agreementVersion: z.string().max(20).optional(),
  })
  .strict()

export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.upload, limitKey: 'listing' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) {
    const agreement = parsed.error.issues.some((i) => i.path[0] === 'acceptHostAgreement')
    return problem(400, agreement ? 'Agree to the Host Agreement to publish.' : 'Something in the listing is invalid. Check each step.')
  }
  try {
    if (parsed.data.agreementVersion && parsed.data.agreementVersion !== LEGAL_VERSIONS.host_agreement) {
      return problem(409, 'The Host Agreement was just updated. Refresh the page to read it.')
    }
    return NextResponse.json(await createListing(user.id, parsed.data.draft, parsed.data.photoIds, undefined, true))
  } catch (err) {
    if (err instanceof ListingRejected) return NextResponse.json({ error: err.message, problems: err.problems }, { status: 422 })
    console.error('listing create failed')
    return problem(500, 'Couldn’t publish the listing. Try again.')
  }
}
