/**
 * ONE PAPER ENGINE — a real second `node src/server.ts` on the same data
 * directory is refused with the owner named, the first keeps running, and
 * once the first is gone a new process takes over the stale lock.
 */
import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tempDataDir, startMockFeeds, startBot, ROOT } from '../helpers.ts'
import type { MockFeeds, RunningBot } from '../helpers.ts'

const tmp = tempDataDir('mrcash-lock-')
let feeds: MockFeeds
let bot: RunningBot
before(async () => { feeds = await startMockFeeds({ days: 3 }); bot = await startBot(feeds, { dir: tmp.dir }) })
after(async () => { try { bot.stop() } catch { /* already gone */ } await feeds.close(); tmp.cleanup() })

const getJson = async <T,>(path: string): Promise<T> => (await fetch(`${bot.base}${path}`)).json() as Promise<T>

test('the running server holds the lock and reports it as its own', async () => {
  const lock = JSON.parse(readFileSync(join(tmp.dir, 'mrcash.lock'), 'utf8')) as { pid: number; role: string }
  assert.equal(lock.pid, bot.child.pid)
  assert.equal(lock.role, 'app')
  const h = await getJson<{ data: { lock: { ours: boolean; info: { pid: number } } } }>('/api/ops/health')
  assert.equal(h.data.lock.ours, true)
  assert.equal(h.data.lock.info.pid, bot.child.pid)
})

test('a second server on the same data directory refuses to start, names the owner, exits 1, and leaves the first untouched', async () => {
  const second = spawn(process.execPath, ['src/server.ts'], {
    cwd: ROOT,
    env: { ...process.env, MRCASH_PORT: String(Number(new URL(bot.base).port) + 1), MRCASH_DATA_DIR: tmp.dir, MRCASH_MARKET_URL: feeds.url, MRCASH_NEWS_URL: feeds.url, MRCASH_STREAM: '0', NO_BROWSER: '1', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  second.stdout.on('data', (d) => { out += String(d) })
  second.stderr.on('data', (d) => { out += String(d) })
  const code = await new Promise<number | null>((resolve) => { const t = setTimeout(() => { second.kill('SIGKILL'); resolve(-1) }, 30_000); second.once('exit', (c) => { clearTimeout(t); resolve(c) }) })
  assert.equal(code, 1, `second process should exit 1; output:\n${out}`)
  assert.match(out, new RegExp(`already owned by Mr\\. Cash pid ${bot.child.pid}`))
  assert.match(out, /One process per data directory/)
  // The first is still the owner and still healthy.
  const lock = JSON.parse(readFileSync(join(tmp.dir, 'mrcash.lock'), 'utf8')) as { pid: number }
  assert.equal(lock.pid, bot.child.pid)
  const h = await getJson<{ data: { healthy: boolean; ops: { overall: string } } }>('/api/health')
  assert.equal(h.data.healthy, true)
})

test('after the first process dies, a new one takes over the stale lock and becomes the owner', async () => {
  const oldPid = bot.child.pid
  bot.child.kill('SIGKILL')
  await new Promise((r) => bot.child.once('exit', r))
  bot = await startBot(feeds, { dir: tmp.dir })
  assert.notEqual(bot.child.pid, oldPid)
  const lock = JSON.parse(readFileSync(join(tmp.dir, 'mrcash.lock'), 'utf8')) as { pid: number }
  assert.equal(lock.pid, bot.child.pid)
  const h = await getJson<{ data: { lock: { ours: boolean }; soak: { runs: number; restarts: number } } }>('/api/ops/health')
  assert.equal(h.data.lock.ours, true)
  assert.equal(h.data.soak.runs, 2, 'the soak counters count the restart instead of resetting')
  assert.equal(h.data.soak.restarts, 1)
})

// Windows has no graceful SIGTERM: child.kill() terminates the process before any handler can run, so the
// lock is released there by the next start's dead-owner takeover (tested above), not by the signal handler.
test('a clean stop (SIGTERM) releases the lock instead of leaving it for the next start to take over', { skip: process.platform === 'win32' ? 'no graceful SIGTERM on Windows' : false }, async () => {
  bot.child.kill('SIGTERM')
  const code = await new Promise<number | null>((r) => bot.child.once('exit', (c) => r(c)))
  assert.equal(code, 0)
  assert.equal(existsSync(join(tmp.dir, 'mrcash.lock')), false, 'lock file removed on SIGTERM')
})
