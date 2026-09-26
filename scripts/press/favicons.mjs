// Favicons and app icons from the seal, rendered with the embedded display
// face so the ligature is the real one at every size.
import { writeFileSync } from 'node:fs'
import { BASE_CSS, C, mark } from './brand.mjs'
import { png, close } from './lib.mjs'

const page = (size, { bg = null, pad = 0.08 } = {}) => {
  const inner = Math.round(size * (1 - pad * 2))
  return `<!doctype html><html><head><style>${BASE_CSS}
  html,body{width:${size}px;height:${size}px;background:transparent;overflow:hidden}
  .tile{width:${size}px;height:${size}px;display:grid;place-items:center;${bg ? `background:${bg};border-radius:${Math.round(size * 0.22)}px;` : ''}color:${C.ink}}
  </style></head><body><div class="tile">${mark(inner, C.ink)}</div></body></html>`
}
await png(page(512, { pad: 0.02 }), { width: 512, height: 512, out: 'public/brand/monogram-512.png', transparent: true })
await png(page(512, { bg: C.cream }), { width: 512, height: 512, out: 'public/images/icon-512.png' })
await png(page(192, { bg: C.cream }), { width: 192, height: 192, out: 'public/images/icon-192.png' })
await png(page(512, { bg: C.cream, pad: 0.16 }), { width: 512, height: 512, out: 'public/images/icon-maskable-512.png' })
await png(page(192, { bg: C.cream, pad: 0.16 }), { width: 192, height: 192, out: 'public/images/icon-maskable-192.png' })
await png(page(180, { bg: C.cream }), { width: 180, height: 180, out: 'public/images/apple-touch-icon.png' })
await png(page(64, { bg: C.cream, pad: 0.04 }), { width: 64, height: 64, out: 'public/brand/favicon-64.png' })
await close()
console.log('icons rendered')
