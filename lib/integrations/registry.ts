import { z } from 'zod'

/**
 * The connector registry.
 *
 * Every integration is described by data, not by a branch in a switch
 * statement: what it is for, which secrets it needs, what it can and cannot
 * give us, and how to check it is alive. Two consequences worth stating:
 *
 *   - **A connector is testable while unconfigured.** Nothing here reads a
 *     credential or opens a socket, so the registry, the onboarding wizard and
 *     the health page all work on a laptop with no keys.
 *   - **The limits are part of the definition.** "Stripe does not know your
 *     cost of goods" belongs next to the connector, not in a support email
 *     after someone's margin looks wrong.
 */

export type CredentialField = {
  key: string
  label: string
  /** Shown under the input: where to find this value. */
  help: string
  /** Rejects a typo'd or wrong-vendor key before it is ever stored. */
  pattern?: RegExp
  patternHelp?: string
  optional?: boolean
}

export type ConnectorDefinition = {
  provider: string
  name: string
  /** One sentence: what connecting this actually gets you. */
  purpose: string
  /** What this source can tell us. */
  provides: string[]
  /**
   * What it cannot. Stated because a connected integration implies completeness
   * to most people, and an unstated gap becomes a wrong number later.
   */
  doesNotProvide: string[]
  credentials: CredentialField[]
  settings?: z.ZodTypeAny
  /** Docs link for the person hunting for a key. */
  docsUrl: string
  /** Whether this connector is implemented end to end yet. */
  status: 'available' | 'planned'
}

export const CONNECTORS: ConnectorDefinition[] = [
  {
    provider: 'stripe',
    name: 'Stripe',
    purpose: 'Reads settled payments, refunds and fees, so revenue is what landed, not what was charged.',
    provides: ['Payments and payouts', 'Refunds and disputes', 'Processing fees', 'Customer records'],
    doesNotProvide: [
      'Cost of goods — Stripe does not know what a product cost you',
      'Advertising spend',
      'Shipping and fulfilment costs',
    ],
    credentials: [
      {
        key: 'api_key',
        label: 'Secret key',
        help: 'Stripe dashboard → Developers → API keys. A restricted key with read access is enough.',
        pattern: /^(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}$/,
        patternHelp: 'That does not look like a Stripe secret key — they start sk_live_, sk_test_ or rk_.',
      },
    ],
    docsUrl: 'https://dashboard.stripe.com/apikeys',
    status: 'available',
  },
  {
    provider: 'shopify',
    name: 'Shopify',
    purpose: 'Reads orders, line items and product catalogue, so revenue can be broken down per product.',
    provides: ['Orders and line items', 'Products and variants', 'Discounts', 'Shipping charged to the customer'],
    doesNotProvide: [
      'What fulfilment actually cost you',
      'Advertising spend',
      'Payments taken outside Shopify',
    ],
    credentials: [
      {
        key: 'access_token',
        label: 'Admin API access token',
        help: 'Shopify admin → Settings → Apps → Develop apps → your app → API credentials.',
        pattern: /^shpat_[A-Za-z0-9]{16,}$/,
        patternHelp: 'Shopify admin tokens start with shpat_.',
      },
    ],
    settings: z.object({
      shopDomain: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/, 'Use the full my-shop.myshopify.com domain.'),
    }),
    docsUrl: 'https://shopify.dev/docs/apps/auth/admin-app-access-tokens',
    status: 'available',
  },
  {
    provider: 'csv',
    name: 'CSV import',
    purpose: 'Upload orders, costs or ad spend directly. Works with any system, needs no keys.',
    provides: ['Whatever your file contains', 'Full control over the mapping', 'A reversible import batch'],
    doesNotProvide: ['Automatic refreshes — a file is a snapshot, not a connection'],
    credentials: [],
    docsUrl: '/app/import',
    status: 'available',
  },
  {
    provider: 'meta_ads',
    name: 'Meta Ads',
    purpose: 'Reads campaign spend so advertising can be set against the revenue it produced.',
    provides: ['Daily spend by campaign', 'Impressions and clicks', 'Platform-reported conversions'],
    doesNotProvide: [
      'Ground truth on attribution — platform-reported conversions are the platform marking its own homework',
    ],
    credentials: [
      { key: 'access_token', label: 'System user access token', help: 'Meta Business Settings → System users.' },
    ],
    docsUrl: 'https://developers.facebook.com/docs/marketing-apis',
    status: 'planned',
  },
  {
    provider: 'google_ads',
    name: 'Google Ads',
    purpose: 'Reads campaign spend so advertising can be set against the revenue it produced.',
    provides: ['Daily spend by campaign', 'Impressions and clicks', 'Conversions as Google counts them'],
    doesNotProvide: ['Cross-channel attribution'],
    credentials: [
      { key: 'refresh_token', label: 'OAuth refresh token', help: 'Issued when you authorise the connection.' },
      { key: 'developer_token', label: 'Developer token', help: 'Google Ads API Center.' },
    ],
    docsUrl: 'https://developers.google.com/google-ads/api/docs/start',
    status: 'planned',
  },
]

export const CONNECTORS_BY_PROVIDER = new Map(CONNECTORS.map((c) => [c.provider, c]))

export function connector(provider: string): ConnectorDefinition | undefined {
  return CONNECTORS_BY_PROVIDER.get(provider)
}

/**
 * Validates a credential before it is sealed.
 *
 * Catching a wrong-vendor or truncated key here matters more than it looks: a
 * bad credential that reaches the vault produces a connection that fails on a
 * schedule, at which point the operator has to guess whether the key is wrong
 * or the vendor is down.
 */
export function validateCredential(
  definition: ConnectorDefinition,
  field: string,
  value: string,
): { ok: true } | { ok: false; reason: string } {
  const spec = definition.credentials.find((c) => c.key === field)
  if (!spec) return { ok: false, reason: `${definition.name} does not take a ${field}.` }

  const trimmed = value.trim()
  if (!trimmed) return { ok: false, reason: `${spec.label} is required.` }
  if (spec.pattern && !spec.pattern.test(trimmed)) {
    return { ok: false, reason: spec.patternHelp ?? `That does not look like a valid ${spec.label}.` }
  }
  return { ok: true }
}
