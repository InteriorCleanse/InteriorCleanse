'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui'

/**
 * "Sync now".
 *
 * A sync is a slow, rate-limited operation against someone else's API, so this
 * says what actually happened rather than flashing a tick:
 *
 *   - It reports the record count, including zero. "Nothing new since the last
 *     sync" is a real and reassuring answer; a silent success looks like a
 *     no-op and gets pressed again.
 *   - A partial run says it is partial and that the next run resumes. Calling
 *     that "done" is how a truncated backfill becomes a wrong quarter.
 *   - The button disables while running so a held click cannot spend the
 *     workspace's rate limit at the vendor.
 */
export function SyncButton({ provider, label }: { provider: string; label: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'running'>('idle')
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null)

  async function run() {
    setState('running')
    setMessage(null)

    try {
      const response = await fetch('/api/integrations/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        status?: string
        recordsWritten?: number
        truncated?: boolean
        detail?: string | null
        error?: string
      }

      if (!response.ok) {
        setMessage({ tone: 'bad', text: body.error ?? 'The sync could not be started.' })
        return
      }

      const written = body.recordsWritten ?? 0
      if (body.status === 'succeeded') {
        setMessage({
          tone: 'ok',
          text: written === 0 ? 'Up to date — nothing new.' : `Updated ${written} records.`,
        })
      } else if (body.status === 'partial') {
        setMessage({
          tone: 'warn',
          text: `Updated ${written} records, then stopped. ${body.detail ?? ''} The next run continues from there.`.trim(),
        })
      } else {
        setMessage({ tone: 'bad', text: body.detail ?? 'The sync failed.' })
      }

      // Refresh so the health badge and last-sync line reflect the new state
      // rather than the page the operator loaded a minute ago.
      router.refresh()
    } catch {
      setMessage({ tone: 'bad', text: 'The request did not complete. Check your connection.' })
    } finally {
      setState('idle')
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <Button variant="secondary" onClick={run} disabled={state === 'running'}>
        {state === 'running' ? `Syncing ${label}…` : 'Sync now'}
      </Button>
      {message ? (
        <p
          className={`text-xs ${
            message.tone === 'ok'
              ? 'text-positive'
              : message.tone === 'warn'
                ? 'text-amber'
                : 'text-negative'
          }`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
