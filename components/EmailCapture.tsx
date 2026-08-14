'use client'

import { useState } from 'react'
import { subscribeEmail, useSource } from '@/lib/use-source'
import dynamic from 'next/dynamic'
import { InView } from './InView'

const LottieIcon = dynamic(() => import('./LottieIcon').then((m) => m.LottieIcon), {
  ssr: false,
  loading: () => null,
})

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
        <InView
          rootMargin="150px"
          style={{ width: 64, height: 64, display: 'inline-block' }}
          placeholder={<span style={{ display: 'block', width: 64, height: 64 }} aria-hidden="true" />}
        >
          <LottieIcon name="envelope" width={64} height={64} />
        </InView>
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
