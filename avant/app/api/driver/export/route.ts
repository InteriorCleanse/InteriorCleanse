import { NextResponse } from 'next/server'
import { loadRecord } from '@/lib/driver-record'
import { requireSession } from '@/lib/security/session'

export const runtime = 'nodejs'

/** Right of access: everything AVANT holds about this driver, as JSON. */
export async function GET() {
  const sid = await requireSession()
  const record = await loadRecord(sid)
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), record }, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="avant-driver-record.json"`,
    },
  })
}
