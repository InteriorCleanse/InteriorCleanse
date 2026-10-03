import { useId } from 'react'

/**
 * The AVANT marks, drawn rather than typeset, so no font can change them.
 *
 * Wordmark: wide, extended capitals with knife-edge apexes. Both A's are
 * open chevrons (no crossbar) that mirror the V, so "AVA" reads as one
 * sweeping line. Beneath it a gold pinstripe tapers away like a coachline,
 * and draws itself in once when the page first loads. Obsidian on light;
 * platinum on dark.
 *
 * Crest: a sculpted shield whose top dips in a shallow V (the wordmark's V),
 * lacquered obsidian inside a gold double keyline, with the open A in
 * platinum crossed by the gold horizon line.
 *
 * Emblem: the same A and horizon on a square obsidian tile, for app icons
 * and the favicon, where a shield's point would be lost.
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

/**
 * Metals. Gold is brushed: pale where light catches it, deep bronze in the
 * fall-off, and a last glint at the far edge. Platinum is cool white
 * settling to warm grey. Lacquer is obsidian with depth.
 */
function Metals({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={`${id}gold`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#f3e2b8" />
        <stop offset="0.32" stopColor="#d2aa66" />
        <stop offset="0.7" stopColor="#9c7038" />
        <stop offset="1" stopColor="#d9bb80" />
      </linearGradient>
      <linearGradient id={`${id}goldv`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f3e2b8" />
        <stop offset="0.4" stopColor="#d2aa66" />
        <stop offset="0.75" stopColor="#9c7038" />
        <stop offset="1" stopColor="#d9bb80" />
      </linearGradient>
      <linearGradient id={`${id}plat`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.55" stopColor="#e9e6df" />
        <stop offset="1" stopColor="#bdb7ab" />
      </linearGradient>
      <linearGradient id={`${id}lac`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#25272c" />
        <stop offset="0.5" stopColor="#141519" />
        <stop offset="1" stopColor="#0a0b0d" />
      </linearGradient>
    </>
  )
}

export function Wordmark({ className, title = 'AVANT', tone = 'ink' }: { className?: string; title?: string | null; tone?: 'ink' | 'platinum' }) {
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
        <Metals id={id} />
      </defs>
      <path d={LETTERS.d} fill={tone === 'platinum' ? `url(#${id}plat)` : 'currentColor'} />
      {/* The coachline: full weight under the first A, thinning to a hair at the T. */}
      <path className="logo-coach" d={`M0 122 L${w} 126.4 L${w} 126.9 L0 128 Z`} fill={`url(#${id}gold)`} />
    </svg>
  )
}

const SHIELD = 'M5 8 L44 16 L83 8 C84.5 30 84 50 80.5 66 C76 87 62 103 44 116 C26 103 12 87 7.5 66 C4 50 3.5 30 5 8 Z'
const KEYLINE = 'M10.5 14.6 L44 21.6 L77.5 14.6 C78.6 33 78.1 50.5 75 64.6 C71 82.8 59.4 96.6 44 108.4 C28.6 96.6 17 82.8 13 64.6 C9.9 50.5 9.4 33 10.5 14.6 Z'

export function Crest({ height = 40, className, title = null }: { height?: number; className?: string; title?: string | null }) {
  const id = useId()
  return (
    <svg
      className={className}
      height={height}
      width={(height * 88) / 120}
      viewBox="0 0 88 120"
      role={title ? 'img' : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <Metals id={id} />
      </defs>
      <path d={SHIELD} fill={`url(#${id}lac)`} stroke={`url(#${id}goldv)`} strokeWidth="2" strokeLinejoin="round" />
      <path d={KEYLINE} fill="none" stroke={`url(#${id}goldv)`} strokeWidth="0.7" opacity="0.7" />
      <path d="M26 86 L44 42 L62 86 H58 L44 52.6 L30 86 Z" fill={`url(#${id}plat)`} />
      <path d="M13 72.6 L44 71.6 L75 72.6 L44 73.6 Z" fill={`url(#${id}gold)`} />
    </svg>
  )
}

/** Crest, a hairline, and the wordmark: the full signature. */
export function Lockup({ className, tone = 'ink' }: { className?: string; tone?: 'ink' | 'platinum' }) {
  return (
    <span className={`lockup ${className ?? ''}`}>
      <Crest className="lockup-crest" />
      <span className="lockup-rule" aria-hidden="true" />
      <Wordmark title={null} tone={tone} className="lockup-word" />
    </span>
  )
}

export function Emblem({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId()
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <Metals id={id} />
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id}lac)`} />
      <rect x="1" y="1" width="62" height="62" rx="14" fill="none" stroke={`url(#${id}goldv)`} strokeOpacity="0.55" strokeWidth="1" />
      <path d="M17.5 47 L32 15 L46.5 47 H43.6 L32 21.6 L20.4 47 Z" fill={`url(#${id}plat)`} />
      <path d="M9 37.4 L32 36.6 L55 37.4 L32 38.2 Z" fill={`url(#${id}gold)`} />
    </svg>
  )
}
