import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { cleanText } from '@/lib/server/accounts'
import { openClaim } from '@/lib/server/claims'
import { deliverNotificationEmails } from '@/lib/server/email'
import { currentUser, signInRequired } from '@/lib/server/session'
import { CLAIM_KINDS, MAX_CLAIM_PHOTOS, type ClaimKind } from '@/lib/trip-record'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z
  .object({
    kind: z.enum(CLAIM_KINDS.map((k) => k.id) as [ClaimKind, ...ClaimKind[]]),
    description: z.string().trim().min(20, 'Describe what happened in a sentence or two.').max(2000),
    amountCents: z.number().int().min(0).max(5_000_000).optional(),
    photoIds: z.array(z.string().max(40)).max(MAX_CLAIM_PHOTOS).optional(),
    policeReport: z.string().trim().max(60).optional(),
    otherParty: z.string().trim().max(600).optional(),
  })
  .strict()

/** A host reports damage or a charge; a guest reports an accident or breakdown. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard(req, { limit: LIMITS.message, limitKey: 'claims' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? 'Check the report.')
  const b = parsed.data
  const result = await openClaim(user.id, (await params).id, {
    ...b,
    description: cleanText(b.description),
    policeReport: b.policeReport ? cleanText(b.policeReport) : undefined,
    otherParty: b.otherParty ? cleanText(b.otherParty) : undefined,
  })
  if (result === 'not-found') return problem(404, 'Trip not found.')
  if (result === 'not-allowed') return problem(409, 'Reports for this trip are closed. Contact support.')
  if (typeof result === 'object' && 'error' in result) return problem(400, result.error)
  after(() => deliverNotificationEmails())
  return NextResponse.json(result)
}
