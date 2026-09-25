#!/usr/bin/env node
/**
 * THE FLEET — Mr. Cash across every market you name, at once.
 *
 * Each symbol gets its OWN full engine: its own watch loop, paper record,
 * research, learning and web app, in its own data-dir lane so nothing collides
 * and the single-process lock still holds per market. The strategy, risk,
 * fusion and validation code is the exact same validated engine — it is simply
 * run once per symbol with MRCASH_SYMBOL set. Nothing here trades real money;
 * every lane is PAPER, same as `npm start`.
 *
 * Built to run unattended (start-fleet-24-7): a lane that stops is restarted on
 * its own, waiting a little longer each time it keeps falling over, and the
 * wait resets once it has stayed up for ten minutes. Only the first lane runs
 * the all-markets scan (the Markets page), so five lanes do not ask the same
 * feeds the same questions five times.
 *
 * Usage:
 *   npm run fleet                          # the default majors watchlist
 *   MRCASH_SYMBOLS=BTCUSDT,ETHUSDT,SOLUSDT npm run fleet
 *   MRCASH_DATA_DIR=./data-soak MRCASH_PORT=4173 npm run fleet
 *
 * Each market opens on its own port; the list is printed on start. Ctrl+C
 * stops the whole fleet.
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_SYMBOLS = 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The environment one lane runs with. PAPER only: nothing live is ever set here. */
export function laneEnv(base, { symbol, index, port, dir }) {
  const env = { ...base, MRCASH_SYMBOL: symbol, MRCASH_PORT: String(port), MRCASH_DATA_DIR: dir, NO_BROWSER: '1' }
  // One all-markets scan for the whole fleet, on the first lane.
  if (index > 0) env.MRCASH_MARKETS = '0'
  // A lane never inherits the live phrase, whatever the parent shell holds.
  delete env.MRCASH_LIVE
  return env
}

/** Seconds to wait before restarting a lane that has stopped `crashes` times in a row: 10, 20, 40 … capped at 5 minutes. */
export function restartDelay(crashes) {
  return Math.min(300, 10 * Math.pow(2, Math.max(0, crashes - 1)))
}

export const STABLE_MS = 10 * 60_000

function main() {
  const symbols = [...new Set((process.env.MRCASH_SYMBOLS || DEFAULT_SYMBOLS).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))]
  const basePort = Number(process.env.MRCASH_PORT || 4173)
  const baseDir = resolve(process.env.MRCASH_DATA_DIR || './data-fleet')
  if (!symbols.length) { console.error('No symbols. Set MRCASH_SYMBOLS=BTCUSDT,ETHUSDT,...'); process.exit(1) }

  console.log('')
  console.log('  MR. CASH FLEET — one full PAPER engine per market, real prices, pretend money.')
  console.log('  ' + '-'.repeat(64))
  let stopping = false
  const lanes = symbols.map((symbol, index) => {
    const port = basePort + index
    const dir = join(baseDir, symbol)
    mkdirSync(dir, { recursive: true })
    const lane = { symbol, index, port, dir, child: null, crashes: 0, startedAt: 0, timer: null, tag: symbol.padEnd(10) }
    console.log(`  ${lane.tag} → http://127.0.0.1:${port}   (lane: ${dir})${index === 0 ? '   · runs the all-markets scan' : ''}`)
    return lane
  })
  const say = (lane, l) => console.log(`  [${lane.tag}] ${l}`)

  function launch(lane) {
    lane.timer = null
    lane.startedAt = Date.now()
    const child = spawn(process.execPath, ['src/server.ts'], { cwd: ROOT, env: laneEnv(process.env, lane), stdio: ['ignore', 'pipe', 'pipe'] })
    lane.child = child
    const line = (buf) => String(buf).split('\n').filter(Boolean).forEach((l) => say(lane, l))
    child.stdout.on('data', line)
    child.stderr.on('data', line)
    child.on('exit', (code, signal) => {
      lane.child = null
      if (stopping) return
      // A lane that ran for a good while is not "crashing"; start its count again.
      lane.crashes = Date.now() - lane.startedAt >= STABLE_MS ? 1 : lane.crashes + 1
      const wait = restartDelay(lane.crashes)
      say(lane, `stopped (${signal || `code ${code}`}). Restarting in ${wait}s${lane.crashes > 1 ? ` — ${lane.crashes} stops in a row` : ''}. Lane ${lane.dir}.`)
      lane.timer = setTimeout(() => launch(lane), wait * 1000)
    })
  }
  lanes.forEach(launch)
  console.log('  ' + '-'.repeat(64))
  console.log('  Open any URL above. Each is Mr. Cash on that one market. A lane that stops restarts itself. Ctrl+C stops the fleet.')
  console.log('')

  function stop() {
    if (stopping) return; stopping = true
    console.log('\n  Stopping the fleet…')
    for (const l of lanes) { if (l.timer) clearTimeout(l.timer); try { l.child?.kill('SIGTERM') } catch {} }
    setTimeout(() => { for (const l of lanes) { try { l.child?.kill('SIGKILL') } catch {} } process.exit(0) }, 4000)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

// Run only when started as a script, so the tests can import the helpers above.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
