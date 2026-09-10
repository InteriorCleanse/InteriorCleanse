import Link from 'next/link'
import { Eyebrow, Panel } from '@/components/ui'
import {
  CLOSING_SOON_DAYS,
  summarisePipeline,
  type CurrencyTotal,
  type PipelineDeal,
} from '@/lib/crm/pipeline'
import { formatMoney, money } from '@/lib/money'
import { requireCapability } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'

export const metadata = { title: 'Pipeline' }

const CLOSED_WINDOW_DAYS = 90
const MAX_DEALS = 500

/**
 * The CRM pipeline, on its own page and nowhere near the revenue page.
 *
 * Pipeline is money that has not happened. It gets no place on the command
 * centre, no line in a briefing's revenue figures, and no probability-weighted
 * "expected value" — a number nobody measured. What it gets is this: every
 * open deal, in the vendor's own stage names, totalled per currency, with the
 * dates that are already behind us called out.
 *
 * Read through the user's own client, so the page shows exactly the rows the
 * assistant's pipeline tool sees for this person.
 */
export default async function PipelinePage() {
  const { membership } = await requireCapability('data:view')
  const supabase = await supabaseServer()

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const closedSince = new Date(now.getTime() - CLOSED_WINDOW_DAYS * 86_400_000).toISOString()

  const [{ data: rows }, { data: connections }] = await Promise.all([
    supabase
      .from('crm_deals')
      .select(
        'id, name, stage, outcome, amount_minor, currency, probability, expected_close_on, owner_name, source, updated_at',
      )
      .eq('organization_id', membership.organizationId)
      .or(`outcome.eq.open,updated_at.gte.${closedSince}`)
      .order('updated_at', { ascending: false })
      .limit(MAX_DEALS),
    supabase
      .from('integration_connections')
      .select('provider, display_name, status, last_success_at')
      .eq('organization_id', membership.organizationId)
      .in('provider', ['hubspot', 'salesforce']),
  ])

  const deals: PipelineDeal[] = (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    stage: row.stage,
    outcome: row.outcome as PipelineDeal['outcome'],
    amountMinor: row.amount_minor,
    currency: row.currency,
    probability: row.probability,
    expectedCloseOn: row.expected_close_on,
    owner: row.owner_name,
    source: row.source,
    updatedAt: row.updated_at,
  }))

  const summary = summarisePipeline(deals, today, closedSince)
  const crm = (connections ?? [])[0] ?? null

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>Pipeline</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Money that has not happened</h1>
        <p className="text-sm text-muted">
          Open deals from {crm ? crm.display_name : 'the connected CRM'}, in its own stage names.
          Nothing here appears on the revenue page until an order exists.
          {crm?.last_success_at
            ? ` Last synced ${new Date(crm.last_success_at).toLocaleString()}.`
            : ''}
        </p>
      </header>

      {!crm ? (
        <Panel>
          <p className="text-sm text-muted">
            No CRM is connected. Connect HubSpot on the{' '}
            <Link href="/app/integrations" className="text-signal hover:underline">
              integrations page
            </Link>{' '}
            and open deals appear here after the first sync.
          </p>
        </Panel>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open deals" value={String(summary.open.count)} />
        <Stat
          label="Open value"
          value={totalsLine(summary.open.totals)}
          note={
            summary.open.withoutAmount > 0
              ? `${summary.open.withoutAmount} without an amount`
              : undefined
          }
        />
        <Stat
          label={`Closing in ${CLOSING_SOON_DAYS} days`}
          value={String(summary.closingSoon)}
          note={summary.overdue > 0 ? `${summary.overdue} past their expected close` : undefined}
          tone={summary.overdue > 0 ? 'amber' : undefined}
        />
        <Stat
          label={`Won · lost, last ${CLOSED_WINDOW_DAYS} days`}
          value={`${summary.won.count} · ${summary.lost.count}`}
          note={summary.won.totals.length > 0 ? `Won ${totalsLine(summary.won.totals)}` : undefined}
        />
      </div>

      {summary.open.count === 0 ? (
        crm ? (
          <Panel>
            <p className="text-sm text-muted">No open deals. Either the pipeline is empty or the first sync has not run yet.</p>
          </Panel>
        ) : null
      ) : (
        <div className="space-y-4">
          {summary.open.stages.map((group) => (
            <Panel key={group.stage}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-ink">{group.stage}</h2>
                <p className="text-xs text-muted">
                  {group.deals.length} {group.deals.length === 1 ? 'deal' : 'deals'}
                  {group.totals.length > 0 ? ` · ${totalsLine(group.totals)}` : ''}
                  {group.withoutAmount > 0 ? ` · ${group.withoutAmount} without an amount` : ''}
                </p>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-muted">
                      <th className="py-1 pr-4 font-medium">Deal</th>
                      <th className="py-1 pr-4 font-medium">Amount</th>
                      <th className="py-1 pr-4 font-medium">Vendor probability</th>
                      <th className="py-1 pr-4 font-medium">Expected close</th>
                      <th className="py-1 font-medium">Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.deals.map((deal) => {
                      const overdue = deal.expectedCloseOn !== null && deal.expectedCloseOn < today
                      return (
                        <tr key={deal.id} className="border-t border-hairline">
                          <td className="py-2 pr-4 text-ink">{deal.name}</td>
                          <td className="py-2 pr-4 tabular-nums text-ink">
                            {deal.amountMinor !== null && deal.currency
                              ? formatMoney(money(deal.amountMinor, deal.currency))
                              : <span className="text-muted">—</span>}
                          </td>
                          <td className="py-2 pr-4 tabular-nums text-muted">
                            {deal.probability !== null ? `${deal.probability}%` : '—'}
                          </td>
                          <td className={`py-2 pr-4 tabular-nums ${overdue ? 'text-amber' : 'text-muted'}`}>
                            {deal.expectedCloseOn ?? '—'}
                            {overdue ? ' · overdue' : ''}
                          </td>
                          <td className="py-2 text-muted">{deal.owner ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <p className="text-xs text-muted">
        Probabilities are the CRM&rsquo;s own and are shown, not multiplied: a weighted total is a
        number nobody measured. Currencies are totalled separately and never converted.
        {deals.length >= MAX_DEALS ? ` Showing the ${MAX_DEALS} most recently updated deals.` : ''}
      </p>
    </div>
  )
}

function totalsLine(totals: readonly CurrencyTotal[]): string {
  if (totals.length === 0) return '—'
  return totals.map((t) => formatMoney(money(t.minor, t.currency))).join(' + ')
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string
  tone?: 'amber'
}) {
  return (
    <Panel className="space-y-1">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-ink">{value}</p>
      {note ? <p className={`text-xs ${tone === 'amber' ? 'text-amber' : 'text-muted'}`}>{note}</p> : null}
    </Panel>
  )
}
