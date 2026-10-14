'use client'

import { useState } from 'react'

// Email capture / lead magnet. Offers the free flagship guide in exchange for
// an email, which is stored to the subscriber list and emailed the guide link.
export function EmailCapture({
  source = 'site',
  heading = 'Get the free Car-Key Survival Guide',
  sub = 'The one thing every car owner should read before a key ever goes missing. Straight to your inbox — no spam.',
}: {
  source?: string
  heading?: string
  sub?: string
}) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [err, setErr] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/.+@.+\..+/.test(email)) { setErr('Enter a valid email.'); return }
    setState('busy'); setErr('')
    try {
      const r = await fetch('/api/subscribe/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'Could not sign you up.'); setState('idle'); return }
      setState('done')
    } catch {
      setErr('Could not reach the server.'); setState('idle')
    }
  }

  return (
    <div className="capture">
      <div className="capture-copy">
        <div className="kicker" style={{ color: 'var(--gold)' }}>Free guide</div>
        <h3>{heading}</h3>
        <p className="sub">{sub}</p>
      </div>
      {state === 'done' ? (
        <div className="capture-done">
          <span className="capture-check">✓</span>
          <div>
            <b>Check your inbox.</b>
            <p className="ex" style={{ color: 'var(--muted)', marginTop: 4 }}>Your guide is on its way.</p>
          </div>
        </div>
      ) : (
        <form className="capture-form" onSubmit={submit}>
          <input
            className="field"
            type="email"
            placeholder="YOUR EMAIL"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
            style={{ textTransform: 'none' }}
          />
          <button className="btn glow" type="submit" disabled={state === 'busy'}>
            {state === 'busy' ? 'SENDING…' : 'SEND IT'}<span className="arrow" aria-hidden="true">→</span>
          </button>
        </form>
      )}
      {err ? <p className="ex" style={{ color: 'var(--alert)', marginTop: 8 }}>{err}</p> : null}
    </div>
  )
}
