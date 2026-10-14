#!/usr/bin/env node
/**
 * Copy every Higgsfield asset the storefront shows into public/media/hf/ and
 * point the site at the local copy, so nothing on interiorcleanse.com depends
 * on the generation CDN staying reachable or keeping its URLs.
 *
 *   node scripts/land-media.mjs
 *
 * Runs in the "Land Higgsfield media" workflow, because the CDN is not
 * reachable from every network. Safe to re-run: links that are already local
 * are left alone, and a file that is already landed is fetched again only if
 * a record still points at the CDN.
 *
 * What it does with each file:
 *   .png  → resized to fit 2000px and saved as WebP (alpha kept); the photos
 *           were 1–3 MB PNGs, which is most of a page's weight.
 *   .webp, .mp4, .glb → saved byte for byte.
 *   lib/brand-assets.ts → the logo and Earth texture are saved byte for byte
 *           and keep their names; the favicon must stay a PNG.
 *
 * content/poster-sources.json is deliberately not touched: it is the input to
 * scripts/fetch-posters.mjs, not something the site renders.
 */
import fs from 'node:fs'
import path from 'node:path'

const CDN_BASE = 'https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/'
const CDN_RE = /https:\/\/d8j0ntlcm91z4\.cloudfront\.net\/user_3HcoDUttWldZsray5X12PGDUTBl\/([A-Za-z0-9_.-]+)/g
const FILES = ['content/catalog.json', 'content/books.json', 'content/scenes.json', 'app/page.tsx']
const BRAND = 'lib/brand-assets.ts'
const OUT = 'public/media/hf'
const PUB = '/media/hf/'
const MAX_BYTES = 90 * 1024 * 1024 // GitHub refuses files over 100 MB

const sharp = (await import('sharp').catch(() => null))?.default
if (!sharp) {
  console.error('sharp is required: npm i --no-save sharp')
  process.exit(1)
}
fs.mkdirSync(OUT, { recursive: true })

async function fetchBuffer(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      if (attempt === 4) throw new Error(`${url}: ${err.message}`)
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
}

const landed = new Map()
let total = 0

async function land(url, name, { convert }) {
  if (landed.has(url)) return landed.get(url)
  let outName = name
  let buf = await fetchBuffer(url)
  if (convert && /\.png$/i.test(name)) {
    outName = name.replace(/\.png$/i, '.webp')
    buf = await sharp(buf)
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84, alphaQuality: 90 })
      .toBuffer()
  }
  if (buf.length > MAX_BYTES) throw new Error(`${outName} is ${(buf.length / 1e6).toFixed(1)} MB, over the limit`)
  fs.writeFileSync(path.join(OUT, outName), buf)
  total += buf.length
  const local = PUB + outName
  landed.set(url, local)
  console.log(`${String(Math.round(buf.length / 1024)).padStart(7)} KB  ${outName}`)
  return local
}

// 1. Records and pages that hold full CDN URLs.
for (const file of FILES) {
  let src = fs.readFileSync(file, 'utf8')
  const urls = [...new Set([...src.matchAll(CDN_RE)].map((m) => m[0]))]
  for (const url of urls) {
    const local = await land(url, url.slice(url.lastIndexOf('/') + 1), { convert: true })
    src = src.split(url).join(local)
  }
  fs.writeFileSync(file, src)
  console.log(`→ ${file}: ${urls.length} link(s) now local`)
}

// 2. The brand module builds its URLs from a CDN constant.
{
  let src = fs.readFileSync(BRAND, 'utf8')
  if (src.includes(`const CDN = '${CDN_BASE}'`)) {
    const names = [...src.matchAll(/\$\{CDN\}([A-Za-z0-9_.-]+)/g)].map((m) => m[1])
    for (const name of names) await land(CDN_BASE + name, name, { convert: false })
    // LOGO_MIN_URL is derived at runtime as <logo>_min.webp, so land that too.
    for (const name of names.filter((n) => n.endsWith('.png'))) {
      const min = name.replace(/\.png$/, '_min.webp')
      await land(CDN_BASE + min, min, { convert: false }).catch((e) => console.warn(`  (no ${min}: ${e.message})`))
    }
    src = src.replace(`const CDN = '${CDN_BASE}'`, `const CDN = '${PUB}'`)
    fs.writeFileSync(BRAND, src)
    console.log(`→ ${BRAND}: assets now served from ${PUB}`)
  }
}

const stillRemote = new RegExp(CDN_RE.source) // non-global: .test() must not carry lastIndex
const left = FILES.concat(BRAND).filter((f) => stillRemote.test(fs.readFileSync(f, 'utf8')))
console.log(`\n${landed.size} files, ${(total / 1e6).toFixed(1)} MB, in ${OUT}/`)
if (left.length) {
  console.error(`Still pointing at the CDN: ${left.join(', ')}`)
  process.exit(1)
}
