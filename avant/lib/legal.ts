/**
 * Versions of the documents people agree to. Change a version whenever the
 * wording changes materially; every acceptance is recorded against the
 * version shown (lib/server/consent.ts), so you can always prove who agreed
 * to what, and when.
 */

export const LEGAL_VERSIONS = {
  terms: '2026-10-04',
  privacy: '2026-10-05',
  trip_terms: '2026-10-05',
  host_agreement: '2026-10-05',
} as const

export type LegalDocument = keyof typeof LEGAL_VERSIONS

/** The minimum age to hold an account; younger people can't contract. */
export const MIN_ACCOUNT_AGE = 18
