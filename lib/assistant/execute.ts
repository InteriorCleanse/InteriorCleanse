import type { SupabaseClient } from '@supabase/supabase-js'
import { extractHtml, siteSystemPrompt, siteUserPrompt, validateSiteHtml } from '@/lib/sites/generate'
import { DeployError } from '@/lib/sites/vercel'
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
 *
 * Anything that reaches outside the database — the model that writes a page,
 * the host that publishes one — arrives as an injected service, so this stays
 * testable without a key and a missing service is a plain answer rather than
 * an exception.
 */

export type ExecutionResult =
  | { ok: true; summary: string; recordId: string }
  | { ok: false; reason: string }

export type ExecutionServices = {
  /** Asks the model for a page; absent when no model key is configured. */
  generateSite?: (system: string, user: string) => Promise<string>
  /** Publishes a page through the workspace's host; absent when none is connected. */
  publishSite?: (site: { name: string; html: string }) => Promise<{ url: string; deploymentId: string }>
}

export async function executeApprovedAction(input: {
  supabase: SupabaseClient
  toolName: string
  args: unknown
  organizationId: string
  actorUserId: string
  services?: ExecutionServices
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

  const services = input.services ?? {}
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

    case 'build_site': {
      const a = parsed.data as { name: string; brief: string; style?: string }
      if (!services.generateSite) {
        return {
          ok: false,
          reason: 'The assistant model is not configured on this deployment, so a page cannot be written.',
        }
      }

      let html: string
      try {
        html = extractHtml(await services.generateSite(siteSystemPrompt(), siteUserPrompt(a)))
      } catch {
        return { ok: false, reason: 'The page could not be generated. Nothing was saved.' }
      }
      const check = validateSiteHtml(html)
      if (!check.ok) return { ok: false, reason: `${check.reason} Nothing was saved.` }

      const { data, error } = await input.supabase
        .from('site_builds')
        .insert({ ...base, name: a.name, brief: a.brief, html, status: 'generated' })
        .select('id')
        .single()

      if (error || !data) return { ok: false, reason: describe(error?.message) }
      return {
        ok: true,
        summary: `Site “${a.name}” built. Open Sites to preview it; ask to publish it when it is right.`,
        recordId: data.id,
      }
    }

    case 'publish_site': {
      const a = parsed.data as { siteId: string; siteName: string }
      // Through the user's client and pinned to the approval's organization:
      // a site id from another workspace reads as "not here".
      const { data: site } = await input.supabase
        .from('site_builds')
        .select('id, name, html')
        .eq('id', a.siteId)
        .eq('organization_id', input.organizationId)
        .maybeSingle()
      if (!site) return { ok: false, reason: 'That site is not in this workspace.' }

      if (!services.publishSite) {
        return {
          ok: false,
          reason: 'Vercel is not connected to this workspace, so nothing can be published. Connect it on the integrations page.',
        }
      }

      try {
        const { url, deploymentId } = await services.publishSite({ name: site.name, html: site.html })
        const { error } = await input.supabase
          .from('site_builds')
          .update({ status: 'published', published_url: url, deployment_id: deploymentId, error: null })
          .eq('id', site.id)
        if (error) return { ok: false, reason: describe(error.message) }
        return { ok: true, summary: `Published “${site.name}” at ${url}.`, recordId: site.id }
      } catch (error) {
        const reason = error instanceof DeployError ? error.message : 'Publishing failed.'
        await input.supabase
          .from('site_builds')
          .update({ status: 'failed', error: reason })
          .eq('id', site.id)
        return { ok: false, reason }
      }
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
