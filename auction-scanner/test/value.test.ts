/**
 * auto.dev (dealer comparables) and VinAudit (market value by VIN): parsing the
 * documented shapes, and the server using them, offline with a fake fetch.
 * TEST FIXTURE values throughout; nothing here is a real listing or price.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { autodevComps, autodevRows, fromAutodevRow, resetAutodevCache } from '../src/sources/autodev.ts'
import { parseVinaudit, resetVinauditCache, vinauditEstimate, vinauditValue } from '../src/sources/vinaudit.ts'
import { startServer } from '../src/server.ts'

const VA_OK = { vin: '1NXBR32E85Z505904', success: true, vehicle: '2005 Toyota Corolla LE', mileage: 121349, count: 120, mean: 7044, stdev: 1276, certainty: 99, period: ['2026-06-27', '2026-09-25'], prices: { average: 7044, below: 5768, above: 8320 } }

test('VinAudit: the documented answer becomes an estimate; too few sales does not', () => {
  const mv = parseVinaudit(VA_OK)!
  assert.equal(mv.averageUsd, 7044)
  assert.equal(mv.count, 120)
  const est = vinauditEstimate(mv)!
  assert.equal(est.ok, true)
  if (est.ok) {
    assert.equal(est.valueUsd, 7044)
    assert.equal(est.low, 5768)
    assert.match(est.method, /VinAudit market value from 120 recorded sales/)
  }
  assert.equal(vinauditEstimate(parseVinaudit({ ...VA_OK, count: 2 })), undefined, 'two sales are not an estimate')
  assert.equal(parseVinaudit({ success: false }), undefined)
  assert.equal(parseVinaudit('nonsense'), undefined)
})

test('auto.dev: the documented listing shape becomes a dealer comparable', () => {
  const row = { vehicle: { vin: 'TF1FT8W3BT7EE00001', year: 2018, make: 'toyota', model: 'Camry', trim: 'SE' }, retailListing: { price: 18_995, miles: 61_000, city: 'Austin', state: 'tx', dealer: 'TEST FIXTURE Motors' } }
  for (const body of [[row], { data: [row] }, { listings: [row] }]) assert.equal(autodevRows(body).length, 1)
  const l = fromAutodevRow(row)!
  assert.equal(l.make, 'Toyota')
  assert.equal(l.buyNowUsd, 18_995)
  assert.equal(l.mileage, 61_000)
  assert.equal(l.location?.state, 'TX')
  assert.equal(l.kind, 'LIVE')
  assert.equal(fromAutodevRow({ vehicle: { year: 2018, make: 'Toyota', model: 'Camry' }, retailListing: {} }), undefined, 'no price, no comparable')
})

test('auto.dev and VinAudit calls: the right URL and key, plain errors, cached', async () => {
  process.env.GAVEL_AUTODEV_API_KEY = 'TEST_AUTODEV_KEY'
  process.env.GAVEL_VINAUDIT_API_KEY = 'TEST_VINAUDIT_KEY'
  resetAutodevCache(); resetVinauditCache()
  const seen: string[] = []
  const fake: typeof fetch = async (input, init) => {
    const url = String(input)
    seen.push(url + ' ' + JSON.stringify(init?.headers ?? {}))
    if (url.startsWith('https://api.auto.dev/listings')) return new Response(JSON.stringify({ data: [] }), { status: 200 })
    if (url.startsWith('https://marketvalue.vinaudit.com/')) return new Response(JSON.stringify(VA_OK), { status: 200 })
    throw new Error('unexpected ' + url)
  }
  try {
    await autodevComps('Toyota', 'Camry SE', 2018, fake)
    await autodevComps('Toyota', 'Camry SE', 2018, fake)
    assert.equal(seen.length, 1, 'the second call is cached')
    assert.match(seen[0], /vehicle\.make=Toyota/)
    assert.match(seen[0], /vehicle\.model=Camry&/)
    assert.match(seen[0], /vehicle\.year=2017-2019/)
    assert.match(seen[0], /Bearer TEST_AUTODEV_KEY/)
    const mv = await vinauditValue('1NXBR32E85Z505904', 121_349, fake)
    assert.equal(mv?.averageUsd, 7044)
    assert.match(seen[1], /key=TEST_VINAUDIT_KEY/)
    assert.match(seen[1], /mileage=120000/, 'miles rounded to 5,000 for the cache')
    const denied: typeof fetch = async () => new Response('no', { status: 401 })
    resetAutodevCache()
    await assert.rejects(() => autodevComps('Ford', 'F150', 2019, denied), /refused the key/)
  } finally {
    process.env.GAVEL_AUTODEV_API_KEY = ''
    process.env.GAVEL_VINAUDIT_API_KEY = ''
  }
})

test('the plan prices a car with no comparables from VinAudit, and only from enough sales', async () => {
  process.env.GAVEL_VINAUDIT_API_KEY = 'TEST_VINAUDIT_KEY'
  resetVinauditCache()
  const fake: typeof fetch = async (input) => {
    const url = String(input)
    if (url.startsWith('https://marketvalue.vinaudit.com/')) return new Response(JSON.stringify(url.includes('TF2') ? { ...VA_OK, count: 1 } : VA_OK), { status: 200 })
    throw new Error('TEST FIXTURE: network off')
  }
  const s = await startServer({ host: '127.0.0.1', port: 0, pin: '515151', sessionSecret: Buffer.alloc(32, 5), fetchImpl: fake, quiet: true, sniperIntervalMs: 0 })
  try {
    const login = await fetch(s.url + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '515151' }) })
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
    const { csrf } = await login.json() as { csrf: string }
    const call = async (path: string, body?: unknown) => (await fetch(s.url + path, { method: body ? 'POST' : 'GET', headers: { cookie, 'x-gavel-csrf': csrf, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json() as Promise<any>
    const a = await call('/api/import', { title: '2005 Toyota Corolla LE', source: 'gsa', lotNumber: 'TFV1', vin: '1NXBR32E85Z505904', mileage: 121_349, currentBidUsd: 4_000, titleStatus: 'clean' })
    assert.equal(a.estimate.ok, true, JSON.stringify(a.estimate))
    assert.equal(a.estimate.valueUsd, 7044)
    assert.match(a.estimate.method, /VinAudit/)
    assert.ok(a.score.total > 0)
    const b = await call('/api/import', { title: '2005 Toyota Corolla LE', source: 'gsa', lotNumber: 'TFV2', vin: 'TF2BR32E85Z505904', currentBidUsd: 4_000 })
    assert.equal(b.estimate.ok, false, 'one recorded sale is not enough')
  } finally {
    await s.close()
    process.env.GAVEL_VINAUDIT_API_KEY = ''
  }
})
