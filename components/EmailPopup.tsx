'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { EMAIL_FORM_ENDPOINT } from '@/lib/site-config'

/**
 * One-per-session email capture. Posts to EMAIL_FORM_ENDPOINT when one is
 * configured; without an endpoint it still confirms to the visitor but the
 * address is not stored anywhere — wire up a form provider before launch.
 */
export function EmailPopup() {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [email, setEmail] = useState('')
  const [success, setSuccess] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (sessionStorage.getItem('ic_popup')) return
    const pending = timers.current
    const t = window.setTimeout(() => {
      sessionStorage.setItem('ic_popup', '1')
      setOpen(true)
    }, 4000)
    pending.push(t)
    return () => pending.forEach(clearTimeout)
  }, [])

  const close = useCallback(() => {
    setClosing(true)
    const t = window.setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, 350)
    timers.current.push(t)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const submit = () => {
    if (!email.includes('@')) return
    if (EMAIL_FORM_ENDPOINT) {
      fetch(EMAIL_FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }).catch(() => {
        /* Confirmation is optimistic; a provider outage shouldn't scold. */
      })
    }
    setSuccess(true)
    timers.current.push(window.setTimeout(close, 2500))
  }

  if (!open) return null

  return (
    <div
      className={`popup-overlay ${closing ? 'closing' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="popup-box" role="dialog" aria-modal="true" aria-label="Join the edit">
        <button className="popup-close" onClick={close} aria-label="Close">
          ✕
        </button>
        <p className="eyebrow popup-eyebrow">Private correspondence</p>
        <h2 className="popup-headline">
          The considered edit,
          <br />
          <em>delivered quietly.</em>
        </h2>
        <p className="popup-copy">
          Join the InteriorCleanse list. New product finds, organizing guides, and
          early access to book releases — sent when there is something worth saying.
        </p>
        <div className="popup-divider" />
        <input
          className="popup-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="YOUR EMAIL ADDRESS"
          aria-label="Email address"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <button className={`popup-submit ${success ? 'success' : ''}`} onClick={submit}>
          {success ? 'WELCOME TO THE EDIT ✦' : 'JOIN THE EDIT →'}
        </button>
        <p className="popup-privacy">
          No spam. Unsubscribe anytime. Your details stay private.
        </p>
        <span className="popup-diamond">◇</span>
      </div>
    </div>
  )
}
