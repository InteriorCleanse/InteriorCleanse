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
    provider: 'notion',
    name: 'Notion',
    purpose: 'Reads the pages you share with it, so the assistant can answer from your decisions, not only your figures.',
    provides: [
      'Pages and sub-pages as searchable, citable notes',
      'Database rows as pages',
      'Incremental refresh by last edit',
      'Briefings written into a database you choose — one new page each, never edited after',
    ],
    doesNotProvide: [
      'Anything you have not explicitly shared with the integration — Notion enforces that, not us',
      'Comments, page history, or who edited what',
      'Any other write: the briefing database is the only thing this product ever creates in Notion',
    ],
    credentials: [
      {
        key: 'api_key',
        label: 'Internal integration token',
        help: 'notion.so/my-integrations → New integration → copy the token, then share the pages you want it to read.',
        pattern: /^(?:ntn_|secret_)[A-Za-z0-9]{20,}$/,
        patternHelp: 'Notion tokens start with ntn_ (or secret_ on older integrations).',
      },
    ],
    settings: z.object({
      briefingDatabaseId: z
        .string()
        .regex(/^[0-9a-f-]{32,36}$/i, 'A Notion database id: the 32 hex characters in the database’s URL.')
        .optional()
        .or(z.literal('')),
    }),
    docsUrl: 'https://www.notion.so/my-integrations',
    status: 'available',
  },
  {
    provider: 'hubspot',
    name: 'HubSpot',
    purpose: 'Reads contacts and deals, so the pipeline sits next to the revenue it is supposed to become.',
    provides: ['Contacts as customers', 'Deals with stage, amount and expected close', 'Your own pipeline stage names, unchanged'],
    doesNotProvide: [
      'Revenue — a deal is money that has not happened, and it is never added to orders',
      'Probabilities we invented: only the ones your pipeline stages define',
      'Emails, calls, or tickets',
    ],
    credentials: [
      {
        key: 'api_key',
        label: 'Private app access token',
        help: 'HubSpot → Settings → Integrations → Private apps → create one with crm.objects.contacts.read and crm.objects.deals.read.',
        pattern: /^pat-[a-z0-9]+-[A-Za-z0-9-]{20,}$/,
        patternHelp: 'HubSpot private app tokens start with pat-.',
      },
    ],
    docsUrl: 'https://developers.hubspot.com/docs/guides/apps/private-apps/overview',
    status: 'available',
  },
  {
    provider: 'slack',
    name: 'Slack',
    purpose: 'Posts warnings and critical alerts to one channel, so the team hears about a problem where the team already is.',
    provides: ['Warning and critical alerts in a channel', 'The evidence each alert was raised on', 'A link back to the figure'],
    doesNotProvide: [
      'Briefings or info-level notices — a channel that carries everything is muted within a week',
      'Reading anything from Slack: an incoming webhook can only post',
      'Per-person quiet hours — a channel is shared, and a post does not wake anyone',
    ],
    credentials: [
      {
        key: 'webhook_url',
        label: 'Incoming webhook URL',
        help: 'api.slack.com/apps → your app → Incoming Webhooks → Add to a channel. Paste the URL; it is the whole credential.',
        pattern: /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/,
        patternHelp: 'A Slack webhook URL looks like https://hooks.slack.com/services/T…/B…/…',
      },
    ],
    docsUrl: 'https://api.slack.com/messaging/webhooks',
    status: 'available',
  },
  {
    provider: 'obsidian',
    name: 'Obsidian',
    purpose: 'Export briefings, alerts and knowledge as a vault folder with frontmatter; upload your notes back as knowledge.',
    provides: [
      'A zip of Markdown notes with Dataview-ready properties',
      'Your uploaded notes as citable knowledge for the assistant',
      'Wikilinks and frontmatter preserved',
    ],
    doesNotProvide: [
      'Live sync — Obsidian has no cloud API, and a vault is a folder on your machine. This is a snapshot you export again',
      'Anything from a vault you have not uploaded',
    ],
    credentials: [],
    docsUrl: '/api/knowledge/obsidian',
    status: 'available',
  },
  {
    provider: 'base44',
    name: 'Base44',
    purpose: 'Reads one entity from a Base44 app, so records you keep there — suppliers, SOPs, projects — become searchable, citable context.',
    provides: ['Every record of the chosen entity as a note', 'Each field on its own line, so a question about one field finds it', 'Incremental refresh by last update'],
    doesNotProvide: [
      'Building or editing this product — Base44 is an app builder, and this is not a Base44 app',
      'More than one entity per connection: you choose which, because you know which fields are private',
      'Money: nothing here is treated as an order or a deal',
    ],
    credentials: [
      {
        key: 'api_key',
        label: 'API key',
        help: 'Base44 → your app → Settings → API. The key is sent as the api_key header.',
        pattern: /^[A-Za-z0-9_-]{16,}$/,
        patternHelp: 'That does not look like a Base44 API key.',
      },
    ],
    settings: z.object({
      appId: z.string().regex(/^[A-Za-z0-9_-]{6,80}$/, 'The app id is in the app’s URL and settings.'),
      entity: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/, 'An entity name, as defined in the app.'),
    }),
    docsUrl: 'https://docs.base44.com/',
    status: 'available',
  },
  {
    provider: 'salesforce',
    name: 'Salesforce',
    purpose: 'Reads opportunities and accounts into the pipeline view.',
    provides: ['Opportunities as deals', 'Accounts and contacts'],
    doesNotProvide: ['A free tier — Salesforce has none for production; HubSpot does, and is connected today'],
    credentials: [
      { key: 'refresh_token', label: 'Connected app refresh token', help: 'Issued when you authorise the connection.' },
    ],
    docsUrl: 'https://developer.salesforce.com/docs/apis',
    status: 'planned',
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
