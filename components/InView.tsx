'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface InViewProps {
  children: ReactNode
  /** Painted until the real content mounts. Must reserve the same box. */
  placeholder?: ReactNode
  /** Start loading this far before the element reaches the viewport. */
  rootMargin?: string
  className?: string
  style?: React.CSSProperties
}

/**
 * Defers mounting until the element is near the viewport.
 *
 * The point is not just to delay work — it is that a `dynamic()` import inside
 * `children` is never even requested while this returns the placeholder, so a
 * WebGL scene or an animation runtime below the fold costs nothing on first
 * load. The placeholder reserves the same box, so nothing shifts when the real
 * content arrives.
 *
 * Falls back to rendering immediately where IntersectionObserver is missing:
 * degraded performance beats a blank page.
 */
export function InView({
  children,
  placeholder = null,
  rootMargin = '200px',
  className,
  style,
}: InViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return setShown(true)
    const el = ref.current
    if (!el) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setShown(true)
        io.disconnect()
      },
      { rootMargin }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])

  return (
    <div ref={ref} className={className} style={style}>
      {shown ? children : placeholder}
    </div>
  )
}
