'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface Spin360Props {
  frames: string[]
  alt: string
  /** Autoplay until the visitor takes hold. Suppressed under reduced motion. */
  autoplay?: boolean
}

/** Horizontal pixels of drag that advance one frame. */
const DRAG_PER_FRAME = 12

/**
 * Mode B — a real turntable sequence.
 *
 * These are photographs of the actual product, so unlike Mode C this genuinely
 * shows every side. It is still not a model: there is no lighting response and
 * no zoom past the captured resolution.
 *
 * Exposed as a slider so it is fully operable from the keyboard — the brief
 * requires rotation to work without a pointer, not merely to be focusable.
 */
export function Spin360({ frames, alt, autoplay = true }: Spin360Props) {
  const [frame, setFrame] = useState(0)
  const [engaged, setEngaged] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; frame: number } | null>(null)

  const count = frames.length

  const step = useCallback(
    (delta: number) => {
      setEngaged(true)
      setFrame((f) => (((f + delta) % count) + count) % count)
    },
    [count]
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // Offscreen sequences must not burn a timer — the brief is explicit that
  // animation pauses when the element is not in view.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.25 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!autoplay || engaged || !visible || reducedMotion) return
    const id = window.setInterval(() => setFrame((f) => (f + 1) % count), 110)
    return () => window.clearInterval(id)
  }, [autoplay, engaged, visible, reducedMotion, count])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, frame }
    setEngaged(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const advanced = Math.round((e.clientX - drag.x) / DRAG_PER_FRAME)
    setFrame((((drag.frame + advanced) % count) + count) % count)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragRef.current = null
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'Home') {
      setEngaged(true)
      setFrame(0)
    } else return
    e.preventDefault()
  }

  return (
    <div className="spin-stage" ref={rootRef}>
      <div
        className="spin-viewport"
        role="slider"
        tabIndex={0}
        aria-label={`Rotate ${alt}`}
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={frame + 1}
        aria-valuetext={`Frame ${frame + 1} of ${count}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {frames.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={i === 0 ? alt : ''}
            aria-hidden={i === 0 ? undefined : true}
            // Every frame stays mounted so rotation never waits on a network
            // round-trip; only the first is eager.
            loading={i === 0 ? 'eager' : 'lazy'}
            className="spin-frame"
            data-active={i === frame ? 'true' : undefined}
          />
        ))}
      </div>

      <div className="spin-controls">
        <button type="button" onClick={() => step(-1)} aria-label="Rotate left">
          ‹
        </button>
        <span className="spin-hint">360° · DRAG OR USE ARROW KEYS</span>
        <button type="button" onClick={() => step(1)} aria-label="Rotate right">
          ›
        </button>
      </div>
    </div>
  )
}
