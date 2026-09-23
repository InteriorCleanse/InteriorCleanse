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
