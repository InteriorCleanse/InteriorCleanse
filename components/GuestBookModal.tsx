'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { GuestBookForm, SUBSCRIBED_KEY } from './GuestBook'

const DISMISSED_KEY = 'ic_guestbook_dismissed'
const SHOWN_KEY = 'ic_guestbook_shown'
/** A dismissal is respected for this long before the modal may return. */
const DISMISS_DAYS = 30
/** Fraction of the page that counts as meaningful engagement. */
const SCROLL_THRESHOLD = 0.55

/**
 * The Guest Book modal.
 *
 * It never appears on page load. It waits for one of two genuine signals —
 * the visitor has read past halfway, or the pointer has left the top of the
 * window on a desktop, once — and it never appears at all for someone who has
 * already subscribed or dismissed it in the last month.
 *
 * The band on the homepage and the footer form are the primary paths; this is
 * a fallback, so it is deliberately hard to trigger and easy to be rid of.
 */
export function GuestBookModal() {
  const [open, setOpen] = useState(false)
  const armed = useRef(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const dismiss = useCallback(() => {
    setOpen(false)
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    } catch {
      /* Private mode: the session flag below still suppresses it. */
    }
  }, [])

  useEffect(() => {
    let eligible = true
    try {
      if (localStorage.getItem(SUBSCRIBED_KEY)) eligible = false
      if (sessionStorage.getItem(SHOWN_KEY)) eligible = false
      const dismissed = Number(localStorage.getItem(DISMISSED_KEY) ?? 0)
      if (dismissed && Date.now() - dismissed < DISMISS_DAYS * 864e5) eligible = false
    } catch {
      /* Storage unavailable: treat as eligible but session-limited below. */
    }
    if (!eligible) return

    const show = () => {
      if (armed.current) return
      armed.current = true
      try {
        sessionStorage.setItem(SHOWN_KEY, '1')
      } catch {
        /* no-op */
      }
      setOpen(true)
      cleanup()
    }

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (max > 0 && window.scrollY / max >= SCROLL_THRESHOLD) show()
    }

    // Exit intent: pointer leaves through the top of the window. Desktop only —
    // there is no such gesture on touch, and firing on a scroll-out would be
    // exactly the interruption this design is trying to avoid.
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) show()
    }

    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches

    function cleanup() {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('mouseout', onLeave)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    if (fine) document.addEventListener('mouseout', onLeave)
    return cleanup
  }, [])

  // Escape closes; focus moves to the dialog so a keyboard user is not stranded.
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  if (!open) return null

  return (
    <div
      className="popup-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      <div
        className="popup-box guestbook-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guestbook-modal-heading"
        ref={dialogRef}
      >
        <button className="popup-close" onClick={dismiss} aria-label="Close" ref={closeRef}>
          ✕
        </button>
        <p className="guestbook-eyebrow">THE GUEST BOOK</p>
        <h2 className="guestbook-heading" id="guestbook-modal-heading">
          Every house keeps one.
        </h2>
        <p className="guestbook-body">
          New books, quiet-home rituals, and first access to limited Studio Editions.
          Sent when there&rsquo;s something genuinely worth saying.
        </p>
        <GuestBookForm variant="compact" id="guestbook-email-modal" />
      </div>
    </div>
  )
}
