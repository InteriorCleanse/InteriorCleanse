import { deleteRecord, loadRecord } from '../driver-record'
import { redactLicenceSession, stripeIdentityConfigured } from '../verification/stripe-identity'

/** Right to erasure for a Driver Pass: delete the record and ask the provider to redact too. */
export async function eraseDriverPass(key: string): Promise<void> {
  const r = await loadRecord(key)
  const ref = r.providerRef ?? r.pendingProviderRef
  if (ref && stripeIdentityConfigured()) {
    try {
      await redactLicenceSession(ref)
    } catch {
      console.error('driver delete: provider redaction failed; queued for manual follow-up')
    }
  }
  await deleteRecord(key)
}
