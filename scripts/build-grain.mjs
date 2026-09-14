#!/usr/bin/env node
/**
 * Renders the film-grain tile the realism layer uses.
 *
 * The grain used to be a live SVG feTurbulence filter whose seed advanced
 * every 80ms. That re-rasterises a noise field on the CPU twelve times a
 * second for every hero on the page, which is exactly the kind of work that
 * turns scrolling into a slideshow. A pre-rendered tile costs nothing per
 * frame: the browser composites it, and "living" grain is a compositor-only
 * translate of the tile in steps.
 *
 * Output: public/images/grain.png — one 256×256 monochrome noise tile
 * (~65 KB; noise does not compress, so bigger is only heavier). "Living"
 * grain comes from translating the tiled layer to eight uncorrelated offsets
 * in steps: the same tile at a different position over different pixels
 * reads as a fresh field, and the browser only moves a composited layer.
 *
 *   node scripts/build-grain.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 256
const FRAMES = 1
const out = join(ROOT, 'public', 'images', 'grain.png')

// Deterministic PRNG so the tile is reproducible across builds.
let seed = 0x9e3779b9
const rand = () => {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return ((seed >>> 0) % 100000) / 100000
}

const png = new PNG({ width: SIZE, height: SIZE * FRAMES })
for (let f = 0; f < FRAMES; f++) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = ((f * SIZE + y) * SIZE + x) << 2
      // Gaussian-ish grain: sum of three uniforms, centred on mid-grey so an
      // overlay/soft-light blend neither darkens nor lightens on average.
      const g = (rand() + rand() + rand()) / 3
      const v = Math.round(128 + (g - 0.5) * 2 * 96)
      png.data[i] = v
      png.data[i + 1] = v
      png.data[i + 2] = v
      png.data[i + 3] = 255
    }
  }
}
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, PNG.sync.write(png, { colorType: 0 }))
console.log(`wrote ${out} (${SIZE}×${SIZE})`)
