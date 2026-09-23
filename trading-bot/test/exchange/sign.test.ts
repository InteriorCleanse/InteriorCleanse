/**
 * Signing must match Binance exactly, or every signed request is rejected. The
 * canonical HMAC-SHA256 example from Binance's own docs is the known vector; and
 * the read-only client must apply the venue time offset to its timestamps.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sign, signedQuery, toQuery } from '../../src/exchange/sign.ts'
import { ReadOnlyExchange, assessKeyPermissions } from '../../src/exchange/binanceRest.ts'

// Binance's documented example (spot HMAC SHA256).
const SECRET = 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0'
const QUERY = 'symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559'
const EXPECTED = 'b89008e7051ffbf2242be7dc5ae67fd146e6430688627b802c0cbec146e46aef'

test('the signature matches Binance\'s known HMAC-SHA256 vector', () => {
  assert.equal(sign(QUERY, SECRET), EXPECTED)
})

test('toQuery preserves order and signedQuery appends the signature last', () => {
  const q = signedQuery({ symbol: 'BTCUSDT' }, SECRET, { timestamp: 1, recvWindow: 5000 })
  assert.match(q, /^symbol=BTCUSDT&recvWindow=5000&timestamp=1&signature=[a-f0-9]{64}$/)
  assert.equal(toQuery({ a: 1, b: 'x y' }), 'a=1&b=x%20y')
})

test('the client applies the venue time offset to signed timestamps', async () => {
  const requests: string[] = []
  let localClock = 1_000_000
  const fetchImpl = async (url: string) => {
    requests.push(url)
    if (url.includes('/api/v3/time')) return { ok: true, status: 200, json: async () => ({ serverTime: localClock + 7000 }), text: async () => '' }
    return { ok: true, status: 200, json: async () => ({ canTrade: true, canWithdraw: false, canDeposit: true, balances: [] }), text: async () => '' }
  }
  const ex = new ReadOnlyExchange({ baseUrl: 'https://x', apiKey: 'k', apiSecret: SECRET, fetchImpl, now: () => localClock })
  const offset = await ex.syncTime()
  assert.equal(offset, 7000) // serverTime − localTime
  await ex.account()
  const signed = requests.find((u) => u.includes('/api/v3/account'))!
  const ts = Number(new URL(signed).searchParams.get('timestamp'))
  assert.equal(ts, localClock + 7000, 'timestamp carries the offset')
})

test('a key that can withdraw is refused; a read-only key is accepted', () => {
  assert.equal(assessKeyPermissions({ canTrade: false, canWithdraw: true, canDeposit: false }).ok, false)
  assert.match(assessKeyPermissions({ canTrade: false, canWithdraw: true, canDeposit: false }).reason, /WITHDRAW/)
  assert.equal(assessKeyPermissions({ canTrade: false, canWithdraw: false, canDeposit: false }).ok, true)
  assert.equal(assessKeyPermissions({ canTrade: true, canWithdraw: false, canDeposit: true }).ok, true)
})

test('the read-only client exposes no order-placing method', () => {
  const ex = new ReadOnlyExchange({ baseUrl: 'https://x', apiKey: 'k', apiSecret: 's' })
  for (const forbidden of ['order', 'placeOrder', 'newOrder', 'marketBuy', 'marketSell', 'cancelAll', 'ocoSell']) {
    assert.equal((ex as unknown as Record<string, unknown>)[forbidden], undefined, `must not expose ${forbidden}`)
  }
})
