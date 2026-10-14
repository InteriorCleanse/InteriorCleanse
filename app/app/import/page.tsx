import { Eyebrow, Panel } from '@/components/ui'
import { requireMembership } from '@/lib/session'
import { can } from '@/lib/authz'
import { supabaseServer } from '@/lib/supabase/server'
import { ImportWizard, type BatchSummary } from './ImportWizard'

export const metadata = { title: 'Import' }

/**
 * The import surface. Parsing, mapping, validation and preview happen in the
 * browser against pure functions from lib/import/csv, so the operator sees
 * exactly what will be written before anything is. Commit posts the file to
 * `/api/import`, which runs the same functions again and writes under one
 * batch; every batch is listed here and can be rolled back by an admin.
 */
export default async function ImportPage() {
  const { membership, actor } = await requireMembership()
  const allowed = can(actor, 'data:import')
  // Rollback deletes, which RLS allows from Admin; the database function
  // checks again. The button is shown only where it would work.
  const canRollback = can(actor, 'members:update_role')

  const supabase = await supabaseServer()
  const { data: rows } = await supabase
    .from('import_batches')
    .select('id, kind, filename, status, row_count, skipped_count, error_count, created_at')
    .eq('organization_id', membership.organizationId)
    .order('created_at', { ascending: false })
    .limit(20)

  const batches: BatchSummary[] = (rows ?? []).map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    filename: row.filename ? String(row.filename) : null,
    status: String(row.status),
    rowCount: Number(row.row_count ?? 0),
    skippedCount: Number(row.skipped_count ?? 0),
    errorCount: Number(row.error_count ?? 0),
    createdAt: String(row.created_at),
  }))

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Import</Eyebrow>
        <h1 className="text-3xl font-semibold">Bring in your records</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Upload a CSV export of your orders, or of your advertising spend. Nothing is written
          until you have seen the preview, and every import can be rolled back as a batch.
        </p>
      </header>

      {membership.isDemo ? (
        <Panel className="border-amber/40">
          <Eyebrow>Demo workspace</Eyebrow>
          <h2 className="text-lg font-semibold">This workspace keeps its own figures</h2>
          <p className="mt-2 text-sm text-muted">
            The demo dataset is fixed so it never drifts. Create a workspace of your own to import
            real records.
          </p>
        </Panel>
      ) : !allowed ? (
        <Panel className="border-amber/40">
          <Eyebrow>Not permitted</Eyebrow>
          <h2 className="text-lg font-semibold">Your role cannot import data</h2>
          <p className="mt-2 text-sm text-muted">
            Importing requires the Member role or above. Ask an admin of {membership.name} to
            change your role, or to run the import for you.
          </p>
        </Panel>
      ) : (
        <ImportWizard
          defaultCurrency={membership.baseCurrency}
          organizationName={membership.name}
          batches={batches}
          canRollback={canRollback}
        />
      )}
    </div>
  )
}
