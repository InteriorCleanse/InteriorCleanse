#!/usr/bin/env node
/**
 * Print-ready files for the Printful products, rendered from the brand
 * vector so nothing is upscaled. No server needed: the press bundles the
 * self-hosted faces.
 *
 * Output (print-files/):
 *   mark-ink-3000.png                 threshold mark in ink on transparent, 3000 px square
 *   mark-bone-3000.png                the same in bone, for dark garments
 *   wordmark-ink-4500.png             INTERIOR CLEANSE in Fraunces, ink, 4500 px wide
 *   tote-front-3600x4200.png          12×14 in at 300 dpi, mark over wordmark, ink
 *   hoodie-chest-1500.png             5×5 in at 300 dpi, tonal mark for charcoal fleece
 *   mug-wrap-2700x1050.png            Printful 11 oz template, wordmark left, mark right
 *   considered-home-print-18x24.png   the art print, 5400×7200 — a study in warm neutrals
 *
 *   npm run print:files
 */
import { mkdirSync } from 'node:fs'
import { BASE_CSS, C, mark } from './press/brand.mjs'
import { png, close } from './press/lib.mjs'

const OUT = 'print-files'
mkdirSync(OUT, { recursive: true })
const INK = C.ink
const BONE = '#F7F4EF'

const doc = (w, h, body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
html,body{width:${w}px;height:${h}px;background:transparent;overflow:hidden}
.wm{font-family:"Fraunces",Georgia,serif;font-weight:500;letter-spacing:.3em;white-space:nowrap;line-height:1;font-variation-settings:"opsz" 14,"SOFT" 30}
.stack{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0}
${extra}</style></head><body>${body}</body></html>`
const wordmark = (color, px) => `<div class="wm" style="color:${color};font-size:${px}px">INTERIOR&nbsp;CLEANSE</div>`

async function out(name, w, h, body, opts = {}) {
  await png(doc(w, h, body, opts.css), { width: w, height: h, scale: opts.scale ?? 1, out: `${OUT}/${name}`, transparent: !opts.opaque })
  console.log('wrote', name, `${w * (opts.scale ?? 1)}×${h * (opts.scale ?? 1)}`)
}

await out('mark-ink-3000.png', 1000, 1000, `<div class="stack">${mark(900, INK)}</div>`, { scale: 3 })
await out('mark-bone-3000.png', 1000, 1000, `<div class="stack">${mark(900, BONE)}</div>`, { scale: 3 })
await out('wordmark-ink-4500.png', 1500, 260, `<div class="stack">${wordmark(INK, 150)}</div>`, { scale: 3 })
// Tote: 12×14 in at 300 dpi. Mark large, wordmark beneath, both ink.
await out('tote-front-3600x4200.png', 1200, 1400, `<div class="stack" style="gap:70px">${mark(720, INK)}${wordmark(INK, 74)}</div>`, { scale: 3 })
// Hoodie left chest: 5×5 in, a tonal mark one step lighter than charcoal.
await out('hoodie-chest-1500.png', 500, 500, `<div class="stack">${mark(440, '#3A3633')}</div>`, { scale: 3 })
// Mug wrap: Printful's 11 oz template. Wordmark on the left panel, mark on the right.
await out('mug-wrap-2700x1050.png', 2700, 1050, `
  <div style="position:absolute;left:0;top:0;width:1350px;height:1050px;display:grid;place-items:center">${wordmark(INK, 96)}</div>
  <div style="position:absolute;right:0;top:0;width:1350px;height:1050px;display:grid;place-items:center">${mark(560, INK)}</div>`)
// The Considered Home Print, 18×24 in at 300 dpi: a study in warm neutrals.
// Three thresholds receding, one horizon, one sun; nothing else in the room.
const art = `
<div style="position:absolute;inset:0;background:${C.cream}"></div>
<div style="position:absolute;inset:90px;border:1px solid rgba(27,24,21,.12)"></div>
<svg viewBox="0 0 1800 2400" width="1800" height="2400" style="position:absolute;inset:0" fill="none" stroke-linecap="round">
  <defs><linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.goldHi}"/><stop offset="1" stop-color="${C.gold}"/></linearGradient></defs>
  <!-- far threshold, stone -->
  <path d="M330 1560 V860 A570 570 0 0 1 1470 860 V1560" stroke="#CFC5B5" stroke-width="22"/>
  <!-- middle threshold, oatmeal -->
  <path d="M470 1560 V960 A430 430 0 0 1 1330 960 V1560" stroke="#B8A68C" stroke-width="22"/>
  <!-- near threshold, ink -->
  <path d="M610 1560 V1060 A290 290 0 0 1 1190 1060 V1560" stroke="${C.ink}" stroke-width="22"/>
  <!-- the floor -->
  <path d="M250 1560 H1550" stroke="${C.ink}" stroke-width="10" opacity=".5"/>
  <!-- horizon and sun, seen through the near door -->
  <path d="M720 1330 H1080" stroke="${C.ink}" stroke-width="14"/>
  <path d="M800 1330 A100 100 0 0 1 1000 1330 Z" fill="url(#sun)"/>
  <g stroke="${C.ink}" stroke-width="10" opacity=".7"><path d="M900 1120 V1170"/><path d="M780 1160 L815 1195"/><path d="M1020 1160 L985 1195"/></g>
</svg>
<div style="position:absolute;left:0;right:0;bottom:150px;text-align:center;font-family:'Jakarta';font-size:16px;letter-spacing:.42em;text-transform:uppercase;color:rgba(27,24,21,.55);font-weight:600">The Considered Home · InteriorCleanse</div>`
await out('considered-home-print-18x24.png', 1800, 2400, art, { scale: 3, opaque: true })
await close()
