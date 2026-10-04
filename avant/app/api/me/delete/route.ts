import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticate, deleteAccount } from '@/lib/server/accounts'
import { eraseDriverPass } from '@/lib/server/erase'
import { clearAuthCookie, currentUser, driverKey, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'
import { sharedLimit } from '@/lib/server/limits'

export const runtime = 'nodejs'

/** Closes the signed-in account after re-checking the password. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.auth, limitKey: 'account-close' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const limited = await sharedLimit(LIMITS.auth, `close:${user.id}`)
  if (limited) return limited
  const parsed = z.object({ password: z.string().max(200) }).strict().safeParse(await readJson(req).catch(() => null))
  if (!parsed.success || !(await authenticate(user.email, parsed.data.password))) return problem(403, 'That password isn’t right.')
  const result = await deleteAccount(user.id)
  if (result === 'has-trips') return problem(409, 'You have upcoming trips. Cancel or finish them first, then close your account.')
  await eraseDriverPass(driverKey(user))
  await clearAuthCookie()
  return NextResponse.json({ deleted: true })
}
