import type { CSSProperties } from 'react'

/**
 * The brass diamond used as a bullet.
 *
 * Deliberately not a Lottie icon: the trust strip sits at the fold, and four
 * animated marks there cost the whole animation runtime plus a canvas each
 * before the visitor has scrolled a pixel. This is the same shape as a few
 * bytes of inline SVG, server-rendered, with no runtime at all.
 */
export function StaticMark({ size = 30, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={style}>
      <path d="M16 5 L24 16 L16 27 L8 16 Z" fill="none" stroke="var(--brass)" strokeWidth="1.2" />
      <path d="M16 11 L19.6 16 L16 21 L12.4 16 Z" fill="var(--brass)" />
    </svg>
  )
}
