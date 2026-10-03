import { useId } from 'react'

/**
 * The AVANT marks, drawn rather than typeset, so no font can change them.
 *
 * Wordmark: wide, extended capitals with knife-edge apexes. Both A's are
 * open chevrons (no crossbar) that mirror the V, so "AVA" reads as one
 * sweeping line. Beneath it a brushed-gold pinstripe tapers away like a
 * coachline. Letters take currentColor, so the same mark works in obsidian
 * on light and pearl on dark; the gold never changes.
 *
 * Emblem: the open A on obsidian, crossed by the same gold line running
 * edge to edge like a horizon. Used for the app icon and favicon.
 *
 * Geometry is on a 100-unit cap height. Vertical stems are 9 units; the
 * diagonals are cut so their true thickness matches. The T's crossbar ends
 * are sliced at the A's leg angle, so every letter shares one angle.
 * Spacing is kerned by eye: diagonals sit closer than straight stems.
 */

/** Open A: a chevron with flat feet and a sharp apex. */
const A = (x: number) => `M${x} 100 L${x + 55} 0 L${x + 110} 100 H${x + 99} L${x + 55} 20 L${x + 11} 100 Z`
/** V: the A turned over. */
const V = (x: number) => `M${x} 0 H${x + 11} L${x + 55} 80 L${x + 99} 0 H${x + 110} L${x + 55} 100 Z`
const N = (x: number) => `M${x} 0 H${x + 9} V100 H${x} Z M${x + 83} 0 H${x + 92} V100 H${x + 83} Z M${x} 0 H${x + 12} L${x + 92} 100 H${x + 80} Z`
const T = (x: number) => `M${x + 4.95} 0 H${x + 100} L${x + 95.05} 9 H${x} Z M${x + 45.5} 0 H${x + 54.5} V100 H${x + 45.5} Z`

const LETTERS = (() => {
  let x = 0
  const out: string[] = []
  // [glyph, advance width, space after it]
  for (const [draw, width, gap] of [
    [A, 110, 20],
    [V, 110, 20],
    [A, 110, 44],
    [N, 92, 40],
    [T, 100, 0],
  ] as const) {
    out.push(draw(x))
    x += width + gap
  }
  return { d: out.join(' '), width: x }
})()

/** Brushed gold: light catching the top edge, deepening to bronze. */
function Gilt({ id, vertical = false }: { id: string; vertical?: boolean }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
      <stop offset="0" stopColor="#ecd7a6" />
      <stop offset="0.45" stopColor="#c9a15f" />
      <stop offset="1" stopColor="#8a6332" />
    </linearGradient>
  )
}

export function Wordmark({ className, title = 'AVANT' }: { className?: string; title?: string | null }) {
  const id = useId()
  const w = LETTERS.width
  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} 132`}
      role={title ? 'img' : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <Gilt id={`${id}g`} />
      </defs>
      <path d={LETTERS.d} fill="currentColor" />
      {/* The coachline: full weight under the first A, thinning to a hair at the T. */}
      <path d={`M0 122 L${w} 126.4 L${w} 126.9 L0 128 Z`} fill={`url(#${id}g)`} />
    </svg>
  )
}

export function Emblem({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId()
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <Gilt id={`${id}g`} />
        <Gilt id={`${id}v`} vertical />
      </defs>
      <rect width="64" height="64" rx="15" fill="#121316" />
      <rect x="1" y="1" width="62" height="62" rx="14" fill="none" stroke={`url(#${id}v)`} strokeOpacity="0.35" strokeWidth="1" />
      <path d="M17.5 47 L32 15 L46.5 47 H43.6 L32 21.6 L20.4 47 Z" fill="#f4f2ed" />
      <path d="M9 37.4 L32 36.6 L55 37.4 L32 38.2 Z" fill={`url(#${id}g)`} />
    </svg>
  )
}
