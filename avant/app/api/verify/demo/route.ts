import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { loadRecord, saveRecord } from '@/lib/driver-record'
import { isIsoDate, todayIso } from '@/lib/dates'
import { ageOn } from '@/lib/eligibility'
import { modes } from '@/lib/modes'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'
import { currentUser, driverKey, signInRequired } from '@/lib/server/session'

export const runtime = 'nodejs'

/**
 * Demo verification: no document is checked, and the record says so
 * (method "demo"). The birth date is used once to compute an age and is
 * never stored or logged.
 */
const Body = z
  .object({
    birthDate: z.string().refine(isIsoDate, 'Invalid birth date'),
    licenceExpires: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    licenceState: z.string().regex(/^[A-Z]{2}$/),
    licenceYears: z.number().int().min(0).max(80),
    cleanRecord: z.boolean(),
  })
  .strict()

export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.verify, limitKey: 'verify' })
  if (blocked) return blocked
  if (!modes().demoVerifyAllowed) return problem(403, 'Demo verification is off. Use the secure licence check.')
  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await readJson(req))
  } catch {
    return problem(400, 'Check the highlighted fields.')
  }
  const today = todayIso()
  const age = ageOn(body.birthDate, today)
  if (age < 16 || age > 110) return problem(400, 'That birth date does not look right.')
  if (body.licenceYears > age - 14) return problem(400, 'Years licensed is longer than seems possible for that age.')

  const user = await currentUser()
  if (!user) return signInRequired()
  const sid = driverKey(user)
  const prev = await loadRecord(sid)
  await saveRecord(sid, {
    ...prev,
    age,
    licenceYears: body.licenceYears,
    attestedLicenceYears: body.licenceYears,
    licenceExpires: body.licenceExpires,
    licenceState: body.licenceState,
    cleanRecord: body.cleanRecord,
    verified: true,
    method: 'demo',
    verifiedAt: new Date().toISOString(),
    providerRef: null,
    pendingProviderRef: null,
  })
  return NextResponse.json({ ok: true, age })
}
