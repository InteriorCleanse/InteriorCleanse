import { Eyebrow, Panel } from '@/components/ui'
import { requireMembership } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { evaluateRules, type NotificationRule } from '@/lib/notifications/evaluate'

export const metadata = { title: 'Notifications' }

const SEVERITY_CLASS = {
  info: 'text-muted',
  warning: 'text-amber',
  critical: 'text-negative',
} as const

/**
 * The notification centre.
 *
 * Shows three things, in this order: what fired, what your rules are, and —
 * the part usually missing — which rules were skipped and why. A rule that
 * silently never fires is indistinguishable from a rule that is working, and
 * that ambiguity is how people end up trusting coverage they do not have.
 */
export default async function NotificationsPage() {
  const { membership } = await requireMembership()
  const supabase = await supabaseServer()

  const [{ data: notifications }, { data: ruleRows }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, severity, title, body, evidence, created_at, read_at')
      .eq('organization_id', membership.organizationId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('notification_rules')
      .select('id, name, metric_key, comparator, threshold, channel, enabled')
      .eq('organization_id', membership.organizationId),
  ])

  const rules: NotificationRule[] = (ruleRows ?? []).map((row) => ({
    id: row.id,
    organizationId: membership.organizationId,
    name: row.name,
    metricKey: row.metric_key,
    comparator: row.comparator as 'above' | 'below',
    threshold: Number(row.threshold),
    channel: row.channel as 'in_app' | 'email',
    enabled: row.enabled,
  }))

  // Evaluated live so the page shows what each rule says *right now*, including
  // the ones that cannot be judged. This is a read; nothing is written here.
  const { raised, skipped } = evaluateRules({
    rules,
    isDemo: membership.isDemo,
    currency: membership.baseCurrency,
  })
  const skippedById = new Map(skipped.map((s) => [s.ruleId, s.reason]))
  const raisedIds = new Set(raised.map((r) => r.ruleId))

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Notifications</h1>
        <p className="max-w-2xl text-sm text-muted">
          Alerts fire once per period and carry the figures that triggered them. Rules that cannot
          be judged are listed too — a rule that never fires should never be mistaken for a rule
          that found nothing.
        </p>
      </header>

      <Panel>
        <Eyebrow>Recent</Eyebrow>
        {(notifications ?? []).length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="space-y-3">
            {(notifications ?? []).map((notification) => {
              const evidence = notification.evidence as {
                observedDisplay?: string
                thresholdDisplay?: string
                period?: string
              } | null

              return (
                <li key={notification.id} className="border-b border-hairline pb-3 last:border-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
                        SEVERITY_CLASS[notification.severity as keyof typeof SEVERITY_CLASS]
                      }`}
                    >
                      {notification.severity}
                    </span>
                    <h3 className="text-sm font-medium text-ink">{notification.title}</h3>
                    {!notification.read_at ? (
                      <span aria-label="Unread" className="h-1.5 w-1.5 rounded-full bg-signal" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">{notification.body}</p>
                  {evidence?.observedDisplay ? (
                    <p className="mt-1 text-xs text-muted">
                      Observed {evidence.observedDisplay} against {evidence.thresholdDisplay} over{' '}
                      {evidence.period}.
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel>
        <Eyebrow>Your rules</Eyebrow>
        {rules.length === 0 ? (
          <p className="text-sm text-muted">
            No rules yet. Ask the assistant — “alert me if spend goes above £1,000 a day” — and
            approve the request it raises.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <caption className="sr-only">Notification rules and their current state</caption>
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-[0.14em] text-muted">
                  <th scope="col" className="py-2 font-medium">Rule</th>
                  <th scope="col" className="py-2 font-medium">Watches</th>
                  <th scope="col" className="py-2 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const reason = skippedById.get(rule.id)
                  const firing = raisedIds.has(rule.id)

                  return (
                    <tr key={rule.id} className="border-b border-hairline/60 align-top">
                      <th scope="row" className="py-2 text-left font-normal text-ink">
                        {rule.name}
                      </th>
                      <td className="py-2 text-muted">
                        {rule.metricKey} {rule.comparator} {rule.threshold}
                      </td>
                      <td className="py-2">
                        {firing ? (
                          <span className="text-amber">Firing now</span>
                        ) : reason ? (
                          <span className="text-muted">{reason}</span>
                        ) : (
                          <span className="text-positive">Within threshold</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
