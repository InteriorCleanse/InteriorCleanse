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
import { join, resolve } from 'node:path'

const DEFAULT = 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT'
const symbols = [...new Set((process.env.MRCASH_SYMBOLS || DEFAULT).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))]
const basePort = Number(process.env.MRCASH_PORT || 4173)
const baseDir = resolve(process.env.MRCASH_DATA_DIR || './data-fleet')

if (!symbols.length) { console.error('No symbols. Set MRCASH_SYMBOLS=BTCUSDT,ETHUSDT,...'); process.exit(1) }

console.log('')
console.log('  MR. CASH FLEET — one full PAPER engine per market, real prices, pretend money.')
console.log('  ' + '-'.repeat(64))
const children = []
symbols.forEach((symbol, i) => {
  const port = basePort + i
  const dir = join(baseDir, symbol)
  mkdirSync(dir, { recursive: true })
  const env = { ...process.env, MRCASH_SYMBOL: symbol, MRCASH_PORT: String(port), MRCASH_DATA_DIR: dir, NO_BROWSER: '1' }
  const child = spawn(process.execPath, ['src/server.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  const tag = symbol.padEnd(10)
  const line = (buf) => String(buf).split('\n').filter(Boolean).forEach((l) => console.log(`  [${tag}] ${l}`))
  child.stdout.on('data', line)
  child.stderr.on('data', line)
  child.on('exit', (code) => console.log(`  [${tag}] exited (${code}). Lane ${dir}.`))
  children.push(child)
  console.log(`  ${tag} → http://127.0.0.1:${port}   (lane: ${dir})`)
})
console.log('  ' + '-'.repeat(64))
console.log('  Open any URL above. Each is Mr. Cash on that one market. Ctrl+C stops the fleet.')
console.log('')

let stopping = false
function stop() {
  if (stopping) return; stopping = true
  console.log('\n  Stopping the fleet…')
  for (const c of children) { try { c.kill('SIGTERM') } catch {} }
  setTimeout(() => { for (const c of children) { try { c.kill('SIGKILL') } catch {} } process.exit(0) }, 4000)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
