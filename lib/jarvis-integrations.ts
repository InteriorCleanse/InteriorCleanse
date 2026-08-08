import { configured, env } from './env'

/**
 * Integration health, shared by /api/admin/connections and the JARVIS
 * check_integrations tool.
 *
 * `configured.*` only reports whether a variable is present. This adds the
 * second half: a live call per provider, because a key that is set but revoked
 * looks identical to a working one until something actually uses it.
 */

export type IntegrationLevel = 'connected' | 'key-missing' | 'optional'
export type LiveResult = 'ok' | 'invalid' | 'unreachable' | 'skipped'

export type IntegrationCheck = {
  key: string
  service: string
  envVars: string[]
  level: IntegrationLevel
  live?: LiveResult
  liveDetail?: string
  /** Exact steps the owner must take when this is not fully connected. */
  fix: string[]
}

const has = (name: string) => Boolean(process.env[name]?.trim())

const FIX: Record<string, string[]> = {
  anthropic: [
    'console.anthropic.com → API Keys',
    'Create key',
    'Add to Vercel as ANTHROPIC_API_KEY',
    'Redeploy',
  ],
  stripe: [
    'Go to dashboard.stripe.com',
    'Developers → API keys',
    'Copy "Secret key" (starts with sk_)',
    'Vercel → Project → Settings → Environment Variables',
    'Add STRIPE_SECRET_KEY with that value',
    'Redeploy',
  ],
  stripeWebhook: [
    'dashboard.stripe.com → Developers → Webhooks',
    'Add endpoint: https://interiorcleanse.com/api/webhook/ (the trailing slash matters — trailingSlash is on, and Stripe records a 308 as a failed delivery)',
    'Select event: checkout.session.completed',
    'Copy the "Signing secret" (starts with whsec_)',
    'Add to Vercel as STRIPE_WEBHOOK_SECRET',
    'Or run: npm run stripe:setup -- --apply --webhook',
  ],
  brevo: [
    'app.brevo.com → SMTP & API → API Keys',
    'Generate a new key',
    'Add to Vercel as BREVO_API_KEY',
    'Create contact lists for Subscribers and Customers, note their IDs',
    'Add IDs as BREVO_LIST_SUBSCRIBERS and BREVO_LIST_CUSTOMERS',
  ],
  printful: [
    'printful.com → Settings → Stores → API',
    'Create a private token',
    'Add to Vercel as PRINTFUL_API_KEY',
    'Note your Store ID from the same page',
    'Add as PRINTFUL_STORE_ID',
  ],
  printify: [
    'Optional — only if you also fulfil through Printify',
    'printify.com → My Profile → Connections → Personal Access Tokens',
    'Add the token as PRINTIFY_API_KEY and the shop ID as PRINTIFY_SHOP_ID',
  ],
  adminAuth: [
    'Pick a strong password and add it to Vercel as ADMIN_PASSWORD',
    'Generate a signing secret: openssl rand -hex 32',
    'Add it to Vercel as ADMIN_SESSION_SECRET',
    'Redeploy — without both, /admin cannot be signed into at all',
  ],
  siteUrl: [
    'Add NEXT_PUBLIC_SITE_URL to Vercel with your live URL (https://interiorcleanse.com)',
    'Used for CTA links in generated email',
  ],
}

async function probe(fn: () => Promise<Response | unknown>): Promise<{ live: LiveResult; liveDetail?: string }> {
  try {
    const result = await fn()
    if (result instanceof Response) {
      if (result.ok) return { live: 'ok' }
      return {
        live: result.status === 401 || result.status === 403 ? 'invalid' : 'unreachable',
        liveDetail: `HTTP ${result.status}`,
      }
    }
    return { live: 'ok' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      live: /401|403|invalid|authentication|permission/i.test(message) ? 'invalid' : 'unreachable',
      liveDetail: message.slice(0, 200),
    }
  }
}

/**
 * Runs the audit. `deep` performs a live call per configured provider; without
 * it only variable presence is reported.
 */
export async function checkIntegrations({ deep = true }: { deep?: boolean } = {}): Promise<IntegrationCheck[]> {
  const checks: IntegrationCheck[] = [
    {
      key: 'anthropic',
      service: 'Anthropic (powers JARVIS and lifecycle email)',
      envVars: ['ANTHROPIC_API_KEY'],
      level: configured.anthropic() ? 'connected' : 'key-missing',
      fix: FIX.anthropic,
    },
    {
      key: 'stripe',
      service: 'Stripe (checkout, revenue, orders)',
      envVars: ['STRIPE_SECRET_KEY'],
      level: configured.stripe() ? 'connected' : 'key-missing',
      fix: FIX.stripe,
    },
    {
      key: 'stripeWebhook',
      service: 'Stripe webhook (fulfilment + post-purchase email)',
      envVars: ['STRIPE_WEBHOOK_SECRET'],
      level: has('STRIPE_WEBHOOK_SECRET') ? 'connected' : 'key-missing',
      fix: FIX.stripeWebhook,
    },
    {
      key: 'brevo',
      service: 'Brevo (CRM + transactional email)',
      envVars: ['BREVO_API_KEY', 'BREVO_LIST_SUBSCRIBERS', 'BREVO_LIST_CUSTOMERS'],
      level: configured.brevo() ? 'connected' : 'key-missing',
      fix: FIX.brevo,
    },
    {
      key: 'printful',
      service: 'Printful (merch fulfilment)',
      envVars: ['PRINTFUL_API_KEY', 'PRINTFUL_STORE_ID'],
      level: configured.printful() ? 'connected' : 'key-missing',
      fix: FIX.printful,
    },
    {
      key: 'printify',
      service: 'Printify (optional second fulfiller)',
      envVars: ['PRINTIFY_API_KEY', 'PRINTIFY_SHOP_ID'],
      level: configured.printify() ? 'connected' : 'optional',
      fix: FIX.printify,
    },
    {
      key: 'adminAuth',
      service: 'Admin authentication',
      envVars: ['ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET'],
      level: has('ADMIN_PASSWORD') && has('ADMIN_SESSION_SECRET') ? 'connected' : 'key-missing',
      fix: FIX.adminAuth,
    },
    {
      key: 'siteUrl',
      service: 'Site URL',
      envVars: ['NEXT_PUBLIC_SITE_URL'],
      level: has('NEXT_PUBLIC_SITE_URL') ? 'connected' : 'optional',
      fix: FIX.siteUrl,
    },
  ]

  if (!deep) return checks

  await Promise.all(
    checks.map(async (check) => {
      if (check.level !== 'connected') {
        check.live = 'skipped'
        return
      }

      switch (check.key) {
        case 'stripe':
          Object.assign(
            check,
            await probe(async () => {
              const Stripe = (await import('stripe')).default
              return new Stripe(env.stripeSecret()).balance.retrieve()
            }),
          )
          break

        case 'brevo':
          Object.assign(
            check,
            await probe(() =>
              fetch('https://api.brevo.com/v3/account', {
                headers: { 'api-key': env.brevoKey() },
              }),
            ),
          )
          break

        case 'printful':
          Object.assign(
            check,
            await probe(() =>
              fetch('https://api.printful.com/store', {
                headers: { Authorization: `Bearer ${env.printfulKey()}` },
              }),
            ),
          )
          break

        case 'anthropic':
          Object.assign(
            check,
            await probe(async () => {
              const Anthropic = (await import('@anthropic-ai/sdk')).default
              return new Anthropic({ apiKey: env.anthropicKey() }).models.list({ limit: 1 })
            }),
          )
          break

        default:
          // Webhook secret, admin auth and site URL have nothing to call —
          // presence is the whole check.
          check.live = 'skipped'
      }
    }),
  )

  return checks
}

/** Anything that would make a feature fail rather than merely be unconfigured. */
export function blockingIssues(checks: IntegrationCheck[]): IntegrationCheck[] {
  return checks.filter((c) => c.level === 'key-missing' || c.live === 'invalid')
}

/** Compact `{ service: '✅ …' }` shape for the JARVIS check_integrations tool. */
export function summarise(checks: IntegrationCheck[]): Record<string, string> {
  return Object.fromEntries(
    checks.map((c) => {
      if (c.level === 'optional') {
        return [c.key, `⚠️ Optional — ${c.envVars.join(', ')} not set`]
      }
      if (c.level === 'key-missing') {
        const missing = c.envVars.filter((v) => !has(v))
        return [c.key, `❌ Missing ${missing.join(', ')}`]
      }
      switch (c.live) {
        case 'ok':
          return [c.key, '✅ Connected and API responding']
        case 'invalid':
          return [c.key, `❌ Key is set but the provider rejected it (${c.liveDetail ?? 'invalid'})`]
        case 'unreachable':
          return [c.key, `⚠️ Key set but provider unreachable (${c.liveDetail ?? 'network error'})`]
        default:
          return [c.key, '✅ Configured']
      }
    }),
  )
}
