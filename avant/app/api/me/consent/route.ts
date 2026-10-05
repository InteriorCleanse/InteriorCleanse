import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { outdatedConsents, recordConsent } from '@/lib/server/consent'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LEGAL_VERSIONS } from '@/lib/legal'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z.object({ documents: z.array(z.enum(['terms', 'privacy'])).min(1).max(2), versions: z.record(z.string().max(20)) }).strict()

/** Accepting updated terms or privacy notice from the in-app prompt, against the versions the page showed. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'consent' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Check the request.')
  const { documents, versions } = parsed.data
  if (documents.some((d) => versions[d] !== LEGAL_VERSIONS[d])) return problem(409, 'The document was just updated again. Refresh to read it.')
  await recordConsent(user.id, documents, 'update')
  return NextResponse.json({ agreements: await outdatedConsents(user.id) })
}
