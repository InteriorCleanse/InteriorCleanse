import { NextResponse, type NextRequest } from 'next/server'
import { todayIso } from '@/lib/dates'
import { loadRecord, saveRecord } from '@/lib/driver-record'
import { requireSession } from '@/lib/security/session'
import { readLicenceSession, redactLicenceSession } from '@/lib/verification/stripe-identity'
import { recordFromOutcome } from '@/lib/verification/outcome'

export const runtime = 'nodejs'

/**
 * Return URL from the hosted licence check. The session to read comes from
 * the driver's own sealed record, never from the query string, so one
 * person cannot claim another's verification by editing a URL.
 */
export async function GET(req: NextRequest) {
  const sid = await requireSession()
  const prev = await loadRecord(sid)
  const ref = prev.pendingProviderRef
  const back = (q: string) => NextResponse.redirect(new URL(`/verify?${q}`, req.url), 303)
  if (!ref) return back('status=none')

  const outcome = await readLicenceSession(ref)
  const next = recordFromOutcome(prev, outcome, ref, todayIso())
  await saveRecord(sid, next)

  if (outcome.status === 'verified') {
    try {
      await redactLicenceSession(ref)
    } catch {
      console.error('verify: redaction request failed; will retry from the webhook')
    }
    return back('status=verified')
  }
  return back(`status=${outcome.status === 'processing' ? 'processing' : 'retry'}`)
}
