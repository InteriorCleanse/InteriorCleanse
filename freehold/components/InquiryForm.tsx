'use client'

import { useState, type FormEvent } from 'react'
import { SITE } from '@/lib/site'

type Kind = 'build-waitlist' | 'private-call' | 'general' | 'check-report'

export function InquiryForm({ kind, cta }: { kind: Kind; cta: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'unconfigured' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    setState('sending')
    try {
      const res = await fetch('/api/inquiry/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, kind }) })
      if (res.status === 503) return setState('unconfigured')
      if (res.status === 429) {
        setMessage('Too many attempts from this connection. Wait a minute and try again.')
        return setState('error')
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setMessage(body.error || 'Something went wrong.')
        return setState('error')
      }
      setState('sent')
      form.reset()
    } catch {
      setMessage('The request did not reach the server.')
      setState('error')
    }
  }

  if (state === 'sent') {
    return (
      <p className="measure serif text-2xl" role="status">
        Received. A person replies within two working days.
      </p>
    )
  }

  const mail = (
    <a className="link" href={`mailto:${SITE.email}`}>
      {SITE.email}
    </a>
  )

  return (
    <form onSubmit={onSubmit} className="measure grid gap-5">
      <label className="grid gap-1.5 text-sm">
        <span>Name</span>
        <input name="name" required autoComplete="name" className="field" maxLength={120} />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" className="field" maxLength={200} />
      </label>
      {kind === 'private-call' && (
        <label className="grid gap-1.5 text-sm">
          <span>Your role, and the firm or family office (optional)</span>
          <input name="context" className="field" maxLength={200} />
        </label>
      )}
      <label className="grid gap-1.5 text-sm">
        <span>{kind === 'build-waitlist' ? 'What did you try to build, and where did it stop? (optional)' : 'What would you like to talk about? (optional)'}</span>
        <textarea name="message" rows={4} className="field" maxLength={2000} />
      </label>
      <input type="text" name="company_url" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-5 pt-1">
        <button type="submit" className="cta" disabled={state === 'sending'}>
          <span>{state === 'sending' ? 'Sending' : cta}</span>
          <span className="glyph" aria-hidden="true" />
        </button>
        <span className="text-sm text-stone">Sent to one inbox and stored in Brevo. Never sold, never shared.</span>
      </div>
      {state === 'unconfigured' && (
        <p className="text-sm" role="alert">
          The form is not connected yet. Email {mail} and it reaches the same person.
        </p>
      )}
      {state === 'error' && (
        <p className="text-sm" role="alert">
          {message} You can email {mail} instead.
        </p>
      )}
    </form>
  )
}
