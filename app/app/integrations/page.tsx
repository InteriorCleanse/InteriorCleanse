import { Eyebrow, Panel } from '@/components/ui'
import { requireCapability } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { isVaultConfigured } from '@/lib/vault'
import { CONNECTORS } from '@/lib/integrations/registry'
import { assessConnection, describeAge, summariseHealth, type ConnectionRecord } from '@/lib/integrations/health'
import { ADAPTERS } from '@/lib/integrations/sync'
import { SyncButton } from './sync-button'

export const metadata = { title: 'Integrations' }

const TONE_CLASS = {
  ok: 'text-positive',
  warn: 'text-amber',
  bad: 'text-negative',
  idle: 'text-muted',
} as const

/**
 * Integrations.
 *
 * Two things this page does that most integration screens do not: it says what
 * each source *cannot* tell you next to what it can, and it distinguishes
 * "connected" from "current". Both exist because a green tick over week-old
 * figures is how someone ends up making a decision on numbers that stopped
 * updating on Tuesday.
 */
export default async function IntegrationsPage() {
  const { membership } = await requireCapability('integrations:view')
  const supabase = await supabaseServer()

  const [{ data: rows }, { data: runs }] = await Promise.all([
    supabase
      .from('integration_connections')
      .select('id, provider, display_name, status, status_detail, last_success_at, last_attempt_at')
      .eq('organization_id', membership.organizationId),
    // The last run per connection. Shown because "connected" and "the last
    // fetch worked" are different claims, and only the second one is evidence.
    supabase
      .from('integration_sync_runs')
      .select('connection_id, status, finished_at, records_written, error')
      .eq('organization_id', membership.organizationId)
      .order('started_at', { ascending: false })
      .limit(50),
  ])

  const connectionIds = new Map((rows ?? []).map((row) => [row.provider, row.id as string]))
  const lastRun = new Map<string, NonNullable<typeof runs>[number]>()
  for (const run of runs ?? []) {
    if (!lastRun.has(run.connection_id)) lastRun.set(run.connection_id, run)
  }

  const byProvider = new Map(
    (rows ?? []).map((row) => [
      row.provider,
      {
        provider: row.provider,
        displayName: row.display_name,
        status: row.status,
        statusDetail: row.status_detail,
        lastSuccessAt: row.last_success_at ? new Date(row.last_success_at) : null,
        lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at) : null,
      } satisfies ConnectionRecord,
    ]),
  )

  const healths = CONNECTORS.filter((c) => c.status === 'available').map((definition) =>
    assessConnection(
      byProvider.get(definition.provider) ?? {
        provider: definition.provider,
        displayName: definition.name,
        status: 'not_connected',
        statusDetail: null,
        lastSuccessAt: null,
        lastAttemptAt: null,
      },
    ),
  )

  const summary = summariseHealth(healths)

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Integrations</h1>
        <p className={`text-sm ${TONE_CLASS[summary.tone]}`}>{summary.message}</p>
      </header>

      {!isVaultConfigured() ? (
        <Panel className="border-amber/40">
          <Eyebrow>Credential storage not configured</Eyebrow>
          <p className="text-sm text-ink">
            <code className="text-muted">VAULT_MASTER_KEY</code> is not set, so integrations that
            need an API key cannot be connected on this deployment. CSV import works without it.
          </p>
          <p className="mt-2 text-xs text-muted">
            Generate one with <code className="text-ink">npm run keygen</code>. Credentials are
            sealed with a per-secret data key before they reach the database — see{' '}
            <code className="text-ink">docs/SECURITY.md</code>.
          </p>
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {CONNECTORS.map((definition) => {
          const health = healths.find((h) => h.provider === definition.provider)
          const planned = definition.status === 'planned'

          return (
            <Panel key={definition.provider}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-ink">{definition.name}</h2>
                  <p className="mt-1 text-sm text-muted">{definition.purpose}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[11px] ${
                    planned ? 'text-muted' : TONE_CLASS[health?.tone ?? 'idle']
                  }`}
                >
                  {planned ? 'Planned' : (health?.label ?? 'Not connected')}
                </span>
              </div>

              {health && !planned ? (
                <p className={`mt-3 text-sm ${TONE_CLASS[health.tone]}`}>{health.detail}</p>
              ) : null}

              <dl className="mt-4 space-y-3 text-xs">
                <div>
                  <dt className="font-medium uppercase tracking-[0.14em] text-muted">Provides</dt>
                  <dd className="mt-1">
                    <ul className="space-y-0.5 text-ink">
                      {definition.provides.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  {/* The gap is stated with the same weight as the capability.
                      An unstated limit becomes a wrong number later. */}
                  <dt className="font-medium uppercase tracking-[0.14em] text-amber">
                    Does not provide
                  </dt>
                  <dd className="mt-1">
                    <ul className="space-y-0.5 text-muted">
                      {definition.doesNotProvide.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              </dl>

              {(() => {
                const connectionId = connectionIds.get(definition.provider)
                const run = connectionId ? lastRun.get(connectionId) : undefined
                if (!run) return null
                return (
                  <p className="mt-4 text-xs text-muted">
                    Last run: {run.status}
                    {run.finished_at
                      ? `, ${describeAge((Date.now() - new Date(run.finished_at).getTime()) / 3_600_000)} ago`
                      : ''}
                    , {run.records_written} records written
                    {run.error ? `. ${run.error}` : '.'}
                  </p>
                )
              })()}

              {!planned && ADAPTERS[definition.provider] && byProvider.get(definition.provider) &&
              byProvider.get(definition.provider)!.status !== 'not_connected' ? (
                <SyncButton provider={definition.provider} label={definition.name} />
              ) : null}

              {definition.credentials.length > 0 ? (
                <p className="mt-4 text-xs text-muted">
                  Needs: {definition.credentials.map((c) => c.label).join(', ')}. Stored sealed —
                  after saving, only a masked hint is ever shown.
                </p>
              ) : null}
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
