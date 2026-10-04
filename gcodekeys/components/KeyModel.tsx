'use client'

import type { FamilyId } from '@/lib/keyFamilies'

// Faithful stylized fob shapes per key family. Parametric on shell color,
// finish and engraving. Representations only — no OEM logos are reproduced.

function shade(hex: string, amt: number) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  r = Math.max(0, Math.min(255, Math.round(r + amt)))
  g = Math.max(0, Math.min(255, Math.round(g + amt)))
  b = Math.max(0, Math.min(255, Math.round(b + amt)))
  return `rgb(${r},${g},${b})`
}

export type KeyModelProps = { family: FamilyId; color: string; finish: string; engrave?: string }

export function KeyModel({ family, color, finish, engrave }: KeyModelProps) {
  const uid = `${family}-${finish}`.replace(/[^a-z0-9-]/gi, '')
  const light = finish === 'matte' ? shade(color, 20) : shade(color, 70)
  const dark = shade(color, finish === 'chrome' ? -120 : -70)
  const txt = (engrave || '').toUpperCase().slice(0, 12)

  const Body = (
    <defs>
      <linearGradient id={`body-${uid}`} x1="0" y1="0" x2="0.3" y2="1">
        {finish === 'chrome' ? (
          <>
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.35" stopColor={color} />
            <stop offset="0.75" stopColor={dark} />
            <stop offset="1" stopColor="#0a0a0a" />
          </>
        ) : (
          <>
            <stop offset="0" stopColor={light} />
            <stop offset="0.5" stopColor={color} />
            <stop offset="1" stopColor={dark} />
          </>
        )}
      </linearGradient>
      <linearGradient id={`metal-${uid}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e9edf0" /><stop offset="0.5" stopColor="#aab0b4" /><stop offset="1" stopColor="#6c7276" />
      </linearGradient>
      <radialGradient id={`btn-${uid}`} cx="0.4" cy="0.3" r="0.9">
        <stop offset="0" stopColor="rgba(255,255,255,0.25)" /><stop offset="1" stopColor="rgba(0,0,0,0.35)" />
      </radialGradient>
      <filter id={`fdrop-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#000" floodOpacity="0.55" />
      </filter>
      {finish === 'carbon' && (
        <pattern id={`carbon-${uid}`} width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="7" height="7" fill={dark} /><rect width="3.5" height="7" fill={color} opacity="0.5" />
        </pattern>
      )}
    </defs>
  )
  const fill = finish === 'carbon' ? `url(#carbon-${uid})` : `url(#body-${uid})`

  const Badge = (
    <g>
      <rect x="92" y="26" width="56" height="20" rx="10" fill="rgba(0,0,0,0.45)" />
      <text x="120" y="40" textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="10" fontWeight="700" fill="#6bffbb" letterSpacing="1">GCODE</text>
    </g>
  )
  const Screen = txt ? (
    <g>
      <rect x="66" y="92" width="108" height="30" rx="6" fill="rgba(0,0,0,0.75)" />
      <text x="120" y="112" textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="13" fill="#6bffbb" letterSpacing="2">{txt}</text>
    </g>
  ) : null

  const btn = (x: number, yy: number, w: number, h: number, r = 8) => (
    <g>
      <rect x={x} y={yy} width={w} height={h} rx={r} fill="rgba(0,0,0,0.28)" />
      <rect x={x} y={yy} width={w} height={h} rx={r} fill={`url(#btn-${uid})`} opacity="0.5" />
    </g>
  )

  let shape: React.ReactNode

  switch (family) {
    case 'remotehead':
      shape = (
        <g filter={`url(#fdrop-${uid})`}>
          <rect x="70" y="18" width="100" height="150" rx="26" fill={fill} stroke="rgba(255,255,255,0.14)" />
          {Badge}
          {btn(88, 72, 64, 20)}{btn(88, 100, 64, 20)}{btn(88, 128, 64, 20)}
          <rect x="112" y="164" width="16" height="40" fill={`url(#metal-${uid})`} />
          <path d="M104 204 h32 v70 l-10 10 h-12 l-10 -10 Z" fill={`url(#metal-${uid})`} />
          <path d="M136 230 h-14 v8 h14 M136 250 h-10 v8 h10" stroke="#5c6266" strokeWidth="3" fill="none" />
        </g>
      )
      break
    case 'flip':
      shape = (
        <g filter={`url(#fdrop-${uid})`}>
          <rect x="66" y="20" width="108" height="150" rx="24" fill={fill} stroke="rgba(255,255,255,0.14)" />
          {Badge}
          {btn(86, 72, 68, 20)}{btn(86, 100, 68, 20)}{btn(86, 128, 68, 20)}
          <g transform="rotate(26 170 168)">
            <rect x="162" y="150" width="14" height="150" rx="3" fill={`url(#metal-${uid})`} />
            <path d="M176 230 h-12 v8 h12 M176 252 h-9 v8 h9 M176 274 h-12 v8 h12" stroke="#5c6266" strokeWidth="3" fill="none" />
          </g>
        </g>
      )
      break
    case 'bmw':
      shape = (
        <g filter={`url(#fdrop-${uid})`}>
          <rect x="44" y="60" width="152" height="108" rx="20" fill={fill} stroke="rgba(255,255,255,0.16)" />
          <rect x="60" y="76" width="120" height="40" rx="8" fill="rgba(0,0,0,0.8)" />
          <text x="120" y="101" textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="13" fill="#6bffbb" letterSpacing="2">{txt || 'READY'}</text>
          {btn(60, 128, 34, 26)}{btn(103, 128, 34, 26)}{btn(146, 128, 34, 26)}
          <rect x="112" y="168" width="16" height="30" fill={`url(#metal-${uid})`} />
        </g>
      )
      break
    case 'mercedes':
      shape = (
        <g filter={`url(#fdrop-${uid})`}>
          <circle cx="120" cy="54" r="26" fill="none" stroke={`url(#metal-${uid})`} strokeWidth="9" />
          <path d="M96 78 q24 -8 48 0 l16 150 q-40 22 -80 0 Z" fill={fill} stroke="rgba(255,255,255,0.14)" />
          {btn(104, 120, 32, 24, 12)}{btn(104, 152, 32, 24, 12)}{btn(104, 184, 32, 24, 12)}
        </g>
      )
      break
    case 'porsche':
      shape = (
        <g filter={`url(#fdrop-${uid})`}>
          <path d="M48 150 q6 -44 40 -58 q32 -12 64 0 q34 14 40 58 q4 30 -8 54 q-66 26 -128 0 q-12 -24 -8 -54 Z" fill={fill} stroke="rgba(255,255,255,0.14)" />
          <path d="M78 118 q42 -18 84 0 l-10 26 q-32 -10 -64 0 Z" fill="rgba(0,0,0,0.5)" />
          {btn(86, 160, 30, 22, 11)}{btn(124, 160, 30, 22, 11)}
          <text x="120" y="210" textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="11" fill="#6bffbb" letterSpacing="2">{txt}</text>
        </g>
      )
      break
    case 'supercar':
      shape = (
        <g filter={`url(#fdrop-${uid})`}>
          <path d="M120 16 l66 40 v128 l-66 40 l-66 -40 V56 Z" fill={fill} stroke="#ff2e88" strokeWidth="1.5" />
          <path d="M120 16 l66 40 v128 l-66 40 l-66 -40 V56 Z" fill="none" stroke="rgba(255,255,255,0.18)" />
          <circle cx="120" cy="120" r="30" fill="rgba(0,0,0,0.6)" stroke="#ff2e88" strokeWidth="2" />
          <text x="120" y="125" textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="10" fill="#ff5a7a" letterSpacing="1">START</text>
          <rect x="92" y="60" width="56" height="8" rx="4" fill="#ff2e88" opacity="0.8" />
          <text x="120" y="188" textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="11" fill="#6bffbb" letterSpacing="2">{txt}</text>
        </g>
      )
      break
    case 'luxury':
      shape = (
        <g filter={`url(#fdrop-${uid})`}>
          <rect x="60" y="24" width="120" height="188" rx="16" fill={`url(#metal-${uid})`} />
          <rect x="68" y="32" width="104" height="172" rx="12" fill={fill} stroke="rgba(255,255,255,0.14)" />
          {Badge}
          {Screen}
          {btn(84, 134, 72, 20)}{btn(84, 162, 72, 20)}
        </g>
      )
      break
    case 'smart':
    default:
      shape = (
        <g filter={`url(#fdrop-${uid})`}>
          <rect x="64" y="18" width="112" height="208" rx="30" fill={fill} stroke="rgba(255,255,255,0.14)" />
          {Badge}
          {Screen}
          {btn(84, 134, 72, 22)}{btn(84, 164, 72, 22)}{btn(84, 194, 34, 20)}{btn(122, 194, 34, 20)}
        </g>
      )
  }

  return (
    <svg viewBox="0 0 240 320" width="100%" height="100%" role="img" aria-label={`${family} key`} style={{ maxWidth: 260 }}>
      {Body}
      {shape}
    </svg>
  )
}
