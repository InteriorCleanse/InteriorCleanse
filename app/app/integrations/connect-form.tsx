'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, inputClass } from '@/components/ui'

/**
 * Connecting an integration that takes a key.
 *
 * The form is built from the connector's own definition — its credential
 * fields and settings — so a new connector needs no new form. The secret is
 * sent once to /api/integrations, which validates it against the vendor's
 * format, seals it, and answers with a masked hint; the plaintext is never
 * echoed back and the field is cleared the moment the request leaves.
 */
export type ConnectField = { key: string; label: string; help: string; optional?: boolean }

export function ConnectForm({
  provider,
  name,
  credentials,
  settings,
  connected,
}: {
  provider: string
  name: string
  credentials: ConnectField[]
  /** Setting keys the connector's schema expects, shown as plain inputs. */
  settings: { key: string; label: string; help?: string }[]
  connected: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [state, setState] = useState<'idle' | 'working'>('idle')
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setState('working')
    setMessage(null)

    const creds: Record<string, string> = {}
    for (const field of credentials) if (values[field.key]) creds[field.key] = values[field.key]!
    const config: Record<string, string> = {}
    for (const field of settings) if (values[field.key]) config[field.key] = values[field.key]!

    try {
      const response = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, credentials: creds, settings: config }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        masked?: Record<string, string>
        error?: string
      }
      // Cleared whatever happened: the secret has left, and it must not sit in
      // a form field waiting to be read over a shoulder.
      setValues({})
      if (!response.ok) {
        setMessage({ tone: 'bad', text: body.error ?? 'That could not be connected.' })
        return
      }
      const hints = Object.values(body.masked ?? {}).join(', ')
      setMessage({ tone: 'ok', text: `${name} connected${hints ? ` (${hints})` : ''}.` })
      setOpen(false)
      router.refresh()
    } catch {
      setMessage({ tone: 'bad', text: 'The request did not complete. Check your connection.' })
    } finally {
      setState('idle')
    }
  }

  async function disconnect() {
    setState('working')
    setMessage(null)
    try {
      const response = await fetch('/api/integrations', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      setMessage(
        response.ok
          ? { tone: 'ok', text: `${name} disconnected. The stored key was deleted.` }
          : { tone: 'bad', text: body.error ?? 'That could not be disconnected.' },
      )
      router.refresh()
    } catch {
      setMessage({ tone: 'bad', text: 'The request did not complete. Check your connection.' })
    } finally {
      setState('idle')
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setOpen((v) => !v)} disabled={state === 'working'}>
          {open ? 'Cancel' : connected ? 'Replace key' : 'Connect'}
        </Button>
        {connected ? (
          <Button variant="ghost" onClick={disconnect} disabled={state === 'working'}>
            Disconnect
          </Button>
        ) : null}
      </div>

      {open ? (
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-hairline bg-ground p-4">
          {[...credentials, ...settings].map((field) => (
            <label key={field.key} className="block space-y-1">
              <span className="text-xs font-medium text-ink">
                {field.label}
                {'optional' in field && field.optional ? <span className="text-muted"> (optional)</span> : null}
              </span>
              <input
                type={credentials.some((c) => c.key === field.key) ? 'password' : 'text'}
                autoComplete="off"
                spellCheck={false}
                value={values[field.key] ?? ''}
                onChange={(event) => setValues((v) => ({ ...v, [field.key]: event.target.value }))}
                className={inputClass}
              />
              {field.help ? <span className="block text-xs text-muted">{field.help}</span> : null}
            </label>
          ))}
          <p className="text-xs text-muted">
            The key is sealed before it reaches the database and is never shown again — only a
            masked hint.
          </p>
          <Button type="submit" disabled={state === 'working'}>
            {state === 'working' ? 'Connecting…' : `Connect ${name}`}
          </Button>
        </form>
      ) : null}

      {message ? (
        <p className={`text-xs ${message.tone === 'ok' ? 'text-positive' : 'text-negative'}`} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
