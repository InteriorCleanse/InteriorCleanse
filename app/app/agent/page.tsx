import { redirect } from 'next/navigation'
import { Button, Eyebrow, Field, Panel, inputClass } from '@/components/ui'
import { can } from '@/lib/authz'
import { branding } from '@/lib/env'
import { AGENT_NAME_LIMIT, FOCUS_LIMIT, STANDING_ORDERS_LIMIT, agentDisplayName, agentProfileSchema, profileFromRow } from '@/lib/agents/profile'
import { requireMembership } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'

export const metadata = { title: 'Your agent' }

/**
 * This business's agent.
 *
 * Each workspace has an analyst of its own: a name, a line on what the
 * business is, and standing orders in the operator's words. An admin writes
 * them; every member can read what their analyst was told. The owner of the
 * deployment sees every agent report in from the owner console.
 */
async function save(formData: FormData) {
  'use server'

  const { membership, actor, session } = await requireMembership()
  if (!can(actor, 'workspace:update')) redirect('/app/agent?notice=Only%20an%20admin%20can%20change%20the%20agent.')

  const parsed = agentProfileSchema.safeParse({
    agentName: String(formData.get('agentName') ?? ''),
    focus: String(formData.get('focus') ?? ''),
    standingOrders: String(formData.get('standingOrders') ?? ''),
    reportsToOwner: formData.get('reportsToOwner') === 'on',
  })
  if (!parsed.success) {
    redirect(`/app/agent?notice=${encodeURIComponent(parsed.error.issues[0]?.message ?? 'Check the form.')}`)
  }

  const supabase = await supabaseServer()
  const { error } = await supabase.from('assistant_profiles').upsert(
    {
      organization_id: membership.organizationId,
      agent_name: parsed.data.agentName?.trim() || null,
      focus: parsed.data.focus,
      standing_orders: parsed.data.standingOrders,
      reports_to_owner: parsed.data.reportsToOwner,
      updated_by: session.userId,
    },
    { onConflict: 'organization_id' },
  )
  if (error) redirect('/app/agent?notice=The%20agent%20could%20not%20be%20saved.')

  await supabase.from('audit_logs').insert({
    organization_id: membership.organizationId,
    actor_user_id: session.userId,
    action: 'agent.updated',
    target_type: 'assistant_profile',
    target_id: membership.organizationId,
    metadata: { agent_name: parsed.data.agentName?.trim() || null, reports_to_owner: parsed.data.reportsToOwner },
  })

  redirect('/app/agent?notice=Saved.%20The%20agent%20uses%20this%20from%20its%20next%20answer.')
}

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const [{ membership, actor }, params] = await Promise.all([requireMembership(), searchParams])
  const supabase = await supabaseServer()
  const { data: row } = await supabase
    .from('assistant_profiles')
    .select('agent_name, focus, standing_orders, reports_to_owner')
    .eq('organization_id', membership.organizationId)
    .maybeSingle()
  const profile = profileFromRow(row)
  const editable = can(actor, 'workspace:update')
  const name = agentDisplayName(profile, branding.assistantName())

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>Your agent</Eyebrow>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="assistant-reactor">
            <span className="assistant-reactor-ring" />
            <span className="assistant-reactor-core" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{name}</h1>
        </div>
        <p className="text-sm text-muted">
          {membership.name}’s analyst. It answers from this workspace’s own figures, cites every
          record, and never acts without an approval. What you write here shapes what it watches
          and how it speaks; it cannot widen what it is allowed to do.
        </p>
      </header>

      {params.notice ? (
        <Panel>
          <p className="text-sm text-ink" role="status">
            {params.notice}
          </p>
        </Panel>
      ) : null}

      <Panel>
        <form action={save} className="space-y-5">
          <Field label="Name" hint={`What this workspace calls its analyst. Blank uses “${branding.assistantName()}”.`}>
            <input className={inputClass} name="agentName" defaultValue={profile.agentName ?? ''} maxLength={AGENT_NAME_LIMIT} disabled={!editable} placeholder={branding.assistantName()} />
          </Field>
          <Field label="Focus" hint="One line on what this business is and what matters in it.">
            <input className={inputClass} name="focus" defaultValue={profile.focus} maxLength={FOCUS_LIMIT} disabled={!editable} placeholder="Candles and diffusers, wholesale-led, margin over volume." />
          </Field>
          <Field label="Standing orders" hint="Durable instructions in your words: what to watch, what to flag, how to phrase it. These sit beneath the product’s rules and cannot grant a tool or skip an approval.">
            <textarea className={`${inputClass} min-h-40`} name="standingOrders" defaultValue={profile.standingOrders} maxLength={STANDING_ORDERS_LIMIT} disabled={!editable} placeholder={'Flag any week where refunds on the candle range pass 6%.\nJudge the brand campaign on new customers, not ROAS.\nAlways say the period before the number.'} />
          </Field>
          <label className="flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" name="reportsToOwner" defaultChecked={profile.reportsToOwner} disabled={!editable} className="mt-1" />
            <span>
              Report in to the deployment owner’s mission control
              <span className="block text-xs text-muted">
                The owner sees this company’s standing and signals alongside every other. Off keeps the company listed with no agent reporting.
              </span>
            </span>
          </label>
          {editable ? (
            <Button type="submit">Save</Button>
          ) : (
            <p className="text-xs text-muted">Only a workspace admin can change the agent. You can read what it was told.</p>
          )}
        </form>
      </Panel>
    </div>
  )
}
