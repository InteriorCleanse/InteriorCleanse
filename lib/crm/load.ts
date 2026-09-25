import type { SupabaseClient } from '@supabase/supabase-js'
import type { PipelineDeal } from './pipeline'

/**
 * Reads the CRM mirror for one workspace, in the shape the summary takes.
 *
 * Takes whichever client the caller holds: a page passes the person's own
 * client so RLS decides what they see; the scheduled sweep passes the admin
 * client because it runs for nobody in particular and filters by workspace
 * itself. Open deals always; closed deals only back to `closedSince`, so a
 * briefing never pulls a decade of history to count three recent wins.
 */
export async function loadDeals(
  db: SupabaseClient,
  organizationId: string,
  closedSince: string,
  limit = 500,
): Promise<PipelineDeal[]> {
  const { data } = await db
    .from('crm_deals')
    .select(
      'id, name, stage, outcome, amount_minor, currency, probability, expected_close_on, owner_name, source, updated_at',
    )
    .eq('organization_id', organizationId)
    .or(`outcome.eq.open,updated_at.gte.${closedSince}`)
    .order('updated_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    stage: row.stage as string,
    outcome: row.outcome as PipelineDeal['outcome'],
    amountMinor: row.amount_minor as number | null,
    currency: row.currency as string | null,
    probability: row.probability as number | null,
    expectedCloseOn: row.expected_close_on as string | null,
    owner: row.owner_name as string | null,
    source: row.source as string,
    updatedAt: row.updated_at as string | null,
  }))
}
