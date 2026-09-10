#!/usr/bin/env node
/**
 * Downloads the generated environment stills into public/images under the
 * exact filenames content/scenes.json expects.
 *
 *   node scripts/fetch-posters.mjs            # every scene with a source URL
 *   node scripts/fetch-posters.mjs --only hero,library
 *   node scripts/fetch-posters.mjs --dry-run
 *
 * Sources live in content/poster-sources.json: one URL per scene key, written
 * when the stills were generated. The CDN they sit on is not reachable from
 * every network (the build agent's egress proxy blocks it, for one), which is
 * why this is a script to run on your machine rather than something that
 * happened automatically.
 *
 * After it runs: commit public/images, then
 *   npm run build && npm run start &
 *   npm run check:contrast
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dry = args.includes('--dry-run')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null

const scenes = JSON.parse(readFileSync(join(ROOT, 'content', 'scenes.json'), 'utf8'))
const sources = JSON.parse(readFileSync(join(ROOT, 'content', 'poster-sources.json'), 'utf8'))

let done = 0
let skipped = 0
for (const [key, entry] of Object.entries(sources)) {
  if (key.startsWith('_')) continue
  if (only && !only.includes(key)) continue
  const scene = scenes[key]
  const poster = scene?.posterImage
  if (!poster) {
    console.log(`  ${key.padEnd(14)} skipped — no posterImage in scenes.json`)
    skipped++
    continue
  }
  if (!entry?.url) {
    console.log(`  ${key.padEnd(14)} skipped — no source URL yet`)
    skipped++
    continue
  }
  const dst = join(ROOT, 'public', poster)
  console.log(`  ${key.padEnd(14)} ${poster}${existsSync(dst) ? '  (replacing)' : ''}${dry ? '  (dry run)' : ''}`)
  if (dry) continue
  const res = await fetch(entry.url)
  if (!res.ok) {
    console.error(`  ${key.padEnd(14)} FAILED — ${res.status} from the CDN. The link may have expired; re-download from your Higgsfield library.`)
    continue
  }
  mkdirSync(dirname(dst), { recursive: true })
  writeFileSync(dst, Buffer.from(await res.arrayBuffer()))
  done++
}

console.log(`\n${done} poster(s) written, ${skipped} skipped.`)
if (done) console.log('Next: git add public/images && git commit -m "assets: environment posters", then npm run check:contrast against a production build.')
