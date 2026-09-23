/**
 * PORT ISOLATION — a test must never run against a server that is not its own.
 *
 * THE BUG THIS EXISTS TO PREVENT
 *
 * `startBot` used to guess its port: `4300 + random(600)`. Guessing is fine
 * until two things want the same number, and then the readiness probe made the
 * collision invisible. It fetched `/api/health` BEFORE checking whether the
 * child had died, so a port already held by another mrcash answered 200, the
 * loop concluded "our server is up", and every assertion in the file ran
 * against a foreign process with a foreign data directory.
 *
 * That is the same failure as the shared-database race guarded by
 * `dataDirIsolation.test.ts`: parallel work silently sharing a resource each
 * side believed it owned, passing locally, and depending on scheduling to fail.
 *
 * THE FIX
 *
 * The port comes from the kernel (`listen(0)`) instead of a dice roll, the port
 * is checked to be silent before we spawn, liveness is checked before the probe
 * rather than after it, and a child that loses the port is caught by a settle
 * window — measured at 444/464/481ms to exit, with empty stderr, so the exit
 * code is the only evidence available.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startMockFeeds, startBot, ROOT } from './helpers.ts'
import type { RunningBot } from './helpers.ts'

// Windows lets a second process bind a TCP port another process already listens on, so the kernel
// refusal this guard relies on does not exist there; the guard is a Linux/macOS (and CI) property.
test('startBot refuses to hand back a foreign server holding its port', { skip: process.platform === 'win32' ? 'Windows allows a second bind on an occupied port' : false }, async () => {
  // Stand in for another mrcash already on this port: it answers /api/health
  // happily, which is precisely what fooled the old probe loop.
  const foreign = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })
  await new Promise<void>((r) => foreign.listen(0, '127.0.0.1', () => r()))
  const port = (foreign.address() as AddressInfo).port
  const feeds = await startMockFeeds()

  let handed: RunningBot | null = null
  let failure: unknown = null
  try {
    handed = await startBot(feeds, { env: { MRCASH_PORT: String(port) } })
  } catch (e) {
    failure = e
  }

  // Tear down BEFORE asserting. A regression hands back a live child whose
  // stderr pipe keeps the event loop open, so an assertion thrown first would
  // hang the run for ever instead of failing it. (Observed exactly that while
  // checking this guard against the unfixed helper.)
  handed?.child.kill('SIGKILL')
  await feeds.close()
  await new Promise<void>((r) => foreign.close(() => r()))

  assert.ok(failure, 'startBot handed back a bot whose port belongs to another process — every assertion in the file would have run against the wrong server')
  assert.match(String(failure), /could not bind|not ours/)
})

test('startBot allocates its port from the OS rather than guessing', () => {
  const helpers = readFileSync(join(ROOT, 'test', 'helpers.ts'), 'utf8')
  assert.equal(
    /\b4300\s*\+\s*Math\.floor\(Math\.random/.test(helpers), false,
    'the port is being guessed again — two parallel servers can collide and the loser is invisible',
  )
  assert.match(helpers, /listen\(0, '127\.0\.0\.1'/, 'the port must come from the kernel')
})

test('the readiness probe checks liveness before it trusts a health response', () => {
  const helpers = readFileSync(join(ROOT, 'test', 'helpers.ts'), 'utf8')
  const loop = helpers.slice(helpers.indexOf('for (let i = 0; i < 150'))
  const liveness = loop.indexOf('child.exitCode !== null')
  const probe = loop.indexOf('api/health')
  assert.ok(liveness >= 0 && probe >= 0, 'the readiness loop no longer looks the way this guard expects')
  assert.ok(
    liveness < probe,
    'the health probe runs before the liveness check again — a dead child will be mistaken for a healthy one',
  )
})
