import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { loadRecord, saveRecord } from '@/lib/driver-record'
import { modes } from '@/lib/modes'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'
import { recordKey } from '@/lib/security/session'
import { currentUser, driverKey, signInRequired } from '@/lib/server/session'
import { createLicenceSession } from '@/lib/verification/stripe-identity'

export const runtime = 'nodejs'

const Body = z.object({ licenceYears: z.number().int().min(0).max(80) }).strict()

export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.verify, limitKey: 'verify' })
  if (blocked) return blocked
  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await readJson(req))
  } catch {
    return problem(400, 'Tell us how many years you have been licensed.')
  }
  const user = await currentUser()
  if (!user) return signInRequired()
  const sid = driverKey(user)
  const m = modes()
  if (!m.identity) return NextResponse.json({ demo: true })

  const site = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`
  const session = await createLicenceSession({ returnUrl: `${site}/api/verify/complete`, recordKey: await recordKey(sid) })
  const prev = await loadRecord(sid)
  await saveRecord(sid, { ...prev, pendingProviderRef: session.id, attestedLicenceYears: body.licenceYears })
  return NextResponse.json({ url: session.url })
}
