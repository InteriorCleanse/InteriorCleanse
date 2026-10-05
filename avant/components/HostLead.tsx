'use client'

import Link from 'next/link'
import { useState } from 'react'
import { currentCampaign } from '@/lib/campaign'

/** For owners not ready to list yet: a short form, a personal reply from the host team. */
export function HostLeadForm() {
  const [f, setF] = useState({ name: '', email: '', phone: '', city: 'Denver', car: '', cars: '1', consent: false, website: '' })
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: k === 'consent' ? e.target.checked : e.target.value }))

  if (state === 'done') {
    return (
      <div className="panel stack" style={{ gap: 8 }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 400 }}>Thank you, {f.name.split(/\s+/)[0]}.</h3>
        <p className="muted">
          Someone from the host team will reply within a day, personally. When you&apos;re ready, listing takes about ten minutes.
        </p>
        <div>
          <Link href="/host/new" className="btn btn-primary btn-md">
            List your car now
          </Link>
        </div>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('busy')
    setError(null)
    const res = await fetch('/api/host/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: f.name,
        email: f.email,
        ...(f.phone ? { phone: f.phone } : {}),
        city: f.city,
        car: f.car,
        cars: Math.max(1, Number(f.cars) || 1),
        consent: f.consent,
        website: f.website,
        ...currentCampaign(),
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok) return setState('done')
    setError(json.error ?? 'That didn’t go through. Try again.')
    setState('idle')
  }

  return (
    <form method="post" onSubmit={submit} className="panel stack lead-form" style={{ gap: 14 }}>
      <div className="grid-2">
        <label className="field">
          <span className="label">Your name</span>
          <input className="input" required autoComplete="name" value={f.name} onChange={set('name')} />
        </label>
        <label className="field">
          <span className="label">Email</span>
          <input className="input" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
        </label>
        <label className="field">
          <span className="label">Your car</span>
          <input className="input" required placeholder="2021 Tesla Model 3" value={f.car} onChange={set('car')} />
        </label>
        <label className="field">
          <span className="label">City</span>
          <input className="input" required autoComplete="address-level2" value={f.city} onChange={set('city')} />
        </label>
        <label className="field">
          <span className="label">How many cars could you share?</span>
          <input className="input" inputMode="numeric" value={f.cars} onChange={(e) => setF((p) => ({ ...p, cars: e.target.value.replace(/\D/g, '').slice(0, 3) }))} />
        </label>
        <label className="field">
          <span className="label">Phone (optional)</span>
          <input className="input" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} />
        </label>
      </div>
      <label className="sr-only" aria-hidden="true">
        Leave this empty
        <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
      </label>
      <label className="check">
        <input type="checkbox" checked={f.consent} onChange={set('consent')} required />
        <span className="small">
          AVANT may contact me about hosting by email{f.phone ? ' or phone' : ''}. No marketing lists, and you can ask us to delete this any time. See
          the{' '}
          <Link href="/legal/privacy" className="link" target="_blank">
            privacy notice
          </Link>
          .
        </span>
      </label>
      {error ? (
        <p className="error-block" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <button type="submit" className="btn btn-primary btn-md" disabled={state === 'busy' || !f.consent}>
          {state === 'busy' ? 'Sending…' : 'Talk to the host team'}
        </button>
      </div>
    </form>
  )
}
