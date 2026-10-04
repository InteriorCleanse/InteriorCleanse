import { NextResponse, type NextRequest } from 'next/server'
import { loadRecord, toFacts } from '@/lib/driver-record'
import { exportAccount } from '@/lib/server/export'
import { sharedLimit } from '@/lib/server/limits'
import { currentUser, driverKey, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem } from '@/lib/security/request'

export const runtime = 'nodejs'

/** Downloads everything AVANT holds about the signed-in person, as JSON. */
export async function GET(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'export', requireJson: false })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const limited = await sharedLimit({ capacity: 5, refillPerSec: 5 / 3600 }, `export:${user.id}`)
  if (limited) return limited
  const data = await exportAccount(user.id)
  if (!data) return problem(404, 'Account not found.')
  const record = await loadRecord(driverKey(user))
  const body = JSON.stringify({ ...data, driverPass: { facts: toFacts(record), method: record.method, verifiedAt: record.verifiedAt } }, null, 2)
  return new NextResponse(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="avant-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  })
}
