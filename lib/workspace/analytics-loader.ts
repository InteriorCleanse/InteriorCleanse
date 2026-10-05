import type { SupabaseClient } from '@supabase/supabase-js'
import { loadWorkspaceAnalytics, type WorkspaceAnalytics } from '@/lib/workspace-analytics'
import { loadWorkspaceDataset, type Dataset } from '@/lib/workspace/dataset'
import type { ComparisonKey, PresetKey } from '@/lib/periods'

/**
 * The one way a page or route gets a workspace's analytics.
 *
 * A demo workspace reads nothing — its dataset is deterministic and fixed —
 * and a real one has its rows read through the client passed in, which is the
 * caller's own, RLS-scoped client in every tenant path. Keeping the two steps
 * together here means no page can forget the load and quietly show the empty
 * state for a workspace that has data.
 */
export async function loadAnalyticsFor(
  db: SupabaseClient,
  workspace: { organizationId: string; isDemo: boolean; baseCurrency: string },
  options: { preset: PresetKey; comparison: ComparisonKey; now?: Date },
): Promise<WorkspaceAnalytics> {
  const dataset = await datasetFor(db, workspace, options.now)
  return loadWorkspaceAnalytics({
    isDemo: workspace.isDemo,
    currency: workspace.baseCurrency,
    preset: options.preset,
    comparison: options.comparison,
    now: options.now,
    dataset,
  })
}

/** A real workspace's dataset, or null for a demo, which has its own. */
export async function datasetFor(
  db: SupabaseClient,
  workspace: { organizationId: string; isDemo: boolean; baseCurrency: string },
  now?: Date,
): Promise<Dataset | null> {
  if (workspace.isDemo) return null
  return loadWorkspaceDataset(db, workspace.organizationId, workspace.baseCurrency, { now })
}
