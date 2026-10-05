import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { cleanText, NAME_PATTERN } from '@/lib/server/accounts'
import { notifyTeam, saveLead } from '@/lib/server/leads'
import { sharedLimit } from '@/lib/server/limits'
import { LIMITS } from '@/lib/security/rate-limit'
import { clientIp, guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const tag = z.string().trim().max(60).regex(/^[\w .-]*$/).optional()
const Body = z
  .object({
    name: z.string().trim().min(2, 'Add your name.').max(60).regex(NAME_PATTERN, 'Use letters for your name.'),
    email: z.string().trim().email('Check your email address.').max(200),
    phone: z.string().trim().max(30).regex(/^[\d +().-]*$/, 'Check the phone number.').optional(),
    city: z.string().trim().min(2, 'Add your city.').max(60),
    car: z.string().trim().min(3, 'Tell us the car.').max(80),
    cars: z.number().int().min(1).max(500),
    consent: z.literal(true, { errorMap: () => ({ message: 'Tick the box so we can contact you.' }) }),
    source: tag,
    medium: tag,
    campaign: tag,
    /** A field people never see; bots fill it in. */
    website: z.string().max(0).optional(),
  })
  .strict()

/** "Tell me more about hosting": no account needed. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'host-lead' })
  if (blocked) return blocked
  const limited = await sharedLimit({ capacity: 5, refillPerSec: 5 / 3600 }, `host-lead:${clientIp(req)}`)
  if (limited) return limited
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? 'Check the form.')
  const { consent: _c, website: _w, ...b } = parsed.data
  const lead = { ...b, name: cleanText(b.name), city: cleanText(b.city), car: cleanText(b.car) }
  await saveLead(lead)
  after(() => notifyTeam(lead).catch(() => console.error('lead email failed')))
  return NextResponse.json({ ok: true })
}
