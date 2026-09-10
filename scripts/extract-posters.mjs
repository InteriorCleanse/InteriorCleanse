#!/usr/bin/env node
/**
 * Makes every poster the exact first frame of its video.
 *
 * SceneBackground paints the poster first and fades the video in over it. If
 * the two differ by even a few pixels of framing or grade, the swap is a
 * visible pop — the one moment the illusion of a real place breaks. Extracting
 * frame 0 removes the possibility rather than asking anyone to match by eye.
 *
 * Run it after any clip lands or is re-graded:
 *
 *   node scripts/extract-posters.mjs            # every scene with a video
 *   node scripts/extract-posters.mjs --only library
 *   node scripts/extract-posters.mjs --dry-run
 *
 * Needs ffmpeg on PATH. Reads content/scenes.json, so a scene's poster path is
 * always the one the site actually serves — nothing is hard-coded here.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dry = args.includes('--dry-run')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null

const scenes = JSON.parse(readFileSync(join(ROOT, 'content', 'scenes.json'), 'utf8'))

try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
} catch {
  console.error('ffmpeg is not on PATH. Install it (brew install ffmpeg / apt install ffmpeg) and re-run.')
  process.exit(2)
}

let done = 0
let skipped = 0
for (const [id, scene] of Object.entries(scenes)) {
  if (only && id !== only) continue
  const video = scene.desktopVideo
  const poster = scene.posterImage
  if (!video || !poster) {
    console.log(`  ${id.padEnd(14)} skipped — ${!video ? 'no video declared' : 'no poster path declared'}`)
    skipped++
    continue
  }
  const src = join(ROOT, 'public', video)
  const dst = join(ROOT, 'public', poster)
  if (!existsSync(src)) {
    console.log(`  ${id.padEnd(14)} skipped — ${video} is not in public/ yet`)
    skipped++
    continue
  }
  console.log(`  ${id.padEnd(14)} ${video}  →  ${poster}${dry ? '  (dry run)' : ''}`)
  if (dry) continue
  mkdirSync(dirname(dst), { recursive: true })
  // -frames:v 1 at t=0; PNG so nothing is re-compressed on the way to the page.
  execFileSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-i', src, '-frames:v', '1', '-f', 'image2', '-c:v', 'png', dst],
    { stdio: 'inherit' }
  )
  done++
}

console.log(`\n${done} poster(s) written, ${skipped} skipped.`)
if (done) console.log('Now run: npm run build && npm run start & npm run check:contrast')
