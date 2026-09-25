/**
 * BIG MONEY — congress trades, insider Form 4 filings, off-exchange volume and
 * volume leaders: parsed honestly, labelled by source, never sent to the engine.
 *
 * SYNTHETIC / TEST FIXTURE: every name, ticker row, filing and number below is
 * made up to exercise the parsers. None of it is a real disclosure.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseRange, parseQuiverCongress, parseQuiverInsiders, parseQuiverOffExchange, parseForm4Xml, form4FilingsFrom, buildBoard, digest } from '../../src/bigmoney/parse.ts'
import { BigMoney, tickersFromEnv, msUntilNextNy } from '../../src/bigmoney/service.ts'

const ROOT = join(import.meta.dirname, '..', '..')

// SYNTHETIC Form 4, in the SEC's XML shape.
const FORM4 = (code: string, shares: number, price: number, plan = false) => `<?xml version="1.0"?>
<ownershipDocument>
  <issuer><issuerCik>0000000001</issuerCik><issuerName>TEST FIXTURE CORP</issuerName><issuerTradingSymbol>TSTX</issuerTradingSymbol></issuer>
  <reportingOwner><reportingOwnerId><rptOwnerCik>0000000002</rptOwnerCik><rptOwnerName>SYNTHETIC  PERSON A</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isDirector>0</isDirector><isOfficer>1</isOfficer><officerTitle>Chief Test Officer</officerTitle></reportingOwnerRelationship></reportingOwner>
  ${plan ? '<aff10b5One>1</aff10b5One>' : ''}
  <nonDerivativeTable><nonDerivativeTransaction>
    <securityTitle><value>Common Stock</value></securityTitle>
    <transactionDate><value>2026-09-10</value></transactionDate>
    <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>${code}</transactionCode></transactionCoding>
    <transactionAmounts><transactionShares><value>${shares}</value></transactionShares><transactionPricePerShare><value>${price}</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts>
    <postTransactionAmounts><sharesOwnedFollowingTransaction><value>50000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
  </nonDerivativeTransaction>
  <nonDerivativeTransaction>
    <transactionDate><value>2026-09-10</value></transactionDate>
    <transactionCoding><transactionCode>F</transactionCode></transactionCoding>
    <transactionAmounts><transactionShares><value>300</value></transactionShares><transactionPricePerShare><value>${price}</value></transactionPricePerShare></transactionAmounts>
  </nonDerivativeTransaction></nonDerivativeTable>
</ownershipDocument>`

test('disclosed ranges become numbers without inventing precision', () => {
  assert.deepEqual(parseRange('$1,001 - $15,000'), { low: 1001, high: 15000 })
  assert.deepEqual(parseRange('Over $50,000,000'), { low: 50000000, high: null })
  assert.deepEqual(parseRange(null), { low: null, high: null })
})

test('congress rows: buy or sell from the words, the range kept as filed, and how late the report was', () => {
  const rows = parseQuiverCongress([
    { Representative: 'Synthetic Member One', ReportDate: '2026-09-20', TransactionDate: '2026-08-10', Ticker: 'tstx', Transaction: 'Purchase', Range: '$15,001 - $50,000', House: 'Representatives', Party: 'I' },
    { Name: 'Synthetic Member Two', Filed: '2026-09-18', Traded: '2026-09-01', Ticker: 'TSTY', Transaction: 'Sale (Full)', Range: '$1,001 - $15,000', Chamber: 'Senate' },
    { Ticker: '', Transaction: 'Purchase' },
    'not a row',
  ])
  assert.equal(rows.length, 2)
  assert.deepEqual([rows[0].ticker, rows[0].side, rows[0].low, rows[0].high, rows[0].lagDays, rows[0].chamber], ['TSTX', 'buy', 15001, 50000, 41, 'House'])
  assert.deepEqual([rows[1].side, rows[1].chamber, rows[1].lagDays], ['sell', 'Senate', 17])
  assert.deepEqual(parseQuiverCongress({ not: 'an array' }), [])
})

test('Form 4 XML: the owner, role, code in words, value, 10b5-1 flag, and tax withholding kept out of "selling"', () => {
  const rows = parseForm4Xml(FORM4('P', 1000, 25.5), { filed: '2026-09-12', accession: '0000000000-26-000001' })
  assert.equal(rows.length, 2)
  const [buy, tax] = rows
  assert.deepEqual([buy.ticker, buy.who, buy.role, buy.code, buy.side, buy.shares, buy.price, buy.value, buy.ownedAfter, buy.plan, buy.filed], ['TSTX', 'SYNTHETIC PERSON A', 'Chief Test Officer', 'P', 'buy', 1000, 25.5, 25500, 50000, false, '2026-09-12'])
  assert.deepEqual([tax.code, tax.side, tax.codeText], ['F', 'other', 'Shares withheld to pay tax'])
  const planned = parseForm4Xml(FORM4('S', 2000, 30, true))
  assert.equal(planned[0].side, 'sell')
  assert.equal(planned[0].plan, true)
  assert.deepEqual(parseForm4Xml('<html>not a filing</html>'), [])
})

test('EDGAR submissions: only Form 4s, newest first, stops at the window, and points at the raw XML not the styled page', () => {
  const body = { filings: { recent: {
    form: ['4', '8-K', '4', '4'], filingDate: ['2026-09-20', '2026-09-15', '2026-09-01', '2026-01-01'],
    accessionNumber: ['0001-26-000003', '0001-26-000002', '0001-26-000001', '0001-26-000000'],
    primaryDocument: ['xslF345X05/form4.xml', 'doc.htm', 'wf-form4_1.xml', 'old.xml'],
  } } }
  assert.deepEqual(form4FilingsFrom(body, { since: '2026-06-01' }), [
    { accession: '0001-26-000003', filed: '2026-09-20', xmlFile: 'form4.xml' },
    { accession: '0001-26-000001', filed: '2026-09-01', xmlFile: 'wf-form4_1.xml' },
  ])
  assert.deepEqual(form4FilingsFrom({}, { since: '2026-01-01' }), [])
})

test('insider and off-exchange rows from Quiver; off-exchange share as a fraction', () => {
  const ins = parseQuiverInsiders([{ Ticker: 'TSTX', Name: 'Synthetic Person B', Date: '2026-09-05', TransactionCode: 'S', Shares: 100, PricePerShare: 10 }])
  assert.deepEqual([ins[0].side, ins[0].value, ins[0].source], ['sell', 1000, 'QUIVER'])
  const off = parseQuiverOffExchange([{ Ticker: 'TSTX', Date: '2026-09-19', OTC_Short: 400, OTC_Total: 1000, DPI: 0.4 }, { Ticker: 'TSTY', DPI: 55 }])
  assert.deepEqual([off[0].offShare, off[0].shortShare, off[1].offShare], [0.4, 0.4, 0.55])
})

test('the board counts only open-market buys and sells, notes 10b5-1 plans and overlap, and the digest stays factual', () => {
  const congress = parseQuiverCongress([
    { Representative: 'M1', ReportDate: '2026-09-20', TransactionDate: '2026-09-01', Ticker: 'TSTX', Transaction: 'Purchase', Range: '$1,001 - $15,000' },
    { Representative: 'M2', ReportDate: '2026-09-19', TransactionDate: '2026-09-02', Ticker: 'TSTX', Transaction: 'Purchase', Range: '$15,001 - $50,000' },
    { Representative: 'M3', ReportDate: '2026-09-18', TransactionDate: '2026-09-03', Ticker: 'TSTX', Transaction: 'Sale', Range: '$1,001 - $15,000' },
  ])
  const insiders = [...parseForm4Xml(FORM4('P', 1000, 20)), ...parseForm4Xml(FORM4('S', 500, 22, true)).map((r) => ({ ...r, ticker: 'TSTY' }))]
  const board = buildBoard({ congress, insiders, offExchange: parseQuiverOffExchange([{ Ticker: 'TSTX', Date: '2026-09-19', DPI: 0.52 }]), mostActive: [{ symbol: 'TSTX' }] })
  const x = board.find((b) => b.ticker === 'TSTX')!
  assert.deepEqual([x.congress.buys, x.congress.sells, x.congress.lowSum, x.congress.members.length], [2, 1, 17003, 3])
  assert.deepEqual([x.insiders.buys, x.insiders.sells, x.insiders.buyValue], [1, 0, 20000], 'the tax-withholding row is not a sale')
  assert.equal(x.offShare, 0.52)
  assert.equal(x.volumeRank, 1)
  assert.ok(x.notes.some((n) => /open-market insider purchase/.test(n)))
  assert.ok(x.notes.some((n) => /3 different members/.test(n)))
  const y = board.find((b) => b.ticker === 'TSTY')!
  assert.ok(y.notes.some((n) => /10b5-1/.test(n)))
  const lines = digest({ congress, insiders, board, days: 90 }).join(' ')
  assert.match(lines, /2 purchases and 1 sale disclosed/)
  assert.match(lines, /up to 45 days/)
  assert.match(lines, /not a reason to trade/)
  assert.doesNotMatch(lines, /\b(profitable|proven|guaranteed?|superior|best)\b|expected return|edge established/i)
  assert.deepEqual(digest({ congress: [], insiders: [], board: [], days: 90 }), ['NOT ENOUGH DATA: no filings in the window from the connected sources.'])
})

const ENV = ['MRCASH_QUIVER_KEY', 'MRCASH_QUIVER_URL', 'MRCASH_SEC_CONTACT', 'MRCASH_SEC_URL', 'MRCASH_SEC_DATA_URL', 'MRCASH_ALPACA_KEY', 'MRCASH_ALPACA_SECRET', 'MRCASH_ALPACA_DATA_URL']
function withEnv(vars: Record<string, string>, fn: () => Promise<void>) {
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))
  for (const k of ENV) delete process.env[k]
  Object.assign(process.env, vars)
  return fn().finally(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })
}

test('with nothing configured, every source says NOT CONNECTED and no request is made', () => withEnv({}, async () => {
  const calls: string[] = []
  const fetchImpl = async (url: string) => { calls.push(url); return { ok: false, status: 500, json: async () => null } }
  const bm = new BigMoney({ fetchImpl, dir: mkdtempSync(join(tmpdir(), 'bm-')), tickers: ['TSTX'], gapMs: 0 })
  const s = await bm.refresh()
  assert.deepEqual(calls, [])
  assert.deepEqual([s.sources.quiver.status, s.sources.sec.status, s.sources.alpaca.status], ['NOT CONNECTED', 'NOT CONNECTED', 'NOT CONNECTED'])
  assert.match(s.sources.sec.detail, /MRCASH_SEC_CONTACT/)
  assert.equal(s.execution, 'READ-ONLY')
  assert.match(s.digest[0], /NOT ENOUGH DATA/)
}))

test('connected to fake SEC, Quiver and Alpaca: the key and contact travel only in headers, filings are read once, and the result is saved', () => withEnv({
  MRCASH_QUIVER_KEY: 'TESTFIXTUREQUIVERKEY', MRCASH_QUIVER_URL: 'http://quiver.test', MRCASH_SEC_CONTACT: 'test-fixture@example.invalid',
  MRCASH_SEC_URL: 'http://sec.test', MRCASH_SEC_DATA_URL: 'http://secdata.test', MRCASH_ALPACA_KEY: 'TESTFIXTUREKEY', MRCASH_ALPACA_SECRET: 'TESTFIXTURESECRET', MRCASH_ALPACA_DATA_URL: 'http://alpaca.test',
}, async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => String(body) })
  const fetchImpl = async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} })
    if (url.includes('/congresstrading')) return reply([{ Representative: 'Synthetic Member', ReportDate: '2026-09-20', TransactionDate: '2026-09-01', Ticker: 'TSTX', Transaction: 'Purchase', Range: '$1,001 - $15,000' }])
    if (url.includes('/insiders')) return reply([])
    if (url.includes('/offexchange')) return reply('Upgrade your subscription plan to access this dataset.')
    if (url.endsWith('/files/company_tickers.json')) return reply({ 0: { cik_str: 1, ticker: 'TSTX', title: 'TEST FIXTURE CORP' } })
    if (url.includes('/submissions/CIK0000000001.json')) return reply({ filings: { recent: { form: ['4'], filingDate: ['2026-09-12'], accessionNumber: ['0000000000-26-000001'], primaryDocument: ['xslF345X05/form4.xml'] } } })
    if (url.includes('/Archives/edgar/data/1/000000000026000001/form4.xml')) return { ok: true, status: 200, json: async () => null, text: async () => FORM4('P', 1000, 20) }
    if (url.includes('/most-actives')) return reply({ most_actives: [{ symbol: 'TSTX', volume: 1000000, trade_count: 5000 }], last_updated: '2026-09-25T20:00:00Z' })
    if (url.includes('/movers')) return reply({ gainers: [{ symbol: 'TSTX', percent_change: 4.2, price: 21 }], losers: [] })
    return reply(null, 404)
  }
  const dir = mkdtempSync(join(tmpdir(), 'bm-'))
  const bm = new BigMoney({ fetchImpl, dir, tickers: ['TSTX'], gapMs: 0, now: () => Date.parse('2026-09-25T12:00:00Z') })
  const s = await bm.refresh()
  assert.deepEqual([s.sources.quiver.status, s.sources.sec.status, s.sources.alpaca.status], ['OVERRIDE', 'OVERRIDE', 'OVERRIDE'], 'pointed at test hosts, so labelled OVERRIDE')
  assert.equal(s.congress.length, 1)
  assert.deepEqual(s.insiders.map((i) => `${i.source}:${i.code}`), ['SEC EDGAR:P', 'SEC EDGAR:F'])
  assert.equal(s.offExchange.length, 0, 'a dataset outside the plan is empty, not guessed')
  assert.equal(s.mostActive[0].symbol, 'TSTX')
  assert.equal(s.board[0].ticker, 'TSTX')
  for (const c of calls) {
    assert.doesNotMatch(c.url, /TESTFIXTURE/, 'keys never in a URL')
    if (c.url.startsWith('http://quiver.test')) assert.equal(c.headers.Authorization, 'Token TESTFIXTUREQUIVERKEY')
    if (c.url.includes('sec')) assert.match(c.headers['User-Agent'], /test-fixture@example\.invalid/)
  }
  const saved = JSON.parse(readFileSync(join(dir, 'bigmoney.json'), 'utf8'))
  assert.equal(saved.kind, 'BIG MONEY')
  assert.doesNotMatch(JSON.stringify(saved), /TESTFIXTUREQUIVERKEY|TESTFIXTURESECRET/, 'no key is ever saved')
  // A second refresh reads the same filing from memory, not the network.
  const before = calls.filter((c) => c.url.includes('/Archives/')).length
  await bm.refresh()
  assert.equal(calls.filter((c) => c.url.includes('/Archives/')).length, before)
  // A restart shows the saved result straight away.
  assert.equal(new BigMoney({ dir, fetchImpl }).snapshot().congress.length, 1)
}))

test('tickers from the environment: cleaned, deduplicated, capped', () => {
  assert.deepEqual(tickersFromEnv('aapl, NVDA,nvda,,bad ticker!,BRK.B'), ['AAPL', 'NVDA', 'BRK.B'])
  assert.equal(tickersFromEnv(Array.from({ length: 40 }, (_, i) => `T${i}`).join(',')).length, 25)
})

test('walled off: nothing in the engine imports big money, the route is read-only, and the page only GETs', () => {
  const server = readFileSync(join(ROOT, 'src', 'server.ts'), 'utf8')
  assert.match(server, /path === '\/api\/bigmoney'/)
  for (const f of ['watch.ts', 'fusion.ts', 'riskEngine.ts', 'paperTrader.ts', 'config.ts']) {
    const p = join(ROOT, 'src', f)
    if (existsSync(p)) assert.doesNotMatch(readFileSync(p, 'utf8'), /bigmoney/i, `${f} must not see big money`)
  }
  const page = readFileSync(join(ROOT, 'web', 'js', 'bigmoney.js'), 'utf8')
  const calls = [...page.matchAll(/fetch\(\s*'([^']*)'/g)].map((m) => m[1])
  assert.deepEqual(calls, ['/api/bigmoney'], 'one GET, to its own read-only route')
  assert.doesNotMatch(page, /method\s*:\s*['"]POST/)
  const src = readFileSync(join(ROOT, 'src', 'bigmoney', 'sources.ts'), 'utf8')
  assert.doesNotMatch(src, /method\s*:\s*['"](POST|PUT|DELETE|PATCH)/, 'every source call is a GET')
})

test('the morning brief is timed to 6:00 New York, summer and winter', () => {
  const at = (iso: string) => msUntilNextNy(6, Date.parse(iso))
  assert.equal(at('2026-09-25T09:30:00Z'), 30 * 60_000, 'EDT: 6:00 is 10:00Z, half an hour away')
  assert.equal(at('2026-09-25T11:00:00Z'), 23 * 3_600_000, 'already past: tomorrow')
  assert.equal(at('2026-09-25T10:00:00Z'), 24 * 3_600_000, 'exactly on the hour: the next one, never zero')
  assert.equal(at('2026-12-15T10:00:00Z'), 3_600_000, 'EST: 6:00 is 11:00Z')
  assert.equal(at('2026-03-08T05:00:00Z'), 5 * 3_600_000, 'the night clocks go forward: 6:00 EDT is 10:00Z')
})

// SYNTHETIC: a clock pinned 50 ms before 6:00 New York so the morning timer fires at once.
const JUST_BEFORE_SIX = Date.parse('2026-09-25T10:00:00Z') - 50

test('the morning brief rings the bell with a plain summary when filings came in', () => withEnv({ MRCASH_QUIVER_KEY: 'TESTFIXTUREQUIVERKEY', MRCASH_QUIVER_URL: 'http://quiver.test' }, async () => {
  const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => String(body) })
  const fetchImpl = async (url: string) => reply(url.includes('/congresstrading') ? [{ Representative: 'Synthetic Member', ReportDate: '2026-09-20', TransactionDate: '2026-09-01', Ticker: 'TSTX', Transaction: 'Purchase', Range: '$1,001 - $15,000' }] : [])
  const alerts: Array<[string, string]> = []
  const bm = new BigMoney({ fetchImpl, dir: mkdtempSync(join(tmpdir(), 'bm-')), tickers: ['TSTX'], gapMs: 0, now: () => JUST_BEFORE_SIX, alert: (t, b) => { alerts.push([t, b]) } })
  bm.start()
  for (let i = 0; i < 40 && !alerts.length; i++) await new Promise((r) => setTimeout(r, 25))
  bm.stop()
  assert.ok(alerts.length >= 1, 'the bell rang')
  assert.equal(alerts[0][0], 'Morning filings brief')
  assert.match(alerts[0][1], /TSTX/)
  assert.doesNotMatch(alerts[0][1], /TESTFIXTUREQUIVERKEY/, 'no key in the bell')
}))

test('the morning brief stays quiet when nothing is connected, and stop() ends it', () => withEnv({}, async () => {
  const alerts: string[] = []
  const bm = new BigMoney({ fetchImpl: async () => ({ ok: false, status: 500, json: async () => null }), dir: mkdtempSync(join(tmpdir(), 'bm-')), tickers: ['TSTX'], gapMs: 0, now: () => JUST_BEFORE_SIX, alert: (t) => { alerts.push(t) } })
  bm.start()
  await new Promise((r) => setTimeout(r, 200))
  bm.stop()
  assert.deepEqual(alerts, [], 'NOT ENOUGH DATA is not news')
}))
