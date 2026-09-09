import { RETENTION } from './retention'
import { GRACE_PERIOD_DAYS } from './workspace/purge'

/**
 * The facts the legal pages are built from.
 *
 * A privacy notice is usually prose written once and quietly wrong within a
 * quarter — a new sub-processor, a changed retention window, a table nobody
 * mentioned. The parts of the notice that are *facts about the system* live
 * here, next to the code that makes them true, and the pages render them. The
 * retention figures are imported from `lib/retention.ts` rather than retyped,
 * so the notice cannot say 180 days while the purge job does 90.
 *
 * What this is not: a legal instrument. The pages say so at the top, in the
 * first sentence a reader sees, and the launch checklist keeps "real terms,
 * reviewed" as a blocking item until a lawyer has read them. Generated prose
 * with a lawyer's tone would be worse than a placeholder, because it would be
 * believed. Accurate facts with an honest header are the most a codebase can
 * contribute.
 */

export const LEGAL_STATUS = {
  /** Shown before any other content on both pages. */
  banner:
    'Draft — not yet in force. These pages describe accurately what the software does with data, and are published so a reviewer has something concrete to review. They have not been reviewed by a lawyer and do not yet form a contract.',
  reviewedAt: null as string | null,
} as const

export type SubProcessor = {
  name: string
  purpose: string
  /** What of the customer's reaches them. Stated narrowly. */
  receives: string
  /** Only when the deployment configures it. */
  optional: boolean
}

/**
 * Every third party that can receive tenant data, and what each receives.
 *
 * "Optional" means the deployment can run without it, and the readiness console
 * reports which are configured. A sub-processor that is not configured
 * receives nothing.
 */
export const SUB_PROCESSORS: SubProcessor[] = [
  {
    name: 'Supabase',
    purpose: 'Database, authentication and file storage.',
    receives: 'All workspace data, at rest, with tenant isolation enforced by row-level security. Sign-in credentials are handled by Supabase Auth and never stored by this software.',
    optional: false,
  },
  {
    name: 'Anthropic',
    purpose: 'The assistant.',
    receives:
      'The question asked, and the figures and records the assistant reads to answer it — never a stored third-party credential, which is sealed and unreadable to the assistant. Only when the assistant is used.',
    optional: true,
  },
  {
    name: 'Stripe',
    purpose: 'Subscription billing for this product.',
    receives: 'The workspace name, the billing email, and the plan chosen. Nothing about the workspace’s own sales data.',
    optional: true,
  },
  {
    name: 'Resend',
    purpose: 'Notification email.',
    receives: 'The recipient address, the notification title and body, and the figures the notification cites.',
    optional: true,
  },
  {
    name: 'Upstash',
    purpose: 'Rate limiting across instances.',
    receives: 'Opaque limit keys and token counts. No content.',
    optional: true,
  },
  {
    name: 'Google, Microsoft',
    purpose: 'Calendar connections a person chooses to make.',
    receives:
      'Nothing is sent to them; a read-only calendar is read from them, for that person only, with a token they can revoke at either end.',
    optional: true,
  },
]

/**
 * What is stored, in the terms a reader would use rather than table names.
 */
export const DATA_CATEGORIES = [
  {
    label: 'Account',
    detail: 'Email address, display name, timezone, and which workspaces you belong to with which role.',
  },
  {
    label: 'Business records you import or connect',
    detail:
      'Orders, line items, refunds, products, costs, expenses, customers and advertising spend — whatever you upload or authorise a connector to read. These are yours: they are exported on request in full and are never expired on a timer.',
  },
  {
    label: 'Third-party credentials you store',
    detail:
      'API keys and tokens for connected services, sealed with a per-secret key before they reach the database. No screen, export or log ever shows one back; only a masked hint is displayed.',
  },
  {
    label: 'Assistant conversations',
    detail: 'Your questions, the answers, and the records each answer was built from.',
  },
  {
    label: 'Notifications and their delivery',
    detail: 'Each alert raised, and for every recipient and channel whether it was sent, suppressed and why, or failed.',
  },
  {
    label: 'Audit log',
    detail:
      'Who did what, when: connections made, exports taken, workspace deleted. Append-only; never expired, because it is the record that protects you as much as us.',
  },
  {
    label: 'Usage',
    detail: 'Counts of assistant messages, imports, exports and syncs per month, kept as billing evidence.',
  },
] as const

/** Retention windows, straight from the purge job. */
export const RETENTION_SUMMARY = RETENTION.map((rule) => ({
  what: describeTable(rule.table),
  days: rule.days,
  reason: rule.reason,
}))

export const DELETION_GRACE_DAYS = GRACE_PERIOD_DAYS

function describeTable(table: string): string {
  switch (table) {
    case 'assistant_messages':
      return 'Assistant conversations'
    case 'assistant_tool_runs':
      return 'Records of what the assistant looked up'
    case 'usage_events':
      return 'Usage counts'
    case 'integration_sync_runs':
      return 'Connector sync history'
    case 'notification_deliveries':
      return 'Notification delivery log'
    default:
      return table
  }
}
