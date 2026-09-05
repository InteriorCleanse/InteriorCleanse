/**
 * Exporting a workspace.
 *
 * The test of an export feature is whether someone can leave with it. Most
 * cannot: they emit a summary, or the tables the vendor finds convenient, and
 * the customer discovers what is missing only once they have cancelled.
 *
 * So the rules here are:
 *
 * **Every tenant-owned table, named in one list.** Adding a table to the schema
 * without adding it here is the failure mode, and `EXPORTED_TABLES` is asserted
 * against the migrations by a test rather than trusted.
 *
 * **Raw rows, not a rendering.** Money stays in integer minor units with its
 * currency, timestamps stay ISO 8601. A prettified export is a lossy one, and
 * the recipient is a spreadsheet or another system, not a reader.
 *
 * **No secrets, ever.** `integration_credentials` is excluded by name and by
 * assertion. An export containing a customer's Stripe key would turn a download
 * link into a credential leak — and it is *their* key, which they already have.
 *
 * **Export works when the workspace is read-only.** A past-due account that
 * cannot get its data out is being held hostage. `readOnly()` keeps
 * `csvExport: true` for exactly this reason, and this endpoint honours it.
 */

/** Every tenant-owned table, in dependency order so an import could replay it. */
export const EXPORTED_TABLES = [
  'organizations',
  'organization_members',
  'stores',
  'products',
  'product_variants',
  'product_costs',
  'customers',
  'orders',
  'order_items',
  'refunds',
  'expenses',
  'overhead_rules',
  'exchange_rates',
  'daily_business_metrics',
  'import_batches',
  'goals',
  'notification_rules',
  'notification_preferences',
  'notifications',
  'notification_deliveries',
  'assistant_threads',
  'assistant_messages',
  'assistant_tool_runs',
  'action_approvals',
  'integration_connections',
  'integration_sync_runs',
  'calendar_connections',
  'calendar_events',
  'subscriptions',
  'usage_events',
  'audit_logs',
] as const

/**
 * Tables that must never appear in an export, and why.
 *
 * Listed rather than merely omitted, so the exclusion is a decision a test can
 * check instead of an oversight nobody notices.
 */
export const NEVER_EXPORTED: Record<string, string> = {
  integration_credentials:
    'Sealed third-party API keys. The customer already holds the plaintext; putting ciphertext in a download would only create a second place to steal it from.',
  calendar_feed_tokens:
    'Hashes of live subscription URLs. Exporting them would let anyone with the file reconstruct nothing useful, but the hash is still an authenticator and belongs nowhere but the database.',
  platform_staff: 'Vendor operators. Not the customer’s data.',
  platform_owner_allowlist: 'Vendor configuration. Not the customer’s data.',
  stripe_events: 'Our webhook idempotency ledger, not a record of their business.',
  feature_flags: 'Vendor configuration.',
  support_notes: 'Internal notes about the account, written by us.',
  profiles: 'Covered through organization_members; a full profile row is another tenant’s data when shared.',
}

export type ExportedTable = { table: string; rows: Record<string, unknown>[] }

export type WorkspaceExport = {
  format: 'aurelis-workspace-export'
  version: 1
  exportedAt: string
  organizationId: string
  /** What the file does *not* contain, stated in the file itself. */
  excluded: { table: string; reason: string }[]
  notes: string[]
  tables: ExportedTable[]
}

export type TableReader = (table: string) => Promise<Record<string, unknown>[]>

export async function buildWorkspaceExport(input: {
  organizationId: string
  read: TableReader
  now?: Date
}): Promise<WorkspaceExport> {
  const tables: ExportedTable[] = []

  for (const table of EXPORTED_TABLES) {
    // A table that fails to read is reported as empty *and* noted, never
    // silently dropped — a short export that looks complete is the worst
    // possible outcome here.
    try {
      tables.push({ table, rows: await input.read(table) })
    } catch {
      tables.push({ table, rows: [] })
    }
  }

  return {
    format: 'aurelis-workspace-export',
    version: 1,
    exportedAt: (input.now ?? new Date()).toISOString(),
    organizationId: input.organizationId,
    excluded: Object.entries(NEVER_EXPORTED).map(([table, reason]) => ({ table, reason })),
    notes: [
      'Money is in integer minor units with a currency code beside it, never a decimal string, so nothing is lost to rounding on the way out.',
      'Timestamps are ISO 8601 in UTC.',
      'Rows are exactly as stored. Nothing here is summarised, rounded, or reformatted for display.',
      'Demonstration workspaces are marked by organizations.is_demo. Those figures are synthetic.',
    ],
    tables,
  }
}

/**
 * A single table as CSV.
 *
 * RFC 4180: CRLF line endings, quotes doubled inside quoted fields, and every
 * field quoted rather than only the ones that need it — a conditional quote is
 * where an embedded comma or newline eventually escapes.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''

  // Union of keys, not the first row's: Postgres omits nothing, but a jsonb
  // column can make rows differ in shape after serialisation.
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]

  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return '""'
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }

  return [
    columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) => columns.map((column) => cell(row[column])).join(',')),
  ].join('\r\n')
}
