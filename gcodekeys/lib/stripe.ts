import Stripe from 'stripe'

// Single Stripe client, created lazily so the app boots (and the preview
// build runs) with no key present. The secret lives only in the Vercel
// project env — never in the repo.
let client: Stripe | null = null

export function stripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // Pin the API version so behaviour is stable across SDK bumps.
      apiVersion: '2025-02-24.acacia',
      appInfo: { name: 'GCode Keys', url: 'https://gcodekeys.com' },
    })
  }
  return client
}

// Where Stripe sends the customer after a hosted-checkout outcome. Prefers the
// deployment URL, falls back to the configured site URL, then localhost.
export function siteOrigin(req?: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL
  if (env) return env.replace(/\/+$/, '')
  if (req) {
    try {
      return new URL(req.url).origin
    } catch {
      /* fall through */
    }
  }
  return 'http://localhost:3000'
}
