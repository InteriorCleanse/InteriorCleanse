import { NextResponse, type NextRequest } from 'next/server'
import { todayIso } from '@/lib/dates'
import { loadByKey, saveByKey } from '@/lib/driver-record'
import { readCapped } from '@/lib/security/request'
import { readLicenceSession, redactLicenceSession } from '@/lib/verification/stripe-identity'
import { recordFromOutcome } from '@/lib/verification/outcome'
import { verifyStripeSignature } from '@/lib/verification/stripe-signature'

export const runtime = 'nodejs'

const MAX_EVENT_BYTES = 256 * 1024

/**
 * Stripe Identity events. Signature-checked on the raw body; the event is
 * only a hint, and the session is re-read from Stripe before anything is
 * trusted. Needs the vault (the record is addressed by key, not cookie).
 *
 * An event only updates a record that exists and is still waiting on that
 * exact session, so a late or replayed event cannot revive a deleted record
 * or overwrite a newer check.
 */
export async function POST(req: NextRequest) {
  let raw: string
  try {
    raw = await readCapped(req, MAX_EVENT_BYTES)
  } catch {
    return NextResponse.json({ error: 'too large' }, { status: 413 })
  }
  const ok = await verifyStripeSignature(raw, req.headers.get('stripe-signature'), process.env.STRIPE_IDENTITY_WEBHOOK_SECRET ?? '')
  if (!ok) return NextResponse.json({ error: 'bad signature' }, { status: 400 })

  const event = JSON.parse(raw) as { type: string; data: { object: { id: string; metadata?: { record?: string } } } }
  if (!event.type.startsWith('identity.verification_session.')) return NextResponse.json({ ignored: true })

  const id = event.data.object.id
  const key = event.data.object.metadata?.record
  if (!key || !/^[0-9a-f]{48}$/.test(key)) return NextResponse.json({ ignored: true })

  const prev = await loadByKey(key)
  if (!prev || prev.pendingProviderRef !== id) {
    // Nothing to update. Still make sure the provider holds no images for a
    // finished session nobody is waiting on (for example, after deletion).
    if (event.type === 'identity.verification_session.verified') await redact(id)
    return NextResponse.json({ ignored: true })
  }
  const outcome = await readLicenceSession(id)
  await saveByKey(key, recordFromOutcome(prev, outcome, id, todayIso()))
  if (outcome.status === 'verified' && !(await redact(id))) {
    // A 5xx makes Stripe retry the event, which retries the redaction.
    return NextResponse.json({ error: 'redaction pending' }, { status: 503 })
  }
  return NextResponse.json({ received: true })
}

async function redact(id: string): Promise<boolean> {
  try {
    await redactLicenceSession(id)
    return true
  } catch {
    console.error('verify webhook: redaction failed; Stripe will retry the event')
    return false
  }
}
