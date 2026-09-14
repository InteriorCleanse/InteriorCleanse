/**
 * Starts the real server on a random port with a temporary data folder
 * and proves the request guard and the kill switch over HTTP.
 * No internet is needed: the watch loop's feed failures are caught by
 * the server and do not affect these routes.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = mkdtempSync(join(tmpdir(), 'mrcash-server-'))
const port = 4300 + Math.floor(Math.random() * 500)
const base = `http://127.0.0.1:${port}`
let child: ChildProcess

async function waitForHealth(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/api/health`)
      if (r.ok) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('server did not start')
}

before(async () => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'ledger.csv'), 'timestamp,symbol,action,price,quantity,reason,mode,outcome,pnl\n2026-01-15T13:30:00.000Z,BTCUSDT,BUY,100,1,test row,replay-raw,WIN,1\n')
  child = spawn(process.execPath, ['src/server.ts'], { cwd: ROOT, env: { ...process.env, MRCASH_PORT: String(port), MRCASH_DATA_DIR: dir, NO_BROWSER: '1', NO_COLOR: '1' }, stdio: ['ignore', 'ignore', 'ignore'] })
  await waitForHealth()
})

after(() => {
  child.kill('SIGTERM')
  rmSync(dir, { recursive: true, force: true })
})

const ledgerRows = () => readFileSync(join(dir, 'ledger.csv'), 'utf8').trim().split('\n').length - 1

test('/api/health reports paper mode, the kill switch and a writable data folder', async () => {
  const r = await (await fetch(`${base}/api/health`)).json() as { ok: boolean; data: { mode: string; stop: { stopped: boolean }; dataDirWritable: boolean; version: string } }
  assert.equal(r.ok, true)
  assert.equal(r.data.mode, 'paper')
  assert.equal(r.data.stop.stopped, false)
  assert.equal(r.data.dataDirWritable, true)
  assert.match(r.data.version, /^\d+\.\d+\.\d+$/)
})

test('/api/config hands the page a token', async () => {
  const cfg = await (await fetch(`${base}/api/config`)).json() as { csrf: string; mode: string }
  assert.match(cfg.csrf, /^[0-9a-f]{48}$/)
  assert.equal(cfg.mode, 'paper')
})

test('a forged cross-origin POST to /api/memory/reset is refused and memory is untouched', async () => {
  assert.equal(ledgerRows(), 1)
  const r = await fetch(`${base}/api/memory/reset`, { method: 'POST', headers: { origin: 'http://evil.test', 'sec-fetch-site': 'cross-site' } })
  assert.equal(r.status, 403)
  assert.equal(ledgerRows(), 1, 'the ledger row is still there')
})

test('a POST without the token is refused even from localhost', async () => {
  const r = await fetch(`${base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ allow: 'none' }) })
  assert.equal(r.status, 403)
})

test('the token from another origin is refused', async () => {
  const cfg = await (await fetch(`${base}/api/config`)).json() as { csrf: string }
  const r = await fetch(`${base}/api/memory/reset`, { method: 'POST', headers: { 'x-mrcash-csrf': cfg.csrf, origin: 'http://evil.test' } })
  assert.equal(r.status, 403)
  assert.equal(ledgerRows(), 1)
})

test('the same-origin token is accepted: the kill switch engages and releases over HTTP', async () => {
  const cfg = await (await fetch(`${base}/api/config`)).json() as { csrf: string }
  const headers = { 'x-mrcash-csrf': cfg.csrf, origin: base, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }
  const on = await (await fetch(`${base}/api/stop`, { method: 'POST', headers, body: JSON.stringify({ reason: 'http test' }) })).json() as { ok: boolean; data: { stopped: boolean } }
  assert.equal(on.ok, true)
  assert.equal(on.data.stopped, true)
  const h1 = await (await fetch(`${base}/api/health`)).json() as { data: { stop: { stopped: boolean; reason?: string } } }
  assert.equal(h1.data.stop.stopped, true)
  assert.equal(h1.data.stop.reason, 'http test')
  const off = await (await fetch(`${base}/api/resume`, { method: 'POST', headers })).json() as { ok: boolean; data: { stopped: boolean } }
  assert.equal(off.data.stopped, false)
})

test('the TradingView webhook still uses its own secret, not the token', async () => {
  const r = await fetch(`${base}/api/tv-alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: 'wrong', event: 'x' }) })
  assert.equal(r.status, 403)
})
