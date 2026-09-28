import { NextResponse, type NextRequest } from 'next/server'
import { todayIso } from '@/lib/dates'
import { loadByKey, saveByKey } from '@/lib/driver-record'
import { readLicenceSession, redactLicenceSession } from '@/lib/verification/stripe-identity'
import { recordFromOutcome } from '@/lib/verification/outcome'
import { verifyStripeSignature } from '@/lib/verification/stripe-signature'

export const runtime = 'nodejs'

/**
 * Stripe Identity events. Signature-checked on the raw body; the event is
 * only a hint, and the session is re-read from Stripe before anything is
 * trusted. Needs the vault (the record is addressed by key, not cookie).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  const ok = await verifyStripeSignature(raw, req.headers.get('stripe-signature'), process.env.STRIPE_IDENTITY_WEBHOOK_SECRET ?? '')
  if (!ok) return NextResponse.json({ error: 'bad signature' }, { status: 400 })

  const event = JSON.parse(raw) as { type: string; data: { object: { id: string; metadata?: { record?: string } } } }
  if (!event.type.startsWith('identity.verification_session.')) return NextResponse.json({ ignored: true })

  const id = event.data.object.id
  const key = event.data.object.metadata?.record
  if (!key || !/^[0-9a-f]{48}$/.test(key)) return NextResponse.json({ ignored: true })

  const prev = await loadByKey(key)
  if (!prev) return NextResponse.json({ ignored: true })
  const outcome = await readLicenceSession(id)
  await saveByKey(key, recordFromOutcome(prev, outcome, id, todayIso()))
  if (outcome.status === 'verified') await redactLicenceSession(id).catch(() => undefined)
  return NextResponse.json({ received: true })
}
