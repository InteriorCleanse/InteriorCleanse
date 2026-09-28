/**
 * Driver's licence verification with Stripe Identity: document capture plus
 * a matching live selfie, on Stripe's hosted page. AVANT never sees the
 * images. After the result is read, the session is redacted so Stripe
 * deletes the collected personal data too.
 *
 * Raw REST over fetch (form-encoded) keeps the dependency surface small.
 * Docs: https://docs.stripe.com/identity/verify-identity-documents
 */

const API = 'https://api.stripe.com/v1'

export function stripeIdentityConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

async function stripe(path: string, init: { method?: string; form?: Record<string, string> } = {}) {
  const body = init.form ? new URLSearchParams(init.form).toString() : undefined
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? (body ? 'POST' : 'GET'),
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': '2025-03-31.basil',
    },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  const json = (await res.json()) as Record<string, unknown>
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${(json.error as { message?: string })?.message ?? 'error'}`)
  return json
}

export async function createLicenceSession(opts: { returnUrl: string; recordKey: string }) {
  const s = await stripe('/identity/verification_sessions', {
    form: {
      type: 'document',
      'options[document][allowed_types][]': 'driving_license',
      'options[document][require_live_capture]': 'true',
      'options[document][require_matching_selfie]': 'true',
      'metadata[record]': opts.recordKey,
      return_url: opts.returnUrl,
    },
  })
  return { id: String(s.id), url: String(s.url) }
}

interface DateParts {
  day: number | null
  month: number | null
  year: number | null
}

export interface LicenceOutcome {
  status: 'verified' | 'processing' | 'requires_input' | 'canceled'
  recordKey: string | null
  dob: DateParts | null
  expires: DateParts | null
  issuingState: string | null
}

export async function readLicenceSession(id: string): Promise<LicenceOutcome> {
  const s = await stripe(
    `/identity/verification_sessions/${encodeURIComponent(id)}?expand[]=verified_outputs&expand[]=last_verification_report`,
  )
  const outputs = (s.verified_outputs ?? null) as { dob?: DateParts } | null
  const report = (s.last_verification_report ?? null) as {
    document?: { expiration_date?: DateParts; issuing_country?: string; address?: { state?: string } }
  } | null
  return {
    status: s.status as LicenceOutcome['status'],
    recordKey: ((s.metadata as Record<string, string> | undefined)?.record ?? null) || null,
    dob: outputs?.dob ?? null,
    expires: report?.document?.expiration_date ?? null,
    issuingState: report?.document?.address?.state ?? null,
  }
}

/** Ask Stripe to delete the images and personal data it collected. */
export async function redactLicenceSession(id: string): Promise<void> {
  await stripe(`/identity/verification_sessions/${encodeURIComponent(id)}/redact`, { form: {} })
}
