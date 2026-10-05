/**
 * Static security headers. The Content-Security-Policy is per-request (it
 * carries a nonce) and is set in middleware.ts, not here.
 */
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Camera is allowed for this origin only: licence capture happens on the
  // verification provider's page, but a future in-app capture needs it.
  // Location is allowed for "near me" search. Everything else is off.
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(self), payment=(self), usb=(), interest-cohort=()',
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app lives in its own folder; never trace files from a parent project.
  outputFileTracingRoot: import.meta.dirname,
  poweredByHeader: false,
  // The database drivers load at runtime (PGlite ships WebAssembly).
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // Nothing under /api is cached by a shared cache, and no API response can
      // be framed or run anything if opened directly. Photos set their own.
      {
        source: '/api/:path((?!photos/).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
        ],
      },
      // Pages that carry one-time tokens never leak them in a Referer.
      { source: '/reset', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      { source: '/verify-email', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      { source: '/confirm-email', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      { source: '/unsubscribe', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      { source: '/trips/confirm', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
    ]
  },
}

export default nextConfig
