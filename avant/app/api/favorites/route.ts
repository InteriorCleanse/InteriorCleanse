import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { favoritesFor, setFavorite } from '@/lib/server/inbox'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ slugs: null })
  return NextResponse.json({ slugs: await favoritesFor(user.id) })
}

/** Save or unsave one car, or merge a list saved before signing in. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'favorites' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = z
    .object({ slug: z.string().max(120).optional(), on: z.boolean().optional(), merge: z.array(z.string().max(120)).max(200).optional() })
    .strict()
    .safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Unknown change.')
  if (parsed.data.slug) await setFavorite(user.id, parsed.data.slug, parsed.data.on !== false)
  for (const slug of parsed.data.merge ?? []) await setFavorite(user.id, slug, true)
  return NextResponse.json({ slugs: await favoritesFor(user.id) })
}
