/**
 * Shared test plumbing. Nothing here touches the internet.
 *
 *   startMockFeeds()  — a local HTTP server that answers like the exchange
 *                       and the news feeds, with deterministic SYNTHETIC
 *                       data. It exists so the code paths can be exercised;
 *                       the numbers mean nothing.
 *   startBot()        — the real server (src/server.ts) as a child process on a
 *                       port the OS hands out, with a temporary data folder and
 *                       the mock feeds wired in. It throws rather than return a
 *                       server that turns out not to be ours.
 *   tempDataDir()     — a throwaway data folder; set MRCASH_DATA_DIR before
 *                       importing any src module that persists.
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function tempDataDir(prefix = 'mrcash-test-'): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  // On Windows a folder that still holds the open SQLite database cannot be removed (EPERM/EBUSY), and the
  // store handle lives for the whole test process. A leftover temp folder is a tidiness problem, never a
  // correctness one, so the failure must not mark an otherwise green file as failed: retry once the process
  // has released its handles, and otherwise leave it to the OS temp reaper.
  const remove = () => rmSync(dir, { recursive: true, force: true })
  return {
    dir,
    cleanup: () => {
      try { remove() } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'ENOTEMPTY') throw err
        process.once('exit', () => { try { remove() } catch { /* the OS reaps its temp folder */ } })
      }
    },
  }
}

// ---------------------------------------------------------------
// Deterministic synthetic market: 40 days of 5-minute candles
// ---------------------------------------------------------------

const STEP = 300_000

function makeRng(seed: number) {
  let s = seed >>> 0
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
  return { rnd, gauss }
}

const etHourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false })
const etHour = (ms: number) => Number(etHourFmt.format(new Date(ms))) % 24

export type RawKline = [number, number, number, number, number, number, number]

/** Candles ending at the last closed 5-minute boundary before `now`. Same seed ⇒ same candles. */
export function syntheticKlines(days = 40, seed = 42, now = Date.now()): RawKline[] {
  const { gauss } = makeRng(seed)
  const n = days * 288
  const end = Math.floor(now / STEP) * STEP - STEP
  const rows: RawKline[] = []
  let price = 100_000
  for (let i = 0; i < n; i++) {
    const t = end - (n - 1 - i) * STEP
    const h = etHour(t)
    const active = (h >= 2 && h < 5) || (h >= 8 && h < 11)
    const sigma = active ? 0.0016 : h >= 20 ? 0.0006 : 0.0008
    const open = price
    const close = open * (1 + sigma * gauss() + Math.sin(i / 900) * 0.0002)
    const hi = Math.max(open, close) + Math.abs(gauss()) * sigma * open * 0.7
    const lo = Math.min(open, close) - Math.abs(gauss()) * sigma * open * 0.7
    rows.push([t, open, hi, lo, close, 1, t + STEP - 1])
    price = close
  }
  return rows
}

export type MockFeeds = { url: string; close: () => Promise<void>; hits: Record<string, number>; rows: RawKline[]; depthUpdateId: { value: number } }

export async function startMockFeeds(opts: { seed?: number; days?: number } = {}): Promise<MockFeeds> {
  const rows = syntheticKlines(opts.days ?? 40, opts.seed ?? 42)
  const last = rows[rows.length - 1][4]
  const { rnd } = makeRng(7)
  const hits: Record<string, number> = {}
  const depthUpdateId = { value: 1 }
  const tomorrow830 = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(12, 30, 0, 0); return d })()

  const server: Server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x')
    const p = u.pathname
    hits[p] = (hits[p] ?? 0) + 1
    const send = (o: unknown, type = 'application/json') => { res.writeHead(200, { 'content-type': type }); res.end(typeof o === 'string' ? o : JSON.stringify(o)) }
    if (p.endsWith('/klines')) {
      const limit = Math.min(1000, Number(u.searchParams.get('limit') || 500))
      const st = u.searchParams.get('startTime'), et = u.searchParams.get('endTime')
      const inRange = rows.filter((r) => (!st || r[0] >= Number(st)) && (!et || r[0] <= Number(et)))
      return send(st ? inRange.slice(0, limit) : inRange.slice(-limit))
    }
    if (p.endsWith('/depth')) {
      const bids: [string, string][] = [], asks: [string, string][] = []
      for (let i = 1; i <= 400; i++) {
        bids.push([(last * (1 - i * 0.00005)).toFixed(2), (0.02 + rnd() * 0.3 + (i === 120 ? 45 : 0)).toFixed(4)])
        asks.push([(last * (1 + i * 0.00005)).toFixed(2), (0.02 + rnd() * 0.3 + (i === 60 ? 30 : 0)).toFixed(4)])
      }
      return send({ lastUpdateId: depthUpdateId.value, bids, asks })
    }
    if (p.endsWith('/aggTrades')) {
      const now = Date.now()
      const out = []
      for (let i = 0; i < 1000; i++) { const big = i % 97 === 0; out.push({ a: i, p: (last * (1 + (rnd() - 0.5) * 0.001)).toFixed(2), q: (big ? 2 + rnd() * 3 : rnd() * 0.05).toFixed(4), f: i, l: i, T: now - (1000 - i) * 600, m: rnd() > 0.55 }) }
      return send(out)
    }
    if (p.endsWith('/calendar.json')) return send([
      { title: 'CPI m/m', country: 'USD', date: tomorrow830.toISOString(), impact: 'High', forecast: '0.3%', previous: '0.2%' },
      { title: 'Crude Oil Inventories', country: 'USD', date: new Date(Date.now() + 3 * 3600e3).toISOString(), impact: 'Medium', forecast: '', previous: '-1.2M' },
    ])
    if (p.endsWith('/rss')) return send(`<rss><channel><item><title><![CDATA[Fed officials signal patience on rate cuts as inflation lingers]]></title><link>https://example.test/1</link><pubDate>${new Date(Date.now() - 3600e3).toUTCString()}</pubDate></item><item><title>Spot Bitcoin ETF inflows hit two-week high</title><link>https://example.test/2</link><pubDate>${new Date(Date.now() - 7200e3).toUTCString()}</pubDate></item></channel></rss>`, 'application/rss+xml')
    res.writeHead(404); res.end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { url, hits, rows, depthUpdateId, close: () => new Promise((r) => server.close(() => r())) }
}

// ---------------------------------------------------------------
// The real server as a child process
// ---------------------------------------------------------------

export type RunningBot = { base: string; dir: string; child: ChildProcess; stop: () => void; token: () => Promise<string>; post: (path: string, body?: unknown, extraHeaders?: Record<string, string>) => Promise<Response> }

/**
 * A port the OS says is free RIGHT NOW.
 *
 * The previous version of `startBot` guessed — `4300 + random(600)` — which is a
 * lottery rather than an allocation, and it lost in the ugliest possible way.
 * The readiness probe below used to fetch `/api/health` BEFORE checking whether
 * the child had died, so when the guessed port was already held by another
 * mrcash the probe got a cheerful 200 from THAT server, concluded ours was up,
 * and every assertion in the file then ran against a foreign process with a
 * foreign data directory. Reproduced deliberately: loop says "up", child says
 * exit code 1. Same family as the shared-database race in `test/setup.ts` —
 * parallel test files silently sharing a resource each believed it owned.
 *
 * Asking the kernel removes the guess. The reserve/close/spawn gap is a few
 * microseconds against a 600-port band a developer's own server can sit in.
 */
async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', () => r()))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>((r) => probe.close(() => r()))
  return port
}

/** True if anything at all answers on the port — i.e. we did not get it. */
async function occupied(base: string): Promise<boolean> {
  try { await fetch(`${base}/api/health`); return true } catch { return false }
}

export async function startBot(feeds: MockFeeds, opts: { dir?: string; env?: Record<string, string> } = {}): Promise<RunningBot> {
  const dir = opts.dir ?? tempDataDir('mrcash-bot-').dir
  // A caller that pins MRCASH_PORT must not have `base` point somewhere else:
  // one port, one source of truth.
  const pinned = opts.env?.MRCASH_PORT
  const port = pinned ? Number(pinned) : await freePort()
  const base = `http://127.0.0.1:${port}`
  if (!pinned && await occupied(base)) throw new Error(`port ${port} answered before we started — refusing to run against a server that is not ours`)
  const child = spawn(process.execPath, ['src/server.ts'], {
    cwd: ROOT,
    env: { ...process.env, MRCASH_PORT: String(port), MRCASH_DATA_DIR: dir, MRCASH_MARKET_URL: feeds.url, MRCASH_NEWS_URL: feeds.url, MRCASH_STREAM: '0', NO_BROWSER: '1', NO_COLOR: '1', ...(opts.env ?? {}) },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr?.on('data', (d) => { stderr += String(d) })
  let up = false
  for (let i = 0; i < 150; i++) {
    // Liveness first: a dead child can never be the thing answering us.
    if (child.exitCode !== null) throw new Error(`server exited early (code ${child.exitCode}): ${stderr}`)
    try {
      const r = await fetch(`${base}/api/health`)
      if (r.ok) { up = true; break }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  if (!up) { child.kill('SIGKILL'); throw new Error(`server never became healthy on ${base} after 30s: ${stderr}`) }
  // A child that lost the port answers nothing and dies — but not instantly, and
  // meanwhile the winner answers the probe on its behalf. Measured here: a child
  // that cannot bind exits code 1 after 444/464/481ms, with EMPTY stderr, so the
  // exit code is the only evidence there is. Waiting 1000ms covers that with
  // room to spare; it costs a second on the two calls that use this helper, and
  // it is the difference between a loud failure and a whole file quietly
  // asserting against someone else's server.
  await new Promise((r) => setTimeout(r, 1000))
  if (child.exitCode !== null) throw new Error(`something else is answering on ${base} — our server could not bind and exited (code ${child.exitCode})${stderr ? `: ${stderr}` : ' with no stderr'}`)
  let cachedToken = ''
  const token = async () => {
    if (!cachedToken) cachedToken = ((await (await fetch(`${base}/api/config`)).json()) as { csrf: string }).csrf
    return cachedToken
  }
  const post = async (path: string, body?: unknown, extraHeaders: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'x-mrcash-csrf': await token(), origin: base, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { base, dir, child, token, post, stop: () => { child.kill('SIGTERM') } }
}

/** Sends JSON-RPC lines to the MCP server and collects replies by id. */
export async function mcpSession(dir: string, feedsUrl: string, requests: Array<Record<string, unknown>>, timeoutMs = 20_000): Promise<Map<number, unknown>> {
  const child = spawn(process.execPath, ['src/mcp.ts'], { cwd: ROOT, env: { ...process.env, MRCASH_DATA_DIR: dir, MRCASH_MARKET_URL: feedsUrl, MRCASH_NEWS_URL: feedsUrl, NO_COLOR: '1' }, stdio: ['pipe', 'pipe', 'ignore'] })
  const replies = new Map<number, unknown>()
  const wanted = requests.filter((r) => r.id !== undefined).length
  let buf = ''
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('mcp timeout')), timeoutMs)
    child.stdout.on('data', (d) => {
      buf += String(d)
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1)
        if (!line) continue
        const msg = JSON.parse(line) as { id?: number }
        if (msg.id !== undefined) replies.set(msg.id, msg)
        if (replies.size >= wanted) { clearTimeout(timer); resolve() }
      }
    })
    child.on('exit', () => { if (replies.size >= wanted) { clearTimeout(timer); resolve() } })
  })
  for (const r of requests) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...r }) + '\n')
  child.stdin.end()
  await done
  child.kill()
  return replies
}
