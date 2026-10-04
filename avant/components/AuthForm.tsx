'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { safeNext } from '@/lib/security/redirect'
import { useDriver } from './DriverProvider'
import { Crest } from './Logo'
import { useSession } from './Session'

export function AuthForm() {
  const params = useSearchParams()
  const router = useRouter()
  const { refresh } = useSession()
  const driver = useDriver()
  const next = safeNext(params.get('next') ?? '/', undefined)
  const ref = (params.get('ref') ?? '').toUpperCase().slice(0, 12)
  const [mode, setMode] = useState<'in' | 'up'>(params.get('mode') === 'up' || ref ? 'up' : 'in')
  const [inviter, setInviter] = useState<{ firstName: string; creditCents: number } | null>(null)
  useEffect(() => {
    if (!ref) return
    fetch(`/api/referral?code=${encodeURIComponent(ref)}`)
      .then((r) => r.json())
      .then((j) => setInviter(j.firstName ? j : null))
      .catch(() => undefined)
  }, [ref])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [accept, setAccept] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(mode === 'up' ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mode === 'up' ? { name, email, password, accept, ...(inviter ? { ref } : {}) } : { email, password }),
      })
      const json = await res.json()
      if (json.checkEmail) return setCheckEmail(true)
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.')
      await Promise.all([refresh(), driver.refresh()])
      router.replace(next === '/search' && !params.get('next') ? '/' : next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (checkEmail) {
    return (
      <div className="auth fade-in">
        <Crest height={68} />
        <h1 className="greeting" style={{ marginTop: 10 }}>
          Check your email.
        </h1>
        <p className="muted">
          We&apos;ve sent a link to {email}. Open it on this device to confirm your address and finish signing up. It works for 24 hours.
        </p>
        <hr className="coachline" style={{ margin: '28px auto' }} />
        <p className="center muted small">Nothing arrived? Check spam, or sign in with your email and password and we&apos;ll send a new link.</p>
      </div>
    )
  }

  return (
    <div className="auth fade-in">
      <Crest height={68} />
      {inviter && mode === 'up' ? (
        <p className="invite-banner">
          {inviter.firstName} invited you. Create your account and ${Math.round(inviter.creditCents / 100)} comes off your first car.
        </p>
      ) : null}
      <h1 className="greeting" style={{ marginTop: 10 }}>
        {mode === 'up' ? 'Welcome.' : 'Welcome back.'}
      </h1>
      <p className="muted" style={{ marginBottom: 26 }}>
        {mode === 'up' ? 'One account for booking, hosting and talking with your host.' : 'Sign in to book, message your host and see your trips.'}
      </p>
      {/* method="post": a submit before hydration must never put the password in the URL. */}
      <form method="post" className="stack" style={{ gap: 14 }} onSubmit={submit}>
        {mode === 'up' ? (
          <label className="field">
            <span className="label">Your name</span>
            <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} />
          </label>
        ) : null}
        <label className="field">
          <span className="label">Email</span>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input
            className="input"
            type="password"
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'up' ? 10 : 1}
            maxLength={200}
          />
          {mode === 'up' ? (
            <span className="hint">At least 10 characters. A short phrase is easiest to remember.</span>
          ) : (
            <Link href="/forgot" className="link small" style={{ justifySelf: 'start' }}>
              Forgot your password?
            </Link>
          )}
        </label>
        {mode === 'up' ? (
          <label className="check">
            <input type="checkbox" checked={accept} onChange={() => setAccept((a) => !a)} required />
            <span className="small">
              I&apos;m 18 or older and I agree to the{' '}
              <Link href="/legal/terms" className="link" target="_blank">
                terms
              </Link>{' '}
              and the{' '}
              <Link href="/legal/privacy" className="link" target="_blank">
                privacy notice
              </Link>
              .
            </span>
          </label>
        ) : null}
        {error ? (
          <p className="error-block" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || (mode === 'up' && !accept)}>
          {busy ? 'One moment…' : mode === 'up' ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <hr className="coachline" style={{ margin: '28px auto' }} />
      <p className="center muted">
        {mode === 'up' ? 'Already have an account?' : 'New to AVANT?'}{' '}
        <button type="button" className="link" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>
          {mode === 'up' ? 'Sign in' : 'Create an account'}
        </button>
      </p>
      {mode === 'in' ? (
        <p className="center small dim" style={{ marginTop: 16 }}>
          Your use of AVANT stays under the <Link href="/legal/terms" className="link">terms</Link> and <Link href="/legal/privacy" className="link">privacy notice</Link> you agreed to.
        </p>
      ) : null}
    </div>
  )
}
