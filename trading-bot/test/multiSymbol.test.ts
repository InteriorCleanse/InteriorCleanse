/**
 * MULTI-MARKET — the symbol is env-overridable so the fleet can run one full
 * engine per market. The default is unchanged, so the frozen single-symbol
 * validation profile is untouched.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const readSymbol = (env: Record<string, string | undefined>): string =>
  execFileSync(process.execPath, ['-e', "import('./config.ts').then((m) => console.log(m.config.symbol)).catch((e) => { console.error(e); process.exit(1) })"], { env, encoding: 'utf8' }).trim()

test('MRCASH_SYMBOL overrides the market and is upper-cased', () => {
  assert.equal(readSymbol({ ...process.env, MRCASH_SYMBOL: 'ETHUSDT' }), 'ETHUSDT')
  assert.equal(readSymbol({ ...process.env, MRCASH_SYMBOL: 'solusdt' }), 'SOLUSDT')
})

test('the default market stays BTCUSDT when nothing is set (frozen profile untouched)', () => {
  const env = { ...process.env }; delete env.MRCASH_SYMBOL
  assert.equal(readSymbol(env), 'BTCUSDT')
})

// The fleet's lane settings and restart policy (scripts/fleet.mjs). PAPER only.
test('fleet lanes: own symbol, port and data lane; the all-markets scan runs once; the live phrase never passes through', async () => {
  const { laneEnv } = await import('../scripts/fleet.mjs')
  const parent = { PATH: '/bin', MRCASH_LIVE: 'I_UNDERSTAND_REAL_MONEY' }
  const first = laneEnv(parent, { symbol: 'ETHUSDT', index: 0, port: 4174, dir: '/tmp/lane-eth' })
  const second = laneEnv(parent, { symbol: 'SOLUSDT', index: 1, port: 4175, dir: '/tmp/lane-sol' })
  assert.equal(first.MRCASH_SYMBOL, 'ETHUSDT'); assert.equal(first.MRCASH_PORT, '4174'); assert.equal(first.MRCASH_DATA_DIR, '/tmp/lane-eth')
  assert.equal(first.MRCASH_MARKETS, undefined, 'the first lane keeps the parent setting for the scan')
  assert.equal(second.MRCASH_MARKETS, '0', 'every other lane skips the all-markets scan')
  assert.equal('MRCASH_LIVE' in first || 'MRCASH_LIVE' in second, false, 'a lane never inherits the live phrase')
  assert.equal(parent.MRCASH_LIVE, 'I_UNDERSTAND_REAL_MONEY', 'the parent environment is not mutated')
})

test('fleet restarts: 10s, then doubling, capped at five minutes', async () => {
  const { restartDelay } = await import('../scripts/fleet.mjs')
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10].map(restartDelay), [10, 20, 40, 80, 160, 300, 300])
})
