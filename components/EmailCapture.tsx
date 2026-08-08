'use client'

import { useState } from 'react'
import { subscribeEmail, useSource } from '@/lib/use-source'
import { LottieIcon } from './LottieIcon'

/** The inline subscribe line at the foot of the homepage. */
export function EmailCapture() {
  const [value, setValue] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const source = useSource()

  const submit = async () => {
    if (!value.includes('@')) return
    setBusy(true)
    setError('')
    try {
      await subscribeEmail(value, source)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="email-lottie">
        <LottieIcon name="envelope" width={64} height={64} />
      </div>
      <div className="email-line">
        <input
          aria-label="Email address"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="YOUR EMAIL ADDRESS"
          type="email"
          disabled={done}
        />
        <button onClick={submit} disabled={busy || done}>
          {done ? 'Welcome to the edit ✦' : busy ? 'Sending…' : 'Subscribe →'}
        </button>
      </div>
      {error ? (
        <p className="popup-privacy" style={{ color: '#E06B5A' }}>
          {error}
        </p>
      ) : null}
    </>
  )
}
