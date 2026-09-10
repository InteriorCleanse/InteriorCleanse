#!/usr/bin/env node
/**
 * Turns a generated clip into the seamless loop the manifest expects.
 *
 *   node scripts/loop-clips.mjs raw/hero.mp4 --scene atrium
 *   node scripts/loop-clips.mjs raw/library.mp4 --scene library --mode crossfade
 *   node scripts/loop-clips.mjs raw/*.mp4 --auto      # scene from filename
 *
 * Output: public/video/<scene>-desktop.mp4 (H.264, 1440px wide, silent) plus a
 * matching poster extracted from frame 0 so the poster→video swap is invisible.
 *
 * Two loop strategies, chosen per scene:
 *
 * - ping-pong (default): plays forward then backward. Doubles the length for
 *   free and lands exactly on the start frame. Right for camera moves and
 *   still rooms; wrong for water, steam, or anything with a direction of flow,
 *   which visibly reverses.
 * - crossfade: overlaps the tail onto the head. Right for water and steam;
 *   costs a little of the clip's length.
 *
 * Grade: slowed to 70% with motion interpolation (minterpolate), a touch of
 * desaturation, fine grain, and a vignette. The site's realism layer adds
 * living grain and its own vignette on top, so the amounts here are restrained.
 *
 * Needs ffmpeg with libx264 on PATH.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--') && !isFlagValue(a))
const flag = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt)
function isFlagValue(a) {
  const i = args.indexOf(a)
  return i > 0 && ['--scene', '--mode', '--width'].includes(args[i - 1])
}

const auto = args.includes('--auto')
const sceneFlag = flag('--scene', null)
const modeFlag = flag('--mode', null)
const width = Number(flag('--width', 1440))
const dry = args.includes('--dry-run')

const scenes = JSON.parse(readFileSync(join(ROOT, 'content', 'scenes.json'), 'utf8'))

/** Water and steam flow one way; everything else can ping-pong. */
const CROSSFADE_SCENES = new Set(['cleaning', 'pavilion'])

if (!files.length) {
  console.error('Give me at least one clip: node scripts/loop-clips.mjs raw/hero.mp4 --scene atrium')
  process.exit(1)
}
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
} catch {
  console.error('ffmpeg is not on PATH.')
  process.exit(2)
}

const probe = (file) =>
  parseFloat(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString()
  )

const grade =
  `minterpolate=fps=48:mi_mode=mci:mc_mode=aobmc:vsbmc=1,setpts=PTS/0.7,fps=24,` +
  `scale=${width}:-2:flags=lanczos,eq=saturation=0.92:contrast=1.02,` +
  `noise=alls=6:allf=t,vignette=PI/5`

for (const file of files) {
  const scene = sceneFlag ?? (auto ? guessScene(file) : null)
  if (!scene || !scenes[scene]) {
    console.error(`  ${basename(file)}: cannot tell which scene this is — pass --scene <key>. Keys: ${Object.keys(scenes).join(', ')}`)
    continue
  }
  const target = scenes[scene].desktopVideo
  const poster = scenes[scene].posterImage
  if (!target) {
    console.error(`  ${basename(file)}: scene "${scene}" declares no desktopVideo in scenes.json`)
    continue
  }
  const mode = modeFlag ?? (CROSSFADE_SCENES.has(scene) ? 'crossfade' : 'pingpong')
  const out = join(ROOT, 'public', target)
  const dur = probe(file)
  console.log(`  ${basename(file).padEnd(24)} → ${target}  (${mode}, ${dur.toFixed(1)}s in)`)
  if (dry) continue
  mkdirSync(dirname(out), { recursive: true })

  let filter
  if (mode === 'pingpong') {
    filter =
      `[0:v]${grade},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,` +
      `trim=start_frame=1,setpts=PTS-STARTPTS[v]`
  } else {
    // xfade needs a constant frame rate on both inputs, hence fps after trim.
    const fade = Math.min(1.2, dur * 0.7 * 0.15)
    const slowed = dur / 0.7
    filter =
      `[0:v]${grade},split[a][b];` +
      `[a]trim=0:${(slowed - fade).toFixed(3)},setpts=PTS-STARTPTS,fps=24[head];` +
      `[b]trim=${(slowed - fade).toFixed(3)},setpts=PTS-STARTPTS,fps=24[tail];` +
      `[tail][head]xfade=transition=fade:duration=${fade.toFixed(3)}:offset=0[v]`
  }

  execFileSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-i', file, '-filter_complex', filter, '-map', '[v]', '-an',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
    { stdio: 'inherit' }
  )
  if (poster) {
    const posterPath = join(ROOT, 'public', poster)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-frames:v', '1', '-c:v', 'png', posterPath], { stdio: 'inherit' })
    console.log(`  ${''.padEnd(24)}   poster refreshed from frame 0 → ${poster}`)
  }
  console.log(`  ${''.padEnd(24)}   ${probe(out).toFixed(1)}s out`)
}

function guessScene(file) {
  const n = basename(file).toLowerCase()
  if (n.includes('hero') || n.includes('atrium')) return 'atrium'
  return Object.keys(scenes).find((k) => n.includes(k)) ?? null
}
