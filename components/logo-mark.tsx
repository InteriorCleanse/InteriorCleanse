import Link from 'next/link'
import { BRAND_NAME } from '@/lib/site-config'

/**
 * The wordmark half of the header lockup. The mark itself is the interactive
 * IC monogram in `FloatingMark`, rendered just before this in the header, so
 * this component carries only the two-line name.
 *
 * Set in `currentColor`, so it inherits the header's ink — dark on the solid
 * cream bar, light while floating over a hero — with no raster and no swap.
 */
export function LogoMark() {
  return (
    <Link href="/" className="logo-lockup" aria-label={`${BRAND_NAME} — home`}>
      <span className="logo-wordmark">
        <span className="logo-word logo-word-lead">INTERIOR</span>
        <span className="logo-word logo-word-trail">CLEANSE</span>
      </span>
    </Link>
  )
}
