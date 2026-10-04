import { NextResponse, type NextRequest } from 'next/server'
import { REFERRAL } from '@/lib/circle'
import { referrerByCode } from '@/lib/server/advantage'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard } from '@/lib/security/request'

export const runtime = 'nodejs'

/** Who sent an invite link (first name only), so sign-up can say so. */
export async function GET(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'referral' })
  if (blocked) return blocked
  const referrer = await referrerByCode((req.nextUrl.searchParams.get('code') ?? '').toUpperCase())
  return NextResponse.json(referrer ? { firstName: referrer.firstName, creditCents: REFERRAL.friendCreditCents } : { firstName: null })
}
