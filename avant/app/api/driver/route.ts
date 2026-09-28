import { NextResponse, type NextRequest } from 'next/server'
import { deleteRecord, loadRecord, toFacts } from '@/lib/driver-record'
import { modes } from '@/lib/modes'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard } from '@/lib/security/request'
import { requireSession } from '@/lib/security/session'
import { redactLicenceSession, stripeIdentityConfigured } from '@/lib/verification/stripe-identity'

export const runtime = 'nodejs'

/** The driver's facts and how they were verified. Nothing else exists to return. */
export async function GET() {
  const sid = await requireSession()
  const r = await loadRecord(sid)
  return NextResponse.json({
    facts: toFacts(r),
    method: r.method,
    verifiedAt: r.verifiedAt,
    pending: Boolean(r.pendingProviderRef),
    modes: modes(),
  })
}

/** Right to erasure: delete the record and ask the provider to redact too. */
export async function DELETE(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.default, limitKey: 'driver-delete', requireJson: false })
  if (blocked) return blocked
  const sid = await requireSession()
  const r = await loadRecord(sid)
  const ref = r.providerRef ?? r.pendingProviderRef
  if (ref && stripeIdentityConfigured()) {
    try {
      await redactLicenceSession(ref)
    } catch {
      console.error('driver delete: provider redaction failed; queued for manual follow-up')
    }
  }
  await deleteRecord(sid)
  return NextResponse.json({ deleted: true })
}
