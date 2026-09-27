/**
 * THE APP — one small web server, built on node:http, that serves the members'
 * web app and answers its API. It ties together the sources, the estimator,
 * the score, the bid plan, the walkthrough, the stores and the door.
 *
 * Everything under /api needs a signed-in session except the login routes and
 * the Stripe webhook. Every state-changing call carries the session's CSRF
 * token. Bids are PAPER unless live bidding is switched on AND the listing's
 * source can take a bid by API — no connected source can today, so the Bid
 * route always records a paper bid and hands back the lot's URL with the
 * number, and says so in plain words.
 *
 * The API contract lives in BRIEF.md. The UI in web/ is built to it.
 */
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomInt } from 'node:crypto'
import { config } from '../config.ts'
import { BRAND, TAGLINE } from './brand.ts'
import { VERSION } from './version.ts'
import { env, flag, loadEnv } from './env.ts'
import type { BidPlan, Estimate, Listing, Score, SearchQuery } from './types.ts'
import { scanAll, sourceStatuses } from './sources/registry.ts'
import type { ScanResult } from './sources/registry.ts'
import { AUCTION_HOUSES, houseById } from './sources/directory.ts'
import { estimateValue, askingPrice } from './valuation.ts'
import { demandFor } from './demand.ts'
import type { DemandEntry } from './demand.ts'
import { scoreListing } from './scoring.ts'
import { buildPlan } from './bidplan.ts'
import type { PlanInputs } from './bidplan.ts'
import { walkthrough } from './explain.ts'
import type { Walkthrough } from './explain.ts'
import { aiStatus, aiWalkthrough } from './ai.ts'
import { addWatch, listPaper, listWatch, paperSummary, placePaperBid, removeWatch, setOutcome } from './paper.ts'
import { getSettings, updateSettings } from './settings.ts'
import type { Settings } from './settings.ts'
import { GUIDES } from './playbook/content.ts'
import { rentalPicks } from './rental.ts'
import type { RentalUse } from './rental.ts'
import { decodeVin } from './vin.ts'
import { looksLikeVin } from './sources/normalize.ts'
import { newNonce, securityHeaders, withNonce } from './security/harden.ts'
import { Sessions, cookieHeader, clearCookieHeader, parseCookies, sessionSecretFromEnv, COOKIE } from './security/session.ts'
import type { Session } from './security/session.ts'
import { MemberGate, handleStripeEvent, verifyStripeSignature } from './security/members.ts'
import type { StripeEvent } from './security/members.ts'
import { Throttle } from './security/throttle.ts'
import { DATA_DIR, ensureDataDir, readJson, writeJson } from './store.ts'
import { starterCheck } from './filters.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = resolve(HERE, '..', 'web')
const BODY_LIMIT = 256 * 1024
const WEBHOOK_LIMIT = 1024 * 1024
const SCAN_CACHE_MS = 60_000

export type Card = { listing: Listing; estimate: Estimate; score: Score; demand?: { tier: DemandEntry['tier']; why: string } }
export type Feed = { kind: ScanResult['kind']; scannedAt: number; errors: string[]; hidden: number; cards: Card[] }

export type ServerOptions = {
  host?: string
  port?: number
  pin?: string
  sessionSecret?: Buffer
  now?: () => number
  fetchImpl?: typeof fetch
  /** Print the start-up banner. Off in tests. */
  quiet?: boolean
}

type Started = { server: Server; url: string; pin: string; close: () => Promise<void> }

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new HttpError(413, 'That request is too large.'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    req.on('error', (e) => reject(e))
  })
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req, BODY_LIMIT)
  if (!raw.trim()) return {}
  try {
    const v: unknown = JSON.parse(raw)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  } catch {
    /* falls through */
  }
  throw new HttpError(400, 'The request body must be a JSON object.')
}

function num(v: unknown, name: string, opts: { min?: number; max?: number; optional?: boolean } = {}): number | undefined {
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return undefined
    throw new HttpError(400, `${name} is required.`)
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n)) throw new HttpError(400, `${name} must be a number.`)
  if (opts.min !== undefined && n < opts.min) throw new HttpError(400, `${name} must be at least ${opts.min}.`)
  if (opts.max !== undefined && n > opts.max) throw new HttpError(400, `${name} must be at most ${opts.max.toLocaleString('en-US')}.`)
  return n
}

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function clientKey(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown'
}

function isSecure(req: IncomingMessage): boolean {
  return flag('GAVEL_SECURE_COOKIES') || (req.headers['x-forwarded-proto'] ?? '').toString().split(',')[0].trim() === 'https'
}

function safeUrl(u: string | undefined): string | null {
  if (!u) return null
  return /^https?:\/\//i.test(u) ? u : null
}

export async function startServer(opts: ServerOptions = {}): Promise<Started> {
  loadEnv()
  ensureDataDir()
  const now = opts.now ?? Date.now
  const fetchImpl = opts.fetchImpl ?? fetch
  const host = opts.host ?? config.host
  const port = opts.port ?? (Number(env('GAVEL_PORT')) || config.webPort)
  const pin = env('GAVEL_PIN') || opts.pin || String(randomInt(100000, 1000000))
  const secretInfo = opts.sessionSecret ? { secret: opts.sessionSecret, persistent: true } : sessionSecretFromEnv()
  const sessions = new Sessions(secretInfo.secret, 12 * 3600_000, now)
  const gate = new MemberGate({ pin, envCodes: env('GAVEL_MEMBER_CODES').split(',').map((s) => s.trim()).filter(Boolean), throttle: new Throttle(8, 15 * 60_000, now), now })
  const stripeSeen = new Set<string>(readJson<string[]>('stripe-events.json', []))

  /** Every listing seen in any scan this run, so /api/listing and the watchlist can find it. */
  const known = new Map<string, Listing>()
  /** The comparable pool per data kind from the latest scan of that kind. */
  const pools = new Map<Listing['kind'], Listing[]>()
  const scanCache = new Map<string, { at: number; result: ScanResult }>()

  function remember(result: ScanResult): void {
    for (const l of result.listings) known.set(l.id, l)
    if (result.kind !== 'EMPTY') pools.set(result.kind, result.comps)
    for (const w of listWatch()) if (!known.has(w.listingId)) known.set(w.listingId, w.snapshot)
  }

  function cardFor(l: Listing, settings: Settings): Card {
    const pool = pools.get(l.kind) ?? []
    const estimate = estimateValue(l, pool)
    const demand = demandFor(l.make, l.model, settings.demandExtra)
    const score = scoreListing(l, estimate, demand, settings.starter, now())
    return { listing: l, estimate, score, demand: demand ? { tier: demand.tier, why: demand.why } : undefined }
  }

  async function buildFeed(params: URLSearchParams): Promise<Feed> {
    const settings = getSettings()
    const q = str(params.get('q'), 120)
    const make = str(params.get('make'), 40)
    const maxPrice = num(params.get('maxPrice'), 'maxPrice', { optional: true, min: 0, max: 10_000_000 })
    const state = str(params.get('state'), 2).toUpperCase()
    const tier = str(params.get('tier'), 20)
    const starter = params.get('starter') !== '0'
    const allowSample = params.get('sample') !== '0' && settings.allowSample
    const sort = str(params.get('sort'), 10) || 'score'

    const key = JSON.stringify({ q, make, maxPrice, allowSample })
    const hit = scanCache.get(key)
    let result: ScanResult
    let scannedAt: number
    if (hit && now() - hit.at < SCAN_CACHE_MS) {
      result = hit.result
      scannedAt = hit.at
    } else {
      const query: SearchQuery = { text: q || undefined, make: make || undefined, maxPriceUsd: maxPrice, limit: 100 }
      result = await scanAll(query, { allowSample, fetchImpl })
      scannedAt = now()
      scanCache.set(key, { at: scannedAt, result })
      remember(result)
    }

    let cards = result.listings.map((l) => cardFor(l, settings))
    if (make) cards = cards.filter((c) => (c.listing.make ?? '').toLowerCase() === make.toLowerCase())
    if (state) cards = cards.filter((c) => (c.listing.location?.state ?? '').toUpperCase() === state)
    if (maxPrice !== undefined) cards = cards.filter((c) => (askingPrice(c.listing) ?? 0) <= maxPrice)
    if (tier && tier !== 'all') cards = cards.filter((c) => c.demand?.tier === tier)
    if (q && result.kind === 'SAMPLE') {
      const needle = q.toLowerCase()
      cards = cards.filter((c) => c.listing.title.toLowerCase().includes(needle))
    }
    let hidden = 0
    if (starter) {
      const kept = cards.filter((c) => c.score.starterOk)
      hidden = cards.length - kept.length
      cards = kept
    }
    cards.sort((a, b) => {
      if (sort === 'ending') return (a.listing.endsAt ?? Infinity) - (b.listing.endsAt ?? Infinity)
      if (sort === 'price') return (askingPrice(a.listing) ?? Infinity) - (askingPrice(b.listing) ?? Infinity)
      const ua = a.score.grade === 'unpriced' ? 1 : 0
      const ub = b.score.grade === 'unpriced' ? 1 : 0
      return ua - ub || b.score.total - a.score.total
    })
    return { kind: result.kind, scannedAt, errors: result.errors, hidden, cards }
  }

  async function ensureKnown(id: string): Promise<Listing> {
    let l = known.get(id)
    if (!l) {
      // A fresh process: repopulate from the watchlist and a default scan.
      remember(await scanAll({ limit: 100 }, { allowSample: getSettings().allowSample, fetchImpl }))
      l = known.get(id)
    }
    if (!l) throw new HttpError(404, 'That car is not in the current scan any more. Go back to the Feed and open it again.')
    return l
  }

  function planFor(l: Listing, estimate: Estimate, inputs: PlanInputs, settings: Settings): BidPlan {
    const houseId = inputs.houseId ?? l.source
    const feePct = inputs.feePct ?? settings.feeOverrides[houseId]
    return buildPlan(l, estimate, { ...inputs, houseId, feePct })
  }

  function planInputs(body: Record<string, unknown>): PlanInputs {
    const houseId = str(body.houseId, 40) || undefined
    if (houseId && !houseById(houseId) && houseId !== 'sample') throw new HttpError(400, 'Unknown auction house.')
    const marginPct = num(body.marginPct, 'marginPct', { optional: true, min: 0, max: 90 })
    return {
      resaleUsd: num(body.resaleUsd, 'resaleUsd', { optional: true, min: 0, max: 10_000_000 }),
      repairsUsd: num(body.repairsUsd, 'repairsUsd', { optional: true, min: 0, max: 1_000_000 }),
      distanceMiles: num(body.distanceMiles, 'distanceMiles', { optional: true, min: 0, max: 10_000 }),
      feePct: num(body.feePct, 'feePct', { optional: true, min: 0, max: 30 }),
      margin: marginPct !== undefined ? marginPct / 100 : num(body.margin, 'margin', { optional: true, min: 0, max: 0.9 }),
      houseId,
    }
  }

  function requireSession(req: IncomingMessage): Session {
    const s = sessions.read(req.headers.cookie)
    if (!s) throw new HttpError(401, 'Sign in first.')
    return s
  }

  function requireCsrf(req: IncomingMessage, s: Session): void {
    const given = req.headers['x-gavel-csrf']
    if (typeof given !== 'string' || given !== s.csrf) throw new HttpError(403, 'This request is missing its safety token. Reload the page and try again.')
  }

  function requireOwner(s: Session): void {
    if (s.role !== 'owner') throw new HttpError(403, 'Only the owner can do that.')
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string, nonce: string, signedIn: boolean): boolean {
    let decoded: string
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      return false
    }
    if (decoded.includes('..') || decoded.includes('\\') || decoded.includes('\0')) return false
    const rel = decoded === '/' ? '/index.html' : decoded === '/login' ? '/login.html' : decoded
    const file = resolve(WEB_DIR, '.' + rel)
    if (!file.startsWith(WEB_DIR + sep)) return false
    if (!existsSync(file) || !statSync(file).isFile()) return false
    const ext = extname(file).toLowerCase()
    const type = CONTENT_TYPES[ext]
    if (!type) return false
    const headers: Record<string, string> = { 'content-type': type, ...securityHeaders(nonce) }
    if (ext === '.html') {
      if (rel === '/index.html' && !signedIn) {
        res.writeHead(302, { location: '/login', 'cache-control': 'no-store' })
        res.end()
        return true
      }
      headers['cache-control'] = 'no-store'
      res.writeHead(200, headers)
      res.end(withNonce(readFileSync(file, 'utf8'), nonce))
      return true
    }
    headers['cache-control'] = 'public, max-age=300'
    res.writeHead(200, headers)
    res.end(readFileSync(file))
    return true
  }

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const method = req.method ?? 'GET'
    const path = url.pathname
    const parts = path.split('/').filter(Boolean) // ['api', ...]
    const secure = isSecure(req)

    // --- open routes -------------------------------------------------------
    if (path === '/api/login' && method === 'POST') {
      const body = await readJsonBody(req)
      const client = clientKey(req)
      let who: { email: string; role: Session['role'] } | null = null
      if (typeof body.pin === 'string' && body.pin.trim()) {
        const r = gate.loginOwner(client, body.pin)
        if (!r.ok) return json(res, r.status, { error: r.reason })
        who = { email: str(body.email, 200) || 'owner', role: 'owner' }
      } else {
        const r = gate.loginMember(client, body.email, body.code)
        if (!r.ok) return json(res, r.status, { error: r.reason })
        who = { email: r.email ?? str(body.email, 200), role: 'member' }
      }
      const { token, session } = sessions.issue(who)
      return json(res, 200, { email: session.email, role: session.role, csrf: session.csrf }, { 'set-cookie': cookieHeader(token, secure) })
    }
    if (path === '/api/logout' && method === 'POST') {
      const token = parseCookies(req.headers.cookie)[COOKIE]
      if (token) sessions.revoke(token)
      return json(res, 200, { ok: true }, { 'set-cookie': clearCookieHeader() })
    }
    if (path === '/api/stripe/webhook' && method === 'POST') {
      const secret = env('GAVEL_STRIPE_WEBHOOK_SECRET')
      const raw = await readBody(req, WEBHOOK_LIMIT)
      if (!secret) return json(res, 503, { error: 'Webhook secret not set. Add GAVEL_STRIPE_WEBHOOK_SECRET to the host environment.' })
      const sig = req.headers['stripe-signature']
      if (!verifyStripeSignature(raw, typeof sig === 'string' ? sig : undefined, secret, now())) return json(res, 400, { error: 'Bad signature.' })
      let evt: StripeEvent
      try {
        evt = JSON.parse(raw) as StripeEvent
      } catch {
        return json(res, 400, { error: 'The body is not JSON.' })
      }
      if (!evt || typeof evt.id !== 'string' || typeof evt.type !== 'string') return json(res, 400, { error: 'Not a Stripe event.' })
      const out = handleStripeEvent(gate, evt, stripeSeen)
      writeJson('stripe-events.json', [...stripeSeen].slice(-5000))
      if (out.handled) console.log(`[stripe] ${out.action}${out.email ? ` for ${out.email}` : ''}${out.code ? ' — issue their code from the admin page' : ''}`)
      return json(res, 200, { received: true, handled: out.handled, action: out.action })
    }

    // --- everything else needs a session ------------------------------------
    const session = requireSession(req)
    if (method !== 'GET' && method !== 'HEAD') requireCsrf(req, session)

    if (path === '/api/me' && method === 'GET') {
      const ai = await aiStatus()
      return json(res, 200, {
        email: session.email,
        role: session.role,
        csrf: session.csrf,
        version: VERSION,
        brand: BRAND,
        tagline: TAGLINE,
        liveBidding: flag('GAVEL_LIVE_BIDDING'),
        sources: sourceStatuses(),
        ai: { available: ai.available, reason: ai.reason },
        dataDir: session.role === 'owner' ? DATA_DIR : undefined,
      })
    }

    if (path === '/api/feed' && method === 'GET') return json(res, 200, await buildFeed(url.searchParams))

    if (parts[1] === 'listing' && parts.length === 3 && method === 'GET') {
      const id = decodeURIComponent(parts[2])
      const l = await ensureKnown(id)
      const settings = getSettings()
      const card = cardFor(l, settings)
      const plan = planFor(l, card.estimate, {}, settings)
      const wt = walkthrough({ ...card, plan }, houseById(l.source))
      return json(res, 200, { ...card, plan, walkthrough: wt })
    }

    if (path === '/api/plan' && method === 'POST') {
      const body = await readJsonBody(req)
      const l = await ensureKnown(str(body.listingId, 200))
      const settings = getSettings()
      const card = cardFor(l, settings)
      return json(res, 200, planFor(l, card.estimate, planInputs(body), settings))
    }

    if (path === '/api/explain' && method === 'POST') {
      const body = await readJsonBody(req)
      const l = await ensureKnown(str(body.listingId, 200))
      const settings = getSettings()
      const card = cardFor(l, settings)
      const plan = planFor(l, card.estimate, {}, settings)
      const house = houseById(l.source)
      const base = walkthrough({ ...card, plan }, house)
      let out: Walkthrough = base
      let note = 'Explained by the rules. Add ANTHROPIC_API_KEY to turn on the AI explainer.'
      try {
        const ai = await aiWalkthrough({ ...card, plan }, house, base, str(body.question, 1000) || undefined)
        if (ai) {
          out = ai
          note = 'Explained by AI, starting from the rules walkthrough.'
        } else {
          const s = await aiStatus()
          if (!s.available) note = s.reason
        }
      } catch (e) {
        console.error('[explain] AI failed; serving the rules walkthrough.', e instanceof Error ? e.message : e)
        note = 'The AI explainer did not answer this time. This is the rules walkthrough.'
      }
      return json(res, 200, { ...out, note })
    }

    if (path === '/api/bid' && method === 'POST') {
      const body = await readJsonBody(req)
      const l = await ensureKnown(str(body.listingId, 200))
      const maxBidUsd = num(body.maxBidUsd, 'maxBidUsd', { min: 1, max: 5_000_000 })!
      const source = sourceStatuses().find((s) => s.id === l.source)
      const liveWanted = flag('GAVEL_LIVE_BIDDING')
      const liveCapable = !!source?.capabilities.bid
      if (liveWanted && liveCapable) {
        // No source implements this today; the branch exists so the gate is real, not decorative.
        if (l.kind === 'SAMPLE') throw new HttpError(409, 'This is a SAMPLE car. There is no real lot to bid on.')
        throw new HttpError(501, 'Live bidding is switched on but no connected source can place a bid by API yet.')
      }
      const paperBid = placePaperBid(l, maxBidUsd, str(body.note, 500) || undefined)
      const why = !liveWanted
        ? 'Live bidding is switched off (GAVEL_LIVE_BIDDING=0).'
        : `${source?.name ?? l.source} has no bidding API, so nothing can be sent from here.`
      const message = l.kind === 'SAMPLE'
        ? `Recorded as a PAPER bid. This is a SAMPLE car, so there is no real lot to open. Paper means nothing was sent anywhere.`
        : `Recorded as a PAPER bid of $${Math.round(maxBidUsd).toLocaleString('en-US')}. ${why} Nothing was sent to the auction. Open the lot and place the real bid on the auction's own site, and never go above this number.`
      console.log(`[bid] PAPER ${l.id} max $${Math.round(maxBidUsd)} by ${session.email}`)
      return json(res, 200, { mode: 'PAPER', paperBid, openUrl: l.kind === 'SAMPLE' ? null : safeUrl(l.url), message })
    }

    if (path === '/api/watchlist' && method === 'GET') return json(res, 200, listWatch())
    if (path === '/api/watchlist' && method === 'POST') {
      const body = await readJsonBody(req)
      const l = await ensureKnown(str(body.listingId, 200))
      return json(res, 200, addWatch(l))
    }
    if (parts[1] === 'watchlist' && parts.length === 3 && method === 'DELETE') return json(res, 200, removeWatch(decodeURIComponent(parts[2])))

    if (path === '/api/paper' && method === 'GET') return json(res, 200, { bids: listPaper(), summary: paperSummary() })
    if (parts[1] === 'paper' && parts.length === 4 && parts[3] === 'outcome' && method === 'POST') {
      const body = await readJsonBody(req)
      const outcome = str(body.outcome, 20)
      if (outcome !== 'won' && outcome !== 'lost' && outcome !== 'withdrawn') throw new HttpError(400, 'Outcome must be won, lost or withdrawn.')
      const bid = setOutcome(decodeURIComponent(parts[2]), outcome)
      if (!bid) throw new HttpError(404, 'No paper bid with that id.')
      return json(res, 200, bid)
    }

    if (path === '/api/auctions' && method === 'GET') {
      const q = str(url.searchParams.get('q'), 120)
      const houses = AUCTION_HOUSES.map((h) => ({
        id: h.id, name: h.name, url: h.url, access: h.access, best: h.best, inventory: h.inventory, register: h.register,
        buyerFee: h.buyerFee, feeUrl: h.feeUrl, api: h.api, bidApi: h.bidApi, inPerson: h.inPerson, starterNote: h.starterNote,
        searchUrl: h.searchUrl(q || 'cars'),
      }))
      return json(res, 200, { houses, sources: sourceStatuses() })
    }

    if (path === '/api/playbook' && method === 'GET') return json(res, 200, { guides: GUIDES })

    if (path === '/api/rental' && method === 'GET') {
      const budget = num(url.searchParams.get('budget'), 'budget', { optional: true, min: 0, max: 10_000_000 }) ?? 0
      const use = str(url.searchParams.get('use'), 10) as RentalUse
      if (use !== 'p2p' && use !== 'fleet' && use !== 'flip') throw new HttpError(400, 'use must be p2p, fleet or flip.')
      return json(res, 200, rentalPicks(budget, use))
    }

    if (parts[1] === 'vin' && parts.length === 3 && method === 'GET') {
      const vin = decodeURIComponent(parts[2]).trim().toUpperCase()
      if (!looksLikeVin(vin)) throw new HttpError(400, 'A VIN is 17 letters and digits, with no I, O or Q.')
      try {
        return json(res, 200, await decodeVin(vin, fetchImpl))
      } catch (e) {
        throw new HttpError(502, e instanceof Error ? e.message : 'The VIN service did not answer.')
      }
    }

    if (path === '/api/settings' && method === 'GET') return json(res, 200, getSettings())
    if (path === '/api/settings' && method === 'POST') {
      const body = await readJsonBody(req)
      try {
        const next = updateSettings(body)
        scanCache.clear()
        return json(res, 200, next)
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : 'Those settings were not accepted.')
      }
    }

    if (parts[1] === 'admin') {
      requireOwner(session)
      if (path === '/api/admin/members' && method === 'GET') return json(res, 200, gate.listMembers())
      if (path === '/api/admin/members' && method === 'POST') {
        const body = await readJsonBody(req)
        try {
          const made = gate.createMember(str(body.email, 200))
          console.log(`[members] code issued for ${made.member.email} by the owner`)
          return json(res, 200, made)
        } catch (e) {
          throw new HttpError(400, e instanceof Error ? e.message : 'Could not add that member.')
        }
      }
      if (parts[2] === 'members' && parts.length === 4 && method === 'DELETE') {
        const removed = gate.removeMember(decodeURIComponent(parts[3]))
        if (!removed) throw new HttpError(404, 'No member with that email.')
        return json(res, 200, { ok: true })
      }
    }

    throw new HttpError(404, 'No such API route.')
  }

  const server = createServer(async (req, res) => {
    const nonce = newNonce()
    try {
      const url = new URL(req.url ?? '/', 'http://local')
      if (url.pathname.startsWith('/api/')) {
        for (const [k, v] of Object.entries(securityHeaders(nonce))) res.setHeader(k, v)
        await api(req, res, url)
        return
      }
      const signedIn = sessions.read(req.headers.cookie) !== null
      if (url.pathname === '/login' && signedIn) {
        res.writeHead(302, { location: '/', 'cache-control': 'no-store' })
        res.end()
        return
      }
      if (serveStatic(req, res, url.pathname, nonce, signedIn)) return
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...securityHeaders(nonce) })
      res.end('Not found.')
    } catch (e) {
      if (res.headersSent) {
        res.end()
        return
      }
      if (e instanceof HttpError) return json(res, e.status, { error: e.message })
      console.error('[server]', e instanceof Error ? e.stack ?? e.message : e)
      json(res, 500, { error: 'Something went wrong on the server. The details are in the server log.' })
    }
  })

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolvePromise())
  })
  const addr = server.address()
  const actualPort = typeof addr === 'object' && addr ? addr.port : port
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}`

  if (!opts.quiet) {
    const live = sourceStatuses().filter((s) => s.kind === 'api' && s.connected).map((s) => s.name)
    console.log('')
    console.log(`  ${BRAND} ${VERSION} — ${TAGLINE}`)
    console.log(`  Open:        ${url}`)
    console.log(`  Owner PIN:   ${pin}   (sign in on the Owner tab; set GAVEL_PIN in .env to keep it fixed)`)
    console.log(`  Members:     sign in with email + access code (issue codes on the Admin page, or set GAVEL_MEMBER_CODES)`)
    console.log(`  Sources:     ${live.length ? `LIVE from ${live.join(', ')}` : 'none connected — the feed shows SAMPLE cars, labelled, until you add a source (see .env.example)'}`)
    console.log(`  Bidding:     PAPER. ${flag('GAVEL_LIVE_BIDDING') ? 'GAVEL_LIVE_BIDDING=1 is set, but no connected source can take a bid by API, so bids still stay on paper.' : 'Live bidding is off (GAVEL_LIVE_BIDDING=0).'}`)
    if (!secretInfo.persistent) console.log(`  Sessions:    reset on restart. Set GAVEL_SESSION_SECRET (32+ characters) in .env to keep members signed in.`)
    console.log(`  Data:        ${DATA_DIR}`)
    console.log('')
  }

  return {
    server,
    url,
    pin,
    close: () => new Promise<void>((resolvePromise) => server.close(() => resolvePromise())),
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  startServer().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
