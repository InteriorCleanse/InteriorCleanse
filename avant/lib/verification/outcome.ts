/** Turns a provider outcome into the minimal record. Pure, so it is tested. */

import { ageOn } from '../eligibility.ts'
import type { DriverRecord } from '../driver-record.ts'
import type { LicenceOutcome } from './stripe-identity.ts'

const pad = (n: number) => String(n).padStart(2, '0')

export function recordFromOutcome(prev: DriverRecord, o: LicenceOutcome, providerRef: string, today: string): DriverRecord {
  if (o.status !== 'verified' || !o.dob?.year || !o.dob.month || !o.dob.day) {
    return { ...prev, pendingProviderRef: o.status === 'processing' ? providerRef : null }
  }
  const age = ageOn(`${o.dob.year}-${pad(o.dob.month)}-${pad(o.dob.day)}`, today)
  const expires = o.expires?.year && o.expires.month ? `${o.expires.year}-${pad(o.expires.month)}` : null
  const state = o.issuingState && /^[A-Za-z]{2}$/.test(o.issuingState) ? o.issuingState.toUpperCase() : null
  // Years licensed is the driver's own claim; the document proves age, so
  // cap the claim at what that age allows (earliest US learner's permit
  // is 14, a full licence 16).
  const attested = prev.attestedLicenceYears
  const licenceYears = attested === null ? null : Math.max(0, Math.min(attested, age - 16))
  return {
    ...prev,
    age,
    licenceYears,
    licenceExpires: expires,
    licenceState: state,
    verified: true,
    method: 'stripe_identity',
    verifiedAt: new Date().toISOString(),
    providerRef,
    pendingProviderRef: null,
  }
}
