'use client'

import { useEffect, useRef } from 'react'

/**
 * Makes `aria-modal="true"` true.
 *
 * Declaring a dialog modal is a promise to assistive technology that the rest
 * of the page is inert. The cart drawer made that promise and kept none of it:
 * measured on the built site, focus stayed on the button behind the overlay,
 * all eight of the first eight Tab presses landed outside the dialog (the
 * wordmark, then the newsletter input, then the footer links), the page behind
 * scrolled 458 px, and Escape did nothing. A keyboard shopper could not reach
 * Checkout without tabbing through the whole page underneath.
 *
 * This hook supplies the four things the role implies: move focus in, keep Tab
 * inside, close on Escape, and put focus back where it came from. It also
 * stops Lenis, because the site's smooth scrolling ignores `overflow: hidden`
 * on the body.
 *
 * Returns the ref to spread onto the dialog element, which needs `tabIndex={-1}`
 * so it can hold focus when it contains no focusable child.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  // Held in a ref so a caller passing an inline arrow does not tear the whole
  // effect down and re-run it — which would steal focus on every render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const node = ref.current
    const opener = document.activeElement as HTMLElement | null

    const focusable = () =>
      Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )

    ;(focusable()[0] ?? node)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const items = focusable()
      if (!items.length) {
        e.preventDefault()
        node.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const outside = !node.contains(active)
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault()
        first.focus()
      }
    }

    // Capture phase: the dialog's own children must not swallow Escape first.
    document.addEventListener('keydown', onKey, true)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const lenis = window.__lenis
    lenis?.stop?.()

    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = previousOverflow
      lenis?.start?.()
      // Put focus back where it came from, but only if closing is what
      // orphaned it. React removes the dialog from the DOM before this
      // cleanup runs, so by now focus has usually fallen to <body> and the
      // node is detached — checking `node.contains(activeElement)` alone
      // never matched, and the restore silently never happened.
      const active = document.activeElement
      const orphaned = !active || active === document.body || Boolean(node?.contains(active))
      if (orphaned) opener?.focus?.()
    }
  }, [open])

  return ref
}
