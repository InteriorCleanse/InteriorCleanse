#!/usr/bin/env node
/**
 * Downloads every asset in content/asset-sources.json to public/, converts to
 * a web-sized JPEG when sharp is available, and records it as landed.
 * Run where the generation CDN is reachable (your machine or CI).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sources = JSON.parse(readFileSync(resolve(root, 'content/asset-sources.json'), 'utf8'))
let sharp = null
try {
  sharp = (await import('sharp')).default
} catch {
  console.warn('sharp not installed: saving originals as-is (PNG bytes under a .jpg name is fine for browsers, but install sharp for smaller files)')
}

const landed = []
for (const [name, a] of Object.entries(sources.assets)) {
  const url = `${sources.cdn}/${a.file}`
  const out = resolve(root, 'public' + a.local)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    mkdirSync(dirname(out), { recursive: true })
    const bytes = sharp ? await sharp(buf).resize({ width: name === 'hero' || name === 'coast' ? 2400 : 1400, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer() : buf
    writeFileSync(out, bytes)
    landed.push(name)
    console.log(`landed ${name} → public${a.local} (${Math.round(bytes.length / 1024)} KB)`)
  } catch (err) {
    console.error(`failed ${name}: ${err.message}`)
  }
}
writeFileSync(resolve(root, 'content/assets-landed.json'), JSON.stringify({ landed }, null, 2) + '\n')
console.log(`${landed.length}/${Object.keys(sources.assets).length} landed`)
