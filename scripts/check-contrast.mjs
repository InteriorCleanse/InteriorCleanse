#!/usr/bin/env node
/**
 * Measures text-over-image legibility on every surface where copy sits on a
 * photograph, and fails loudly when a scrim is not doing its job.
 *
 * Run it against the production build after any poster lands:
 *
 *   npm run build && npm run start &
 *   node scripts/check-contrast.mjs
 *   node scripts/check-contrast.mjs --url http://localhost:3000 --json
 *
 * Why measure instead of eyeball: the scrims are tuned for photographs nobody
 * has seen yet. A poster with a bright sky exactly where the headline sits will
 * pass a glance and fail a reader. This samples the actual rendered pixels
 * behind the text — with the interface hidden, so it reads the backdrop rather
 * than the type — and reports WCAG contrast against bone.
 *
 * Thresholds: 3:1 is the AA floor for large text, which the headlines are.
 * 4.5:1 is the normal-text floor and the bar the body copy has to clear.
 */

// Imported lazily so a missing dependency explains itself instead of throwing a
// module-resolution stack at someone who just wanted to check a poster.
let chromium, PNG
try {
  ;({ chromium } = await import('playwright'))
  ;({ PNG } = await import('pngjs'))
} catch {
  console.error(
    '\n  This check needs playwright and pngjs:\n' +
      '    npm install\n' +
      '    npx playwright install chromium\n'
  )
  process.exit(2)
}

const BONE = [247, 244, 239]
const AA_LARGE = 3.0
const AA_NORMAL = 4.5
/** Share of samples allowed below AA_NORMAL before a surface is called thin. */
const THIN_BUDGET = 0.12

/** Surfaces to check: page, the text element, and what to hide to see behind it. */
const SURFACES = [
  {
    name: 'homepage hero headline',
    path: '/',
    text: '.residence-headline',
    hide: ['.residence-copy', '.featured-slot', '.hotspot-layer', '.site-header'],
  },
  {
    name: 'homepage hero CTAs',
    path: '/',
    text: '.residence-ctas',
    hide: ['.residence-copy', '.featured-slot', '.hotspot-layer', '.site-header'],
  },
  {
    name: 'guest book copy',
    path: '/',
    text: '.guestbook-panel',
    hide: ['.guestbook-panel'],
  },
  {
    name: 'library band headline',
    path: '/library/',
    text: '.residence-headline',
    hide: ['.residence-copy', '.hotspot-layer', '.site-header'],
  },
  {
    name: 'shop band headline',
    path: '/shop/',
    text: '.residence-headline',
    hide: ['.residence-copy', '.hotspot-layer', '.site-header'],
  },
  {
    name: 'partners band headline',
    path: '/partners/',
    text: '.residence-headline',
    hide: ['.residence-copy', '.hotspot-layer', '.site-header'],
  },
  {
    name: 'showroom panel',
    path: '/collection/',
    text: '.showroom-panel',
    hide: ['.showroom-ui'],
  },
]

const channel = (v) => {
  v /= 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

async function measure(page, surface, base) {
  await page.goto(base + surface.path, { waitUntil: 'load' })
  await page.waitForTimeout(2200)

  const el = page.locator(surface.text).first()
  if ((await el.count()) === 0) return { ...surface, skipped: 'element not present' }

  // A clip only captures the viewport, and several of these surfaces sit far
  // below the fold — scroll to it, let smooth scrolling settle, then re-measure.
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)

  const raw = await el.boundingBox()
  if (!raw || raw.width < 4 || raw.height < 4) return { ...surface, skipped: 'element has no box' }

  // Clamp to the viewport so the clip is always inside the captured image.
  const vp = page.viewportSize()
  const box = {
    x: Math.max(0, Math.min(raw.x, vp.width - 4)),
    y: Math.max(0, Math.min(raw.y, vp.height - 4)),
    width: Math.min(raw.width, vp.width - Math.max(0, raw.x)),
    height: Math.min(raw.height, vp.height - Math.max(0, raw.y)),
  }
  if (box.width < 4 || box.height < 4) return { ...surface, skipped: 'element off-screen' }

  // Hide the interface so the sample reads the backdrop, not the type itself.
  await page.evaluate((sels) => {
    for (const s of sels) {
      document.querySelectorAll(s).forEach((e) => (e.style.visibility = 'hidden'))
    }
  }, surface.hide)
  await page.waitForTimeout(400)

  // Whether a real photograph is actually behind this surface. Without one the
  // measurement is against the painted gradient, which always passes and proves
  // nothing about the poster that will replace it.
  const backdrop = await page.evaluate(() => {
    const imgs = Array.from(
      document.querySelectorAll('.scene-poster, .guestbook-bg, .showroom-bg img')
    )
    return imgs.some((i) => i.complete && i.naturalWidth > 0 && i.style.display !== 'none')
  })

  const png = PNG.sync.read(await page.screenshot({ clip: box }))

  await page.evaluate((sels) => {
    for (const s of sels) {
      document.querySelectorAll(s).forEach((e) => (e.style.visibility = ''))
    }
  }, surface.hide)

  let worst = Infinity
  let sum = 0
  let n = 0
  let thin = 0
  for (let y = 1; y < png.height - 1; y += 2) {
    for (let x = 1; x < png.width - 1; x += 2) {
      const i = (png.width * y + x) << 2
      const c = contrast(BONE, [png.data[i], png.data[i + 1], png.data[i + 2]])
      sum += c
      n++
      if (c < AA_NORMAL) thin++
      if (c < worst) worst = c
    }
  }

  return {
    ...surface,
    mean: sum / n,
    worst,
    thinShare: thin / n,
    backdrop,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const base =
    (args.includes('--url') ? args[args.indexOf('--url') + 1] : null) || 'http://localhost:3000'
  const asJson = args.includes('--json')

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  // Keep the modal and popup out of the way of every measurement.
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('ic_popup', '1')
      localStorage.setItem('ic_subscribed', '1')
    } catch {
      /* storage blocked; the surfaces are still measurable */
    }
  })

  const results = []
  for (const surface of SURFACES) {
    // One awkward surface must not abort the whole report.
    try {
      results.push(await measure(page, surface, base))
    } catch (e) {
      results.push({ ...surface, skipped: (e?.message || String(e)).split('\n')[0] })
    }
  }
  await browser.close()

  if (asJson) {
    console.log(JSON.stringify(results, null, 2))
  } else {
    console.log('\nText-over-image contrast (against bone #F7F4EF)\n')
    for (const r of results) {
      if (r.skipped) {
        console.log(`  ${r.name.padEnd(26)} — skipped (${r.skipped})`)
        continue
      }
      const verdict = !r.backdrop
        ? 'NO POSTER'
        : r.worst < AA_LARGE
          ? 'FAIL'
          : r.thinShare > THIN_BUDGET
            ? 'THIN'
            : 'PASS'
      console.log(
        `  ${r.name.padEnd(26)} mean ${r.mean.toFixed(2).padStart(6)}:1   ` +
          `worst ${r.worst.toFixed(2).padStart(5)}:1   ` +
          `under 4.5 ${(r.thinShare * 100).toFixed(1).padStart(5)}%   ${verdict}`
      )
    }
    const unposted = results.filter((r) => !r.skipped && !r.backdrop).length
    console.log(
      '\n  PASS = worst point clears 3:1 (AA large text) and under 12% of the area is thin.' +
        '\n  A surface reporting FAIL or THIN needs a heavier scrim there, not a' +
        '\n  different photograph.'
    )
    if (unposted) {
      console.log(
        `\n  ${unposted} surface(s) have NO POSTER: measured against the painted gradient,` +
          '\n  which always passes. Those numbers say nothing about the photograph that' +
          '\n  will replace it — re-run this once the posters are in.\n'
      )
    } else {
      console.log('')
    }
  }

  const failed = results.filter((r) => !r.skipped && r.worst < AA_LARGE)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e?.stack || String(e))
  process.exit(2)
})
