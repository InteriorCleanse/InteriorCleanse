/**
 * Multi-factor authentication, the pure part.
 *
 * Supabase reports two levels: the one the current session has reached and
 * the one it could reach given the factors enrolled. The gap between them is
 * the whole decision: a session that could be stronger and is not has not
 * finished signing in. Everything that enforces that — the server session,
 * the owner console, the verify page — reads this one function, so there is
 * one definition of "signed in".
 */

export type AssuranceLevel = 'aal1' | 'aal2' | null

export type Assurance = {
  current: AssuranceLevel
  next: AssuranceLevel
}

/** True when a second factor is enrolled and this session has not presented it. */
export function needsStepUp(assurance: Assurance): boolean {
  return assurance.next === 'aal2' && assurance.current !== 'aal2'
}

/** True when the person has at least one verified second factor. */
export function hasSecondFactor(assurance: Assurance): boolean {
  return assurance.next === 'aal2'
}

export type FactorSummary = {
  id: string
  friendlyName: string
  status: 'verified' | 'unverified'
  createdAt: string
}

/** Factors as the page shows them: verified first, newest first, named. */
export function describeFactors(
  factors: readonly { id: string; friendly_name?: string | null; status: string; created_at: string }[],
): FactorSummary[] {
  return factors
    .map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name?.trim() || 'Authenticator app',
      status: f.status === 'verified' ? ('verified' as const) : ('unverified' as const),
      createdAt: f.created_at,
    }))
    .sort(
      (a, b) =>
        Number(b.status === 'verified') - Number(a.status === 'verified') ||
        b.createdAt.localeCompare(a.createdAt),
    )
}

/** A six-digit code, digits only, spaces tolerated. */
export function normaliseCode(input: string): string | null {
  const digits = input.replace(/\s+/g, '')
  return /^\d{6}$/.test(digits) ? digits : null
}
