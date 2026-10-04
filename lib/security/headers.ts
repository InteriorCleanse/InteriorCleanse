/**
 * The response headers every page carries.
 *
 * Browser-side hardening that costs nothing at runtime and closes whole
 * classes of attack: clickjacking (`frame-ancestors`), MIME sniffing,
 * referrer leakage, a downgraded connection, and — through the CSP — a
 * script from anywhere but this origin. The policy is strict enough to
 * matter and loose exactly where the app needs it, with the reason beside
 * each allowance.
 *
 * Kept as data, not config, so a test can read it: a header that is missing
 * or weakened fails the build rather than the next audit.
 */

export const SUPABASE_HOSTS = 'https://*.supabase.co wss://*.supabase.co'

export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    // Next inlines its runtime boot and the no-flash theme script; a nonce
    // would need every page dynamic. Scripts still come from this origin only.
    "script-src 'self' 'unsafe-inline'",
    // Tailwind's utilities and the motion components set inline styles.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src self data: https://fonts.gstatic.com'.replace('self', "'self'"),
    // Avatars and connector logos may be remote; data: for generated icons.
    "img-src 'self' data: https:",
    // Spoken replies play from a blob the browser made; nothing streams from elsewhere.
    "media-src 'self' blob:",
    // The browser talks to Supabase Auth and to this origin, and to nothing else.
    `connect-src 'self' ${SUPABASE_HOSTS}`,
    // Built sites are previewed in a same-origin frame, served from /api/sites
    // with its own sandboxing policy.
    "frame-src 'self'",
    // Nobody frames this app. The preview frame is ours, pointing at us.
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ')
}

export type Header = { key: string; value: string }

export function securityHeaders(): Header[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
    // Two years, subdomains, preload-eligible: once set, a downgrade is not an option.
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // The microphone is the one powerful capability this app uses, and only here.
    {
      key: 'Permissions-Policy',
      value: 'microphone=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ]
}

/**
 * Paths that carry their own policy instead. Built sites set a sandboxing CSP
 * of their own and are framed by the preview page, so the global
 * `frame-ancestors 'none'` must not reach them.
 */
export const HEADERS_SOURCE = '/((?!api/sites/).*)'
