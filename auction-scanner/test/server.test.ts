/**
 * The app end to end, over real HTTP on a random port, with a temp data
 * directory (test/setup.ts) and a fake fetch so no source is ever reached.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { clientKey, startServer } from '../src/server.ts'

const PIN = '424242'
const NEVER_FETCH: typeof fetch = async () => { throw new Error('TEST FIXTURE: the network is off') }
let url = ''
let close: () => Promise<void>
let cookie = ''
let csrf = ''

async function api(path: string, init: RequestInit & { json?: unknown; asMember?: string; noCsrf?: boolean } = {}): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = { cookie: init.asMember ?? cookie }
  if (init.json !== undefined) headers['content-type'] = 'application/json'
  if (!init.noCsrf && init.method && init.method !== 'GET') headers['x-gavel-csrf'] = csrf
  const res = await fetch(url + path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }, body: init.json !== undefined ? JSON.stringify(init.json) : init.body, redirect: 'manual' })
  let body: any = null
  try { body = await res.clone().json() } catch { body = await res.text() }
  return { status: res.status, body, headers: res.headers }
}

before(async () => {
  process.env.GAVEL_STRIPE_WEBHOOK_SECRET = 'whsec_TESTFIXTURE_secret'
  const s = await startServer({ host: '127.0.0.1', port: 0, pin: PIN, sessionSecret: Buffer.alloc(32, 9), fetchImpl: NEVER_FETCH, quiet: true, sniperIntervalMs: 0 })
  url = s.url
  close = s.close
})
after(async () => { await close() })

test('the front door redirects to /login and the API refuses strangers', async () => {
  const home = await api('/')
  assert.equal(home.status, 302)
  assert.equal(home.headers.get('location'), '/login')
  const login = await api('/login')
  assert.equal(login.status, 200)
  assert.match(String(login.body), /Sign in/)
  const feed = await api('/api/feed')
  assert.equal(feed.status, 401)
  assert.match(feed.body.error, /Sign in/)
})

test('/healthz answers ok without a session and says nothing else', async () => {
  const r = await api('/healthz', { asMember: '' })
  assert.equal(r.status, 200)
  assert.equal(r.body, 'ok')
})

test('the login throttle keys on the proxy-supplied address only when GAVEL_TRUST_PROXY=1', () => {
  const req = { headers: { 'x-forwarded-for': '198.51.100.7, 203.0.113.9' }, socket: { remoteAddress: '127.0.0.1' } } as unknown as Parameters<typeof clientKey>[0]
  process.env.GAVEL_TRUST_PROXY = ''
  assert.equal(clientKey(req), '127.0.0.1', 'without the flag a forged header is ignored')
  process.env.GAVEL_TRUST_PROXY = '1'
  try {
    assert.equal(clientKey(req), '203.0.113.9', 'the hop our proxy appended, not one the client wrote')
    const bare = { headers: {}, socket: { remoteAddress: '10.0.0.5' } } as unknown as Parameters<typeof clientKey>[0]
    assert.equal(clientKey(bare), '10.0.0.5')
  } finally {
    process.env.GAVEL_TRUST_PROXY = ''
  }
})

test('a wrong PIN fails; the right PIN issues a cookie and a CSRF token', async () => {
  const bad = await api('/api/login', { method: 'POST', json: { pin: '000000' }, noCsrf: true })
  assert.equal(bad.status, 401)
  const ok = await api('/api/login', { method: 'POST', json: { pin: PIN }, noCsrf: true })
  assert.equal(ok.status, 200)
  const setCookie = ok.headers.get('set-cookie') ?? ''
  assert.match(setCookie, /gavel_session=/)
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Strict/)
  cookie = setCookie.split(';')[0]
  csrf = ok.body.csrf
  assert.ok(csrf.length > 10)
  const me = await api('/api/me')
  assert.equal(me.status, 200)
  assert.equal(me.body.role, 'owner')
  assert.equal(me.body.liveBidding, false)
  assert.ok(Array.isArray(me.body.sources) && me.body.sources.length >= 8)
})

test('the home page is served with a per-request nonce in the CSP and on the script tag', async () => {
  const a = await api('/')
  const b = await api('/')
  assert.equal(a.status, 200)
  const csp = a.headers.get('content-security-policy') ?? ''
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
  assert.ok(nonce, 'nonce in CSP')
  assert.ok(String(a.body).includes(`nonce="${nonce}"`), 'nonce on the script tag')
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp))
  assert.notEqual(nonce, /'nonce-([^']+)'/.exec(b.headers.get('content-security-policy') ?? '')?.[1])
  assert.equal(a.headers.get('x-frame-options'), 'DENY')
})

test('static files are served with the right type and traversal is refused', async () => {
  const js = await api('/js/app.js')
  assert.equal(js.status, 200)
  assert.match(js.headers.get('content-type') ?? '', /javascript/)
  for (const p of ['/css/../../package.json', '/css/..%2F..%2Fpackage.json', '/%2e%2e/package.json', '/js/%5c..%5cpackage.json']) {
    const r = await api(p)
    assert.equal(r.status, 404, p)
  }
})

test('the feed shows SAMPLE cars, labelled, when no source is connected', async () => {
  const feed = await api('/api/feed?sample=1')
  assert.equal(feed.status, 200)
  assert.equal(feed.body.kind, 'SAMPLE')
  assert.ok(feed.body.cards.length > 5)
  assert.ok(feed.body.cards.every((c: any) => c.listing.kind === 'SAMPLE' && c.listing.vin.startsWith('SAMPLE')))
  assert.ok(feed.body.cards.every((c: any) => c.score && c.estimate && Array.isArray(c.score.reasons)))
  assert.ok(feed.body.cards.every((c: any) => c.score.starterOk === true), 'starter mode is on by default')
  const all = await api('/api/feed?sample=1&starter=0')
  assert.ok(all.body.cards.length > feed.body.cards.length)
  assert.equal(feed.body.hidden, all.body.cards.length - feed.body.cards.length)
  const none = await api('/api/feed?sample=0')
  assert.equal(none.body.kind, 'EMPTY')
  assert.equal(none.body.cards.length, 0)
  const sorted = await api('/api/feed?sample=1&sort=price')
  const prices = sorted.body.cards.map((c: any) => c.listing.currentBidUsd ?? c.listing.buyNowUsd)
  assert.deepEqual(prices, [...prices].sort((a: number, b: number) => a - b))
  const tier = await api('/api/feed?sample=1&starter=0&tier=supercar')
  assert.ok(tier.body.cards.length > 0 && tier.body.cards.every((c: any) => c.demand?.tier === 'supercar'))
})

let listingId = ''
test('a listing carries a plan and a walkthrough; the plan reacts to repairs', async () => {
  const feed = await api('/api/feed?sample=1')
  listingId = feed.body.cards[0].listing.id
  const one = await api('/api/listing/' + encodeURIComponent(listingId))
  assert.equal(one.status, 200)
  assert.ok(one.body.plan && typeof one.body.plan.maxBidUsd === 'number')
  assert.equal(one.body.walkthrough.steps.length, 7)
  assert.ok(one.body.walkthrough.warnings.some((w: string) => /SAMPLE/.test(w)))
  const base = await api('/api/plan', { method: 'POST', json: { listingId, repairsUsd: 0, distanceMiles: 0 } })
  const more = await api('/api/plan', { method: 'POST', json: { listingId, repairsUsd: 2000, distanceMiles: 0 } })
  assert.equal(base.status, 200)
  assert.equal(base.body.maxBidUsd - more.body.maxBidUsd, 2000)
  const bad = await api('/api/plan', { method: 'POST', json: { listingId, repairsUsd: 'lots' } })
  assert.equal(bad.status, 400)
  const missing = await api('/api/listing/ebay:does-not-exist')
  assert.equal(missing.status, 404)
})

test('state-changing calls need the CSRF token', async () => {
  const r = await api('/api/plan', { method: 'POST', json: { listingId }, noCsrf: true })
  assert.equal(r.status, 403)
})

test('a bid is always PAPER, and a SAMPLE car has no lot to open', async () => {
  const bid = await api('/api/bid', { method: 'POST', json: { listingId, maxBidUsd: 12_345, note: 'practice' } })
  assert.equal(bid.status, 200)
  assert.equal(bid.body.mode, 'PAPER')
  assert.equal(bid.body.paperBid.mode, 'PAPER')
  assert.equal(bid.body.openUrl, null)
  assert.match(bid.body.message, /PAPER/)
  assert.doesNotMatch(bid.body.message, /placed on the auction|bid is live/i)
  const bad = await api('/api/bid', { method: 'POST', json: { listingId, maxBidUsd: -5 } })
  assert.equal(bad.status, 400)
  const paper = await api('/api/paper')
  assert.equal(paper.body.bids.length, 1)
  assert.equal(paper.body.summary.open, 1)
  const done = await api('/api/paper/' + paper.body.bids[0].id + '/outcome', { method: 'POST', json: { outcome: 'lost' } })
  assert.equal(done.body.outcome, 'lost')
})

test('the watchlist adds, lists and removes', async () => {
  const add = await api('/api/watchlist', { method: 'POST', json: { listingId } })
  assert.equal(add.status, 200)
  assert.equal(add.body.length, 1)
  const list = await api('/api/watchlist')
  assert.equal(list.body[0].listingId, listingId)
  const rm = await api('/api/watchlist/' + encodeURIComponent(listingId), { method: 'DELETE' })
  assert.equal(rm.body.length, 0)
})

test('the explainer never fails: without a key it serves the rules walkthrough', async () => {
  const r = await api('/api/explain', { method: 'POST', json: { listingId } })
  assert.equal(r.status, 200)
  assert.equal(r.body.source, 'rules')
  assert.equal(r.body.steps.length, 7)
  assert.ok(typeof r.body.note === 'string')
})

test('auctions, playbook, rental and vin routes', async () => {
  const a = await api('/api/auctions?q=corvette')
  assert.ok(a.body.houses.length >= 8)
  assert.ok(a.body.houses.every((h: any) => typeof h.searchUrl === 'string' && (/corvette/i.test(decodeURIComponent(h.searchUrl)) || h.id === 'acv' || h.id === 'gsa')))
  assert.ok(a.body.houses.every((h: any) => h.bidApi === false))
  const p = await api('/api/playbook')
  assert.ok(p.body.guides.length >= 7)
  const r = await api('/api/rental?budget=15000&use=p2p')
  assert.ok(r.body.picks.length >= 5 && r.body.steps.length === 10)
  const badUse = await api('/api/rental?budget=15000&use=yacht')
  assert.equal(badUse.status, 400)
  const badVin = await api('/api/vin/NOTAVIN')
  assert.equal(badVin.status, 400)
  const offline = await api('/api/vin/1HGCV1F30JA000000')
  assert.equal(offline.status, 502)
})

test('settings round-trip and reject nonsense', async () => {
  const got = await api('/api/settings')
  assert.equal(got.body.starter.cleanTitleOnly, true)
  const set = await api('/api/settings', { method: 'POST', json: { starter: { maxPriceUsd: 45_000 }, homeState: 'tx', feeOverrides: { copart: 12 } } })
  assert.equal(set.status, 200)
  assert.equal(set.body.starter.maxPriceUsd, 45_000)
  assert.equal(set.body.homeState, 'TX')
  assert.equal(set.body.feeOverrides.copart, 12)
  const bad = await api('/api/settings', { method: 'POST', json: { starter: { maxDamage: 'total' } } })
  assert.equal(bad.status, 400)
  await api('/api/settings', { method: 'POST', json: { starter: { maxPriceUsd: 60_000 }, homeState: null, feeOverrides: {} } })
})

test('the owner manages members; a member cannot', async () => {
  const made = await api('/api/admin/members', { method: 'POST', json: { email: 'Pat@Example.com' } })
  assert.equal(made.status, 200)
  assert.match(made.body.code, /^GVL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  assert.equal(made.body.member.email, 'pat@example.com')
  const list = await api('/api/admin/members')
  assert.equal(list.body.length, 1)
  assert.ok(!('codeHash' in list.body[0]))
  const login = await api('/api/login', { method: 'POST', json: { email: 'pat@example.com', code: made.body.code }, noCsrf: true })
  assert.equal(login.status, 200)
  assert.equal(login.body.role, 'member')
  const memberCookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
  const forbidden = await api('/api/admin/members', { asMember: memberCookie })
  assert.equal(forbidden.status, 403)
  const wrong = await api('/api/login', { method: 'POST', json: { email: 'pat@example.com', code: 'GVL-0000-0000-0000' }, noCsrf: true })
  assert.equal(wrong.status, 401)
  const removed = await api('/api/admin/members/pat%40example.com', { method: 'DELETE' })
  assert.equal(removed.status, 200)
  const again = await api('/api/login', { method: 'POST', json: { email: 'pat@example.com', code: made.body.code }, noCsrf: true })
  assert.equal(again.status, 401)
})

test('the Stripe webhook refuses a bad signature and creates a member on a good one', async () => {
  const body = JSON.stringify({ id: 'evt_test_1', type: 'checkout.session.completed', data: { object: { customer_details: { email: 'sub@example.com' }, customer: 'cus_1', subscription: 'sub_1' } } })
  const bad = await api('/api/stripe/webhook', { method: 'POST', body, headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=00' }, noCsrf: true, asMember: '' })
  assert.equal(bad.status, 400)
  const t = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', 'whsec_TESTFIXTURE_secret').update(`${t}.${body}`).digest('hex')
  const good = await api('/api/stripe/webhook', { method: 'POST', body, headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, noCsrf: true, asMember: '' })
  assert.equal(good.status, 200, JSON.stringify(good.body))
  assert.equal(good.body.handled, true)
  const list = await api('/api/admin/members')
  assert.ok(list.body.some((m: any) => m.email === 'sub@example.com' && m.source === 'stripe' && m.active))
  const twice = await api('/api/stripe/webhook', { method: 'POST', body, headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, noCsrf: true, asMember: '' })
  assert.equal(twice.body.handled, false, 'the same event id is not handled twice')
})

test('sign out revokes the session', async () => {
  const out = await api('/api/logout', { method: 'POST', json: {} })
  assert.equal(out.status, 200)
  const me = await api('/api/me')
  assert.equal(me.status, 401)
})

test('knowledge, catalog, intel (offline) and research (no key) routes', async () => {
  const login = await api('/api/login', { method: 'POST', json: { pin: PIN }, noCsrf: true })
  cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
  csrf = login.body.csrf
  const k = await api('/api/knowledge')
  assert.ok(k.body.policies.length >= 10 && k.body.regulations.length >= 10 && k.body.glossary.length >= 40)
  const s = await api('/api/knowledge/search?q=sniping')
  assert.ok(s.body.hits.length > 0)
  const c = await api('/api/catalog')
  assert.ok(c.body.makes.some((m: any) => m.make === 'Porsche'))
  const i = await api('/api/intel?year=2019&make=Toyota&model=Camry')
  assert.equal(i.status, 200)
  assert.equal(i.body.recalls, null)
  assert.ok(i.body.notes.length === 4)
  const bad = await api('/api/intel?year=2019&make=&model=Camry')
  assert.equal(bad.status, 400)
  const r = await api('/api/research', { method: 'POST', json: { question: 'Does sniping work on Bring a Trailer?' } })
  assert.equal(r.status, 200)
  assert.equal(r.body.source, 'knowledge')
  assert.ok(r.body.hits.length > 0)
  assert.match(r.body.note, /ANTHROPIC_API_KEY/)
})

test('the sniper: create a target, run it on the sample feed, get picks and alerts; armed fires PAPER once', async () => {
  const empty = await api('/api/sniper')
  assert.equal(empty.body.paper, true)
  const made = await api('/api/sniper/targets', { method: 'POST', json: { name: 'Cheap Toyotas', makes: ['Toyota'], maxBudgetUsd: 30_000, minScore: 40, starterOnly: true } })
  assert.equal(made.status, 200)
  const run = await api('/api/sniper/run', { method: 'POST', json: {} })
  assert.equal(run.status, 200)
  assert.ok(run.body.picks.length > 0, 'the sample feed has cheap Toyotas')
  assert.ok(run.body.picks.every((p: any) => p.card.listing.make === 'Toyota' && p.fire.maxBidUsd <= 30_000 && p.card.listing.kind === 'SAMPLE'))
  assert.equal(run.body.fired, 0)
  const st = await api('/api/sniper')
  assert.ok(st.body.alerts.some((a: any) => a.kind === 'pick'))
  const paperBefore = (await api('/api/paper')).body.bids.length
  const armed = await api('/api/sniper/targets/' + made.body.id, { method: 'POST', json: { armed: true } })
  assert.equal(armed.body.armed, true)
  const run2 = await api('/api/sniper/run', { method: 'POST', json: {} })
  assert.ok(run2.body.fired > 0)
  const run3 = await api('/api/sniper/run', { method: 'POST', json: {} })
  assert.equal(run3.body.fired, 0, 'never fires twice on the same car')
  const paperAfter = (await api('/api/paper')).body.bids
  assert.equal(paperAfter.length - paperBefore, run2.body.fired)
  assert.ok(paperAfter.every((b: any) => b.mode === 'PAPER'))
  const read = await api('/api/sniper/alerts/read', { method: 'POST', json: {} })
  assert.ok(read.body.read > 0)
  const bad = await api('/api/sniper/targets', { method: 'POST', json: { maxBudgetUsd: 1 } })
  assert.equal(bad.status, 400)
  const rm = await api('/api/sniper/targets/' + made.body.id, { method: 'DELETE' })
  assert.equal(rm.status, 200)
})

test('home, setup, garage and backup are per member', async () => {
  const owner = await api('/api/login', { method: 'POST', json: { pin: PIN }, noCsrf: true })
  cookie = (owner.headers.get('set-cookie') ?? '').split(';')[0]
  csrf = owner.body.csrf
  const home0 = await api('/api/home')
  assert.equal(home0.status, 200)
  assert.equal(home0.body.next.find((n: any) => n.id === 'setup').done, false)
  const bad = await api('/api/onboard', { method: 'POST', json: { goal: 'yacht', budgetUsd: 15000 } })
  assert.equal(bad.status, 400)
  const setup = await api('/api/onboard', { method: 'POST', json: { goal: 'rental', homeState: 'tx', budgetUsd: 15000, makes: ['Toyota', 'Honda'], models: [] } })
  assert.equal(setup.status, 200, JSON.stringify(setup.body))
  assert.equal(setup.body.settings.onboarded, true)
  assert.equal(setup.body.settings.homeState, 'TX')
  assert.equal(setup.body.target.maxBudgetUsd, 15000)
  const car = await api('/api/garage', { method: 'POST', json: { title: 'TEST FIXTURE 2016 Corolla', purchaseUsd: 7800 } })
  assert.equal(car.status, 200)
  const cost = await api(`/api/garage/${car.body.id}/cost`, { method: 'POST', json: { label: 'Detail', usd: 180 } })
  assert.equal(cost.body.totals.spentUsd, 7980)
  const inc = await api(`/api/garage/${car.body.id}/income`, { method: 'POST', json: { label: 'Turo payout', usd: 420 } })
  assert.equal(inc.body.totals.netUsd, -7560)
  const g = await api('/api/garage')
  assert.equal(g.body.summary.cars, 1)
  const missing = await api('/api/garage/nope/cost', { method: 'POST', json: { label: 'x', usd: 1 } })
  assert.equal(missing.status, 404)
  const home1 = await api('/api/home')
  assert.equal(home1.body.goal, 'rental')
  assert.equal(home1.body.garage.cars, 1)
  assert.equal(home1.body.next.find((n: any) => n.id === 'setup').done, true)
  assert.equal(home1.body.next.find((n: any) => n.id === 'target').done, true)

  const backup = await api('/api/backup')
  assert.equal(backup.status, 200)
  assert.match(backup.headers.get('content-disposition') ?? '', /gavel-backup-/)
  assert.equal(backup.body.files['garage.json'].length, 1)

  // A member sees none of the owner's data, and their restore lands in their own folder only.
  const made = await api('/api/admin/members', { method: 'POST', json: { email: 'kim@example.com' } })
  const kim = await api('/api/login', { method: 'POST', json: { email: 'kim@example.com', code: made.body.code }, noCsrf: true })
  const kimCookie = (kim.headers.get('set-cookie') ?? '').split(';')[0]
  const asKim = (path: string, init: any = {}) => api(path, { ...init, asMember: kimCookie, headers: { ...(init.headers ?? {}), 'x-gavel-csrf': kim.body.csrf } })
  assert.equal((await asKim('/api/garage')).body.summary.cars, 0)
  assert.equal((await asKim('/api/sniper')).body.targets.length, 0)
  assert.equal((await asKim('/api/home')).body.onboarded, false)
  const restore = await asKim('/api/backup', { method: 'POST', json: backup.body })
  assert.equal(restore.status, 200, JSON.stringify(restore.body))
  assert.ok(restore.body.restored.includes('garage.json'))
  assert.equal((await asKim('/api/garage')).body.summary.cars, 1)
  const junk = await asKim('/api/backup', { method: 'POST', json: { files: { 'garage.json': [{ id: 'x' }] } } })
  assert.equal(junk.status, 400)
  assert.match(junk.body.error, /Nothing was restored/)
  assert.equal((await asKim('/api/garage')).body.summary.cars, 1, 'a bad restore changes nothing')
  assert.equal((await api('/api/garage')).body.summary.cars, 1, 'the owner still has exactly their own car')
})

test('import: parse a pasted lot, save it, plan it, see it in the feed; CSV; connect guide', async () => {
  const login = await api('/api/login', { method: 'POST', json: { pin: PIN }, noCsrf: true })
  cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
  csrf = login.body.csrf
  const text = 'TEST FIXTURE\n2016 LEXUS GX 460\nLot #: 41234567\nOdometer: 78,512 mi\nTitle Code: CLEAN\nPrimary Damage: MINOR DENT/SCRATCHES\nHighlights: Run and Drive\nCurrent Bid: $14,250'
  const parsed = await api('/api/import/parse', { method: 'POST', json: { text, url: 'https://www.copart.com/lot/41234567', useAi: false } })
  assert.equal(parsed.status, 200)
  assert.equal(parsed.body.fields.source, 'copart')
  assert.equal(parsed.body.fields.currentBidUsd, 14250)
  assert.equal(parsed.body.usedAi, false)
  const empty = await api('/api/import/parse', { method: 'POST', json: { text: '   ' } })
  assert.equal(empty.status, 400)
  const saved = await api('/api/import', { method: 'POST', json: parsed.body.fields })
  assert.equal(saved.status, 200, JSON.stringify(saved.body))
  assert.equal(saved.body.listing.origin, 'import')
  const id = saved.body.listing.id
  const plan = await api('/api/listing/' + encodeURIComponent(id))
  assert.equal(plan.status, 200)
  assert.ok(plan.body.walkthrough.steps.length === 7)
  const feed = await api('/api/feed?starter=0&sample=1')
  assert.equal(feed.body.kind, 'LIVE', 'imports make the feed LIVE')
  assert.ok(feed.body.cards.some((c: any) => c.listing.id === id))
  const csv = await api('/api/import/csv', { method: 'POST', json: { source: 'iaa', csv: 'Stock #,Year,Make,Model,Odometer,High Bid\n38123456,2019,Toyota,Tacoma,61004,17500\n' } })
  assert.equal(csv.body.added, 1)
  assert.equal((await api('/api/imports')).body.length, 2)
  const rm = await api('/api/imports/' + encodeURIComponent(id), { method: 'DELETE' })
  assert.equal(rm.status, 200)
  const connect = await api('/api/connect')
  assert.equal(connect.status, 200)
  const ids = connect.body.items.map((i: any) => i.id)
  for (const want of ['ebay', 'gsa', 'marketcheck', 'import', 'anthropic', 'pin', 'session', 'hosting', 'stripe']) assert.ok(ids.includes(want), want)
  assert.ok(!JSON.stringify(connect.body).includes('whsec_TESTFIXTURE_secret'), 'no secret value is ever returned')
  assert.equal(connect.body.items.find((i: any) => i.id === 'stripe').done, true)
  assert.equal(connect.body.items.find((i: any) => i.id === 'import').done, true)
})
