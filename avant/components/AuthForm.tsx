'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { safeNext } from '@/lib/security/redirect'
import { useDriver } from './DriverProvider'
import { Emblem } from './Logo'
import { useSession } from './Session'

export function AuthForm() {
  const params = useSearchParams()
  const router = useRouter()
  const { refresh } = useSession()
  const driver = useDriver()
  const next = safeNext(params.get('next') ?? '/', undefined)
  const [mode, setMode] = useState<'in' | 'up'>(params.get('mode') === 'up' ? 'up' : 'in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(mode === 'up' ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mode === 'up' ? { name, email, password } : { email, password }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.')
      await Promise.all([refresh(), driver.refresh()])
      router.replace(next === '/search' && !params.get('next') ? '/' : next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth fade-in">
      <Emblem size={56} />
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
          {mode === 'up' ? <span className="hint">At least 10 characters. A short phrase is easiest to remember.</span> : null}
        </label>
        {error ? (
          <p className="error-block" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
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
      <p className="center small dim" style={{ marginTop: 16 }}>
        By continuing you agree to the <Link href="/legal/terms" className="link">terms</Link> and <Link href="/legal/privacy" className="link">privacy notice</Link>.
      </p>
    </div>
  )
}
