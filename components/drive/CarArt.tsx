/**
 * A side-profile illustration for each body type, in the car's own colour.
 *
 * The sample fleet has no photographs and the site never ships stock ones,
 * so every car is drawn: consistent, honest about being a demonstration, and
 * a few hundred bytes instead of a few hundred kilobytes. Server-safe.
 */

import type { BodyType } from '@/lib/drive/types'

interface Silhouette {
  body: string
  glass: string
  wheels: [number, number][]
  /** Optional extra detail (a bed, a cargo box) drawn in the darker shade. */
  detail?: string
}

// All silhouettes share a 320×150 canvas; wheels sit on y=120.
const SHAPES: Record<BodyType, Silhouette> = {
  sedan: {
    body: 'M18 118 L24 96 Q30 84 52 82 L86 80 L120 56 Q128 50 142 50 L202 50 Q220 50 232 60 L258 80 L288 84 Q304 88 304 100 L304 114 Q304 120 296 120 L28 120 Q18 120 18 118 Z',
    glass: 'M96 80 L124 60 Q130 56 142 56 L168 56 L168 80 Z M176 56 L204 56 Q216 56 226 64 L246 80 L176 80 Z',
    wheels: [[76, 120], [244, 120]],
  },
  suv: {
    body: 'M18 118 L22 88 Q26 76 46 74 L84 72 L104 46 Q110 38 124 38 L226 38 Q240 38 248 48 L270 74 L292 78 Q306 82 306 96 L306 114 Q306 120 298 120 L26 120 Q18 120 18 118 Z',
    glass: 'M112 72 L124 48 Q128 44 136 44 L168 44 L168 72 Z M176 44 L222 44 Q232 44 238 52 L254 72 L176 72 Z',
    wheels: [[74, 120], [250, 120]],
  },
  truck: {
    body: 'M16 118 L18 78 Q20 72 28 72 L110 72 L110 42 Q110 36 118 36 L188 36 Q198 36 204 44 L224 72 L288 74 Q306 76 306 94 L306 114 Q306 120 298 120 L26 120 Q16 120 16 118 Z',
    glass: 'M118 70 L120 44 L152 44 L152 70 Z M160 44 L186 44 Q192 44 196 50 L212 70 L160 70 Z',
    detail: 'M24 76 L104 76 L104 84 L24 84 Z',
    wheels: [[70, 120], [252, 120]],
  },
  van: {
    body: 'M16 118 L18 82 Q20 70 34 66 L92 40 Q100 34 116 34 L262 34 Q290 34 300 60 L306 96 L306 114 Q306 120 298 120 L26 120 Q16 120 16 118 Z',
    glass: 'M52 66 L98 44 Q104 40 116 40 L140 40 L140 66 Z M148 40 L198 40 L198 66 L148 66 Z M206 40 L258 40 Q276 40 284 54 L290 66 L206 66 Z',
    wheels: [[70, 120], [254, 120]],
  },
  convertible: {
    body: 'M18 118 L24 98 Q30 86 52 84 L98 82 L130 66 Q136 62 146 62 L176 62 L176 84 L288 86 Q304 90 304 102 L304 114 Q304 120 296 120 L28 120 Q18 120 18 118 Z',
    glass: 'M110 82 L134 68 Q138 66 146 66 L170 66 L170 82 Z',
    detail: 'M176 78 L212 78 L212 84 L176 84 Z',
    wheels: [[80, 120], [240, 120]],
  },
  coupe: {
    body: 'M18 118 L26 98 Q32 86 56 84 L84 82 L122 54 Q132 46 150 46 L192 46 Q214 46 236 66 L276 84 Q302 88 304 102 L304 114 Q304 120 296 120 L28 120 Q18 120 18 118 Z',
    glass: 'M100 82 L128 58 Q134 52 150 52 L170 52 L170 82 Z M178 52 L192 52 Q208 52 222 66 L240 82 L178 82 Z',
    wheels: [[80, 120], [244, 120]],
  },
  hatchback: {
    body: 'M20 118 L26 92 Q30 80 52 78 L98 74 L118 48 Q124 40 138 40 L212 40 Q226 40 234 52 L250 76 L280 84 Q300 88 300 102 L300 114 Q300 120 292 120 L30 120 Q20 120 20 118 Z',
    glass: 'M108 74 L126 50 Q130 46 138 46 L168 46 L168 74 Z M176 46 L210 46 Q220 46 226 54 L242 74 L176 74 Z',
    wheels: [[78, 120], [242, 120]],
  },
  wagon: {
    body: 'M18 118 L24 90 Q30 78 52 76 L94 74 L116 48 Q122 40 136 40 L262 40 Q276 40 282 50 L296 78 L302 90 L302 114 Q302 120 294 120 L28 120 Q18 120 18 118 Z',
    glass: 'M106 74 L124 50 Q128 46 136 46 L166 46 L166 74 Z M174 46 L218 46 L218 74 L174 74 Z M226 46 L260 46 Q270 46 274 54 L284 74 L226 74 Z',
    wheels: [[76, 120], [246, 120]],
  },
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c : 255 - c) * amount)))
  return `rgb(${mix(r)} ${mix(g)} ${mix(b)})`
}

export function CarArt({
  body,
  color,
  className,
  title,
}: {
  body: BodyType
  color: string
  className?: string
  /** Accessible name; omitted when the card's heading already names the car. */
  title?: string
}) {
  const shape = SHAPES[body]
  const dark = shade(color, -0.35)
  const light = shade(color, 0.25)
  const glass = shade(color, -0.55)

  return (
    <svg
      viewBox="0 0 320 150"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`carbody-${body}-${color.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.55" stopColor={color} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      <ellipse cx="160" cy="132" rx="140" ry="7" fill="currentColor" opacity="0.10" />
      <path d={shape.body} fill={`url(#carbody-${body}-${color.slice(1)})`} />
      {shape.detail ? <path d={shape.detail} fill={dark} opacity="0.8" /> : null}
      <path d={shape.glass} fill={glass} opacity="0.9" />
      <path d={shape.glass} fill="white" opacity="0.12" />
      {shape.wheels.map(([cx, cy]) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r="20" fill="#1B1D22" />
          <circle cx={cx} cy={cy} r="11" fill="#8A8F98" />
          <circle cx={cx} cy={cy} r="4" fill="#2B2D31" />
        </g>
      ))}
    </svg>
  )
}
