import { LOGO_MIN_URL } from '@/lib/brand-assets'

/**
 * The InteriorCleanse emblem, as painted: an engraved brass I and C, the C
 * blooming into an olive branch, the I rising into a flame, inside a fine
 * double ring. It is a raster from the brand CDN, so it renders as an image
 * everywhere the mark appears small — fallback tiles, the header, the intro.
 */
export function Monogram({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <img
      src={LOGO_MIN_URL}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      className={`brand-emblem ${className ?? ''}`.trim()}
    />
  )
}
