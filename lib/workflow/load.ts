import type { SupabaseClient } from '@supabase/supabase-js'
import { itemFromRow, progressOf, summarise, todayIn, type WorkflowSummary } from './progress'

/**
 * One business's playbook, summarised, through whichever client the caller
 * holds: the person's own on every tenant path, the service role only in the
 * scheduled sweep that already holds it. Null when nothing could be read, so
 * a briefing simply carries no playbook block.
 */
export async function loadWorkflowSummary(
  db: SupabaseClient,
  organizationId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<WorkflowSummary | null> {
  const { data, error } = await db
    .from('workflow_items')
    .select('id, stage, title, status, due_on, position, blocked_reason')
    .eq('organization_id', organizationId)
    .limit(500)
  if (error) return null
  return summarise(progressOf((data ?? []).map(itemFromRow), todayIn(timezone, now)))
}
