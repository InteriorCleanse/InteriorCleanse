import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prefsFor, setPrefs } from '@/lib/server/prefs'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

export async function GET() {
  const user = await currentUser()
  if (!user) return signInRequired()
  return NextResponse.json({ prefs: await prefsFor(user.id) })
}

const Channel = z.object({ messages: z.boolean(), offers: z.boolean() }).strict()
const Body = z.object({ prefs: z.object({ email: Channel, push: Channel }).strict() }).strict()

export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'prefs' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Check your choices.')
  await setPrefs(user.id, parsed.data.prefs)
  return NextResponse.json({ prefs: await prefsFor(user.id) })
}
