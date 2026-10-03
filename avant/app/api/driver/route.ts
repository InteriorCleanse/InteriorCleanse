import { NextResponse, type NextRequest } from 'next/server'
import { EMPTY_RECORD, loadRecord, toFacts } from '@/lib/driver-record'
import { modes } from '@/lib/modes'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard } from '@/lib/security/request'
import { currentUser, driverKey, signInRequired } from '@/lib/server/session'
import { eraseDriverPass } from '@/lib/server/erase'

export const runtime = 'nodejs'

/** The driver's facts and how they were verified. Nothing else exists to return. */
export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ facts: toFacts(EMPTY_RECORD), method: null, verifiedAt: null, pending: false, modes: modes(), signedIn: false })
  const sid = driverKey(user)
  const r = await loadRecord(sid)
  return NextResponse.json({
    facts: toFacts(r),
    method: r.method,
    verifiedAt: r.verifiedAt,
    pending: Boolean(r.pendingProviderRef),
    modes: modes(),
    signedIn: true,
  })
}

/** Right to erasure: delete the record and ask the provider to redact too. */
export async function DELETE(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'driver-delete', requireJson: false })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  await eraseDriverPass(driverKey(user))
  return NextResponse.json({ deleted: true })
}
