#!/usr/bin/env node
/**
 * Print-ready files for the Printful products, rendered from the brand
 * vector so nothing is upscaled.
 *
 * Output (print-files/):
 *   mark-ink-3000.png                 flowing-C in ink on transparent, 3000 px square
 *   mark-bone-3000.png                the same in bone, for dark garments
 *   wordmark-ink-4500.png             INTERIOR CLEANSE in Fraunces, ink, 4500 px wide
 *   tote-front-3600x4200.png          12×14 in at 300 dpi, mark over wordmark, ink
 *   hoodie-chest-1500.png             5×5 in at 300 dpi, tonal mark for charcoal fleece
 *   mug-wrap-2700x1050.png            Printful 11 oz template, wordmark left, mark right
 *   considered-home-print-18x24.png   PROPOSAL for the art print, 5400×7200, needs approval
 *
 * Requires the production server on :3000 for the self-hosted Fraunces face.
 *   npm run build && npx next start &   then   node scripts/build-print-files.mjs
 */
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const OUT = 'print-files'
mkdirSync(OUT, { recursive: true })

const INK = '#1C1A17'
const BONE = '#F7F4EF'
const svgSrc = readFileSync('public/brand/flowing-c-light.svg', 'utf8') // ink fill
const inner = svgSrc.replace(/^[\s\S]*?<g[^>]*>/, '').replace(/<\/g>[\s\S]*$/, '')
const mark = (fill, size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><g fill="${fill}">${inner}</g></svg>`

// The built CSS that declares the Fraunces @font-face, served by next start.
const cssFile = readdirSync('.next/static/css').find((f) =>
  readFileSync(`.next/static/css/${f}`, 'utf8').includes('__Fraunces'),
)
const cssText = readFileSync(`.next/static/css/${cssFile}`, 'utf8')
const fraunces = cssText.match(/font-family:(__Fraunces_[a-z0-9]+)/)[1]
const fontCss = `<link rel="stylesheet" href="http://localhost:3000/_next/static/css/${cssFile}">`

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' })

async function render(name, { width, height, scale = 1, html, transparent = true }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8">${fontCss}<style>
      html,body{margin:0;width:${width}px;height:${height}px;background:${transparent ? 'transparent' : BONE};overflow:hidden}
      .f{font-family:${fraunces},Georgia,serif}
      .wm{font-weight:500;letter-spacing:.18em;white-space:nowrap;line-height:1}
      .stack{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
    </style></head><body>${html}</body></html>`,
    { waitUntil: 'networkidle' },
  )
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/${name}`, omitBackground: transparent, fullPage: false })
  await page.close()
  console.log('wrote', `${OUT}/${name}`, `${width * scale}×${height * scale}`)
}

const wordmark = (color, px) =>
  `<div class="f wm" style="color:${color};font-size:${px}px">INTERIOR&nbsp;CLEANSE</div>`

// Marks alone.
await render('mark-ink-3000.png', { width: 1000, height: 1000, scale: 3, html: `<div class="stack">${mark(INK, 900)}</div>` })
await render('mark-bone-3000.png', { width: 1000, height: 1000, scale: 3, html: `<div class="stack">${mark(BONE, 900)}</div>` })
await render('wordmark-ink-4500.png', { width: 1500, height: 260, scale: 3, html: `<div class="stack">${wordmark(INK, 150)}</div>` })

// Tote front: 12×14 in print area at 300 dpi. Mark above the wordmark, ink on natural canvas.
await render('tote-front-3600x4200.png', {
  width: 1200, height: 1400, scale: 3,
  html: `<div class="stack" style="gap:70px">${mark(INK, 560)}${wordmark(INK, 58)}</div>`,
})

// Hoodie chest: 5×5 in. Tonal on charcoal — a lighter charcoal, not white.
await render('hoodie-chest-1500.png', {
  width: 500, height: 500, scale: 3,
  html: `<div class="stack">${mark('#4A443C', 380)}</div>`,
})

// Mug wrap, Printful 11 oz template 2700×1050 (9×3.5 in at 300 dpi).
// Left third and right third print either side of the handle.
await render('mug-wrap-2700x1050.png', {
  width: 900, height: 350, scale: 3,
  html: `<div style="position:absolute;left:70px;top:0;bottom:0;display:flex;align-items:center">${wordmark(INK, 34)}</div>
         <div style="position:absolute;right:120px;top:0;bottom:0;display:flex;align-items:center">${mark(INK, 220)}</div>`,
})

// The art print. A proposal, not a decision: warm-neutral plan of rooms on bone.
const rooms = [
  ['#D9CDBB', 0.08, 0.10, 0.36, 0.30],
  ['#C7BDA9', 0.48, 0.10, 0.44, 0.22],
  ['#B8A88E', 0.48, 0.36, 0.20, 0.30],
  ['#E6DDCF', 0.08, 0.44, 0.36, 0.22],
  ['#A99A85', 0.72, 0.36, 0.20, 0.14],
  ['#D2C6B2', 0.08, 0.70, 0.62, 0.12],
  ['#8C8479', 0.72, 0.54, 0.20, 0.28],
]
const W = 1800, H = 2400, PAD = 160
const plan = rooms
  .map(([c, x, y, w, h]) => `<div style="position:absolute;left:${PAD + x * (W - 2 * PAD)}px;top:${PAD + y * (H - 2 * PAD - 320)}px;width:${w * (W - 2 * PAD)}px;height:${h * (H - 2 * PAD - 320)}px;background:${c};mix-blend-mode:multiply"></div>`)
  .join('')
await render('considered-home-print-18x24.png', {
  width: W, height: H, scale: 3, transparent: false,
  html: `<div style="position:absolute;inset:0;background:${BONE}"></div>
         <div style="position:absolute;inset:${PAD}px ${PAD}px ${PAD + 320}px ${PAD}px;border:2px solid ${INK};opacity:.9"></div>
         ${plan}
         <div style="position:absolute;left:${PAD}px;right:${PAD}px;bottom:${PAD}px;display:flex;justify-content:space-between;align-items:flex-end;color:${INK}">
           <div class="f" style="font-size:44px;letter-spacing:.02em"><em>The Considered Home</em></div>
           <div class="f wm" style="font-size:18px;letter-spacing:.32em">MIND · HOME · BODY · SPIRIT</div>
         </div>`,
})

await browser.close()
