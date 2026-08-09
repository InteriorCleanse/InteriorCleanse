'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { BRAND_NAME } from '@/lib/site-config'

/**
 * Botanical logo mark that sits to the left of the text wordmark.
 *
 * The asset is loaded with a plain <img> (not next/image) so it stays a
 * single static request with no optimiser round-trip. If the file is
 * missing the mark removes itself rather than leaving a broken-image icon
 * in a fixed header on every page.
 */
export function LogoMark() {
  const [failed, setFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // The image is in the server HTML, so a 404 fires `error` before React has
  // hydrated and attached the handler — that event is never replayed. Checking
  // the settled state on mount is what actually catches a missing file.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [])

  if (failed) return null

  return (
    <Link href="/" className="logo-mark" aria-label={BRAND_NAME}>
      <img
        ref={imgRef}
        src="/images/logo-mark-dark.png"
        alt=""
        width={1254}
        height={1254}
        onError={() => setFailed(true)}
      />
    </Link>
  )
}
