'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Crest } from './Logo'
import { useSession } from './Session'

export function ForgotForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/auth/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(json.error ?? 'Something went wrong. Try again.')
    setSent(true)
  }

  return (
    <div className="auth fade-in">
      <Crest height={68} />
      <h1 className="greeting" style={{ marginTop: 10 }}>
        {sent ? 'Check your email.' : 'Forgot your password?'}
      </h1>
      {sent ? (
        <p className="muted">
          If {email} has an AVANT account, a reset link is on its way. It works once, for the next hour. Nothing arrived? Check spam, or{' '}
          <button type="button" className="link" onClick={() => setSent(false)}>
            try again
          </button>
          .
        </p>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 26 }}>
            Enter the email on your account and we&apos;ll send a link to choose a new password.
          </p>
          <form method="post" className="stack" style={{ gap: 14 }} onSubmit={submit}>
            <label className="field">
              <span className="label">Email</span>
              <input className="input" type="email" autoComplete="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error ? (
              <p className="error-block" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        </>
      )}
      <hr className="coachline" style={{ margin: '28px auto' }} />
      <p className="center muted">
        <Link href="/signin" className="link">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}

export function ResetForm() {
  const router = useRouter()
  const { refresh } = useSession()
  const [token, setToken] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // The token travels in the fragment; take it, then drop it from the address bar and history.
    setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '')
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/auth/reset/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(json.error ?? 'Something went wrong. Try again.')
    await refresh()
    router.replace('/more')
  }

  if (token === null) return <div className="skeleton" />
  return (
    <div className="auth fade-in">
      <Crest height={68} />
      <h1 className="greeting" style={{ marginTop: 10 }}>
        Choose a new password.
      </h1>
      {!token ? (
        <p className="muted">
          This link is incomplete. Open it straight from the email, or <Link href="/forgot" className="link">ask for a new one</Link>.
        </p>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 26 }}>
            You&apos;ll be signed in here and signed out everywhere else.
          </p>
          <form method="post" className="stack" style={{ gap: 14 }} onSubmit={submit}>
            <label className="field">
              <span className="label">New password</span>
              <input className="input" type="password" autoComplete="new-password" required minLength={10} maxLength={200} value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="hint">At least 10 characters.</span>
            </label>
            {error ? (
              <p className="error-block" role="alert">
                {error} {error.includes('expired') ? <Link href="/forgot" className="link">Get a new link</Link> : null}
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? 'Saving…' : 'Save and sign in'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}

/** Opened from the confirmation email: confirms the address and signs in. */
export function VerifyEmail() {
  const router = useRouter()
  const { refresh } = useSession()
  const [state, setState] = useState<'working' | 'failed'>('working')
  const [error, setError] = useState('')

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? ''
    window.history.replaceState(null, '', window.location.pathname)
    fetch('/api/auth/verify-email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error ?? 'This link didn’t work.')
        await refresh()
        router.replace('/more')
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'This link didn’t work.')
        setState('failed')
      })
  }, [refresh, router])

  return (
    <div className="auth fade-in">
      <Crest height={68} />
      <h1 className="greeting" style={{ marginTop: 10 }}>
        {state === 'working' ? 'Confirming your email…' : 'That link didn’t work.'}
      </h1>
      {state === 'failed' ? (
        <p className="muted">
          {error}{' '}
          <Link href="/signin" className="link">
            Sign in
          </Link>
        </p>
      ) : null}
    </div>
  )
}
