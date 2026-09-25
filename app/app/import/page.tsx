import { Eyebrow, Panel } from '@/components/ui'
import { requireMembership } from '@/lib/session'
import { can } from '@/lib/authz'
import { ORDER_FIELDS } from '@/lib/import/csv'
import { ImportWizard } from './ImportWizard'

export const metadata = { title: 'Import' }

/**
 * The import surface. Parsing, mapping, validation and preview all happen in
 * the browser against pure functions from lib/import/csv, so the operator sees
 * exactly what will be written before anything is. The commit step (Checkpoint
 * 2, remaining) posts the validated rows plus a batch id.
 */
export default async function ImportPage() {
  const { membership, actor } = await requireMembership()
  const allowed = can(actor, 'data:import')

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Import</Eyebrow>
        <h1 className="text-3xl font-semibold">Bring in your orders</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Upload a CSV export from your store. Nothing is written until you have seen the preview,
          and every import can be rolled back as a batch.
        </p>
      </header>

      {!allowed ? (
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
          fields={ORDER_FIELDS}
          defaultCurrency="USD"
          organizationName={membership.name}
        />
      )}
    </div>
  )
}
