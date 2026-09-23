/**
 * BROKER PORTFOLIO — read-only, and provably so.
 *
 * These tests use a local stand-in for Alpaca (the dev container cannot reach
 * the real one). They check the mapping, the not-connected and error paths,
 * that a key never leaks into a surfaced message, and — the important one —
 * that the module exposes no way to place an order.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchPortfolio } from '../../src/broker/alpaca.ts'

let server: Server
let url = ''
before(async () => {
  server = createServer((req, res) => {
    // A wrong key is rejected, like the real API, so we can test the 401 path.
    if (req.headers['apca-api-key-id'] === 'BAD') { res.writeHead(403); res.end('forbidden'); return }
    res.setHeader('content-type', 'application/json')
    if (req.url === '/v2/account') { res.end(JSON.stringify({ equity: '25123.45', cash: '10000', buying_power: '20000', currency: 'USD', status: 'ACTIVE' })); return }
    if (req.url === '/v2/positions') { res.end(JSON.stringify([{ symbol: 'AAPL', qty: '10', side: 'long', avg_entry_price: '150', market_value: '1600', unrealized_pl: '100', unrealized_plpc: '0.066' }])); return }
    res.writeHead(404); res.end('[]')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const a = server.address(); url = typeof a === 'object' && a ? `http://127.0.0.1:${a.port}` : ''
})
after(() => server.close())

function clearKeys() { delete process.env.MRCASH_ALPACA_KEY; delete process.env.MRCASH_ALPACA_SECRET; delete process.env.MRCASH_ALPACA_URL; delete process.env.MRCASH_ALPACA_MODE }

test('not connected without keys — never invents an account', async () => {
  clearKeys()
  const p = await fetchPortfolio()
  assert.equal(p.connected, false)
  assert.equal(p.account, null)
  assert.equal(p.execution, 'READ-ONLY')
  assert.match(p.note, /MRCASH_ALPACA_KEY/)
})

test('connected: reads the account and positions, maps the numbers', async () => {
  process.env.MRCASH_ALPACA_KEY = 'test-key'; process.env.MRCASH_ALPACA_SECRET = 'test-secret'; process.env.MRCASH_ALPACA_URL = url
  const p = await fetchPortfolio()
  clearKeys()
  assert.equal(p.connected, true)
  assert.equal(p.mode, 'PAPER')
  assert.equal(p.account?.equity, 25123.45)
  assert.equal(p.account?.buyingPower, 20000)
  assert.equal(p.positions.length, 1)
  assert.equal(p.positions[0].symbol, 'AAPL')
  assert.equal(p.positions[0].qty, 10)
  assert.equal(p.positions[0].unrealizedPl, 100)
})

test('a rejected key returns a redacted note, never the key', async () => {
  process.env.MRCASH_ALPACA_KEY = 'BAD'; process.env.MRCASH_ALPACA_SECRET = 'supersecretkey1234567890'; process.env.MRCASH_ALPACA_URL = url
  const p = await fetchPortfolio()
  clearKeys()
  assert.equal(p.connected, false)
  assert.equal(p.note.includes('supersecretkey1234567890'), false, 'a secret must never appear in a surfaced message')
})

test('the broker module cannot place an order — read-only by construction', () => {
  const src = readFileSync(join(process.cwd(), 'src/broker/alpaca.ts'), 'utf8')
  assert.equal(/\/v2\/orders/.test(src), false, 'no orders endpoint may appear in the read-only client')
  assert.equal(/method:\s*['"]POST['"]/i.test(src), false, 'the read-only client must not POST')
  assert.equal(/\bDELETE\b/.test(src), false, 'the read-only client must not cancel orders')
})
