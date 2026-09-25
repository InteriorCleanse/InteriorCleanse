/**
 * Data retention.
 *
 * "We keep everything forever" is a decision, not the absence of one — and it
 * is the wrong one. Every extra month of assistant transcripts is a month of
 * a customer's business questions sitting in a database, readable by anyone who
 * gets in, and discoverable by anyone who subpoenas. Retention is the only
 * control that reduces that, because it removes the data rather than guarding
 * it.
 *
 * The windows below are chosen against what each table is actually *for*, and
 * each one is written down with its reason so it can be argued with:
 *
 * **Assistant transcripts — 180 days.** Long enough to answer "what did it tell
 * me last quarter", short enough that a breach three years from now cannot
 * expose a conversation from today. The figures the answers were built from
 * live in the commerce tables and are not touched by this.
 *
 * **Tool runs — 180 days**, with the transcripts they belong to. A tool run
 * without its message is an orphan nobody can interpret.
 *
 * **Usage events — 400 days.** Longer, deliberately: these are billing
 * evidence, and a customer disputing an invoice may reasonably do so more than
 * a year later. 400 rather than 365 so a full year is always covered including
 * the dispute window at its end.
 *
 * **Sync runs — 90 days.** Operational telemetry. Nobody debugs a sync failure
 * from last spring.
 *
 * **Delivery log — 400 days.** Evidence that a notification was or was not
 * sent, which is exactly what gets questioned after an incident.
 *
 * Two things are deliberately **never** purged here. `audit_logs` is
 * append-only and is the record of who did what — expiring it would defeat its
 * only purpose, and it is small. Commerce records are the customer's own
 * business data: deleting those is their decision, through export and workspace
 * deletion, not ours on a timer.
 */

export type RetentionRule = {
  table: string
  /** Column holding the row's age. */
  column: string
  days: number
  /** Why this number, in a sentence, for whoever changes it later. */
  reason: string
}

export const RETENTION: RetentionRule[] = [
  {
    table: 'assistant_messages',
    column: 'created_at',
    days: 180,
    reason:
      'Transcripts of a customer’s business questions. Kept long enough to be useful, short enough that a future breach cannot reach far back.',
  },
  {
    table: 'assistant_tool_runs',
    column: 'created_at',
    days: 180,
    reason: 'Belongs with the transcript. A tool run without its message cannot be interpreted.',
  },
  {
    table: 'usage_events',
    column: 'created_at',
    days: 400,
    reason:
      'Billing evidence. 400 days rather than 365 so a full year is covered including a dispute raised at the end of it.',
  },
  {
    table: 'integration_sync_runs',
    column: 'started_at',
    days: 90,
    reason: 'Operational telemetry. Nobody debugs a sync failure from last spring.',
  },
  {
    table: 'notification_deliveries',
    column: 'attempted_at',
    days: 400,
    reason: 'Evidence a notification was or was not sent, which is what gets questioned later.',
  },
]

/**
 * Tables this job must never touch, asserted rather than merely documented.
 *
 * A retention job that grows a new rule by copy-paste is exactly how an audit
 * log or a customer's orders quietly acquire an expiry date.
 */
export const NEVER_PURGED = [
  'audit_logs',
  'orders',
  'order_items',
  'refunds',
  'expenses',
  'products',
  'customers',
  'organizations',
  'organization_members',
  'integration_credentials',
] as const

export function cutoffFor(rule: RetentionRule, now: Date = new Date()): Date {
  return new Date(now.getTime() - rule.days * 86_400_000)
}

/** Rules, with their cutoffs resolved. The shape a purge job iterates. */
export function retentionPlan(now: Date = new Date()): {
  table: string
  column: string
  cutoff: Date
  days: number
}[] {
  return RETENTION.map((rule) => ({
    table: rule.table,
    column: rule.column,
    cutoff: cutoffFor(rule, now),
    days: rule.days,
  }))
}

export type PurgeExecutor = (input: {
  table: string
  column: string
  cutoff: Date
}) => Promise<number>

export type PurgeOutcome = {
  table: string
  deleted: number
  error: string | null
}

/**
 * Runs the plan.
 *
 * One table's failure does not stop the rest: a purge is a background hygiene
 * job, and a single locked table must not mean nothing expires anywhere. Each
 * outcome is reported so a table that has silently stopped purging is visible
 * rather than assumed.
 */
export async function runRetention(
  execute: PurgeExecutor,
  now: Date = new Date(),
): Promise<PurgeOutcome[]> {
  const outcomes: PurgeOutcome[] = []

  for (const step of retentionPlan(now)) {
    try {
      const deleted = await execute(step)
      outcomes.push({ table: step.table, deleted, error: null })
    } catch (error) {
      outcomes.push({
        table: step.table,
        deleted: 0,
        error: error instanceof Error ? error.message : 'Unknown error.',
      })
    }
  }

  return outcomes
}
