'use client'

import useSWR from 'swr'
import Link from 'next/link'
import type { IntegrationCheck } from '@/lib/jarvis-integrations'
import '@/components/jarvis/jarvis.css'

type ConnectionsResponse = {
  checks: IntegrationCheck[]
  allConnected: boolean
  blockingCount: number
  checkedAt: string
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`)
  return res.json()
}

function statusOf(check: IntegrationCheck): { icon: string; label: string; tone: string } {
  if (check.level === 'connected' && check.live === 'invalid') {
    return { icon: '❌', label: 'Key set, provider rejected it', tone: 'bad' }
  }
  if (check.level === 'connected' && check.live === 'unreachable') {
    return { icon: '⚠️', label: 'Key set, provider unreachable', tone: 'warn' }
  }
  if (check.level === 'connected') {
    return { icon: '✅', label: check.live === 'ok' ? 'Connected — API responding' : 'Configured', tone: 'good' }
  }
  if (check.level === 'optional') {
    return { icon: '⚠️', label: 'Optional — not set', tone: 'warn' }
  }
  return { icon: '❌', label: 'Code ready, key missing', tone: 'bad' }
}

export default function ConnectionsPage() {
  const { data, error, isLoading, mutate, isValidating } = useSWR<ConnectionsResponse>(
    '/api/admin/connections/',
    fetcher,
    { revalidateOnFocus: false },
  )

  return (
    <div className="jarvis-shell jarvis-shell--doc">
      <header className="jarvis-topbar">
        <span className="jarvis-wordmark">
          CONNECTIONS <i>◇</i> InteriorCleanse
        </span>
        <nav className="jarvis-nav">
          <Link href="/admin/">Dashboard</Link>
          <Link href="/admin/jarvis/">JARVIS</Link>
        </nav>
      </header>

      <div className="jarvis-doc">
        <h1>Integration status</h1>
        <p className="jarvis-doc-lead">
          Every integration this site depends on, checked against the live provider rather than just asking whether a
          variable exists. Environment variables are read on the server, so add them in Vercel and redeploy.
        </p>

        <div className="jarvis-doc-actions">
          <button type="button" onClick={() => void mutate()} disabled={isValidating}>
            {isValidating ? 'Checking…' : 'Re-check now'}
          </button>
          {data?.checkedAt && <span>Last checked {new Date(data.checkedAt).toLocaleTimeString()}</span>}
        </div>

        {error && <p className="jarvis-error">{(error as Error).message}</p>}
        {isLoading && <p className="jarvis-doc-lead">Running live checks against each provider…</p>}

        {data?.checks.map((check) => {
          const status = statusOf(check)
          return (
            <section key={check.key} className={`jarvis-conn jarvis-conn--${status.tone}`}>
              <div className="jarvis-conn-head">
                <h2>
                  <span aria-hidden="true">{status.icon}</span> {check.service}
                </h2>
                <span className="jarvis-conn-status">{status.label}</span>
              </div>

              <p className="jarvis-conn-env">
                {check.envVars.map((v) => (
                  <code key={v}>{v}</code>
                ))}
              </p>

              {check.liveDetail && status.tone !== 'good' && (
                <p className="jarvis-conn-detail">{check.liveDetail}</p>
              )}

              {status.tone !== 'good' && (
                <ol className="jarvis-conn-steps">
                  {check.fix.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
