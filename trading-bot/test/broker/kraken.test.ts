/**
 * KRAKEN PORTFOLIO — read-only, and provably so.
 *
 * A local stand-in for Kraken (the dev container cannot reach the real one)
 * checks the signing, the mapping, the not-connected and error paths, that a
 * secret never leaks into a surfaced message, and — the important one — that
 * the client can only ever call the two balance endpoints.
 *
 * TEST FIXTURE: every key, secret and balance below is synthetic.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { krakenSignature, fetchKrakenPortfolio, assetName, brokerStatus, READ_PATHS } from '../../src/broker/kraken.ts'

// A synthetic, validly-encoded 64-byte secret for the stand-in server.
const SECRET = Buffer.alloc(64, 7).toString('base64')
const KEY = 'test-fixture-key'

let server: Server
let url = ''
const seen: Array<{ path: string; nonce: number; ok: boolean }> = []
let mode: 'ok' | 'denied' = 'ok'

before(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const path = req.url || ''
      const nonce = new URLSearchParams(body).get('nonce') || ''
      // An independent re-implementation of Kraken's check, so the test does not grade the client with its own code.
      const expect = createHmac('sha512', Buffer.from(SECRET, 'base64')).update(Buffer.concat([Buffer.from(path), createHash('sha256').update(nonce + body).digest()])).digest('base64')
      const ok = req.method === 'POST' && req.headers['api-key'] === KEY && req.headers['api-sign'] === expect
      seen.push({ path, nonce: Number(nonce), ok })
      res.setHeader('content-type', 'application/json')
      if (!ok) { res.end(JSON.stringify({ error: ['EAPI:Invalid signature'] })); return }
      if (mode === 'denied') { res.end(JSON.stringify({ error: ['EGeneral:Permission denied'] })); return }
      if (path === '/0/private/Balance') { res.end(JSON.stringify({ error: [], result: { XXBT: '0.5000000000', ZUSD: '1250.40', 'ETH2.S': '1.2', XXDG: '0.0000' } })); return }
      if (path === '/0/private/TradeBalance') { res.end(JSON.stringify({ error: [], result: { eb: '34567.89', tb: '1250.40', e: '34500.10' } })); return }
      res.end(JSON.stringify({ error: ['EGeneral:Unknown method'] }))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const a = server.address(); url = typeof a === 'object' && a ? `http://127.0.0.1:${a.port}` : ''
})
after(() => server.close())

function setKeys(secret = SECRET) { process.env.MRCASH_KRAKEN_KEY = KEY; process.env.MRCASH_KRAKEN_SECRET = secret; process.env.MRCASH_KRAKEN_URL = url }
function clearKeys() { delete process.env.MRCASH_KRAKEN_KEY; delete process.env.MRCASH_KRAKEN_SECRET; delete process.env.MRCASH_KRAKEN_URL }

test('the signature matches the worked example in Kraken\'s own API documentation', () => {
  const sig = krakenSignature(
    '/0/private/AddOrder', '1616492376594',
    'nonce=1616492376594&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25',
    'kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==',
  )
  assert.equal(sig, '4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==')
})

test('not connected without keys — never invents an account', async () => {
  clearKeys()
  const p = await fetchKrakenPortfolio()
  assert.equal(p.connected, false)
  assert.equal(p.account, null)
  assert.equal(p.execution, 'READ-ONLY')
  assert.match(p.note, /Query Funds/)
})

test('connected: signs both reads, maps assets, drops zero balances, reads the USD total', async () => {
  mode = 'ok'; seen.length = 0; setKeys()
  const p = await fetchKrakenPortfolio()
  clearKeys()
  assert.equal(p.connected, true, p.note)
  assert.equal(p.mode, 'LIVE ACCOUNT · READ-ONLY')
  assert.equal(p.account?.totalUsd, 34567.89)
  assert.equal(p.account?.equityUsd, 34500.1)
  assert.deepEqual(p.holdings.map((h) => h.asset), ['BTC', 'ETH', 'USD'], 'DOGE at zero is dropped; ETH2.S reads as ETH')
  assert.equal(p.holdings.find((h) => h.asset === 'BTC')?.qty, 0.5)
  assert.deepEqual(seen.map((s) => s.path), ['/0/private/Balance', '/0/private/TradeBalance'])
  assert.ok(seen.every((s) => s.ok), 'every request carried a valid key and signature')
  assert.ok(seen[1].nonce > seen[0].nonce, 'each nonce is larger than the last')
})

test('a key without Query Funds gets a plain explanation, and no secret appears in any message', async () => {
  mode = 'denied'; setKeys()
  const p = await fetchKrakenPortfolio()
  clearKeys(); mode = 'ok'
  assert.equal(p.connected, false)
  assert.match(p.note, /Query Funds/)
  assert.equal(p.note.includes(SECRET), false)
  assert.equal(p.note.includes(KEY), false)
})

test('a wrong secret is reported as a rejected key, never echoed', async () => {
  const wrong = Buffer.alloc(64, 9).toString('base64')
  setKeys(wrong)
  const p = await fetchKrakenPortfolio()
  clearKeys()
  assert.equal(p.connected, false)
  assert.match(p.note, /rejected the key or secret/)
  assert.equal(p.note.includes(wrong), false)
})

test('the client cannot trade, move or withdraw — only the two balance reads exist', () => {
  const src = readFileSync(join(process.cwd(), 'src/broker/kraken.ts'), 'utf8')
  const privatePaths = [...src.matchAll(/\/0\/private\/([A-Za-z]+)/g)].map((m) => m[1])
  assert.deepEqual([...new Set(privatePaths)].sort(), ['Balance', 'TradeBalance'], 'no other private endpoint may appear in the read-only client')
  assert.equal(/AddOrder|EditOrder|CancelOrder|CancelAll|Withdraw[A-Z]|WalletTransfer|DepositAddresses|Stake/.test(src), false)
  assert.deepEqual([...READ_PATHS], ['/0/private/Balance', '/0/private/TradeBalance'])
})

test('asset codes read the way people say them', () => {
  assert.equal(assetName('XXBT'), 'BTC')
  assert.equal(assetName('ZUSD'), 'USD')
  assert.equal(assetName('SOL'), 'SOL')
  assert.equal(assetName('DOT.F'), 'DOT')
})

test('the broker list reports configured yes/no and never a key', () => {
  setKeys()
  const s = JSON.stringify(brokerStatus())
  clearKeys()
  assert.equal(s.includes(KEY), false)
  assert.equal(s.includes(SECRET), false)
  assert.equal(brokerStatus().brokers.find((b) => b.id === 'kraken')?.configured, false)
})
