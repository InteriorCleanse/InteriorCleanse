/**
 * The plan catalogue.
 *
 * Plans are data here and rows in the database; Stripe holds prices. That split
 * matters: what a plan *allows* is our business rule and must be enforceable
 * without asking Stripe, while what it *costs* is Stripe's and must never be
 * duplicated into our code where the two can drift.
 *
 * So this file contains no prices in any authoritative sense — the display
 * figures below are for the pricing page and are reconciled against Stripe at
 * checkout. If they disagree, Stripe wins and we have a bug to fix, which is
 * strictly better than charging one number and showing another.
 */

export type PlanKey = 'free' | 'starter' | 'growth' | 'scale'

export type Entitlements = {
  /** Hard ceilings. null means unlimited. */
  members: number | null
  connectedIntegrations: number | null
  /** Assistant messages per calendar month. The expensive one. */
  assistantMessagesPerMonth: number | null
  notificationRules: number | null
  /** How far back the workspace can query. */
  historyDays: number | null
  /** Feature switches. */
  emailNotifications: boolean
  calendarFeed: boolean
  csvExport: boolean
  apiAccess: boolean
  prioritySupport: boolean
}

export type Plan = {
  key: PlanKey
  name: string
  /** One line: who this is for. Not a feature list. */
  audience: string
  /** Display only — Stripe is authoritative. Minor units, per month. */
  displayPriceMinor: number
  currency: string
  entitlements: Entitlements
  /** Shown on the pricing page, in the order a buyer cares about. */
  highlights: string[]
  /** What this plan deliberately does not include. */
  limitations: string[]
}

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: 'free',
    name: 'Free',
    audience: 'One person checking whether the numbers add up.',
    displayPriceMinor: 0,
    currency: 'USD',
    entitlements: {
      members: 1,
      connectedIntegrations: 1,
      assistantMessagesPerMonth: 25,
      notificationRules: 2,
      historyDays: 90,
      emailNotifications: false,
      calendarFeed: false,
      csvExport: false,
      apiAccess: false,
      prioritySupport: false,
    },
    highlights: [
      'Full profit calculation, not a teaser',
      'One connected source',
      '25 assistant questions a month',
      '90 days of history',
    ],
    limitations: ['No email alerts', 'No CSV export', 'One seat'],
  },
  starter: {
    key: 'starter',
    name: 'Starter',
    audience: 'A founder running the business from their own numbers.',
    displayPriceMinor: 4_900,
    currency: 'USD',
    entitlements: {
      members: 3,
      connectedIntegrations: 3,
      assistantMessagesPerMonth: 300,
      notificationRules: 10,
      historyDays: 730,
      emailNotifications: true,
      calendarFeed: true,
      csvExport: true,
      apiAccess: false,
      prioritySupport: false,
    },
    highlights: [
      'Three seats and three sources',
      '300 assistant questions a month',
      'Email alerts and calendar feed',
      'Two years of history',
    ],
    limitations: ['No API access'],
  },
  growth: {
    key: 'growth',
    name: 'Growth',
    audience: 'A team where more than one person owns a number.',
    displayPriceMinor: 14_900,
    currency: 'USD',
    entitlements: {
      members: 10,
      connectedIntegrations: null,
      assistantMessagesPerMonth: 2_000,
      notificationRules: 50,
      historyDays: null,
      emailNotifications: true,
      calendarFeed: true,
      csvExport: true,
      apiAccess: true,
      prioritySupport: false,
    },
    highlights: [
      'Ten seats, unlimited sources',
      '2,000 assistant questions a month',
      'Full history',
      'API access',
    ],
    limitations: ['Standard support'],
  },
  scale: {
    key: 'scale',
    name: 'Scale',
    audience: 'A business where the reporting is somebody’s actual job.',
    displayPriceMinor: 39_900,
    currency: 'USD',
    entitlements: {
      members: null,
      connectedIntegrations: null,
      assistantMessagesPerMonth: null,
      notificationRules: null,
      historyDays: null,
      emailNotifications: true,
      calendarFeed: true,
      csvExport: true,
      apiAccess: true,
      prioritySupport: true,
    },
    highlights: [
      'Unlimited seats and sources',
      'Unlimited assistant use',
      'Priority support',
    ],
    limitations: [],
  },
}

export const PLAN_ORDER: PlanKey[] = ['free', 'starter', 'growth', 'scale']

export function planFor(key: string | null | undefined): Plan {
  // An unrecognised plan key falls back to free rather than to unlimited. A
  // typo in a webhook must not silently grant the top tier.
  return PLANS[(key ?? 'free') as PlanKey] ?? PLANS.free
}

export function isUpgrade(from: PlanKey, to: PlanKey): boolean {
  return PLAN_ORDER.indexOf(to) > PLAN_ORDER.indexOf(from)
}

/** Display only. The pricing page says as much. */
export function formatPlanPrice(plan: Plan): string {
  if (plan.displayPriceMinor === 0) return 'Free'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: plan.currency,
    minimumFractionDigits: 0,
  }).format(plan.displayPriceMinor / 100)
}

/**
 * What a workspace would lose by moving down a tier.
 *
 * Shown before a downgrade is confirmed. Finding out that you dropped from ten
 * seats to three *after* six colleagues lost access is the kind of surprise
 * that ends a subscription.
 */
export function downgradeImpact(from: PlanKey, to: PlanKey): string[] {
  const before = PLANS[from].entitlements
  const after = PLANS[to].entitlements
  const losses: string[] = []

  const numeric: [keyof Entitlements, string][] = [
    ['members', 'seats'],
    ['connectedIntegrations', 'connected sources'],
    ['assistantMessagesPerMonth', 'assistant questions a month'],
    ['notificationRules', 'alert rules'],
  ]

  for (const [key, label] of numeric) {
    const b = before[key] as number | null
    const a = after[key] as number | null
    if (b === null && a !== null) losses.push(`Limited to ${a} ${label} (currently unlimited)`)
    else if (b !== null && a !== null && a < b) losses.push(`${label} drop from ${b} to ${a}`)
  }

  if (before.historyDays === null && after.historyDays !== null) {
    losses.push(`History limited to the last ${after.historyDays} days`)
  }

  const flags: [keyof Entitlements, string][] = [
    ['emailNotifications', 'Email alerts'],
    ['calendarFeed', 'Calendar subscription'],
    ['csvExport', 'CSV export'],
    ['apiAccess', 'API access'],
    ['prioritySupport', 'Priority support'],
  ]

  for (const [key, label] of flags) {
    if (before[key] && !after[key]) losses.push(`${label} switched off`)
  }

  return losses
}
