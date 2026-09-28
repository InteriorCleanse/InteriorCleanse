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
import { DATA_DIR, PERSONAL_FILES, adoptLegacyFiles, currentUser, ensureDataDir, listUserScopes, readJson, userFile, withUser, writeJson } from './store.ts'
import { addCar, addCost, addIncome, garageSummary, listGarage, removeCar, removeEntry, totalsFor, updateCar, validateGarageFile } from './garage.ts'
import { validateTarget } from './sniper/targets.ts'
import { listImports, removeImport, saveImports } from './imports.ts'
import { listingFromImport, parseCsvImport, parseLotText } from './sources/importer.ts'
import { aiExtractLot } from './research/extract.ts'
import { marketcheckComps, marketcheckConfigured } from './sources/marketcheck.ts'
import { createHash } from 'node:crypto'
import { HOUSE_POLICIES, REGULATIONS, GLOSSARY, searchKnowledge } from './knowledge/index.ts'
import { carIntel, intelSummary } from './research/intel.ts'
import { researchAvailable, webResearch } from './research/web.ts'
import { CATALOG } from './catalog.ts'
import { listTargets, saveTarget, removeTarget } from './sniper/targets.ts'
import type { Target } from './sniper/targets.ts'
import { pickFor } from './sniper/engine.ts'
import type { Pick } from './sniper/engine.ts'
import { addAlert, alreadyFired, listAlerts, markAlertsRead } from './sniper/alerts.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = resolve(HERE, '..', 'web')
const BODY_LIMIT = 256 * 1024
const WEBHOOK_LIMIT = 1024 * 1024
const SCAN_CACHE_MS = 60_000
/** The owner's session email and the name of the owner's data folder. */
const OWNER_EMAIL = 'owner'

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
  /** How often the sniper rescans its targets. 0 turns the clock off (tests). */
  sniperIntervalMs?: number
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
  const movedLegacy = adoptLegacyFiles(OWNER_EMAIL)
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

  /** A short fingerprint of a member's imports, so the scan cache never hands one member's lots to another. */
  function importsSignature(extra: Listing[]): string {
    if (!extra.length) return ''
    return `${currentUser() ?? ''}:${createHash('sha256').update(extra.map((l) => `${l.id}@${l.fetchedAt}`).join('|')).digest('hex').slice(0, 16)}`
  }

  /** Extra comparables for one LIVE car: MarketCheck dealer prices for its make and model, when connected. */
  async function extraComps(l: Listing): Promise<Listing[]> {
    if (l.kind !== 'LIVE' || !l.make || !l.model || !marketcheckConfigured()) return []
    try { return await marketcheckComps(l.make, l.model, fetchImpl) } catch { return [] }
  }

  function remember(result: ScanResult): void {
    for (const l of result.listings) known.set(l.id, l)
    if (result.kind !== 'EMPTY') pools.set(result.kind, result.comps)
    for (const w of listWatch()) if (!known.has(w.listingId)) known.set(w.listingId, w.snapshot)
  }

  function cardFor(l: Listing, settings: Settings, extraPool: Listing[] = []): Card {
    const pool = extraPool.length ? [...(pools.get(l.kind) ?? []), ...extraPool] : pools.get(l.kind) ?? []
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

    const extra = listImports()
    const key = JSON.stringify({ q, make, maxPrice, allowSample, imports: importsSignature(extra) })
    const hit = scanCache.get(key)
    let result: ScanResult
    let scannedAt: number
    if (hit && now() - hit.at < SCAN_CACHE_MS) {
      result = hit.result
      scannedAt = hit.at
    } else {
      const query: SearchQuery = { text: q || undefined, make: make || undefined, maxPriceUsd: maxPrice, limit: 100 }
      result = await scanAll(query, { allowSample, fetchImpl, extra })
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

  /** Scan one query (cached like the feed) and score every car, starter rules not applied. */
  async function scanCards(text: string | undefined, settings: Settings): Promise<{ cards: Card[]; kind: ScanResult['kind']; errors: string[] }> {
    const allowSample = settings.allowSample
    const extra = listImports()
    const key = JSON.stringify({ q: text ?? '', make: '', maxPrice: undefined, allowSample, imports: importsSignature(extra) })
    const hit = scanCache.get(key)
    let result: ScanResult
    if (hit && now() - hit.at < SCAN_CACHE_MS) result = hit.result
    else {
      result = await scanAll({ text, limit: 100 }, { allowSample, fetchImpl, extra })
      scanCache.set(key, { at: now(), result })
      remember(result)
    }
    return { cards: result.listings.map((l) => cardFor(l, settings)), kind: result.kind, errors: result.errors }
  }

  type SniperState = { lastRun: number; picks: Pick[]; running: Promise<{ picks: Pick[]; fired: number }> | null }
  /** Sniper state per member. The key is the member's email; every store call inside runs in that member's scope. */
  const sniper = new Map<string, SniperState>()
  function sniperFor(email: string): SniperState {
    let st = sniper.get(email)
    if (!st) { st = { lastRun: 0, picks: [], running: null }; sniper.set(email, st) }
    return st
  }

  /** Run every active target of the current member: scan, match, rank, and (when armed) fire a PAPER bid once per car. */
  function runSniper(): Promise<{ picks: Pick[]; fired: number }> {
    const email = currentUser() ?? OWNER_EMAIL
    const st = sniperFor(email)
    if (st.running) return st.running
    st.running = (async () => {
      const settings = getSettings()
      const targets = listTargets().filter((t) => t.active)
      const picks: Pick[] = []
      let fired = 0
      for (const target of targets) {
        const queries = target.makes.length
          ? target.makes.flatMap((mk) => (target.models.length ? target.models.map((md) => `${mk} ${md}`) : [mk])).slice(0, 6)
          : target.models.length ? target.models.slice(0, 6) : [undefined]
        const seen = new Set<string>()
        for (const q of queries) {
          let scanned: { cards: Card[] }
          try { scanned = await scanCards(q, settings) } catch { continue }
          for (const card of scanned.cards) {
            if (seen.has(card.listing.id)) continue
            seen.add(card.listing.id)
            const plan = planFor(card.listing, card.estimate, {}, settings)
            const pick = pickFor(target, card, plan, now())
            if (!pick) continue
            picks.push(pick)
            if (target.armed && !alreadyFired(target.id, card.listing.id)) {
              const bid = placePaperBid(card.listing, pick.fire.maxBidUsd, `Sniper "${target.name}": ${pick.fire.method}`)
              addAlert({ kind: 'paper-fired', targetId: target.id, listingId: card.listing.id, title: `PAPER bid fired: ${card.listing.title}`, body: `${target.name} recorded a paper bid of $${bid.maxBidUsd.toLocaleString('en-US')} (${pick.fire.method}). Nothing was sent to the auction. ${pick.fire.why}` }, now())
              fired++
              console.log(`[sniper] PAPER fired ${card.listing.id} $${bid.maxBidUsd} for a target`)
            } else if (!listAlerts().some((a) => a.kind === 'pick' && a.targetId === target.id && a.listingId === card.listing.id)) {
              addAlert({ kind: 'pick', targetId: target.id, listingId: card.listing.id, title: `New pick for ${target.name}: ${card.listing.title}`, body: `Score ${card.score.total} (${card.score.grade}). Never bid above $${pick.fire.maxBidUsd.toLocaleString('en-US')}. ${pick.fire.why}` }, now())
            }
          }
        }
      }
      picks.sort((a, b) => b.fit - a.fit)
      st.picks = picks
      st.lastRun = now()
      return { picks, fired }
    })().finally(() => { st.running = null })
    return st.running
  }

  /** Run the sniper for every member who has an active target. */
  function runAllSnipers(): void {
    const emails = new Set<string>([OWNER_EMAIL, ...listUserScopes().map((u) => u.email)])
    for (const email of emails) {
      withUser(email, () => {
        if (listTargets().some((t) => t.active)) runSniper().catch((e) => console.error('[sniper]', e instanceof Error ? e.message : e))
      })
    }
  }

  const sniperEvery = opts.sniperIntervalMs ?? 10 * 60_000
  let sniperTimer: NodeJS.Timeout | null = null
  if (sniperEvery > 0) {
    sniperTimer = setInterval(runAllSnipers, sniperEvery)
    sniperTimer.unref()
    // A fresh process has no picks in memory: hunt once soon after start.
    const kick = setTimeout(runAllSnipers, 3_000)
    kick.unref()
  }

  function serialisePick(p: Pick): Record<string, unknown> {
    return { targetId: p.targetId, targetName: p.targetName, card: p.card, plan: p.plan, fire: p.fire, fit: p.fit, reasons: p.reasons }
  }

  async function ensureKnown(id: string): Promise<Listing> {
    let l = known.get(id)
    if (!l) {
      // A fresh process: repopulate from the watchlist and a default scan.
      remember(await scanAll({ limit: 100 }, { allowSample: getSettings().allowSample, fetchImpl }))
      l = known.get(id)
    }
    if (!l) l = listImports().find((x) => x.id === id)
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
        who = { email: OWNER_EMAIL, role: 'owner' }
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
    return withUser(session.email, () => authed(req, res, url, session))
  }

  /** Every signed-in route. Runs inside the member's data scope. */
  async function authed(req: IncomingMessage, res: ServerResponse, url: URL, session: Session): Promise<void> {
    const method = req.method ?? 'GET'
    const path = url.pathname
    const parts = path.split('/').filter(Boolean)

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
        research: await researchAvailable(),
        sniper: { unread: listAlerts().filter((a) => !a.read).length, targets: listTargets().filter((t) => t.active).length },
        dataDir: session.role === 'owner' ? DATA_DIR : undefined,
      })
    }

    if (path === '/api/feed' && method === 'GET') return json(res, 200, await buildFeed(url.searchParams))

    if (parts[1] === 'listing' && parts.length === 3 && method === 'GET') {
      const id = decodeURIComponent(parts[2])
      const l = await ensureKnown(id)
      const settings = getSettings()
      const card = cardFor(l, settings, await extraComps(l))
      const plan = planFor(l, card.estimate, {}, settings)
      const wt = walkthrough({ ...card, plan }, houseById(l.source))
      return json(res, 200, { ...card, plan, walkthrough: wt })
    }

    if (path === '/api/plan' && method === 'POST') {
      const body = await readJsonBody(req)
      const l = await ensureKnown(str(body.listingId, 200))
      const settings = getSettings()
      const card = cardFor(l, settings, await extraComps(l))
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

    if (path === '/api/knowledge' && method === 'GET') return json(res, 200, { policies: HOUSE_POLICIES, regulations: REGULATIONS, glossary: GLOSSARY })
    if (path === '/api/knowledge/search' && method === 'GET') return json(res, 200, { hits: searchKnowledge(str(url.searchParams.get('q'), 200)) })
    if (path === '/api/catalog' && method === 'GET') return json(res, 200, { makes: CATALOG })

    if (path === '/api/intel' && method === 'GET') {
      const year = num(url.searchParams.get('year'), 'year', { min: 1950, max: 2050 })!
      const make = str(url.searchParams.get('make'), 40)
      const model = str(url.searchParams.get('model'), 60)
      if (!make || !model) throw new HttpError(400, 'Give a make and a model.')
      const timed: typeof fetch = (input, init) => fetchImpl(input, { ...init, signal: AbortSignal.timeout(8_000) })
      const intel = await carIntel(year, make, model, timed, now())
      return json(res, 200, { ...intel, summary: intelSummary(intel), source: 'NHTSA and fueleconomy.gov, public data, no key' })
    }

    if (path === '/api/research' && method === 'POST') {
      const body = await readJsonBody(req)
      const question = str(body.question, 1000)
      if (!question) throw new HttpError(400, 'Ask a question first.')
      let context = ''
      const listingId = str(body.listingId, 200)
      if (listingId && known.has(listingId)) {
        const l = known.get(listingId)!
        context = `Listing: ${l.title}, ${l.year ?? ''} ${l.make ?? ''} ${l.model ?? ''}, ${l.mileage ?? 'unknown'} miles, title ${l.titleStatus}, damage ${l.damage}, source ${l.source}, kind ${l.kind}.`
      }
      const hits = searchKnowledge(question, 6)
      const status = await researchAvailable()
      if (!status.available) return json(res, 200, { source: 'knowledge', hits, note: status.reason })
      try {
        const r = await webResearch(question, context)
        if (!r) return json(res, 200, { source: 'knowledge', hits, note: 'The web desk did not answer this time. These are the built-in notes.' })
        return json(res, 200, { source: 'web', ...r, hits, note: 'AI research from live web pages, with the sources it read. Verify a fee or a rule on the official page before you act on it.' })
      } catch (e) {
        console.error('[research]', e instanceof Error ? e.message : e)
        return json(res, 200, { source: 'knowledge', hits, note: 'The web desk hit an error. These are the built-in notes.' })
      }
    }

    if (parts[1] === 'sniper') {
      if (path === '/api/sniper' && method === 'GET') {
        const alerts = listAlerts()
        const st = sniperFor(session.email)
        return json(res, 200, { targets: listTargets(), picks: st.picks.map(serialisePick), alerts: alerts.slice(0, 50), unread: alerts.filter((a) => !a.read).length, lastRunAt: st.lastRun || null, everyMs: sniperEvery, paper: true })
      }
      if (path === '/api/sniper/targets' && method === 'POST') {
        const body = await readJsonBody(req)
        try { return json(res, 200, saveTarget(body)) } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : 'That target was not accepted.') }
      }
      if (parts[2] === 'targets' && parts.length === 4 && method === 'POST') {
        const body = await readJsonBody(req)
        try { return json(res, 200, saveTarget(body, decodeURIComponent(parts[3]))) } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : 'That target was not accepted.') }
      }
      if (parts[2] === 'targets' && parts.length === 4 && method === 'DELETE') {
        if (!removeTarget(decodeURIComponent(parts[3]))) throw new HttpError(404, 'No target with that id.')
        return json(res, 200, { ok: true })
      }
      if (path === '/api/sniper/run' && method === 'POST') {
        const r = await runSniper()
        return json(res, 200, { picks: r.picks.map(serialisePick), fired: r.fired, ranAt: sniperFor(session.email).lastRun, paper: true })
      }
      if (path === '/api/sniper/alerts/read' && method === 'POST') return json(res, 200, { read: markAlertsRead() })
    }

    if (path === '/api/import/parse' && method === 'POST') {
      const body = await readJsonBody(req)
      const text = typeof body.text === 'string' ? body.text.slice(0, 60_000) : ''
      const pageUrl = str(body.url, 500)
      if (!text.trim()) throw new HttpError(400, 'Paste the lot page text first.')
      const parsed = parseLotText(text, pageUrl || undefined)
      let usedAi = false
      if ((!parsed.fields.title || (parsed.fields.currentBidUsd === undefined && parsed.fields.buyNowUsd === undefined)) && body.useAi !== false) {
        const ai = await aiExtractLot(text, pageUrl || undefined)
        if (ai) {
          usedAi = true
          for (const [k, v] of Object.entries(ai)) if (v !== undefined && (parsed.fields as Record<string, unknown>)[k] === undefined) (parsed.fields as Record<string, unknown>)[k] = v
          parsed.found = Object.entries(parsed.fields).filter(([k, v]) => v !== undefined && k !== 'source').map(([k]) => k)
          parsed.missing = parsed.missing.filter((k) => (parsed.fields as Record<string, unknown>)[k] === undefined)
        }
      }
      return json(res, 200, { ...parsed, usedAi })
    }
    if (path === '/api/import' && method === 'POST') {
      const body = await readJsonBody(req)
      let listing: Listing
      try { listing = listingFromImport(body, now()) } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : 'That lot was not saved.') }
      saveImports([listing])
      known.set(listing.id, listing)
      const settings = getSettings()
      return json(res, 200, cardFor(listing, settings, await extraComps(listing)))
    }
    if (path === '/api/import/csv' && method === 'POST') {
      const body = await readJsonBody(req)
      const csv = typeof body.csv === 'string' ? body.csv : ''
      if (!csv.trim()) throw new HttpError(400, 'Choose a CSV file first.')
      const src = str(body.source, 20) || 'other'
      const parsed = parseCsvImport(csv, src)
      const listings: Listing[] = []
      let bad = 0
      for (const row of parsed.rows) {
        try { listings.push(listingFromImport({ ...row, source: row.source === 'other' ? src : row.source }, now())) } catch { bad++ }
      }
      if (listings.length) saveImports(listings)
      for (const l of listings) known.set(l.id, l)
      return json(res, 200, { added: listings.length, skipped: parsed.skipped + bad, used: parsed.used })
    }
    if (path === '/api/imports' && method === 'GET') return json(res, 200, listImports())
    if (parts[1] === 'imports' && parts.length === 3 && method === 'DELETE') {
      if (!removeImport(decodeURIComponent(parts[2]))) throw new HttpError(404, 'No imported lot with that id.')
      return json(res, 200, { ok: true })
    }

    if (path === '/api/connect' && method === 'GET') {
      const owner = session.role === 'owner'
      const st = Object.fromEntries(sourceStatuses().filter((x) => x.kind === 'api').map((x) => [x.id, x.connected]))
      const ai = await aiStatus()
      const items: Array<{ id: string; group: string; name: string; done: boolean; unlocks: string; cost: string; steps: string[]; env: string[]; link?: string; ownerOnly?: boolean }> = [
        { id: 'ebay', group: 'Auction sources', name: 'eBay Motors', done: !!st.ebay, unlocks: 'Live eBay Motors auctions and Buy It Now cars in the feed and the Sniper.', cost: 'Free developer account.', link: 'https://developer.ebay.com', env: ['GAVEL_EBAY_CLIENT_ID', 'GAVEL_EBAY_CLIENT_SECRET'], steps: ['Sign in at developer.ebay.com with your eBay account and join the developer programme.', 'Open Application Keys and create a Production keyset.', 'Copy the App ID into GAVEL_EBAY_CLIENT_ID and the Cert ID into GAVEL_EBAY_CLIENT_SECRET.', 'Restart Gavel. The chip at the top turns LIVE.'] },
        { id: 'gsa', group: 'Auction sources', name: 'GSA Auctions (federal surplus)', done: !!st.gsa, unlocks: 'Government fleet cars, trucks and SUVs, live, with no buyer premium.', cost: 'Free.', link: 'https://api.data.gov/signup/', env: ['GAVEL_GSA_API_KEY', 'or GAVEL_GSA=1 to try with DEMO_KEY'], steps: ['Fill in the short form at api.data.gov/signup; the key arrives by email in a minute.', 'Put it in GAVEL_GSA_API_KEY. (To try it first, GAVEL_GSA=1 uses the shared demo key, which is rate-limited.)', 'Restart Gavel.'] },
        { id: 'marketcheck', group: 'Auction sources', name: 'MarketCheck (dealers and auctions)', done: !!st.marketcheck, unlocks: 'Auction lots in the feed, and dealer asking prices from across the country behind every estimate. The biggest single upgrade to pricing.', cost: 'Paid API plan; ask them for trial data. Check current pricing on their site.', link: 'https://www.marketcheck.com/apis/', env: ['GAVEL_MARKETCHECK_API_KEY', 'GAVEL_MARKETCHECK_AUCTION_PATH (only if your plan uses a different path)'], steps: ['Create an account at marketcheck.com/apis and choose a plan that includes Inventory Search and Auction Inventory Search.', 'Copy your API key into GAVEL_MARKETCHECK_API_KEY.', 'If your dashboard shows a different auction search path than search/car/auction/active, put that path in GAVEL_MARKETCHECK_AUCTION_PATH.', 'Restart Gavel.'] },
        { id: 'import', group: 'Auction sources', name: 'Copart, IAA, Bring a Trailer, Cars & Bids and every other house', done: listImports().length > 0, unlocks: 'Any lot you are looking at, scored against live comparables with a full bid plan.', cost: 'Free. Copart and IAA need their own membership to bid.', env: [], steps: ['Open Import in Gavel and drag the Send to Gavel button to your bookmarks bar.', 'On any lot page (Copart, IAA, BaT, Cars & Bids, GovDeals, a dealer), click the bookmark.', 'Check the fields Gavel found, fill any blanks, save. The car appears in your feed and can be planned and watched.', 'For many lots at once, export a CSV from your auction account and upload it on the same screen.'] },
        { id: 'anthropic', group: 'Intelligence', name: 'Claude (the AI explainer, web research and lot reader)', done: ai.available, unlocks: 'Walkthroughs rewritten for each car, a research desk that searches the live web with sources, and a reader for messy lot pages.', cost: 'Pay as you go; see the Anthropic pricing page.', link: 'https://console.anthropic.com', env: ['ANTHROPIC_API_KEY'], steps: ['Create an account at console.anthropic.com and add a payment method.', 'Create an API key and put it in ANTHROPIC_API_KEY.', 'Run npm install once in the Gavel folder, then restart.'] },
      ]
      if (owner) {
        items.push(
          { id: 'pin', group: 'Running it', name: 'A fixed owner PIN', done: !!env('GAVEL_PIN'), unlocks: 'The same PIN every start.', cost: 'Free.', env: ['GAVEL_PIN'], steps: ['Pick six digits nobody would guess and put them in GAVEL_PIN.'], ownerOnly: true },
          { id: 'session', group: 'Running it', name: 'Members stay signed in across restarts', done: env('GAVEL_SESSION_SECRET').length >= 32, unlocks: 'Nobody is signed out when you restart or update Gavel.', cost: 'Free.', env: ['GAVEL_SESSION_SECRET'], steps: ['Put 32 or more random characters in GAVEL_SESSION_SECRET (a password manager can generate them).', 'Never share it and never put it in the code.'], ownerOnly: true },
          { id: 'hosting', group: 'Running it', name: 'On the internet, behind HTTPS', done: flag('GAVEL_SECURE_COOKIES'), unlocks: 'Subscribers can sign in from anywhere.', cost: 'A small always-on server with a disk; see docs/GO_LIVE.md for options.', env: ['GAVEL_HOST=0.0.0.0', 'GAVEL_SECURE_COOKIES=1'], steps: ['Rent a small server that keeps running and keeps its files (a VPS, or a platform with a persistent disk).', 'Install Node 22, copy the Gavel folder, fill in the environment, and run npm start as a service.', 'Put HTTPS in front with Caddy or your platform, point your domain at it, and set GAVEL_SECURE_COOKIES=1.'], ownerOnly: true },
          { id: 'stripe', group: 'Getting paid', name: 'Stripe subscriptions', done: !!env('GAVEL_STRIPE_WEBHOOK_SECRET'), unlocks: 'A paid checkout creates the member automatically; a cancelled one switches them off.', cost: 'Stripe takes a fee per payment; see their pricing.', link: 'https://dashboard.stripe.com', env: ['GAVEL_STRIPE_WEBHOOK_SECRET'], steps: ['In Stripe, create a product with a monthly price and a Payment Link for it.', 'Add a webhook endpoint at https://your-domain/api/stripe/webhook with checkout.session.completed, customer.subscription.updated and customer.subscription.deleted.', 'Copy the endpoint signing secret into GAVEL_STRIPE_WEBHOOK_SECRET on the server.', 'When someone pays, issue their code on the Members page and send it to them.'], ownerOnly: true },
        )
      }
      return json(res, 200, { items, done: items.filter((i) => i.done).length, total: items.length })
    }

    if (path === '/api/home' && method === 'GET') {
      const settings = getSettings()
      const st = sniperFor(session.email)
      const t = now()
      const targets = listTargets()
      const alerts = listAlerts()
      const watch = listWatch()
      const paper = listPaper()
      const garage = garageSummary(t)
      const endingSoon = st.picks
        .filter((p) => p.card.listing.endsAt && p.card.listing.endsAt > t)
        .sort((a, b) => (a.card.listing.endsAt ?? 0) - (b.card.listing.endsAt ?? 0))
        .slice(0, 4)
      const liveSource = sourceStatuses().some((x) => x.kind === 'api' && x.connected)
      const next: Array<{ id: string; title: string; body: string; href: string; done: boolean }> = [
        { id: 'setup', title: 'Tell Gavel what you are after', body: 'Four questions: your goal, your state, your budget, and the cars you like.', href: '#setup', done: settings.onboarded },
        { id: 'source', title: 'Connect a live auction source', body: 'eBay Motors and GSA Auctions are free to connect. The Connect screen walks you through each one.', href: '#connect', done: liveSource },
        { id: 'import', title: 'Bring in a lot from Copart, IAA or any auction', body: 'Add the Send to Gavel button once, then one click on any lot page scores it and plans your bid.', href: '#import', done: listImports().length > 0 },
        { id: 'target', title: 'Set your first Sniper target', body: 'Makes, models, years and the most you will spend. It watches for you.', href: '#sniper', done: targets.length > 0 },
        { id: 'learn', title: 'Read "Your first auction car"', body: 'Twelve minutes that save you from the expensive mistakes.', href: '#playbook/first-car', done: false },
        { id: 'paper', title: 'Place three PAPER bids', body: 'Practise the number before you spend a dollar. Record how each one ended.', href: '#feed', done: paper.length >= 3 },
        { id: 'garage', title: settings.goal === 'rental' ? 'Log your first rental car in the Garage' : 'Log your first car in the Garage', body: 'Every cost in, every dollar out. The ledger tells you if the business works.', href: '#garage', done: garage.cars > 0 },
      ]
      return json(res, 200, {
        goal: settings.goal ?? null,
        onboarded: settings.onboarded,
        liveSource,
        sniper: { targets: targets.length, active: targets.filter((x) => x.active).length, armed: targets.filter((x) => x.armed).length, picks: st.picks.length, lastRunAt: st.lastRun || null, endingSoon: endingSoon.map(serialisePick) },
        alerts: { unread: alerts.filter((a) => !a.read).length, latest: alerts.slice(0, 5) },
        watch: watch.slice(0, 6).map((w) => ({ listingId: w.listingId, title: w.title, endsAt: w.snapshot?.endsAt ?? null, priceUsd: w.snapshot ? (w.snapshot.currentBidUsd ?? w.snapshot.buyNowUsd ?? null) : null, kind: w.snapshot?.kind ?? null })),
        paper: paperSummary(),
        garage,
        next,
      })
    }

    if (path === '/api/onboard' && method === 'POST') {
      const body = await readJsonBody(req)
      const goal = str(body.goal, 10)
      if (goal !== 'rental' && goal !== 'flip' && goal !== 'keep') throw new HttpError(400, 'Pick a goal: rental, flip or keep.')
      const homeState = str(body.homeState, 2).toUpperCase()
      if (homeState && !/^[A-Z]{2}$/.test(homeState)) throw new HttpError(400, 'Your state is two letters, for example TX.')
      const budget = num(body.budgetUsd, 'budgetUsd', { min: 500, max: 5_000_000 })!
      const makes = Array.isArray(body.makes) ? (body.makes as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 12) : []
      const models = Array.isArray(body.models) ? (body.models as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 20) : []
      try {
        const settings = updateSettings({ onboarded: true, goal, homeState: homeState || null, starter: { maxPriceUsd: Math.max(budget, 1000) } })
        const target = saveTarget({ name: goal === 'rental' ? 'My first rental car' : goal === 'flip' ? 'My first flip' : 'My next car', makes, models, maxBudgetUsd: budget, minScore: 60, starterOnly: true, armed: false, active: true })
        scanCache.clear()
        runSniper().catch(() => {})
        return json(res, 200, { settings, target })
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : 'Setup was not saved.')
      }
    }

    if (parts[1] === 'garage') {
      const t = now()
      const withTotals = (c: ReturnType<typeof listGarage>[number]) => ({ ...c, totals: totalsFor(c, t) })
      try {
        if (path === '/api/garage' && method === 'GET') return json(res, 200, { cars: listGarage().map(withTotals), summary: garageSummary(t) })
        if (path === '/api/garage' && method === 'POST') return json(res, 200, withTotals(addCar(await readJsonBody(req), t)))
        const id = parts[2] ? decodeURIComponent(parts[2]) : ''
        if (id && parts.length === 3 && method === 'POST') return json(res, 200, withTotals(updateCar(id, await readJsonBody(req), t)))
        if (id && parts.length === 3 && method === 'DELETE') {
          if (!removeCar(id)) throw new HttpError(404, 'No car with that id in your garage.')
          return json(res, 200, { ok: true })
        }
        if (id && parts[3] === 'cost' && method === 'POST') return json(res, 200, withTotals(addCost(id, await readJsonBody(req), t)))
        if (id && parts[3] === 'income' && method === 'POST') return json(res, 200, withTotals(addIncome(id, await readJsonBody(req), t)))
        if (id && parts[3] === 'entry' && parts[4] && method === 'DELETE') return json(res, 200, withTotals(removeEntry(id, decodeURIComponent(parts[4]), t)))
      } catch (e) {
        if (e instanceof HttpError) throw e
        throw new HttpError(/No car|No entry/.test(e instanceof Error ? e.message : '') ? 404 : 400, e instanceof Error ? e.message : 'That was not saved.')
      }
    }

    if (path === '/api/backup' && method === 'GET') {
      const files: Record<string, unknown> = {}
      for (const name of PERSONAL_FILES) files[name] = readJson<unknown>(userFile(name), null)
      res.setHeader('content-disposition', `attachment; filename="gavel-backup-${new Date(now()).toISOString().slice(0, 10)}.json"`)
      return json(res, 200, { app: BRAND, version: VERSION, exportedAt: now(), email: session.email, files })
    }
    if (path === '/api/backup' && method === 'POST') {
      const body = await readJsonBody(req)
      const files = body.files
      if (!files || typeof files !== 'object' || Array.isArray(files)) throw new HttpError(400, 'That is not a Gavel backup file.')
      const f = files as Record<string, unknown>
      const restored: string[] = []
      try {
        const list = (name: string) => (f[name] === null || f[name] === undefined ? undefined : Array.isArray(f[name]) ? (f[name] as unknown[]) : (() => { throw new Error(`${name} must be a list.`) })())
        const watch = list('watchlist.json')
        const paper = list('paper-bids.json')
        const targets = list('targets.json')?.map((x) => validateTarget(x, x as never))
        const alerts = list('alerts.json')
        const garage = f['garage.json'] === null || f['garage.json'] === undefined ? undefined : validateGarageFile(f['garage.json'])
        for (const [i, w] of (watch ?? []).entries()) if (!w || typeof (w as { listingId?: unknown }).listingId !== 'string') throw new Error(`watchlist[${i}] is missing its listing id.`)
        for (const [i, b] of (paper ?? []).entries()) if (!b || (b as { mode?: unknown }).mode !== 'PAPER' || typeof (b as { maxBidUsd?: unknown }).maxBidUsd !== 'number') throw new Error(`paper-bids[${i}] is not a paper bid.`)
        if (f['settings.json'] && typeof f['settings.json'] === 'object') { updateSettings(f['settings.json']); restored.push('settings.json') }
        if (watch) { writeJson(userFile('watchlist.json'), watch); restored.push('watchlist.json') }
        if (paper) { writeJson(userFile('paper-bids.json'), paper); restored.push('paper-bids.json') }
        if (targets) { writeJson(userFile('targets.json'), targets); restored.push('targets.json') }
        if (alerts) { writeJson(userFile('alerts.json'), alerts.slice(0, 200)); restored.push('alerts.json') }
        if (garage) { writeJson(userFile('garage.json'), garage); restored.push('garage.json') }
      } catch (e) {
        throw new HttpError(400, `Nothing was restored: ${e instanceof Error ? e.message : 'the file did not check out.'}`)
      }
      scanCache.clear()
      return json(res, 200, { restored })
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
    console.log(`  Data:        ${DATA_DIR} (each member has their own folder)`)
    if (movedLegacy.length) console.log(`  Moved:       ${movedLegacy.join(', ')} into the owner's folder`)
    console.log('')
  }

  return {
    server,
    url,
    pin,
    close: () => new Promise<void>((resolvePromise) => { if (sniperTimer) clearInterval(sniperTimer); server.close(() => resolvePromise()) }),
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  startServer().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
