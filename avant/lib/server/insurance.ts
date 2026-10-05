/**
 * The insurance programme's live details, from the environment so the owner
 * can fill them in the day the policy binds without a code change:
 *
 *   AVANT_INSURER_NAME     the carrier (or programme) named on the policy
 *   AVANT_POLICY_NUMBER    the platform policy number
 *   AVANT_ROADSIDE_PHONE   24/7 roadside assistance
 *   AVANT_CLAIMS_PHONE     the claims line (the carrier's or the adjuster's)
 *   AVANT_CLAIMS_EMAIL     where every claim and incident report is sent
 *
 * Until COVERAGE_TERMS_FINAL is true and the carrier and policy are set,
 * the app keeps saying that coverage terms are not final.
 */

import { COVERAGE_TERMS_FINAL } from '../catalog.ts'

export interface InsuranceDetails {
  insurer: string | null
  policy: string | null
  roadsidePhone: string | null
  claimsPhone: string | null
  claimsEmail: string | null
  /** True only when the terms are final and the policy is named. */
  final: boolean
}

const env = (k: string) => process.env[k]?.trim() || null

export function insuranceDetails(): InsuranceDetails {
  const insurer = env('AVANT_INSURER_NAME')
  const policy = env('AVANT_POLICY_NUMBER')
  return {
    insurer,
    policy,
    roadsidePhone: env('AVANT_ROADSIDE_PHONE'),
    claimsPhone: env('AVANT_CLAIMS_PHONE'),
    claimsEmail: env('AVANT_CLAIMS_EMAIL'),
    final: COVERAGE_TERMS_FINAL && Boolean(insurer && policy),
  }
}

/** What a page may show publicly (the claims inbox address stays on the server). */
export function publicInsurance(): Omit<InsuranceDetails, 'claimsEmail'> {
  const { claimsEmail: _private, ...rest } = insuranceDetails()
  return rest
}
