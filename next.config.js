/**
 * Security headers.
 *
 * The site takes card details through Stripe Checkout and runs a
 * password-gated admin that can write to the repository, and until now it
 * shipped no security headers at all. These are the ones that cost nothing
 * and close real holes.
 *
 * The content policy is written against the origins this site actually
 * talks to, enumerated from the code and the catalogue rather than guessed:
 *
 *   Stripe        js.stripe.com for Checkout's script, api.stripe.com for
 *                 its calls, hooks/js frames for 3-D Secure.
 *   Plausible     analytics, loaded only when the domain env var is set.
 *   Unsplash      current product and editorial photography.
 *   Printful /    mockup images arrive from their CDNs once the owner syncs,
 *   Printify      so they are allowed before that happens rather than after
 *                 an admin wonders why a mockup renders blank.
 *
 * `'unsafe-inline'` is present for scripts and styles because the App Router
 * emits an inline bootstrap and several components set inline styles. Doing
 * better means a per-request nonce, which means making every page dynamic —
 * a real cost for a storefront that is almost entirely static. The rest of
 * the policy is tight: no object, no base tag, no framing, forms only to
 * this origin and Stripe.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://plausible.io",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://files.cdn.printful.com https://images-api.printify.com https://*.printify.com https://d8j0ntlcm91z4.cloudfront.net",
  "font-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self' https://api.stripe.com https://plausible.io",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "worker-src 'self' blob:",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ')

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  // Two years, subdomains included. Vercel serves HTTPS only, so this costs
  // nothing and stops the first-request downgrade.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here needs a camera, a microphone, or a location.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: `output: 'export'` was removed deliberately. Static export has no
  // server, so API routes, middleware, and the Stripe webhook cannot exist
  // under it — Next fails the build. The site now needs a Node runtime
  // (Vercel); the GitHub Pages workflow can no longer deploy it.
  trailingSlash: true,
  // Next's own <Image> optimiser is not used for product photography (the
  // catalogue renders plain <img> so the pedestal and reel can share one
  // source), but the allowlist stays accurate for anything that does.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ]
  },
}

module.exports = nextConfig
