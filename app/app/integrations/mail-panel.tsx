'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, ButtonLink } from '@/components/ui'

/**
 * A person's own mailbox on the integrations page.
 *
 * Connect is a plain link into the OAuth flow. Disconnect is here so the
 * ability to take an inbox away again sits next to the ability to grant it,
 * and it says what was and was not removed rather than flashing a tick.
 */
export function MailPanel({
  providerName,
  configured,
  connected,
}: {
  providerName: string
  configured: boolean
  connected: { accountEmail: string; status: string; detail: string | null }[]
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'working'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function disconnect() {
    setState('working')
    setMessage(null)
    try {
      const response = await fetch('/api/mail', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'gmail' }),
      })
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string }
      setMessage(response.ok ? (body.message ?? 'Disconnected.') : (body.error ?? 'That did not work.'))
      router.refresh()
    } catch {
      setMessage('The request did not complete. Check your connection.')
    } finally {
      setState('idle')
    }
  }

  return (
    <li className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink">{providerName}</span>
        {connected.map((c) => (
          <span
            key={c.accountEmail}
            className={`text-xs ${c.status === 'connected' ? 'text-positive' : 'text-amber'}`}
            title={c.detail ?? undefined}
          >
            {c.accountEmail}
            {c.status !== 'connected' ? ` · ${c.status}` : ''}
          </span>
        ))}
        {configured ? (
          <ButtonLink href="/api/mail/connect/gmail" variant="secondary">
            {connected.length > 0 ? 'Reconnect' : 'Connect'}
          </ButtonLink>
        ) : (
          <span className="text-xs text-muted">Not configured on this deployment.</span>
        )}
        {connected.length > 0 ? (
          <Button variant="ghost" onClick={disconnect} disabled={state === 'working'}>
            {state === 'working' ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        ) : null}
      </div>
      {message ? (
        <p className="text-xs text-muted" role="status">
          {message}
        </p>
      ) : null}
    </li>
  )
}
