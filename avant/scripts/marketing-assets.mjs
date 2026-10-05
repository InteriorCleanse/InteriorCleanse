/**
 * Draws AVANT's marketing graphics from the brand itself: the drawn crest
 * and wordmark, Urbanist, obsidian and porcelain, gold only as a hairline,
 * and the product's own screens. No stock, rendered or AI imagery, ever.
 *
 *   SITE=https://your.domain npm run marketing:assets
 *
 * SITE is the public domain printed on the graphics and encoded in the
 * flyer's QR code (with campaign tags, so leads show where they came from).
 * APP is a running copy of the app to photograph the earnings estimator
 * from (default http://localhost:3000); skipped if it isn't running.
 *
 * Writes:
 *   app/opengraph-image.png, app/host/opengraph-image.png   link previews
 *   marketing/social/*.png                                  posts, stories, ads
 *   marketing/flyer.pdf, marketing/flyer.png                print, with QR
 *
 * Needs Playwright with Chromium (the repository root has it).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import QRCode from 'qrcode'

const SITE = (process.env.SITE ?? 'https://avant.example').replace(/\/$/, '')
const APP = (process.env.APP ?? 'http://localhost:3000').replace(/\/$/, '')
const domain = new URL(SITE).host
const share = readFileSync('lib/catalog.ts', 'utf8').match(/HOST_SHARE_PCT = (\d+)/)?.[1] ?? '80'
const font = (w) => readFileSync(`node_modules/@fontsource/urbanist/files/urbanist-latin-${w}-normal.woff2`).toString('base64')
const FONTS = [300, 400, 500, 600].map((w) => `@font-face{font-family:U;font-weight:${w};src:url(data:font/woff2;base64,${font(w)}) format('woff2')}`).join('')

const METALS = `
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f3e2b8"/><stop offset=".32" stop-color="#d2aa66"/><stop offset=".7" stop-color="#9c7038"/><stop offset="1" stop-color="#d9bb80"/></linearGradient>
<linearGradient id="goldv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e2b8"/><stop offset=".4" stop-color="#d2aa66"/><stop offset=".75" stop-color="#9c7038"/><stop offset="1" stop-color="#d9bb80"/></linearGradient>
<linearGradient id="plat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e9e6df"/><stop offset="1" stop-color="#bdb7ab"/></linearGradient>
<linearGradient id="lac" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25272c"/><stop offset=".5" stop-color="#141519"/><stop offset="1" stop-color="#0a0b0d"/></linearGradient>`

const crest = (h) => `<svg width="${(h * 88) / 120}" height="${h}" viewBox="0 0 88 120"><defs>${METALS}</defs>
<path d="M5 8 L44 16 L83 8 C84.5 30 84 50 80.5 66 C76 87 62 103 44 116 C26 103 12 87 7.5 66 C4 50 3.5 30 5 8 Z" fill="url(#lac)" stroke="url(#goldv)" stroke-width="2" stroke-linejoin="round"/>
<path d="M10.5 14.6 L44 21.6 L77.5 14.6 C78.6 33 78.1 50.5 75 64.6 C71 82.8 59.4 96.6 44 108.4 C28.6 96.6 17 82.8 13 64.6 C9.9 50.5 9.4 33 10.5 14.6 Z" fill="none" stroke="url(#goldv)" stroke-width="0.7" opacity="0.7"/>
<path d="M26 86 L44 42 L62 86 H58 L44 52.6 L30 86 Z" fill="url(#plat)"/>
<path d="M13 72.6 L44 71.6 L75 72.6 L44 73.6 Z" fill="url(#gold)"/></svg>`

// The wordmark, drawn: open chevron A's, V, N, T on a 100-unit cap height.
const A = (x) => `M${x} 100 L${x + 55} 0 L${x + 110} 100 H${x + 99} L${x + 55} 20 L${x + 11} 100 Z`
const V = (x) => `M${x} 0 H${x + 11} L${x + 55} 80 L${x + 99} 0 H${x + 110} L${x + 55} 100 Z`
const N = (x) => `M${x} 0 H${x + 9} V100 H${x} Z M${x + 83} 0 H${x + 92} V100 H${x + 83} Z M${x} 0 H${x + 12} L${x + 92} 100 H${x + 80} Z`
const T = (x) => `M${x + 4.95} 0 H${x + 100} L${x + 95.05} 9 H${x} Z M${x + 45.5} 0 H${x + 54.5} V100 H${x + 45.5} Z`
let x = 0
const d = []
for (const [f, w, g] of [[A, 110, 20], [V, 110, 20], [A, 110, 44], [N, 92, 40], [T, 100, 0]]) {
  d.push(f(x))
  x += w + g
}
const W = x
const wordmark = (width, tone) =>
  `<svg width="${width}" height="${(width * 132) / W}" viewBox="0 0 ${W} 132"><defs>${METALS}</defs><path d="${d.join(' ')}" fill="${tone === 'light' ? 'url(#plat)' : '#121316'}"/><path d="M0 122 L${W} 126.4 L${W} 126.9 L0 128 Z" fill="url(#gold)"/></svg>`

const lockup = (h, tone) =>
  `<div style="display:flex;align-items:center;gap:${h * 0.45}px">${crest(h)}<span style="width:1px;height:${h * 0.72}px;background:${tone === 'light' ? 'rgba(244,242,237,.25)' : 'rgba(18,19,22,.18)'}"></span>${wordmark(h * 2.6, tone)}</div>`

const page = (w, h, tone, body) => `<!doctype html><html><head><style>${FONTS}
*{box-sizing:border-box}html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:U,sans-serif;-webkit-font-smoothing:antialiased}
body{background:${tone === 'light' ? '#f5f4f2' : 'radial-gradient(120% 70% at 50% 0%,#2a2c32 0%,#121316 62%)'};color:${tone === 'light' ? '#121316' : '#f4f2ed'}}
h1{font-weight:300;letter-spacing:-.028em;line-height:1.02;margin:0}
p{margin:0}.muted{color:${tone === 'light' ? '#6d6a64' : '#a39f97'}}
.rule{height:3px;background:linear-gradient(90deg,#f3e2b8,#d2aa66 32%,#9c7038 70%,#d9bb80)}
.pill{display:inline-block;border-radius:999px;font-weight:600}
</style></head><body>${body}</body></html>`

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const shoot = async (file, w, h, html) => {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await p.setContent(html)
  await p.waitForTimeout(150)
  await p.screenshot({ path: file })
  await p.close()
  console.log('wrote', file)
}

mkdirSync('marketing/social', { recursive: true })
mkdirSync('app/host', { recursive: true })

// Link previews.
await shoot('app/opengraph-image.png', 1200, 630, page(1200, 630, 'dark', `
  <div style="position:absolute;inset:72px 80px;display:flex;flex-direction:column;justify-content:space-between">
    ${lockup(64, 'light')}
    <div><h1 style="font-size:86px">Cars worth remembering.</h1><p class="muted" style="font-size:34px;margin-top:22px">From people who care for them. The whole price, up front.</p></div>
    <div class="rule" style="width:120px"></div>
  </div>`))
writeFileSync('app/opengraph-image.alt.txt', 'AVANT: cars worth remembering, from people who care for them.')
await shoot('app/host/opengraph-image.png', 1200, 630, page(1200, 630, 'light', `
  <div style="position:absolute;inset:72px 80px;display:flex;flex-direction:column;justify-content:space-between">
    ${lockup(64, 'dark')}
    <div><h1 style="font-size:86px">Your car could pay for itself.</h1><p class="muted" style="font-size:34px;margin-top:22px">Keep ${share}% of every trip. Verified guests. Paid after every trip.</p></div>
    <div class="rule" style="width:120px"></div>
  </div>`))
writeFileSync('app/host/opengraph-image.alt.txt', `Host on AVANT: your car could pay for itself. Keep ${share}% of every trip.`)

// Social: portrait posts (1080 × 1350), stories (1080 × 1920), a link ad (1200 × 628).
const cta = (tone, size = 34) =>
  `<span class="pill" style="font-size:${size}px;padding:${size * 0.6}px ${size * 1.2}px;background:${tone === 'light' ? '#121316' : '#f4f2ed'};color:${tone === 'light' ? '#fff' : '#121316'}">List your car · ${domain}/host</span>`

const post = (tone, head, sub, extra = '') => page(1080, 1350, tone, `
  <div style="position:absolute;inset:96px 92px;display:flex;flex-direction:column;justify-content:space-between">
    ${lockup(70, tone === 'dark' ? 'light' : 'dark')}
    <div><div class="rule" style="width:110px;margin-bottom:48px"></div><h1 style="font-size:112px">${head}</h1><p class="muted" style="font-size:42px;line-height:1.3;margin-top:36px">${sub}</p>${extra}</div>
    <div>${cta(tone)}</div>
  </div>`)

await shoot('marketing/social/post-1-pays-for-itself.png', 1080, 1350, post('dark', 'Your car could pay for itself.', `Share it on the days you don’t drive it. Keep ${share}% of every trip, paid after each one.`))
await shoot('marketing/social/post-2-your-rules.png', 1080, 1350, post('light', 'Your car. Your rules.', 'Your price. Your days. Your miles. You approve every guest, and every guest is licence-verified.'))
await shoot('marketing/social/post-3-founding-hosts.png', 1080, 1350, post('dark', 'Founding hosts wanted in Denver.', 'AVANT opens city by city. Be one of the first cars guests can book.'))

// The product itself: the earnings estimator, photographed from the running app.
let estimator = null
try {
  const p = await b.newPage({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 })
  await p.goto(`${APP}/host`, { waitUntil: 'networkidle', timeout: 15000 })
  await p.addStyleTag({ content: '.demo-ribbon,.ai-fab{display:none!important}' })
  // A worked example (your rate × days), never a market median: ads must not quote sample data.
  const panel = p.locator('section[aria-labelledby=est] .panel').first()
  await panel.locator('select').nth(1).selectOption('denver').catch(() => undefined)
  await panel.locator('input[inputmode=numeric]').fill('85')
  await p.waitForTimeout(200)
  estimator = (await p.locator('section[aria-labelledby=est] .panel').first().screenshot()).toString('base64')
  await p.close()
} catch {
  console.log(`skipped the estimator post: start the app at ${APP} to include it`)
}
if (estimator) {
  await shoot('marketing/social/post-4-estimate.png', 1080, 1350, page(1080, 1350, 'light', `
    <div style="position:absolute;inset:96px 92px;display:flex;flex-direction:column;justify-content:space-between">
      ${lockup(70, 'dark')}
      <div style="display:grid;gap:56px"><h1 style="font-size:100px">See what your car could earn.</h1>
      <img src="data:image/png;base64,${estimator}" style="width:100%;border-radius:36px;box-shadow:0 40px 90px -30px rgba(18,19,22,.35)">
      <p class="muted" style="font-size:26px">An example: $85 a day, 14 days a month, you keep ${share}%. Try your own numbers.</p></div>
      <div>${cta('light')}</div>
    </div>`))
}

const story = (tone, head, sub) => page(1080, 1920, tone, `
  <div style="position:absolute;inset:180px 96px 220px;display:flex;flex-direction:column;justify-content:space-between">
    ${lockup(84, tone === 'dark' ? 'light' : 'dark')}
    <div><div class="rule" style="width:120px;margin-bottom:56px"></div><h1 style="font-size:132px">${head}</h1><p class="muted" style="font-size:50px;line-height:1.3;margin-top:44px">${sub}</p></div>
    <div>${cta(tone, 40)}</div>
  </div>`)
await shoot('marketing/social/story-1-pays-for-itself.png', 1080, 1920, story('dark', 'Your car could pay for itself.', `Keep ${share}% of every trip. Verified guests only.`))
await shoot('marketing/social/story-2-founding-hosts.png', 1080, 1920, story('light', 'Founding hosts wanted in Denver.', 'List in about ten minutes, with your own photos.'))

await shoot('marketing/social/ad-1200x628-host.png', 1200, 628, page(1200, 628, 'dark', `
  <div style="position:absolute;inset:64px 72px;display:flex;flex-direction:column;justify-content:space-between">
    ${lockup(56, 'light')}
    <div><h1 style="font-size:78px">Your car could pay for itself.</h1><p class="muted" style="font-size:30px;margin-top:18px">Keep ${share}% of every trip. Verified guests. ${domain}/host</p></div>
  </div>`))

// The flyer: US Letter, with a QR code carrying campaign tags.
const flyerUrl = `${SITE}/host?utm_source=flyer&utm_medium=print&utm_campaign=founding-hosts`
const qr = await QRCode.toString(flyerUrl, { type: 'svg', margin: 0, color: { dark: '#121316', light: '#0000' }, errorCorrectionLevel: 'M' })
const flyer = page(816, 1056, 'light', `
  <div style="position:absolute;inset:64px 64px 56px;display:flex;flex-direction:column">
    ${lockup(46, 'dark')}
    <div class="rule" style="width:90px;margin:64px 0 34px"></div>
    <h1 style="font-size:70px">Your car could pay for itself.</h1>
    <p class="muted" style="font-size:22px;line-height:1.45;margin-top:22px;max-width:560px">Share it with verified guests on the days you don’t drive it. You set the price, the days and the rules.</p>
    <ul style="list-style:none;padding:0;margin:40px 0 0;display:grid;gap:18px;font-size:21px">
      <li>— Keep ${share}% of every trip, paid after each one</li>
      <li>— Every guest verifies their licence with a live selfie</li>
      <li>— Photos and a mileage record at every pickup and return</li>
      <li>— A person on the host team, not a call centre</li>
    </ul>
    <div style="margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:32px">
      <div><p style="font-size:26px;font-weight:500">Scan to list your car</p><p class="muted" style="font-size:19px;margin-top:8px">or visit ${domain}/host</p><p class="muted" style="font-size:13px;margin-top:26px">Founding hosts wanted in Denver. Cars under 12 years and 130,000 miles, with no open recalls.</p></div>
      <div style="width:190px;height:190px;padding:14px;border:1px solid rgba(18,19,22,.14);border-radius:18px;background:#fff">${qr.replace('<svg', '<svg width="160" height="160"')}</div>
    </div>
  </div>`)
{
  const p = await b.newPage({ viewport: { width: 816, height: 1056 } })
  await p.setContent(flyer)
  await p.waitForTimeout(150)
  await p.screenshot({ path: 'marketing/flyer.png' })
  await p.pdf({ path: 'marketing/flyer.pdf', width: '8.5in', height: '11in', printBackground: true, pageRanges: '1' })
  await p.close()
  console.log('wrote marketing/flyer.pdf, marketing/flyer.png →', flyerUrl)
}

await b.close()
