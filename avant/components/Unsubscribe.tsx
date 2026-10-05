'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

/** One tap to stop a kind of email, from the link in that email. No sign-in needed: the link is signed. */
export function Unsubscribe() {
  const t = useSearchParams()?.get('t') ?? ''
  const [state, setState] = useState<'ready' | 'busy' | 'done' | 'error'>('ready')
  const [message, setMessage] = useState('')

  const stop = async () => {
    setState('busy')
    const res = await fetch('/api/email/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t }) })
    const json = await res.json().catch(() => ({}))
    if (res.ok) return setState('done')
    setMessage(json.error ?? 'That didn’t work. Try again.')
    setState('error')
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="page-title">Email settings.</h1>
      {state === 'done' ? (
        <p className="lead">Done. You won&apos;t get those emails any more. Trip, payment and security emails still come, because you need them to use AVANT.</p>
      ) : (
        <>
          <p className="lead">Stop this kind of email? Trip, payment and security emails still come, because you need them to use AVANT.</p>
          <div>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => void stop()} disabled={state === 'busy' || !t}>
              {state === 'busy' ? 'Saving…' : 'Stop these emails'}
            </button>
          </div>
          {state === 'error' ? (
            <p className="error-block" role="alert">
              {message}
            </p>
          ) : null}
        </>
      )}
      <p className="small muted">
        Every email setting, and push notifications on your iPhone, are in <Link href="/account#notifications" className="link">your Profile</Link>.
      </p>
    </div>
  )
}
