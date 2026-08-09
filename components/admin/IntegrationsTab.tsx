'use client'

import useSWR from 'swr'
import type { ConnectorState, IntegrationsReport } from '@/app/api/admin/integrations/route'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

const STATE_LABEL: Record<ConnectorState, string> = {
  connected: 'Connected',
  partial: 'Partly configured',
  not_connected: 'Not connected',
}

/**
 * Connector health.
 *
 * Every "not connected" row states the exact fix rather than just the fault —
 * a dashboard that reports a problem without the remedy just moves the work.
 */
export function IntegrationsTab() {
  const { data, error, isLoading } = useSWR<IntegrationsReport>(
    '/api/admin/integrations/',
    fetcher
  )

  if (isLoading) return <p className="admin-muted">Checking connectors…</p>
  if (error) return <p className="admin-error">{(error as Error).message}</p>
  if (!data) return null

  return (
    <section>
      {data.unsellable.length > 0 ? (
        <div className="connector-alert">
          <p className="connector-alert-title">
            {data.unsellable.length} product
            {data.unsellable.length === 1 ? '' : 's'} cannot be sold
          </p>
          <p>
            These have no Stripe Price, so checkout returns 409 for them. Run{' '}
            <code>npm run stripe:setup -- --apply</code> to create the Prices and write
            the IDs back into <code>content/products.json</code>.
          </p>
          <ul>
            {data.unsellable.map((p) => (
              <li key={p.slug}>{p.name}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="connector-grid">
        {data.connectors.map((c) => (
          <article className="connector-card" key={c.name} data-state={c.state}>
            <div className="connector-head">
              <h3>{c.name}</h3>
              <span className="connector-state">{STATE_LABEL[c.state]}</span>
            </div>
            <p className="connector-purpose">{c.purpose}</p>
            {c.blocker ? <p className="connector-blocker">{c.blocker}</p> : null}
            {c.envKeys.length > 0 ? (
              <p className="connector-keys">
                {c.envKeys.map((k) => (
                  <code key={k}>{k}</code>
                ))}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <p className="readiness-note">
        &ldquo;Connected&rdquo; means the credentials are present, not that a live call has
        succeeded — this view deliberately does not call the providers, because a
        dashboard that fires six third-party requests per load is its own liability. Run a
        sync to confirm a connector actually works.
      </p>
    </section>
  )
}
