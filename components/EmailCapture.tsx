'use client'

import { useState } from 'react'
import { EMAIL_FORM_ENDPOINT } from '@/lib/site-config'
import { LottieIcon } from './LottieIcon'

/** The inline subscribe line used at the foot of the homepage. */
export function EmailCapture() {
  const [value, setValue] = useState('')
  const [done, setDone] = useState(false)

  const submit = () => {
    if (!value.includes('@')) return
    if (EMAIL_FORM_ENDPOINT) {
      fetch(EMAIL_FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      }).catch(() => {
        /* Optimistic: a provider outage shouldn't read as the visitor's fault. */
      })
    }
    setDone(true)
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
        />
        <button onClick={submit}>{done ? 'Welcome to the edit ✦' : 'Subscribe →'}</button>
      </div>
    </>
  )
}
