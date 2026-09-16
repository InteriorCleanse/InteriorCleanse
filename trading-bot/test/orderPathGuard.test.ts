/**
 * THE ORDER-PATH GUARD.
 *
 * `LIVE_EXECUTION_AUDIT.md` established that the only order-placing code in the
 * tree (`src/exchange/binanceTrade.ts`, reached through `src/live/trader.ts`) is
 * ORPHANED: nothing in the running application imports it. That is the single
 * strongest safety property this project has — stronger than any flag, because a
 * flag can be flipped in one line whereas wiring has to be deliberately built.
 *
 * The audit recommended turning that property from "true today" into "enforced
 * by CI", and this file is that enforcement. It fails the build the moment
 * anyone imports the order path into the running application, wires an order
 * route, or flips the hard flag — which is exactly when a human should be made
 * to stop and think, rather than discovering it later.
 *
 * This is a safety invariant, not a style rule. If you are here because it
 * failed: that is the test working. Activating live trading is meant to be a
 * deliberate, reviewed, multi-gate act (see `src/live/gates.ts`), and adding an
 * exception below is part of that act — not a way around it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIVE_TRADING_ENABLED, config } from '../config.ts'

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src')

/** The ONLY files allowed to touch the order-placing path. */
const ALLOWED = new Set([
  join('live', 'trader.ts'),          // the gated live trader (dormant, unwired)
  join('live', 'orders.ts'),          // order shapes used by the trader
  join('live', 'reconcile.ts'),       // reconciliation reads venue fills
  join('exchange', 'binanceTrade.ts'), // the trade adapter itself
])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

const srcFiles = walk(SRC).map((p) => ({ path: p, rel: relative(SRC, p), body: readFileSync(p, 'utf8') }))

test('NOTHING in the running application imports the order-placing path', () => {
  const importsOrderPath = /from\s+'[^']*(?:live\/trader|exchange\/binanceTrade)\.ts'/
  const offenders = srcFiles
    .filter((f) => !ALLOWED.has(f.rel))
    .filter((f) => importsOrderPath.test(f.body))
    .map((f) => f.rel.split(sep).join('/'))

  assert.deepEqual(offenders, [], [
    '',
    'An order-placing module is now imported by the running application:',
    ...offenders.map((o) => `  src/${o}`),
    '',
    'This removes the "unwired" property that LIVE_EXECUTION_AUDIT.md relies on.',
    'If you genuinely intend to activate live trading, that is a deliberate,',
    'reviewed change — update the audit and this guard together.',
  ].join('\n'))
})

test('order-placing methods exist in exactly one file, and nowhere else', () => {
  const orderVerbs = /\b(marketBuy|marketSell|ocoSell|cancelAll)\s*\(/
  const owners = srcFiles.filter((f) => orderVerbs.test(f.body)).map((f) => f.rel.split(sep).join('/')).sort()
  // The adapter defines them; the trader calls them. Nothing else may mention them.
  assert.deepEqual(owners, ['exchange/binanceTrade.ts', 'live/trader.ts'], `order verbs appeared in unexpected files: ${owners.join(', ')}`)
})

test('the only write-capable exchange endpoint stays inside the trade adapter', () => {
  const writeEndpoint = /api\/v3\/(order|orderList)/
  const owners = srcFiles.filter((f) => writeEndpoint.test(f.body)).map((f) => f.rel.split(sep).join('/')).sort()
  assert.deepEqual(owners, ['exchange/binanceTrade.ts'], `an order endpoint appeared outside the adapter: ${owners.join(', ')}`)
})

test('no HTTP route anywhere can submit an order', () => {
  const server = srcFiles.find((f) => f.rel === 'server.ts')
  assert.ok(server, 'server.ts must exist')
  // Every route string the server registers.
  const routes = [...server!.body.matchAll(/path === '([^']+)'/g)].map((m) => m[1])
  assert.ok(routes.length > 20, 'expected the server to register many routes')
  const suspicious = routes.filter((r) => /\border\b|\bbuy\b|\bsell\b|\bexecute\b|\btrade\/(open|place|submit)\b/i.test(r))
  assert.deepEqual(suspicious, [], `a route that looks like it places an order: ${suspicious.join(', ')}`)
  // The live route is read-only by name and by method.
  assert.ok(routes.includes('/api/live/status'), 'the live status route should exist')
  assert.equal(/\/api\/live\/status'\s*&&\s*req\.method === 'POST'/.test(server!.body), false, 'the live route must not accept POST')
})

test('the hard safety flag is still false, and the gate chain is still closed', () => {
  assert.equal(LIVE_TRADING_ENABLED as boolean, false, 'LIVE_TRADING_ENABLED must remain false')
  assert.equal(config.live.enabled, false, 'config.live.enabled must remain false')
  assert.equal(config.shadow.enabled, false, 'config.shadow.enabled must remain false (shadow is prepared, not active)')
})

test('the audit document still describes the tree it audited', () => {
  const audit = readFileSync(join(SRC, '..', 'LIVE_EXECUTION_AUDIT.md'), 'utf8')
  assert.match(audit, /orphaned/i, 'the audit should still describe the order path as orphaned')
  assert.match(audit, /binanceTrade\.ts/, 'the audit should still name the trade adapter')
})
