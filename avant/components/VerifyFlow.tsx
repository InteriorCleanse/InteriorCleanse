'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { safeNext } from '@/lib/security/redirect'
import { useDriver } from './DriverProvider'
import { Icon } from './Icons'
import { useToast } from './Toast'
import { Notice } from './ui'

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

export function VerifyFlow() {
  const { facts, method, modes, loaded, refresh, pending } = useDriver()
  const params = useSearchParams()
  const router = useRouter()
  const toast = useToast()
  const next = safeNext(params.get('next'))
  const status = params.get('status')
  const [years, setYears] = useState('')
  const [dob, setDob] = useState('')
  const [expires, setExpires] = useState('')
  const [state, setState] = useState('')
  const [clean, setClean] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setError(null)
    const n = Number(years)
    if (!Number.isInteger(n) || n < 0 || n > 80) return setError('How many whole years have you held a driver’s licence?')
    setBusy(true)
    try {
      const res = await fetch('/api/verify/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ licenceYears: n }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (json.url) window.location.assign(json.url)
      else setBusy(false)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not start verification.')
      setBusy(false)
    }
  }

  const demo = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/verify/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ birthDate: dob, licenceExpires: expires, licenceState: state, licenceYears: Number(years), cleanRecord: clean }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      await refresh()
      toast('Driver Pass ready')
      router.push(next)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not verify.')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <div className="skeleton" />

  if (facts.verified) {
    return (
      <div className="stack">
        <Notice tone="ok" icon="check">
          <strong>Your Driver Pass is active{method === 'demo' ? ' (preview verification)' : ''}.</strong> Age {facts.age}, licensed {facts.licenceYears} years, valid to{' '}
          {facts.licenceExpires}
          {facts.licenceState ? `, ${facts.licenceState}` : ''}.
        </Notice>
        <div className="row">
          <Link href={next} className="btn btn-primary btn-md">
            Continue <Icon name="arrow-right" size={16} />
          </Link>
          <Link href="/account" className="btn btn-secondary btn-md">
            Manage or delete
          </Link>
        </div>
      </div>
    )
  }

  const live = modes?.identity
  return (
    <div className="stack" style={{ gap: 22 }}>
      {status === 'processing' || pending ? <Notice>Your check is being processed. This usually takes under a minute; refresh shortly.</Notice> : null}
      {status === 'retry' ? <Notice tone="warn">The check didn’t complete. Make sure the licence is fully in frame and try again.</Notice> : null}

      <div className="field">
        <label className="label" htmlFor="years">
          Years you&apos;ve held a driver&apos;s licence
        </label>
        <input id="years" className="input" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="e.g. 4" style={{ maxWidth: 200 }} />
        <span className="hint">Confirmed later against your driving record where required.</span>
      </div>

      {live ? (
        <div className="stack">
          <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={busy}>
            <Icon name="id" size={18} /> {busy ? 'Opening secure check…' : 'Scan licence & selfie'}
          </button>
          <p className="small dim">Opens our verification partner (Stripe Identity). You&apos;ll come straight back here.</p>
        </div>
      ) : (
        <form method="post" onSubmit={demo} className="panel stack" aria-labelledby="demo-h">
          <div>
            <p className="eyebrow">Preview verification</p>
            <h2 id="demo-h" style={{ fontSize: '1.2rem', marginTop: 6 }}>
              No document is checked in preview mode
            </h2>
            <p className="small muted" style={{ marginTop: 6 }}>
              Enter details to try the booking rules. Your birth date is used once to work out your age and is not stored.
            </p>
          </div>
          <div className="grid-2">
            <label className="field">
              <span className="label">Date of birth</span>
              <input className="input" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} autoComplete="bday" />
            </label>
            <label className="field">
              <span className="label">Licence expires</span>
              <input className="input" type="month" required value={expires} onChange={(e) => setExpires(e.target.value)} />
            </label>
            <label className="field">
              <span className="label">Issuing state</span>
              <select className="select" required value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">Choose</option>
                {STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="check" style={{ alignSelf: 'end', paddingBottom: 12 }}>
              <input type="checkbox" checked={clean} onChange={() => setClean((c) => !c)} />
              <span className="small">Simulate a verified clean driving record</span>
            </label>
          </div>
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !years}>
            {busy ? 'Checking…' : 'Create my Driver Pass'}
          </button>
        </form>
      )}
      {error ? (
        <p className="error-block" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
