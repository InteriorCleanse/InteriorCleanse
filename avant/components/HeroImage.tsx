'use client'

import { useEffect, useRef, useState } from 'react'

/** A background photo that simply disappears if it cannot load. */
export function HeroImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el?.complete && el.naturalWidth === 0) setFailed(true)
  }, [])
  if (failed) return null
  return <img ref={ref} src={src} alt={alt} className={className} fetchPriority="high" decoding="async" onError={() => setFailed(true)} />
}
