/**
 * Attribution and referrals.
 *
 * Marketing attribution is where privacy regressions and security holes get
 * introduced quietly, because nobody reviews the tracking code. Three rules:
 *
 *   1. **Only a known list of parameters is captured.** Not "everything that
 *      looks like a UTM" — a fixed set, each sanitised and length-bounded.
 *      Landing-page URLs carry password-reset tokens, invite codes and session
 *      identifiers; a greedy capture stores them and then they are in logs.
 *   2. **Nothing captured is ever reflected into a page.** These values reach
 *      a database column and an analytics row, never `innerHTML` and never an
 *      `href` — a `javascript:` URL in `utm_source` is a stored XSS otherwise.
 *   3. **A referral code cannot credit its own owner.** Self-referral is the
 *      first thing anyone tries.
 */

/** The only parameters we keep. Anything else on the URL is ignored. */
const CAPTURED = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
] as const

export type Attribution = Partial<Record<(typeof CAPTURED)[number], string>> & {
  /** First page seen, path only — query strings carry secrets. */
  landingPath?: string
  referrerHost?: string
}

const MAX_VALUE_LENGTH = 120

/**
 * Sanitises one captured value.
 *
 * Allows what real campaign tags contain and nothing else. This is a
 * whitelist rather than an escaping pass on purpose: escaping is a promise
 * about every consumer downstream, and a restricted character set is a promise
 * about the data itself.
 */
export function sanitiseTag(value: string): string | null {
  const trimmed = value.trim().slice(0, MAX_VALUE_LENGTH)
  if (!trimmed) return null
  if (!/^[A-Za-z0-9._~ -]+$/.test(trimmed)) return null
  return trimmed
}

export function captureAttribution(input: {
  url: string
  referrer?: string | null
}): Attribution {
  let parsed: URL
  try {
    parsed = new URL(input.url)
  } catch {
    return {}
  }

  const attribution: Attribution = {}

  for (const key of CAPTURED) {
    const raw = parsed.searchParams.get(key)
    if (!raw) continue
    const clean = sanitiseTag(raw)
    if (clean) attribution[key] = clean
  }

  // Path only. A landing URL's query string routinely contains an invite token
  // or a password-reset code, and storing it turns a one-time secret into a
  // durable one sitting in an analytics table.
  attribution.landingPath = parsed.pathname.slice(0, 200)

  if (input.referrer) {
    try {
      // Host only, for the same reason — and because a full referrer URL is
      // personal data in a way a hostname mostly is not.
      attribution.referrerHost = new URL(input.referrer).hostname.slice(0, 100)
    } catch {
      // A malformed referrer is not worth an error.
    }
  }

  return attribution
}

/**
 * Whether a referral may be credited.
 *
 * Kept as a pure function because the rules are the sort that get quietly
 * broken during a growth push, and a test is the only thing that notices.
 */
export type ReferralCheck = { credited: true } | { credited: false; reason: string }

export function checkReferral(input: {
  code: string
  /** Who owns the code. */
  ownerUserId: string
  /** Who is signing up. */
  newUserId: string
  ownerEmailDomain: string | null
  newEmailDomain: string | null
  /** Whether this person has been credited to any referral before. */
  alreadyReferred: boolean
  /** Whether the code is still active. */
  active: boolean
}): ReferralCheck {
  if (!input.active) {
    return { credited: false, reason: 'That referral code is no longer active.' }
  }

  if (input.ownerUserId === input.newUserId) {
    // The first thing anyone tries.
    return { credited: false, reason: 'A referral code cannot be used by the person who owns it.' }
  }

  if (input.alreadyReferred) {
    return { credited: false, reason: 'This account was already credited to a referral.' }
  }

  // Same-domain signups are the second thing anyone tries: one company creating
  // accounts for its own staff to farm credit. Blocked for consumer domains
  // would be wrong, so only company domains are treated this way.
  if (
    input.ownerEmailDomain &&
    input.newEmailDomain &&
    input.ownerEmailDomain === input.newEmailDomain &&
    !isConsumerDomain(input.ownerEmailDomain)
  ) {
    return {
      credited: false,
      reason: 'Referrals between colleagues at the same company are not credited.',
    }
  }

  return { credited: true }
}

const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
])

export function isConsumerDomain(domain: string): boolean {
  return CONSUMER_DOMAINS.has(domain.toLowerCase())
}

/**
 * Generates a referral code.
 *
 * Excludes characters that are misread aloud or in a screenshot — 0/O, 1/I/l —
 * because these get typed from a phone screen more often than pasted.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateReferralCode(random: () => number = Math.random, length = 8): string {
  let code = ''
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  }
  return code
}

export function normaliseReferralCode(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (cleaned.length < 4 || cleaned.length > 16) return null
  return cleaned
}
