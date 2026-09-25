import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EXPORTED_TABLES,
  NEVER_EXPORTED,
  buildWorkspaceExport,
  toCsv,
} from '@/lib/workspace/export'
import { NEVER_PURGED, RETENTION, cutoffFor, retentionPlan, runRetention } from '@/lib/retention'
import {
  GRACE_PERIOD_DAYS,
  isDue,
  purgeCutoff,
  purgeExpiredWorkspaces,
} from '@/lib/workspace/purge'
import { GRACE_PERIOD_DAYS as ENDPOINT_GRACE } from '@/app/api/workspace/route'

/**
 * Export and retention.
 *
 * Both are list-driven, and a list is exactly the kind of thing that rots: a
 * table added to the schema next month is silently missing from the export, or
 * silently acquires an expiry date. So the lists are checked against the
 * migrations rather than against themselves.
 */

function tablesInMigrations(): string[] {
  const dir = path.resolve(process.cwd(), 'supabase/migrations')
  const tables: string[] = []

  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.sql')) continue
    const sql = readFileSync(path.join(dir, file), 'utf8')
    for (const match of sql.matchAll(/create table public\.(\w+)/g)) {
      if (match[1]) tables.push(match[1])
    }
  }
  return tables
}

describe('the export list', () => {
  it('accounts for every table in the schema', () => {
    // The failure this exists to catch: a table added to a migration and to no
    // list, so a customer's export is quietly missing it.
    const known = new Set<string>([...EXPORTED_TABLES, ...Object.keys(NEVER_EXPORTED)])
    const unaccounted = tablesInMigrations().filter((table) => !known.has(table))

    expect(
      unaccounted,
      `These tables are neither exported nor explicitly excluded: ${unaccounted.join(', ')}. Add each to EXPORTED_TABLES or to NEVER_EXPORTED with a reason.`,
    ).toEqual([])
  })

  it('never exports sealed credentials', () => {
    expect(EXPORTED_TABLES).not.toContain('integration_credentials')
    expect(NEVER_EXPORTED.integration_credentials).toBeTruthy()
  })

  it('never exports live feed tokens', () => {
    expect(EXPORTED_TABLES).not.toContain('calendar_feed_tokens')
  })

  it('never exports the vendor’s own tables', () => {
    for (const table of ['platform_staff', 'platform_owner_allowlist', 'support_notes']) {
      expect(EXPORTED_TABLES).not.toContain(table)
    }
  })

  it('gives a reason for every exclusion', () => {
    for (const [table, reason] of Object.entries(NEVER_EXPORTED)) {
      expect(reason.length, `${table} has no reason`).toBeGreaterThan(20)
    }
  })

  it('includes the tables a customer would actually need to leave', () => {
    for (const table of ['orders', 'order_items', 'refunds', 'products', 'customers', 'expenses']) {
      expect(EXPORTED_TABLES).toContain(table)
    }
  })
})

describe('buildWorkspaceExport', () => {
  const read = async (table: string) =>
    table === 'orders' ? [{ id: '1', total_minor: 1999, currency: 'USD' }] : []

  it('states in the file what the file does not contain', async () => {
    const data = await buildWorkspaceExport({ organizationId: 'org1', read })
    expect(data.excluded.map((e) => e.table)).toContain('integration_credentials')
    expect(data.excluded.every((e) => e.reason.length > 0)).toBe(true)
  })

  it('keeps money in minor units rather than prettifying it', async () => {
    const data = await buildWorkspaceExport({ organizationId: 'org1', read })
    const orders = data.tables.find((t) => t.table === 'orders')!
    expect(orders.rows[0]!.total_minor).toBe(1999)
  })

  it('includes every table, empty ones included', async () => {
    const data = await buildWorkspaceExport({ organizationId: 'org1', read })
    expect(data.tables).toHaveLength(EXPORTED_TABLES.length)
  })

  it('does not abandon the export when one table fails to read', async () => {
    // A short export that looks complete is the worst outcome here.
    const flaky = async (table: string) => {
      if (table === 'orders') throw new Error('permission denied')
      return []
    }
    const data = await buildWorkspaceExport({ organizationId: 'org1', read: flaky })
    expect(data.tables).toHaveLength(EXPORTED_TABLES.length)
  })
})

describe('toCsv', () => {
  it('quotes every field, so an embedded comma cannot escape', () => {
    const csv = toCsv([{ name: 'Smith, John', qty: 2 }])
    expect(csv).toContain('"Smith, John"')
    expect(csv).toContain('"2"')
  })

  it('doubles quotes inside a field, per RFC 4180', () => {
    expect(toCsv([{ name: 'He said "hi"' }])).toContain('"He said ""hi"""')
  })

  it('uses CRLF line endings', () => {
    expect(toCsv([{ a: 1 }, { a: 2 }])).toContain('\r\n')
  })

  it('takes the union of keys, so a sparse row does not shift columns', () => {
    const csv = toCsv([{ a: 1 }, { a: 2, b: 3 }])
    expect(csv.split('\r\n')[0]).toBe('"a","b"')
    expect(csv.split('\r\n')[1]).toBe('"1",""')
  })

  it('serialises an object rather than printing [object Object]', () => {
    expect(toCsv([{ meta: { source: 'stripe' } }])).toContain('{""source"":""stripe""}')
  })

  it('returns nothing for no rows rather than a bare header', () => {
    expect(toCsv([])).toBe('')
  })
})

describe('retention', () => {
  it('never expires the audit log', () => {
    // Append-only and small. Expiring it would defeat its only purpose.
    expect(RETENTION.map((r) => r.table)).not.toContain('audit_logs')
    expect(NEVER_PURGED).toContain('audit_logs')
  })

  it('never expires the customer’s own business records', () => {
    const purged = new Set(RETENTION.map((r) => r.table))
    for (const table of ['orders', 'order_items', 'refunds', 'expenses', 'products', 'customers']) {
      expect(purged.has(table), `${table} must not expire on a timer`).toBe(false)
    }
  })

  it('never expires sealed credentials on a timer', () => {
    // They go when the connection or the workspace goes, not when they age.
    expect(RETENTION.map((r) => r.table)).not.toContain('integration_credentials')
  })

  it('keeps billing evidence longer than a year', () => {
    // A customer disputing an invoice may do it more than twelve months later.
    const usage = RETENTION.find((r) => r.table === 'usage_events')!
    expect(usage.days).toBeGreaterThan(365)
  })

  it('keeps assistant transcripts for a bounded time, not forever', () => {
    const messages = RETENTION.find((r) => r.table === 'assistant_messages')!
    expect(messages.days).toBeLessThanOrEqual(365)
    expect(messages.days).toBeGreaterThanOrEqual(90)
  })

  it('expires tool runs with the transcripts they belong to', () => {
    const messages = RETENTION.find((r) => r.table === 'assistant_messages')!
    const runs = RETENTION.find((r) => r.table === 'assistant_tool_runs')!
    expect(runs.days).toBe(messages.days)
  })

  it('gives a reason for every rule', () => {
    for (const rule of RETENTION) {
      expect(rule.reason.length, `${rule.table} has no reason`).toBeGreaterThan(20)
    }
  })

  it('computes a cutoff in the past', () => {
    const now = new Date('2025-06-01T00:00:00Z')
    const rule = RETENTION.find((r) => r.table === 'integration_sync_runs')!
    expect(cutoffFor(rule, now).toISOString()).toBe('2025-03-03T00:00:00.000Z')
  })

  it('resolves a plan with one entry per rule', () => {
    expect(retentionPlan()).toHaveLength(RETENTION.length)
  })
})

describe('runRetention', () => {
  it('reports what it deleted, per table', async () => {
    const outcomes = await runRetention(async () => 3)
    expect(outcomes).toHaveLength(RETENTION.length)
    expect(outcomes.every((o) => o.deleted === 3 && o.error === null)).toBe(true)
  })

  it('keeps going when one table fails, and says which', async () => {
    // A single locked table must not mean nothing expires anywhere.
    const outcomes = await runRetention(async ({ table }) => {
      if (table === 'usage_events') throw new Error('deadlock detected')
      return 1
    })

    const failed = outcomes.filter((o) => o.error)
    expect(failed).toHaveLength(1)
    expect(failed[0]!.table).toBe('usage_events')
    expect(outcomes.filter((o) => o.deleted === 1)).toHaveLength(RETENTION.length - 1)
  })

  it('only ever deletes rows older than the cutoff', async () => {
    const seen: Date[] = []
    const now = new Date('2025-06-01T00:00:00Z')
    await runRetention(async ({ cutoff }) => {
      seen.push(cutoff)
      return 0
    }, now)

    expect(seen.every((cutoff) => cutoff < now)).toBe(true)
  })
})

describe('the deletion grace period', () => {
  const now = new Date('2025-06-01T00:00:00Z')

  it('matches the figure quoted to the customer', () => {
    // The endpoint tells them "retained for N days, then removed". Two
    // constants drifting apart makes that sentence false, quietly.
    expect(GRACE_PERIOD_DAYS).toBe(ENDPOINT_GRACE)
  })

  it('never purges a workspace that was not deleted', () => {
    expect(isDue({ deletedAt: null }, now)).toBe(false)
  })

  it('does not purge a day early', () => {
    const oneDayShort = new Date(purgeCutoff(now).getTime() + 86_400_000)
    expect(isDue({ deletedAt: oneDayShort }, now)).toBe(false)
  })

  it('purges once the period has elapsed', () => {
    expect(isDue({ deletedAt: purgeCutoff(now) }, now)).toBe(true)
    expect(isDue({ deletedAt: new Date(purgeCutoff(now).getTime() - 1) }, now)).toBe(true)
  })

  it('leaves a workspace deleted moments ago alone', () => {
    expect(isDue({ deletedAt: new Date(now.getTime() - 1_000) }, now)).toBe(false)
  })
})

describe('purgeExpiredWorkspaces', () => {
  const now = new Date('2025-06-01T00:00:00Z')
  const due = { id: 'due', name: 'Old Co', deletedAt: new Date('2025-01-01T00:00:00Z') }
  const notDue = { id: 'fresh', name: 'New Co', deletedAt: new Date('2025-05-31T00:00:00Z') }

  it('removes only what is due', async () => {
    const removed: string[] = []
    const result = await purgeExpiredWorkspaces({
      candidates: [due, notDue],
      now,
      remove: async (id) => {
        removed.push(id)
      },
    })

    expect(removed).toEqual(['due'])
    expect(result.purged).toEqual(['due'])
  })

  it('reports a failure instead of leaving data believed to be gone', async () => {
    const result = await purgeExpiredWorkspaces({
      candidates: [due],
      now,
      remove: async () => {
        throw new Error('foreign key violation')
      },
    })

    expect(result.purged).toEqual([])
    expect(result.failed).toEqual([{ id: 'due', error: 'foreign key violation' }])
  })

  it('keeps going after one workspace fails', async () => {
    const second = { id: 'due2', name: 'Other', deletedAt: new Date('2025-01-01T00:00:00Z') }
    const result = await purgeExpiredWorkspaces({
      candidates: [due, second],
      now,
      remove: async (id) => {
        if (id === 'due') throw new Error('locked')
      },
    })

    expect(result.purged).toEqual(['due2'])
    expect(result.failed).toHaveLength(1)
  })

  it('bounds one sweep so it terminates', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      id: `w${i}`,
      name: 'x',
      deletedAt: new Date('2025-01-01T00:00:00Z'),
    }))

    const result = await purgeExpiredWorkspaces({ candidates: many, now, remove: async () => {} })
    expect(result.purged).toHaveLength(25)
  })
})
