import { Eyebrow, Panel } from '@/components/ui'
import { requireCapability } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { isBillingConfigured } from '@/lib/billing/stripe'
import { PLANS, PLAN_ORDER, formatPlanPrice, type PlanKey } from '@/lib/billing/plans'
import { resolveAccess, type Subscription } from '@/lib/billing/entitlements'

export const metadata = { title: 'Billing' }

/**
 * Billing.
 *
 * Shows what is actually true right now — plan, payment state, usage against
 * limits — before it shows anything to buy. A billing page that leads with
 * upsells and buries "your card failed" is optimising for the wrong week.
 */
export default async function BillingPage() {
  const { membership } = await requireCapability('billing:view')
  const supabase = await supabaseServer()

  const month = new Date().toISOString().slice(0, 7)

  const [{ data: row }, { data: usage }, { count: memberCount }, { count: ruleCount }] =
    await Promise.all([
      supabase
        .from('subscriptions')
        .select('plan_key, status, current_period_end, cancel_at, past_due_since')
        .eq('organization_id', membership.organizationId)
        .maybeSingle(),
      supabase
        .from('usage_events')
        .select('quantity')
        .eq('organization_id', membership.organizationId)
        .eq('kind', 'assistant_message')
        .eq('period_month', month),
      supabase
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', membership.organizationId)
        .eq('status', 'active'),
      supabase
        .from('notification_rules')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', membership.organizationId),
    ])

  const subscription: Subscription = {
    planKey: (row?.plan_key ?? 'free') as PlanKey,
    status: (row?.status ?? 'active') as Subscription['status'],
    currentPeriodEnd: row?.current_period_end ? new Date(row.current_period_end) : null,
    cancelAt: row?.cancel_at ? new Date(row.cancel_at) : null,
    pastDueSince: row?.past_due_since ? new Date(row.past_due_since) : null,
  }

  const access = resolveAccess(subscription)
  const assistantUsed = (usage ?? []).reduce((total, event) => total + (event.quantity ?? 1), 0)

  const meters = [
    { label: 'Seats', used: memberCount ?? 0, limit: access.entitlements.members },
    {
      label: 'Assistant questions this month',
      used: assistantUsed,
      limit: access.entitlements.assistantMessagesPerMonth,
    },
    { label: 'Alert rules', used: ruleCount ?? 0, limit: access.entitlements.notificationRules },
  ]

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Billing</h1>
        <p className="text-sm text-muted">
          On the <span className="text-ink">{access.plan.name}</span> plan.
          {subscription.currentPeriodEnd && access.plan.key !== 'free'
            ? ` Renews ${subscription.currentPeriodEnd.toISOString().slice(0, 10)}.`
            : ''}
        </p>
      </header>

      {/* The state that matters leads, whatever we would rather sell. */}
      {access.notice ? (
        <Panel
          className={access.level === 'read_only' ? 'border-negative/40' : 'border-amber/40'}
        >
          <Eyebrow>{access.level === 'read_only' ? 'Read-only' : 'Payment problem'}</Eyebrow>
          <p className="text-sm text-ink">{access.notice}</p>
        </Panel>
      ) : null}

      <Panel>
        <Eyebrow>Usage</Eyebrow>
        <ul className="space-y-3">
          {meters.map((meter) => {
            const unlimited = meter.limit === null
            const over = !unlimited && meter.used > meter.limit!
            const pct = unlimited ? 0 : Math.min(100, (meter.used / Math.max(1, meter.limit!)) * 100)

            return (
              <li key={meter.label}>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-muted">{meter.label}</span>
                  <span className={`tabular-nums ${over ? 'text-negative' : 'text-ink'}`}>
                    {meter.used}
                    {unlimited ? '' : ` / ${meter.limit}`}
                  </span>
                </div>
                {!unlimited ? (
                  <div
                    role="img"
                    aria-label={`${meter.used} of ${meter.limit} used`}
                    className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-panelRaised"
                  >
                    <div
                      className={`h-full ${over ? 'bg-negative' : 'bg-signal'}`}
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </Panel>

      {!isBillingConfigured() ? (
        <Panel>
          <Eyebrow>Billing not configured</Eyebrow>
          <p className="text-sm text-muted">
            <code className="text-ink">STRIPE_SECRET_KEY</code> is not set on this deployment, so
            plans cannot be changed here. Every other surface works normally.
          </p>
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((key) => {
          const plan = PLANS[key]
          const current = key === access.plan.key

          return (
            <Panel key={key} className={current ? 'border-signal' : ''}>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-ink">{plan.name}</h2>
                <span className="text-sm text-muted">{formatPlanPrice(plan)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{plan.audience}</p>

              <ul className="mt-3 space-y-1 text-xs text-ink">
                {plan.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              {plan.limitations.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {plan.limitations.map((item) => (
                    <li key={item}>Not included: {item}</li>
                  ))}
                </ul>
              ) : null}

              {current ? (
                <p className="mt-4 text-xs font-medium text-signal">Current plan</p>
              ) : null}
            </Panel>
          )
        })}
      </div>

      <p className="text-xs text-muted">
        Prices shown are indicative; Stripe is authoritative at checkout. Changing to a smaller
        plan is done through the billing portal so proration and tax are calculated once, by the
        system that bills you.
      </p>
    </div>
  )
}
