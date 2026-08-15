'use client'

import { useEffect, useState } from 'react'
import { playClick, setSoundEnabled, soundEnabled } from '@/lib/click-sound'
import { subscribeEmail, useSource } from '@/lib/use-source'

/** Marks the visitor as subscribed so no modal ever interrupts them again. */
export const SUBSCRIBED_KEY = 'ic_subscribed'

interface GuestBookFormProps {
  /** `section` is the full band; `compact` is the always-present footer form. */
  variant?: 'section' | 'compact'
  id?: string
}

/**
 * The Guest Book sign-up form.
 *
 * A plain semantic form: a real `<form>`, a real `<label>`, `type="email"` with
 * `required`, and a submit button. It works with no JavaScript animation of any
 * kind, and the browser's own validation carries it if our handler never runs.
 * Success replaces the form in place — no navigation, no scroll jump.
 */
export function GuestBookForm({ variant = 'section', id }: GuestBookFormProps) {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const source = useSource()

  const fieldId = id ?? `guestbook-email-${variant}`

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    playClick()
    setBusy(true)
    setError('')
    try {
      await subscribeEmail(email, source)
      try {
        localStorage.setItem(SUBSCRIBED_KEY, '1')
      } catch {
        /* Private mode: the sign-up still worked. */
      }
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p className="guestbook-success" role="status">
        Signed. Look for a note from us shortly — and thank you.
      </p>
    )
  }

  return (
    <form className={`guestbook-form guestbook-form-${variant}`} onSubmit={onSubmit} noValidate={false}>
      <label className="guestbook-label" htmlFor={fieldId}>
        Your email
      </label>
      <div className="guestbook-row">
        <input
          id={fieldId}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={`${fieldId}-micro`}
          aria-invalid={error ? true : undefined}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Signing…' : 'Sign the guest book'}
        </button>
      </div>
      {error ? (
        <p className="guestbook-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="guestbook-micro" id={`${fieldId}-micro`}>
        Occasional notes. No clutter. Unsubscribe anytime.
      </p>
    </form>
  )
}

/**
 * The sound toggle.
 *
 * Rendered next to the form rather than buried in a settings page, because a
 * sound the visitor did not ask for needs its off switch within reach — and
 * here it is really an on switch, since the default is silence.
 */
function SoundToggle() {
  const [on, setOn] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Read after mount: localStorage during render would desync the markup.
  useEffect(() => {
    setOn(soundEnabled())
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <button
      type="button"
      className="guestbook-sound"
      aria-pressed={on}
      onClick={() => {
        const next = !on
        setSoundEnabled(next)
        setOn(next)
        if (next) playClick()
      }}
    >
      {on ? 'Sound on' : 'Sound off'}
    </button>
  )
}

/**
 * The full-width Guest Book band.
 *
 * The poster fills the section and the copy sits on the right half over a warm
 * scrim, so the text is legible whatever the photograph turns out to be.
 */
export function GuestBook() {
  return (
    <section className="guestbook" aria-labelledby="guestbook-heading">
      <img
        className="guestbook-bg"
        src="/images/guestbook-poster.jpg"
        alt=""
        loading="lazy"
        decoding="async"
        onError={(e) => {
          // No poster yet — the painted gradient behind it stands in.
          e.currentTarget.style.display = 'none'
        }}
      />
      <div className="guestbook-scrim" aria-hidden="true" />
      <div className="guestbook-panel">
        <p className="guestbook-eyebrow">THE GUEST BOOK</p>
        <h2 className="guestbook-heading" id="guestbook-heading">
          Every house keeps one.
        </h2>
        <p className="guestbook-body">
          New books, quiet-home rituals, and first access to limited Studio Editions.
          Sent when there&rsquo;s something genuinely worth saying.
        </p>
        <GuestBookForm variant="section" />
        <SoundToggle />
      </div>
    </section>
  )
}
