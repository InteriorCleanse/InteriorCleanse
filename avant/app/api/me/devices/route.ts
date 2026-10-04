import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { tokenHash } from '@/lib/server/accounts'
import { isDeviceToken, registerDevice, removeDevice } from '@/lib/server/push'
import { authToken, currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

const Body = z.object({ token: z.string().refine(isDeviceToken) }).strict()

/** The iOS app registers its push token here once the person allows notifications. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'devices' })
  if (blocked) return blocked
  const user = await currentUser()
  const session = await authToken()
  if (!user || !session) return signInRequired()
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'That isn’t a device token.')
  await registerDevice(user.id, tokenHash(session), parsed.data.token.toLowerCase())
  return NextResponse.json({ ok: true })
}

/** Turning notifications off on this device. */
export async function DELETE(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'devices' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'That isn’t a device token.')
  await removeDevice(user.id, parsed.data.token.toLowerCase())
  return NextResponse.json({ ok: true })
}
