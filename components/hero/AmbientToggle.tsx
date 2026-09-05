'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ambientEnabled,
  setAmbientEnabled,
  startAmbient,
  stopAmbient,
  type AmbientKind,
} from '@/lib/ambient-audio'

const LABEL: Record<AmbientKind, string> = {
  classical: 'room tone: strings',
  birdsong: 'room tone: birdsong',
  water: 'room tone: water',
}

/**
 * The speaker in the corner of an environment.
 *
 * Off by default. Turning it on starts this room's bed and remembers the
 * choice; the bed follows the visitor's scroll — it plays while this hero is
 * mostly on screen and fades when it is not — so two rooms on one page never
 * overlap and a bed never keeps going three screens below the room it belongs
 * to. Under prefers-reduced-motion the control is not rendered at all: there
 * is nothing it could honestly offer.
 */
export function AmbientToggle({
  kind,
  sceneRef,
}: {
  kind: AmbientKind
  sceneRef: React.RefObject<HTMLElement>
}) {
  const [on, setOn] = useState(false)
  const [shown, setShown] = useState(false)
  const inView = useRef(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) return
    setShown(true)
    setOn(ambientEnabled())
  }, [])

  // Playback follows visibility; the preference only says whether it may.
  useEffect(() => {
    const el = sceneRef.current
    if (!shown || !el) return

    const sync = () => {
      if (on && inView.current) startAmbient(kind)
      else if (!inView.current || !on) {
        // Only stop our own bed — another hero may legitimately own playback.
        stopAmbient()
      }
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        inView.current = entry.isIntersecting
        sync()
      },
      { threshold: 0.5 }
    )
    io.observe(el)

    const onHide = () => {
      if (document.hidden) stopAmbient(true)
      else sync()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', () => stopAmbient(true), { once: true })

    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onHide)
      stopAmbient()
    }
  }, [on, kind, shown, sceneRef])

  if (!shown) return null

  return (
    <button
      type="button"
      className="ambient-toggle"
      aria-pressed={on}
      aria-label={on ? `Turn off ${LABEL[kind]}` : `Turn on ${LABEL[kind]}`}
      title={on ? 'Room tone on' : 'Room tone off'}
      onClick={() => {
        const next = !on
        setAmbientEnabled(next)
        setOn(next)
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <path
          d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {on ? (
          <>
            <path d="M15 9.2a4 4 0 0 1 0 5.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M17.6 6.6a7.5 7.5 0 0 1 0 10.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : (
          <path d="M15.5 9.5l4 5m0-5l-4 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        )}
      </svg>
    </button>
  )
}
