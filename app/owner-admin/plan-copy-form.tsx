'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, inputClass } from '@/components/ui'
import type { Plan } from '@/lib/billing/plans'

/**
 * One form per plan, editing only the copy.
 *
 * There is no price field and no entitlement field, and that is shown rather
 * than hidden: the price is rendered read-only with a note saying where it
 * lives. An operator looking for a way to change it learns the answer here
 * instead of filing a bug about a missing input.
 *
 * Lists are one item per line. Clearing a field restores the code default —
 * the only sensible meaning of clearing it.
 */
export function PlanCopyForm({ plan, priceLabel }: { plan: Plan; priceLabel: string }) {
  const router = useRouter()
  const [name, setName] = useState(plan.name)
  const [audience, setAudience] = useState(plan.audience)
  const [highlights, setHighlights] = useState(plan.highlights.join('\n'))
  const [limitations, setLimitations] = useState(plan.limitations.join('\n'))
  const [state, setState] = useState<'idle' | 'saving'>('idle')
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  async function save() {
    setState('saving')
    setMessage(null)
    try {
      const response = await fetch('/api/owner/plans', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          planKey: plan.key,
          name,
          audience,
          highlights: lines(highlights),
          limitations: lines(limitations),
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setMessage({ tone: 'bad', text: body.error ?? 'The copy could not be saved.' })
        return
      }
      setMessage({ tone: 'ok', text: 'Saved. The pricing page shows this now.' })
      router.refresh()
    } catch {
      setMessage({ tone: 'bad', text: 'The request did not complete.' })
    } finally {
      setState('idle')
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">{plan.key}</h3>
        <span className="text-xs text-muted" title="Set in Stripe. Not editable here by design.">
          {priceLabel} · price lives in Stripe
        </span>
      </div>

      <label className="block text-xs text-muted">
        Name
        <input
          className={inputClass}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="block text-xs text-muted">
        Audience — one line, who this is for
        <input
          className={inputClass}
          value={audience}
          maxLength={160}
          onChange={(e) => setAudience(e.target.value)}
        />
      </label>

      <label className="block text-xs text-muted">
        Highlights — one per line, up to six
        <textarea
          className={inputClass}
          rows={4}
          value={highlights}
          onChange={(e) => setHighlights(e.target.value)}
        />
      </label>

      <label className="block text-xs text-muted">
        Not included — one per line. Shown with the same prominence as the highlights.
        <textarea
          className={inputClass}
          rows={3}
          value={limitations}
          onChange={(e) => setLimitations(e.target.value)}
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={state === 'saving'}>
          {state === 'saving' ? 'Saving…' : 'Save copy'}
        </Button>
        {message ? (
          <p
            role="status"
            className={`text-xs ${message.tone === 'ok' ? 'text-positive' : 'text-negative'}`}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </form>
  )
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
}
