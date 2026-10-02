import { NextResponse } from 'next/server'
import { loadRecord } from '@/lib/driver-record'
import { currentUser, driverKey, signInRequired } from '@/lib/server/session'

export const runtime = 'nodejs'

/** Right of access: everything AVANT holds about this driver, as JSON. */
export async function GET() {
  const user = await currentUser()
  if (!user) return signInRequired()
  const sid = driverKey(user)
  const record = await loadRecord(sid)
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), record }, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="avant-driver-record.json"`,
    },
  })
}
