'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogoIcon } from '@/components/Logo'

// Operator console entry. Posts the passkey to /api/operator/login, which sets
// a signed httpOnly session cookie on success. OPERATOR_PASSWORD is set in
// Vercel, never here. Until it is set, the endpoint reports it's not configured.
export default function OperatorLogin() {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await fetch('/api/operator/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErr(d.error ?? 'Could not sign in.')
        return
      }
      router.replace('/operator')
      router.refresh()
    } catch {
      setErr('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="cyber-login">
      <form className="cyber-card" onSubmit={submit}>
        <p className="cyber-eyebrow"><span style={{ color: 'var(--neon)' }}>●</span> GCODE KEYS // SECURE NODE</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoIcon size={34} />
          <h1 className="cyber-title" style={{ fontSize: '2.1rem', margin: 0 }}>ACCESS</h1>
        </div>
        <p className="cyber-sub">Operator authentication required</p>
        <div className="opt">
          <label htmlFor="pw" className="cyber-eyebrow">::PASSKEY</label>
          <input
            id="pw"
            className="field"
            type="password"
            placeholder="••••••••••••"
            aria-label="Operator password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button className="btn" type="submit" style={{ textAlign: 'center' }} disabled={busy || !pw}>
          {busy ? 'VERIFYING…' : 'JACK IN'}
        </button>
        {err ? <p className="ex" style={{ color: 'var(--alert)', marginTop: 4 }}>{err}</p> : null}
        <p className="cyber-sub" style={{ opacity: 0.7 }}>Set OPERATOR_PASSWORD in Vercel to enable access.</p>
      </form>
    </section>
  )
}
