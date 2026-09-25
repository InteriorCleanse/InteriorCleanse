import type { SupabaseClient } from '@supabase/supabase-js'
import { TOOLS_BY_NAME } from './tools'

/**
 * Carrying out an approved action.
 *
 * Separate from the tool definitions on purpose. A tool produces a *preview*
 * and never touches the database; this module is the only place a write
 * happens, and it runs exactly once, after a human approved the specific
 * arguments — which is what makes the approval mean something.
 *
 * Two properties hold every write here:
 *
 *   1. Arguments are re-validated against the tool's schema. The stored
 *      arguments were validated when the approval was raised, but a row can be
 *      edited between then and now, and trusting stored JSON because it was
 *      once trustworthy is how injection gets a second bite.
 *   2. The organization comes from the approval record, never from the caller.
 *      RLS is the backstop; this is the intent.
 */

export type ExecutionResult =
  | { ok: true; summary: string; recordId: string }
  | { ok: false; reason: string }

export async function executeApprovedAction(input: {
  supabase: SupabaseClient
  toolName: string
  args: unknown
  organizationId: string
  actorUserId: string
}): Promise<ExecutionResult> {
  const tool = TOOLS_BY_NAME.get(input.toolName)
  if (!tool || tool.kind !== 'write') {
    return { ok: false, reason: 'That action is not something this assistant can carry out.' }
  }

  const parsed = tool.schema.safeParse(input.args)
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'The stored details of this action are no longer valid, so it was not carried out.',
    }
  }

  const base = {
    organization_id: input.organizationId,
    created_by: input.actorUserId,
  }

  switch (input.toolName) {
    case 'create_goal': {
      const a = parsed.data as {
        title: string
        metric: string
        targetValue: number
        deadline: string
      }
      // The schema takes whole currency units; the column is minor units, in
      // line with every other money value in the database.
      const isMoney = a.metric === 'netRevenue' || a.metric === 'contributionProfit'
      const { data, error } = await input.supabase
        .from('goals')
        .insert({
          ...base,
          title: a.title,
          metric_key: a.metric,
          target_value: Math.round(isMoney ? a.targetValue * 100 : a.targetValue),
          deadline: a.deadline,
        })
        .select('id')
        .single()

      if (error || !data) return { ok: false, reason: describe(error?.message) }
      return { ok: true, summary: `Goal “${a.title}” created.`, recordId: data.id }
    }

    case 'create_notification_rule': {
      const a = parsed.data as {
        name: string
        metric: string
        comparator: 'above' | 'below'
        threshold: number
        channel: 'in_app' | 'email'
      }
      const { data, error } = await input.supabase
        .from('notification_rules')
        .insert({
          ...base,
          name: a.name,
          metric_key: a.metric,
          comparator: a.comparator,
          threshold: a.threshold,
          channel: a.channel,
        })
        .select('id')
        .single()

      if (error || !data) return { ok: false, reason: describe(error?.message) }
      return { ok: true, summary: `Alert “${a.name}” created.`, recordId: data.id }
    }

    default:
      return { ok: false, reason: 'That action is not something this assistant can carry out.' }
  }
}

/**
 * Postgres errors are not user-facing copy. A policy violation in particular
 * must read as "you cannot do this", not as a table name.
 */
function describe(message?: string): string {
  if (!message) return 'The action could not be saved.'
  if (/row-level security|permission denied/i.test(message)) {
    return 'You do not have permission to carry out this action in this workspace.'
  }
  return 'The action could not be saved.'
}
