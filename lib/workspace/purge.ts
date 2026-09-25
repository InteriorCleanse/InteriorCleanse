/**
 * Removing workspaces whose grace period has expired.
 *
 * The deletion endpoint tells the customer their records are "retained for 30
 * days in case this was a mistake, then removed". Until something removes
 * them, that sentence is false — and a false sentence about deletion is the one
 * most likely to be quoted back at us by a regulator. This is what makes it
 * true.
 *
 * What it relies on, and what it deliberately does not:
 *
 * **`on delete cascade` does the work.** Every tenant-owned table references
 * `organizations (id) on delete cascade`, so deleting the organization row
 * removes everything beneath it in one statement, in one transaction. A
 * hand-written list of tables to delete from would be a list that goes stale
 * the next time a table is added — the same failure the export list is tested
 * against, except here the consequence is retained data nobody knows about.
 *
 * **Credentials are already gone.** They were destroyed at the moment of
 * deletion, not deferred to this job. If this job never ran, no third-party key
 * would still be held. That ordering is the point.
 *
 * **The audit entry survives.** `audit_logs.organization_id` is
 * `on delete set null`, so the record of who deleted what outlives the
 * workspace. A purge that erased its own evidence would be indistinguishable
 * from data loss.
 *
 * **Nothing is purged early.** The cutoff is computed from `deleted_at` and the
 * grace period, and a workspace that is not soft-deleted is never a candidate,
 * whatever else is true of it.
 */

/** Must match the figure quoted to the customer at deletion time. */
export const GRACE_PERIOD_DAYS = 30

export type PurgeCandidate = { id: string; name: string; deletedAt: Date }

export type WorkspacePurgeResult = {
  purged: string[]
  failed: { id: string; error: string }[]
}

export function purgeCutoff(now: Date = new Date(), graceDays = GRACE_PERIOD_DAYS): Date {
  return new Date(now.getTime() - graceDays * 86_400_000)
}

/**
 * Whether a workspace is due for removal.
 *
 * Separated out and exhaustively tested because an off-by-one here deletes a
 * customer's business a day early.
 */
export function isDue(
  candidate: { deletedAt: Date | null },
  now: Date = new Date(),
  graceDays = GRACE_PERIOD_DAYS,
): boolean {
  if (!candidate.deletedAt) return false
  return candidate.deletedAt.getTime() <= purgeCutoff(now, graceDays).getTime()
}

export type WorkspaceDeleter = (id: string) => Promise<void>

export async function purgeExpiredWorkspaces(input: {
  candidates: readonly PurgeCandidate[]
  remove: WorkspaceDeleter
  now?: Date
  graceDays?: number
  /** Bounded so one sweep terminates; the next takes the rest. */
  limit?: number
}): Promise<WorkspacePurgeResult> {
  const now = input.now ?? new Date()
  const graceDays = input.graceDays ?? GRACE_PERIOD_DAYS
  const limit = input.limit ?? 25

  const due = input.candidates.filter((c) => isDue(c, now, graceDays)).slice(0, limit)

  const purged: string[] = []
  const failed: { id: string; error: string }[] = []

  for (const candidate of due) {
    try {
      await input.remove(candidate.id)
      purged.push(candidate.id)
    } catch (error) {
      // One workspace's failure must not stop the rest, and a failure must be
      // reported rather than leaving data that is believed to be gone.
      failed.push({
        id: candidate.id,
        error: error instanceof Error ? error.message : 'Unknown error.',
      })
    }
  }

  return { purged, failed }
}
