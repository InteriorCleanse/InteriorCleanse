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
import type { BidPlan, Estimate, Listing, Score, SearchQuery, SourceStatus } from './types.ts'
import { scanAll, sourceStatuses } from './sources/registry.ts'
import type { ScanResult } from './sources/registry.ts'
import { AUCTION_HOUSES, houseById, HOUSE_GROUPS } from './sources/directory.ts'
import { estimateValue, askingPrice } from './valuation.ts'
import { demandFor } from './demand.ts'
import type { DemandEntry } from './demand.ts'
import { gradeWord, scoreListing } from './scoring.ts'
import { buildPlan } from './bidplan.ts'
import type { PlanInputs } from './bidplan.ts'
import { walkthrough } from './explain.ts'
import type { Walkthrough } from './explain.ts'
import { aiAdvise, aiStatus, aiWalkthrough } from './ai.ts'
import { addWatch, listPaper, listWatch, paperSummary, placePaperBid, removeWatch, saveWatch, setOutcome } from './paper.ts'
import { checkWatch } from './watchalerts.ts'
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
import { addCar, addCost, addIncome, garageSummary, listGarage, removeCar, removeEntry, totalsFor, unassignCompany, updateCar, validateGarageFile } from './garage.ts'
import { validateTarget } from './sniper/targets.ts'
import { listImports, removeImport, saveImports } from './imports.ts'
import { listSold, recentSold, removeSold, saveSold } from './sold.ts'
import { importFieldsOf, listingFromImport, parseCsvImport, parseLotText } from './sources/importer.ts'
import { aiExtractLot } from './research/extract.ts'
import { marketcheckComps, marketcheckConfigured } from './sources/marketcheck.ts'
import { createHash } from 'node:crypto'
import { HOUSE_POLICIES, REGULATIONS, GLOSSARY, searchKnowledge } from './knowledge/index.ts'
import { carIntel, intelSummary } from './research/intel.ts'
import { researchAvailable, webResearch } from './research/web.ts'
import { CATALOG } from './catalog.ts'
import { listTargets, saveTarget, removeTarget } from './sniper/targets.ts'
import type { Target } from './sniper/targets.ts'
import { byPriority, pickFor } from './sniper/engine.ts'
import type { Pick } from './sniper/engine.ts'
import { addAlert, alreadyFired, firedOnCar, listAlerts, markAlertsRead } from './sniper/alerts.ts'
import { money } from './ui.ts'
import { autodevComps, autodevConfigured } from './sources/autodev.ts'
import { vinauditConfigured, vinauditEstimate, vinauditValue } from './sources/vinaudit.ts'
import { isStateCode } from './states.ts'
import { findDeals } from './finder.ts'
import { addCompany, addOverhead, listCompanies, removeCompany, removeOverhead, updateCompany, validateCompaniesFile } from './companies.ts'
import { businessReport, ledgerCsv } from './business.ts'
import { answerFromBooks, briefing } from './advisor.ts'
import type { BriefingInput } from './advisor.ts'
import { materialsFor } from './materials.ts'
import { estimatePnl, pnlInputFrom } from './pnl.ts'
import type { PnlInput } from './pnl.ts'
import { cleanQuery, partCategories, partLinks, vehicleFrom } from './parts.ts'
import { ebayConfigured, searchEbayParts } from './sources/ebay.ts'
import { splitTitle } from './sources/normalize.ts'
import { parseSearch } from './searchparse.ts'
import { JOURNEY, LOOK_FOR, journeyStatus, stageOf, todayTasks } from './coach/journey.ts'
import type { JourneyFacts } from './coach/journey.ts'
import { carryOver, currentThread, dayKey, newThread, readCoach, streak, writeCoach } from './coach/store.ts'
import type { DisplayMsg } from './coach/store.ts'
import { coachAiStatus, coachTurn } from './coach/agent.ts'
import type { CoachTool } from './coach/agent.ts'
import { coachFromRules } from './coach/rules.ts'
import type { ParsedSearch } from './searchparse.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = resolve(HERE, '..', 'web')
const BODY_LIMIT = 256 * 1024
const WEBHOOK_LIMIT = 1024 * 1024
const SCAN_CACHE_MS = 60_000
/** The owner's session email and the name of the owner's data folder. */
const OWNER_EMAIL = 'owner'
/** Searched for the deal finder when the member has no Sniper makes of their own. */
const DEAL_MAKES = ['Toyota', 'Honda', 'Lexus', 'Ford', 'Chevrolet', 'Jeep', 'Subaru', 'Mazda']

export type Card = { listing: Listing; estimate: Estimate; score: Score; demand?: { tier: DemandEntry['tier']; tags: Array<DemandEntry['tier']>; why: string } }
export type Feed = { kind: ScanResult['kind']; scannedAt: number; errors: string[]; hidden: number; cards: Card[]; /** What the search box understood, one phrase per filter applied. */ understood?: string[] }

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

/**
 * Who is signing in, for the login throttle. Behind a reverse proxy every
 * request arrives from the proxy's own address, so one guesser would lock
 * every member out. With GAVEL_TRUST_PROXY=1 the address the proxy added last
 * to X-Forwarded-For is used instead. Set it only when a proxy you run sits
 * in front: without one, anybody can write that header.
 */
export function clientKey(req: { headers: IncomingMessage['headers']; socket: { remoteAddress?: string } }): string {
  if (flag('GAVEL_TRUST_PROXY')) {
    const hops = String(req.headers['x-forwarded-for'] ?? '').split(',').map((h) => h.trim()).filter(Boolean)
    const last = hops.at(-1)
    if (last && last.length <= 64) return last
  }
  return req.socket.remoteAddress ?? 'unknown'
}

function isSecure(req: IncomingMessage): boolean {
  return flag('GAVEL_SECURE_COOKIES') || (req.headers['x-forwarded-proto'] ?? '').toString().split(',')[0].trim() === 'https'
}

function safeUrl(u: string | undefined): string | null {
  if (!u) return null
  return /^https?:\/\//i.test(u) ? u : null
}

/**
 * A member cannot change the server, so what they read about sources names no
 * environment variable and no terminal step: only whether it is on.
 */
function memberSources(list: SourceStatus[]): SourceStatus[] {
  return list.map((x) => (x.kind === 'api' && !x.connected ? { ...x, reason: 'Not connected on this Gavel yet. The owner connects sources.' } : x))
}

/** Feed notes for a member: a source that is simply not connected is the owner's business; setup words become a plain line. */
function memberErrors(errors: string[]): string[] {
  return errors.filter((e) => !/not connected/i.test(e)).map((e) => (/GAVEL_|ANTHROPIC_|\.env\b|npm /.test(e) ? 'One source did not answer this time. The cars below come from the others.' : e))
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

  /**
   * Public listings seen in any scan this run (API and SAMPLE data), so
   * /api/listing can find them. A member's imports, sold prices and watch
   * snapshots never go in here: they are read from that member's own files on
   * each request, so nothing one member typed reaches another.
   */
  const known = new Map<string, Listing>()
  /**
   * Comparables per data kind: every public comp from recent scans, newest
   * price per id, so the feed and the plan page price a car from the same
   * pool. Entries older than POOL_MAX_AGE_MS or past POOL_MAX drop off.
   */
  const pools = new Map<Listing['kind'], Map<string, Listing>>()
  const POOL_MAX = 5000
  const POOL_MAX_AGE_MS = 6 * 3600_000
  const scanCache = new Map<string, { at: number; result: ScanResult }>()

  /** The lot reader can call Claude, so each member gets READER_MAX reads per ten minutes. */
  const READER_MAX = 40
  const readerLog = new Map<string, number[]>()
  function readerAllows(email: string): boolean {
    const since = now() - 10 * 60_000
    const recent = (readerLog.get(email) ?? []).filter((t) => t > since)
    if (recent.length >= READER_MAX) { readerLog.set(email, recent); return false }
    recent.push(now())
    readerLog.set(email, recent)
    if (readerLog.size > 10_000) readerLog.delete(readerLog.keys().next().value as string)
    return true
  }

  /** Keep the scan cache small: drop what has expired, and the oldest past 300 entries. */
  function cacheScan(key: string, entry: { at: number; result: ScanResult }): void {
    const t = now()
    for (const [k, v] of scanCache) if (t - v.at >= SCAN_CACHE_MS) scanCache.delete(k)
    scanCache.delete(key)
    scanCache.set(key, entry)
    while (scanCache.size > 300) scanCache.delete(scanCache.keys().next().value as string)
  }

  /** A short fingerprint of a member's imports, so the scan cache never hands one member's lots to another. */
  function importsSignature(extra: Listing[]): string {
    if (!extra.length) return ''
    return `${currentUser() ?? ''}:${createHash('sha256').update(extra.map((l) => `${l.id}@${l.fetchedAt}`).join('|')).digest('hex').slice(0, 16)}`
  }

  /** Extra comparables for one LIVE car: MarketCheck dealer prices for its make and model, when connected. */
  async function extraComps(l: Listing): Promise<Listing[]> {
    if (l.kind !== 'LIVE' || !l.make || !l.model) return []
    const [mc, ad] = await Promise.all([
      marketcheckConfigured() ? marketcheckComps(l.make, l.model, fetchImpl).catch(() => []) : Promise.resolve([]),
      autodevConfigured() ? autodevComps(l.make, l.model, l.year, fetchImpl).catch(() => []) : Promise.resolve([]),
    ])
    return [...mc, ...ad]
  }

  /**
   * One car, priced as well as Gavel can: comparables first, and when they
   * fall short, VinAudit's market value for the VIN (if connected and it
   * rests on enough recorded sales). Used where a single car is shown.
   */
  async function cardWithValue(l: Listing, settings: Settings): Promise<Card> {
    const extra = await extraComps(l)
    const card = cardFor(l, settings, { extra })
    if (card.estimate.ok || l.kind !== 'LIVE' || !l.vin || !vinauditConfigured()) return card
    const fallback = vinauditEstimate(await vinauditValue(l.vin, l.mileage, fetchImpl).catch(() => undefined))
    return fallback ? cardFor(l, settings, { extra, fallback }) : card
  }

  function remember(result: ScanResult): void {
    for (const l of result.listings) if (l.origin !== 'import') { known.delete(l.id); known.set(l.id, l) }
    // Newest last; past 20,000 public listings the oldest go (a plan opened later simply rescans).
    while (known.size > 20_000) known.delete(known.keys().next().value as string)
    if (result.kind === 'EMPTY') return
    let pool = pools.get(result.kind)
    if (!pool) { pool = new Map(); pools.set(result.kind, pool) }
    for (const c of result.comps) if (c.origin !== 'import') { pool.delete(c.id); pool.set(c.id, c) }
    const oldest = now() - POOL_MAX_AGE_MS
    for (const [id, c] of pool) if (pool.size > POOL_MAX || c.fetchedAt < oldest) pool.delete(id)
  }

  /** A listing by id, for the member making the request: their own imports and watch snapshots, or the public scan. */
  function findListing(id: string): Listing | undefined {
    const snapshot = () => listWatch().find((w) => w.listingId === id)?.snapshot
    if (id.startsWith('import:')) return listImports().find((x) => x.id === id) ?? snapshot()
    return known.get(id) ?? snapshot()
  }

  /** The member's own comparables: their imported lots and their recent sold prices. Never shared. */
  function myComps(): Listing[] {
    return [...listImports(), ...recentSold(listSold(), now())]
  }

  /**
   * Score one car. The pool is the public comps from recent scans, plus any
   * extra (MarketCheck dealer prices for this car), plus the member's own
   * imports and sold prices. Pass `mine` when scoring many cards at once, so
   * the member's files are read once.
   */
  function cardFor(l: Listing, settings: Settings, opts: { extra?: Listing[]; mine?: Listing[]; fallback?: Estimate } = {}): Card {
    const pool = [...(pools.get(l.kind)?.values() ?? []), ...(opts.extra ?? []), ...(opts.mine ?? myComps())]
    const fromComps = estimateValue(l, pool)
    const estimate = !fromComps.ok && opts.fallback?.ok ? opts.fallback : fromComps
    const demand = demandFor(l.make, l.model, settings.demandExtra)
    const score = scoreListing(l, estimate, demand, settings.starter, now())
    return { listing: l, estimate, score, demand: demand ? { tier: demand.tier, tags: [demand.tier, ...(demand.also ?? [])], why: demand.why } : undefined }
  }

  async function buildFeed(params: URLSearchParams): Promise<Feed> {
    const settings = getSettings()
    // Plain English in the search box ("2015+ camry under 8k no damage") becomes filters (src/searchparse.ts).
    const raw = str(params.get('q'), 160)
    const parsed: ParsedSearch | undefined = raw ? parseSearch(raw) : undefined
    const q = parsed ? parsed.text : ''
    const make = str(params.get('make'), 40) || parsed?.make || ''
    const maxPrice = num(params.get('maxPrice'), 'maxPrice', { optional: true, min: 0, max: 10_000_000 }) ?? parsed?.maxPriceUsd
    const state = (str(params.get('state'), 2) || parsed?.state || '').toUpperCase()
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
      cacheScan(key, { at: scannedAt, result })
      remember(result)
    }

    const mine = myComps()
    let cards = result.listings.map((l) => cardFor(l, settings, { mine }))
    if (make) cards = cards.filter((c) => (c.listing.make ?? '').toLowerCase() === make.toLowerCase())
    if (state) cards = cards.filter((c) => (c.listing.location?.state ?? '').toUpperCase() === state)
    if (maxPrice !== undefined) cards = cards.filter((c) => (askingPrice(c.listing) ?? 0) <= maxPrice)
    // A car can be more than one kind: a 911 shows under Enthusiast, Supercar and Holds value.
    if (tier && tier !== 'all') cards = cards.filter((c) => c.demand?.tags.includes(tier as DemandEntry['tier']))
    if (parsed?.model) cards = cards.filter((c) => `${c.listing.model ?? ''} ${c.listing.title}`.toLowerCase().replace(/-/g, ' ').includes(parsed.model!.toLowerCase().replace(/-/g, ' ')))
    if (parsed?.minYear !== undefined) cards = cards.filter((c) => (c.listing.year ?? 0) >= parsed.minYear!)
    if (parsed?.maxYear !== undefined) cards = cards.filter((c) => c.listing.year !== undefined && c.listing.year <= parsed.maxYear!)
    if (parsed?.maxMileage !== undefined) cards = cards.filter((c) => c.listing.mileage !== undefined && c.listing.mileage <= parsed.maxMileage!)
    if (parsed?.damage === 'none') cards = cards.filter((c) => c.listing.damage === 'none')
    if (parsed?.damage === 'minor') cards = cards.filter((c) => c.listing.damage === 'none' || c.listing.damage === 'minor')
    if (q && !parsed?.make && result.kind === 'SAMPLE') {
      const words = q.toLowerCase().split(' ').filter(Boolean)
      cards = cards.filter((c) => words.every((w) => c.listing.title.toLowerCase().includes(w)))
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
    return { kind: result.kind, scannedAt, errors: result.errors, hidden, cards, understood: parsed?.understood ?? [] }
  }

  /** The deal finder for the member in scope: searched by make so each car meets its own kind. */
  async function dealsFor(o: { budget: number; maxDamage: 'none' | 'minor'; minYear?: number; minProfitUsd?: number; makes?: string[] }) {
    const settings = getSettings()
    const fromTargets = [...new Set(listTargets().flatMap((t) => t.makes))]
    const makes = o.makes && o.makes.length ? o.makes : fromTargets.length ? fromTargets.slice(0, 8) : DEAL_MAKES
    const byId = new Map<string, Card>()
    let kind: ScanResult['kind'] = 'EMPTY'
    const errors = new Set<string>()
    for (const make of makes) {
      const r = await scanCards(make, settings)
      if (r.kind === 'LIVE') kind = 'LIVE'
      else if (r.kind === 'SAMPLE' && kind === 'EMPTY') kind = 'SAMPLE'
      for (const c of r.cards) byId.set(c.listing.id, c)
      for (const e of r.errors) errors.add(e)
    }
    const result = findDeals([...byId.values()], { budgetUsd: o.budget, maxDamage: o.maxDamage, minYear: o.minYear, minProfitUsd: o.minProfitUsd, feeOverrides: settings.feeOverrides, taxTitlePct: settings.taxTitlePct, allowSample: kind === 'SAMPLE', now: now() })
    return { kind, budget: o.budget, maxDamage: o.maxDamage, minYear: o.minYear ?? null, minProfitUsd: o.minProfitUsd ?? null, makes, ...result, deals: result.deals.slice(0, 40), leads: result.leads.slice(0, 20), errors: [...errors] }
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
      cacheScan(key, { at: now(), result })
      remember(result)
    }
    const mine = myComps()
    return { cards: result.listings.map((l) => cardFor(l, settings, { mine })), kind: result.kind, errors: result.errors }
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
            if (target.armed && !alreadyFired(target.id, card.listing.id) && !firedOnCar(card.listing.id)) {
              const bid = placePaperBid(card.listing, pick.fire.maxBidUsd, `Sniper "${target.name}": ${pick.fire.method}`)
              addAlert({ kind: 'paper-fired', targetId: target.id, listingId: card.listing.id, title: `PAPER bid fired: ${card.listing.title}`, body: `${target.name} recorded a paper bid of $${bid.maxBidUsd.toLocaleString('en-US')} (${pick.fire.method}). Nothing was sent to the auction. ${pick.fire.why}` }, now())
              fired++
              console.log(`[sniper] PAPER fired ${card.listing.id} $${bid.maxBidUsd} for a target`)
            } else if (!target.armed && !listAlerts().some((a) => (a.kind === 'pick' || a.kind === 'paper-fired') && a.listingId === card.listing.id)) {
              addAlert({ kind: 'pick', targetId: target.id, listingId: card.listing.id, title: `New pick for ${target.name}: ${card.listing.title}`, body: `Score ${card.score.total} (${gradeWord(card.score.grade)}). Never bid above $${pick.fire.maxBidUsd.toLocaleString('en-US')}. ${pick.fire.why}` }, now())
            }
          }
        }
      }
      picks.sort(byPriority)
      st.picks = picks
      st.lastRun = now()
      return { picks, fired }
    })().finally(() => { st.running = null })
    return st.running
  }

  /** Watched cars: ending soon, price moved, ended (src/watchalerts.ts). Uses only listings already scanned. */
  function runWatchAlerts(): void {
    const items = listWatch()
    if (!items.length) return
    const r = checkWatch(items, (id) => known.get(id), now())
    for (const a of r.alerts) addAlert({ kind: 'watch', listingId: a.listingId, title: a.title, body: a.body }, now())
    if (r.changed) saveWatch(r.items)
  }

  /** Run the sniper for every member who has an active target, and check every member's watched cars. */
  function runAllSnipers(): void {
    const emails = new Set<string>([OWNER_EMAIL, ...listUserScopes().map((u) => u.email)])
    for (const email of emails) {
      withUser(email, () => {
        try { runWatchAlerts() } catch (e) { console.error('[watch]', e instanceof Error ? e.message : e) }
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

  function serialisePick(p: Pick & { targetNames?: string[] }): Record<string, unknown> {
    return { targetId: p.targetId, targetName: p.targetName, targetNames: p.targetNames ?? [p.targetName], card: p.card, plan: p.plan, fire: p.fire, fit: p.fit, named: p.named, reasons: p.reasons }
  }

  /** One entry per car, best first (asked for by model, then fit): a car that suits two targets shows once, naming both. */
  function uniquePicks(picks: Pick[]): Array<Pick & { targetNames: string[] }> {
    const byId = new Map<string, Pick & { targetNames: string[] }>()
    for (const p of [...picks].sort(byPriority)) {
      const have = byId.get(p.card.listing.id)
      if (!have) byId.set(p.card.listing.id, { ...p, targetNames: [p.targetName] })
      else if (!have.targetNames.includes(p.targetName)) have.targetNames.push(p.targetName)
    }
    return [...byId.values()]
  }

  async function ensureKnown(id: string): Promise<Listing> {
    let l = findListing(id)
    if (!l && !id.startsWith('import:')) {
      // A fresh process: repopulate from a default scan.
      remember(await scanAll({ limit: 100 }, { allowSample: getSettings().allowSample, fetchImpl }))
      l = findListing(id)
    }
    if (!l) throw new HttpError(404, 'That car is not in the current scan any more. Go back to the Feed and open it again.')
    return l
  }

  function planFor(l: Listing, estimate: Estimate, inputs: PlanInputs, settings: Settings): BidPlan {
    const houseId = inputs.houseId ?? l.source
    const feePct = inputs.feePct ?? settings.feeOverrides[houseId]
    // A supercar by its main kind or as a second one (a 911 is both): it gets the bigger cushion and the checks.
    const d = demandFor(l.make, l.model, settings.demandExtra)
    const supercar = !!d && (d.tier === 'supercar' || (d.also ?? []).includes('supercar'))
    return buildPlan(l, estimate, { cashUsd: settings.cashUsd, goal: settings.goal, taxTitlePct: settings.taxTitlePct, ...inputs, houseId, feePct, supercar })
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
      taxTitlePct: num(body.taxTitlePct, 'taxTitlePct', { optional: true, min: 0, max: 20 }),
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
      const research = await researchAvailable()
      const owner = session.role === 'owner'
      return json(res, 200, {
        email: session.email,
        role: session.role,
        csrf: session.csrf,
        version: VERSION,
        brand: BRAND,
        tagline: TAGLINE,
        liveBidding: flag('GAVEL_LIVE_BIDDING'),
        sources: owner ? sourceStatuses() : memberSources(sourceStatuses()),
        ai: { available: ai.available, reason: owner || ai.available ? ai.reason : 'Off on this Gavel. Every car is still explained by the built-in rules.' },
        research: owner || research.available ? research : { available: false, reason: 'Answers come from the built-in knowledge base: auction rules, fees, laws and terms.' },
        allowSample: getSettings().allowSample,
        hasImports: listImports().length > 0,
        sniper: { unread: listAlerts().filter((a) => !a.read).length, targets: listTargets().filter((t) => t.active).length },
        goal: getSettings().goal ?? null,
        homeState: getSettings().homeState ?? null,
        cashUsd: getSettings().cashUsd ?? null,
        dataDir: session.role === 'owner' ? DATA_DIR : undefined,
      })
    }

    if (path === '/api/deals' && method === 'GET') {
      // Budget in, real deals out (src/finder.ts).
      const budget = num(url.searchParams.get('budget') ?? '', 'budget', { min: 500, max: 5_000_000 })!
      const minYearN = Number(url.searchParams.get('minYear') ?? '')
      const minProfitN = Number(url.searchParams.get('minProfit') ?? '')
      const r = await dealsFor({
        budget,
        maxDamage: url.searchParams.get('damage') === 'none' ? 'none' : 'minor',
        minYear: Number.isInteger(minYearN) && minYearN >= 1950 && minYearN <= 2050 ? minYearN : undefined,
        minProfitUsd: Number.isFinite(minProfitN) && minProfitN > 0 && minProfitN <= 1_000_000 ? minProfitN : undefined,
        makes: str(url.searchParams.get('makes') ?? '', 300).split(',').map((m) => m.trim()).filter(Boolean).slice(0, 8),
      })
      return json(res, 200, { ...r, errors: session.role === 'owner' ? r.errors : memberErrors(r.errors) })
    }

    if (path === '/api/feed' && method === 'GET') {
      const feed = await buildFeed(url.searchParams)
      return json(res, 200, session.role === 'owner' ? feed : { ...feed, errors: memberErrors(feed.errors) })
    }

    if (parts[1] === 'listing' && parts.length === 3 && method === 'GET') {
      const id = decodeURIComponent(parts[2])
      const l = await ensureKnown(id)
      const settings = getSettings()
      const card = await cardWithValue(l, settings)
      const plan = planFor(l, card.estimate, {}, settings)
      const wt = walkthrough({ ...card, plan }, houseById(l.source))
      return json(res, 200, { ...card, plan, walkthrough: wt })
    }

    if (path === '/api/plan' && method === 'POST') {
      const body = await readJsonBody(req)
      const l = await ensureKnown(str(body.listingId, 200))
      const inputs = planInputs(body)
      // A fee or a tax rate typed on one plan is a fact about the house or the member's state: remember it,
      // so Home, the Sniper and every other plan use the same number.
      if (body.remember === true) {
        const now0 = getSettings()
        const house = inputs.houseId ?? l.source
        const patch: Record<string, unknown> = {}
        if (inputs.feePct !== undefined) patch.feeOverrides = { ...now0.feeOverrides, [house]: inputs.feePct }
        if (inputs.taxTitlePct !== undefined) patch.taxTitlePct = inputs.taxTitlePct
        if (Object.keys(patch).length) { updateSettings(patch); runSniper().catch(() => {}) }
      }
      const settings = getSettings()
      const card = await cardWithValue(l, settings)
      return json(res, 200, planFor(l, card.estimate, inputs, settings))
    }

    if (path === '/api/explain' && method === 'POST') {
      const body = await readJsonBody(req)
      const l = await ensureKnown(str(body.listingId, 200))
      const settings = getSettings()
      const card = await cardWithValue(l, settings)
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
      // A member cannot change the server; the setup words are the owner's.
      if (session.role !== 'owner' && /ANTHROPIC_|\.env\b|npm /.test(note)) note = 'Explained by the rules.'
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
      return json(res, 200, { houses, groups: HOUSE_GROUPS, sources: sourceStatuses() })
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
      const l = listingId ? findListing(listingId) : undefined
      if (l) {
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
        return json(res, 200, { targets: listTargets(), picks: uniquePicks(st.picks).map(serialisePick), alerts: alerts.slice(0, 50), unread: alerts.filter((a) => !a.read).length, lastRunAt: st.lastRun || null, everyMs: sniperEvery, paper: true })
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
        return json(res, 200, { picks: uniquePicks(r.picks).map(serialisePick), fired: r.fired, ranAt: sniperFor(session.email).lastRun, paper: true })
      }
      if (path === '/api/sniper/alerts/read' && method === 'POST') return json(res, 200, { read: markAlertsRead() })
    }

    if (path === '/api/import/parse' && method === 'POST') {
      if (!readerAllows(session.email)) throw new HttpError(429, `That is ${READER_MAX} lots read in ten minutes. Wait a few minutes, then carry on.`)
      const body = await readJsonBody(req)
      const text = typeof body.text === 'string' ? body.text.slice(0, 60_000) : ''
      const pageUrl = str(body.url, 500)
      if (!text.trim()) throw new HttpError(400, 'Paste the lot page text first.')
      const parsed = parseLotText(text, pageUrl || undefined, now())
      let usedAi = false
      const priced = parsed.fields.currentBidUsd !== undefined || parsed.fields.buyNowUsd !== undefined || parsed.fields.soldUsd !== undefined
      if ((!parsed.fields.title || !priced) && body.useAi !== false) {
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
      if (listing.soldUsd !== undefined) {
        saveSold([listing])
        return json(res, 200, { sold: true, listing })
      }
      saveImports([listing])
      const settings = getSettings()
      return json(res, 200, await cardWithValue(listing, settings))
    }
    if (path === '/api/import/csv' && method === 'POST') {
      const body = await readJsonBody(req)
      const csv = typeof body.csv === 'string' ? body.csv : ''
      if (!csv.trim()) throw new HttpError(400, 'Choose a CSV file first.')
      const src = str(body.source, 20) || 'other'
      const parsed = parseCsvImport(csv, src, { sold: body.sold === true })
      const lots: Listing[] = []
      const sold: Listing[] = []
      let bad = 0
      let undated = 0
      for (const row of parsed.rows) {
        try {
          const l = listingFromImport({ ...row, source: row.source === 'other' ? src : row.source }, now())
          ;(l.soldUsd !== undefined ? sold : lots).push(l)
        } catch {
          if (row.soldUsd !== undefined && row.soldAt === undefined) undated++
          else bad++
        }
      }
      if (lots.length) saveImports(lots)
      if (sold.length) saveSold(sold)
      return json(res, 200, { added: lots.length, sold: sold.length, skipped: parsed.skipped + bad, undated, used: parsed.used })
    }
    if (path === '/api/imports' && method === 'GET') return json(res, 200, listImports())
    if (path === '/api/sold' && method === 'GET') return json(res, 200, listSold())
    if (parts[1] === 'sold' && parts.length === 3 && method === 'DELETE') {
      if (!removeSold(decodeURIComponent(parts[2]))) throw new HttpError(404, 'No sold price with that id.')
      return json(res, 200, { ok: true })
    }
    if (parts[1] === 'imports' && parts.length === 3 && method === 'DELETE') {
      if (!removeImport(decodeURIComponent(parts[2]))) throw new HttpError(404, 'No imported lot with that id.')
      return json(res, 200, { ok: true })
    }

    if (path === '/api/connect' && method === 'GET') {
      // The go-live guide is about the server: a member can change none of it.
      if (session.role !== 'owner') throw new HttpError(403, 'Only the owner sets up Gavel.')
      const owner = true
      const st = Object.fromEntries(sourceStatuses().filter((x) => x.kind === 'api').map((x) => [x.id, x.connected]))
      const ai = await aiStatus()
      const items: Array<{ id: string; group: string; name: string; done: boolean; unlocks: string; cost: string; steps: string[]; env: string[]; link?: string; ownerOnly?: boolean }> = [
        { id: 'ebay', group: 'Auction sources', name: 'eBay Motors', done: !!st.ebay, unlocks: 'Live eBay Motors auctions and Buy It Now cars in the feed and the Sniper.', cost: 'Free developer account.', link: 'https://developer.ebay.com', env: ['GAVEL_EBAY_CLIENT_ID', 'GAVEL_EBAY_CLIENT_SECRET'], steps: ['Sign in at developer.ebay.com with your eBay account and join the developer programme.', 'Open Application Keys and create a Production keyset.', 'Copy the App ID into GAVEL_EBAY_CLIENT_ID and the Cert ID into GAVEL_EBAY_CLIENT_SECRET.', 'Restart Gavel. The chip at the top turns LIVE.'] },
        { id: 'gsa', group: 'Auction sources', name: 'GSA Auctions (federal surplus)', done: !!st.gsa, unlocks: 'Government fleet cars, trucks and SUVs, live, with no buyer premium.', cost: 'Free.', link: 'https://api.data.gov/signup/', env: ['GAVEL_GSA_API_KEY', 'or GAVEL_GSA=1 to try with DEMO_KEY'], steps: ['Fill in the short form at api.data.gov/signup; the key arrives by email in a minute.', 'Put it in GAVEL_GSA_API_KEY. (To try it first, GAVEL_GSA=1 uses the shared demo key, which is rate-limited.)', 'Restart Gavel.'] },
        { id: 'marketcheck', group: 'Auction sources', name: 'MarketCheck (dealers and auctions)', done: !!st.marketcheck, unlocks: 'Auction lots in the feed, and dealer asking prices from across the country behind every estimate. The biggest single upgrade to pricing.', cost: 'A free tier (about 500 calls a month within 100 miles) and paid plans, as listed on their pricing page; check it before you sign up.', link: 'https://www.marketcheck.com/apis/', env: ['GAVEL_MARKETCHECK_API_KEY', 'GAVEL_MARKETCHECK_AUCTION_PATH (only if your plan uses a different path)'], steps: ['Create an account at marketcheck.com/apis and choose a plan that includes Inventory Search and Auction Inventory Search.', 'Copy your API key into GAVEL_MARKETCHECK_API_KEY.', 'If your dashboard shows a different auction search path than search/car/auction/active, put that path in GAVEL_MARKETCHECK_AUCTION_PATH.', 'Restart Gavel.'] },
        { id: 'autodev', group: 'Prices', name: 'auto.dev (dealer prices)', done: autodevConfigured(), unlocks: 'Dealer asking prices for the same make, model and year behind every estimate, so many more cars in the Feed get a price instead of "not enough comps".', cost: 'A free tier (about 1,000 calls a month) and paid plans, as listed on their pricing page.', link: 'https://auto.dev/pricing', env: ['GAVEL_AUTODEV_API_KEY'], steps: ['Create a free account at auto.dev (no card needed for the free tier, as listed).', 'Copy your API key into GAVEL_AUTODEV_API_KEY.', 'Restart Gavel, then run npm run probe to check it answers.'] },
        { id: 'vinaudit', group: 'Prices', name: 'VinAudit market value', done: vinauditConfigured(), unlocks: 'A market value for any car with a VIN, from the sales VinAudit has recorded, shown on its plan when the scan has too few comparables (GSA and imported cars especially).', cost: 'A free developer account to start; check their data pricing page for paid use.', link: 'https://data.vinaudit.com/market-values-api', env: ['GAVEL_VINAUDIT_API_KEY'], steps: ['Open a developer account at data.vinaudit.com.', 'Copy your API key into GAVEL_VINAUDIT_API_KEY.', 'Restart Gavel, then run npm run probe to check it answers.'] },
        { id: 'import', group: 'Auction sources', name: 'Copart, IAA, Bring a Trailer, Cars & Bids and every other house', done: listImports().length > 0, unlocks: 'Any lot you are looking at, scored against live comparables with a full bid plan.', cost: 'Free. Copart and IAA need their own membership to bid.', env: [], steps: ['Open Import in Gavel and drag the Send to Gavel button to your bookmarks bar.', 'On any lot page (Copart, IAA, BaT, Cars & Bids, GovDeals, a dealer), click the bookmark.', 'Check the fields Gavel found, fill any blanks, save. The car appears in your feed and can be planned and watched.', 'For many lots at once, export a CSV from your auction account and upload it on the same screen.'] },
        { id: 'anthropic', group: 'Intelligence', name: 'Claude (the AI explainer, web research and lot reader)', done: ai.available, unlocks: 'Walkthroughs rewritten for each car, a research desk that searches the live web with sources, and a reader for messy lot pages.', cost: 'Pay as you go; see the Anthropic pricing page.', link: 'https://console.anthropic.com', env: ['ANTHROPIC_API_KEY'], steps: ['Create an account at console.anthropic.com and add a payment method.', 'Create an API key and put it in ANTHROPIC_API_KEY.', 'Run npm install once in the Gavel folder, then restart.'] },
      ]
      if (owner) {
        items.push(
          { id: 'pin', group: 'Running it', name: 'A fixed owner PIN', done: !!env('GAVEL_PIN'), unlocks: 'The same PIN every start.', cost: 'Free.', env: ['GAVEL_PIN'], steps: ['Pick six digits nobody would guess and put them in GAVEL_PIN.'], ownerOnly: true },
          { id: 'session', group: 'Running it', name: 'Members stay signed in across restarts', done: env('GAVEL_SESSION_SECRET').length >= 32, unlocks: 'Nobody is signed out when you restart or update Gavel.', cost: 'Free.', env: ['GAVEL_SESSION_SECRET'], steps: ['Put 32 or more random characters in GAVEL_SESSION_SECRET (a password manager can generate them).', 'Never share it and never put it in the code.'], ownerOnly: true },
          { id: 'hosting', group: 'Running it', name: 'On the internet, behind HTTPS', done: flag('GAVEL_SECURE_COOKIES') || flag('GAVEL_TRUST_PROXY'), unlocks: 'Subscribers can sign in from anywhere.', cost: 'A small always-on server with a disk; see docs/GO_LIVE.md for options.', env: ['GAVEL_TRUST_PROXY=1'], steps: ['Rent a small server that keeps running and keeps its files (a VPS, or a platform with a persistent disk).', 'Point your domain at it (an A record).', 'With Docker: GAVEL_DOMAIN=your-domain docker compose -f deploy/compose.yaml up -d --build. That runs Gavel and Caddy, which handles HTTPS by itself. Without Docker, follow deploy/gavel.service.', 'Back up the data folder every day; docs/GO_LIVE.md has the one-line command.'], ownerOnly: true },
          { id: 'stripe', group: 'Getting paid', name: 'Stripe subscriptions', done: !!env('GAVEL_STRIPE_WEBHOOK_SECRET'), unlocks: 'A paid checkout creates the member automatically; a cancelled one switches them off.', cost: 'Stripe takes a fee per payment; see their pricing.', link: 'https://dashboard.stripe.com', env: ['GAVEL_STRIPE_WEBHOOK_SECRET'], steps: ['In Stripe, create a product with a monthly price and a Payment Link for it.', 'Add a webhook endpoint at https://your-domain/api/stripe/webhook with checkout.session.completed, customer.subscription.updated and customer.subscription.deleted.', 'Copy the endpoint signing secret into GAVEL_STRIPE_WEBHOOK_SECRET on the server.', 'When someone pays, issue their code on the Members page and send it to them.'], ownerOnly: true },
        )
      }
      return json(res, 200, { items, done: items.filter((i) => i.done).length, total: items.length })
    }

    const carsWithTotals = (t: number) => listGarage().map((c) => ({ ...c, totals: totalsFor(c, t) }))
    const briefingFor = (t: number): BriefingInput => {
      const settings = getSettings()
      const cars = carsWithTotals(t)
      const companies = listCompanies()
      const endingSoon = uniquePicks(sniperFor(session.email).picks)
        .filter((p) => p.card.listing.endsAt && p.card.listing.endsAt > t && !p.card.listing.endsAtDateOnly)
        .sort((a, b) => (a.card.listing.endsAt ?? 0) - (b.card.listing.endsAt ?? 0))
        .slice(0, 3)
        .map((p) => ({ listingId: p.card.listing.id, title: p.card.listing.title, endsAt: p.card.listing.endsAt as number, maxBidUsd: p.fire.maxBidUsd }))
      return {
        report: businessReport(cars, companies, t), cars, companies, cashUsd: settings.cashUsd, goal: settings.goal, taxTitlePctSet: settings.taxTitlePct !== undefined,
        endingSoon, unreadAlerts: listAlerts().filter((a) => !a.read).length, paperBids: listPaper().length,
        liveSource: sourceStatuses().some((x) => x.kind === 'api' && x.connected), now: t,
      }
    }
    const carVehicle = (c: { year?: number; make?: string; model?: string; title: string; vin?: string }) => {
      const t = splitTitle(c.title)
      return { year: c.year ?? t.year, make: c.make ?? t.make, model: c.model ?? t.model, vin: c.vin }
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
      const partnerInput = briefingFor(t)
      const picks = uniquePicks(st.picks)
      const best = picks[0]
      const endingSoon = picks
        .filter((p) => p.card.listing.endsAt && p.card.listing.endsAt > t)
        .sort((a, b) => (a.card.listing.endsAt ?? 0) - (b.card.listing.endsAt ?? 0))
        .slice(0, 4)
      const liveSource = sourceStatuses().some((x) => x.kind === 'api' && x.connected)
      const owner = session.role === 'owner'
      const bestTitle = best ? best.card.listing.title : ''
      const next: Array<{ id: string; title: string; body: string; href: string; done: boolean }> = [
        { id: 'setup', title: 'Tell Gavel what you are after', body: 'Four questions: your goal, your state, your cash, and the cars you like.', href: '#setup', done: settings.onboarded },
        // Only the owner can connect a source; for a member it would be a step they can never finish.
        ...(owner ? [{ id: 'source', title: 'Connect a live auction source', body: 'eBay Motors and GSA Auctions are free to connect. The Connect screen walks you through each one.', href: '#connect', done: liveSource }] : []),
        ...(owner ? [{ id: 'members', title: 'Invite your first member', body: 'Add their email on Members, then press Copy invite and send it. Try it on yourself first, on your phone.', href: '#admin', done: gate.listMembers().length > 0 }] : []),
        { id: 'target', title: 'Set your first Sniper target', body: 'Makes, models, years and the most you will spend. It watches for you.', href: '#sniper', done: targets.length > 0 },
        best
          ? { id: 'pick', title: `Open your best pick: ${bestTitle}`, body: `Never bid above ${money(best.fire.maxBidUsd)}. The plan shows where every dollar goes.`, href: `#plan/${encodeURIComponent(best.card.listing.id)}`, done: paper.length > 0 }
          : { id: 'pick', title: 'Look at the best cars in your price', body: 'The Feed ranks them. Open one and press Plan my bid.', href: '#feed', done: paper.length > 0 },
        { id: 'learn', title: 'Read "Your first auction car"', body: 'Twelve minutes that save you from the expensive mistakes.', href: '#playbook/first-car', done: (settings.readGuides ?? []).includes('first-car') },
        { id: 'paper', title: 'Place three PAPER bids', body: 'Practise the number before you spend a dollar. Record how each one ended.', href: '#feed', done: paper.length >= 3 },
        { id: 'import', title: 'Bring in a lot from Copart, IAA or any auction', body: 'Add the Send to Gavel button once, then one click on any lot page scores it and plans your bid.', href: '#import', done: listImports().length > 0 },
        { id: 'garage', title: settings.goal === 'rental' ? 'Log your first rental car in Business' : 'Log your first car in Business', body: 'Every cost in, every dollar out, per company. The books tell you if the business works.', href: '#business', done: garage.cars > 0 },
      ]
      return json(res, 200, {
        goal: settings.goal ?? null,
        onboarded: settings.onboarded,
        liveSource,
        sniper: { targets: targets.length, active: targets.filter((x) => x.active).length, armed: targets.filter((x) => x.armed).length, picks: picks.length, lastRunAt: st.lastRun || null, endingSoon: endingSoon.map(serialisePick), best: best ? serialisePick(best) : null },
        alerts: { unread: alerts.filter((a) => !a.read).length, latest: alerts.slice(0, 5) },
        watch: watch.slice(0, 6).map((w) => ({ listingId: w.listingId, title: w.title, endsAt: w.snapshot?.endsAt ?? null, priceUsd: w.snapshot ? (w.snapshot.currentBidUsd ?? w.snapshot.buyNowUsd ?? null) : null, kind: w.snapshot?.kind ?? null })),
        paper: paperSummary(),
        // Profit after company overhead, the same figure Business shows.
        garage: { ...garage, netUsd: partnerInput.report.overall.profitUsd },
        partner: briefing(partnerInput),
        next,
      })
    }

    if (path === '/api/guides/read' && method === 'POST') {
      const body = await readJsonBody(req)
      const id = str(body.id, 60)
      if (!/^[a-z0-9-]{1,60}$/.test(id)) throw new HttpError(400, 'Which guide?')
      const read = getSettings().readGuides ?? []
      if (!read.includes(id)) updateSettings({ readGuides: [...read, id].slice(-100) })
      return json(res, 200, { ok: true })
    }

    if (path === '/api/onboard' && method === 'POST') {
      const body = await readJsonBody(req)
      const goal = str(body.goal, 10)
      if (goal !== 'rental' && goal !== 'flip' && goal !== 'keep') throw new HttpError(400, 'Pick a goal: rental, flip or keep.')
      const homeState = str(body.homeState, 2).toUpperCase()
      if (homeState && !isStateCode(homeState)) throw new HttpError(400, 'Pick your state from the list, for example TX or GA.')
      const budget = num(body.budgetUsd, 'budgetUsd', { min: 500, max: 5_000_000 })!
      const makes = Array.isArray(body.makes) ? (body.makes as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 12) : []
      const models = Array.isArray(body.models) ? (body.models as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 20) : []
      try {
        const settings = updateSettings({ onboarded: true, goal, homeState: homeState || null, cashUsd: budget, starter: { maxPriceUsd: Math.max(budget, 1000) } })
        const target = saveTarget({ name: goal === 'rental' ? 'My first rental car' : goal === 'flip' ? 'My first flip' : 'My next car', makes, models, maxBudgetUsd: budget, minScore: 60, starterOnly: true, armed: false, active: true })
        scanCache.clear()
        runSniper().catch(() => {})
        return json(res, 200, { settings, target })
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : 'Setup was not saved.')
      }
    }

    // ---- The business: companies, books, the partner, materials, P/L, parts ----
    // ---- The coach: the first-car journey, today's three, and a coach to talk to ----
    const journeyFacts = (): JourneyFacts => {
      const st = getSettings()
      const watch = listWatch()
      const paper = listPaper()
      const cars = listGarage()
      return {
        onboarded: st.onboarded, cashUsd: st.cashUsd, homeState: st.homeState, guidesRead: st.readGuides ?? [],
        watched: watch.length, watchedSources: new Set(watch.map((w) => w.snapshot?.source ?? '')).size, imports: listImports().length,
        paperBids: paper.length, paperDecided: paper.filter((b) => b.outcome === 'won' || b.outcome === 'lost').length,
        carsOwned: cars.length, carsWithCosts: cars.filter((c) => c.costs.length > 0).length,
        materialsTicked: cars.reduce((n, c) => n + (c.materialsDone?.length ?? 0), 0),
        soldOrRented: cars.filter((c) => c.status === 'sold' || c.income.length > 0).length,
      }
    }
    const coachState = (t: number) => {
      const st = readCoach()
      const facts = journeyFacts()
      const status = journeyStatus(facts, st.ticked)
      const stage = stageOf(status)
      const input = briefingFor(t)
      const brief = briefing(input)
      const urgent = brief.items.find((x) => x.tone === 'hot' || x.tone === 'best')
      const today = todayTasks({ next: stage.next, urgent, stage: stage.n, budgetUsd: facts.cashUsd, done: st.days[dayKey(t)] ?? [] })
      return { st, facts, status, stage, input, brief, today }
    }

    /** The coach's tools: Gavel's own data, read-only except adding a car to the watchlist. */
    const coachTools = (): CoachTool[] => {
      const n = (v: unknown, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) && x >= lo && x <= hi ? x : undefined }
      const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
      const brief = (c: Card) => ({ id: c.listing.id, title: c.listing.title, kind: c.listing.kind, source: c.listing.source, url: c.listing.url, priceUsd: askingPrice(c.listing) ?? null, priceKind: c.listing.saleType, endsAt: c.listing.endsAt ? new Date(c.listing.endsAt).toISOString() : null, endsDateOnly: !!c.listing.endsAtDateOnly, mileage: c.listing.mileage ?? null, state: c.listing.location?.state ?? null, title_status: c.listing.titleStatus, damage: c.listing.damage, runsAndDrives: c.listing.runsAndDrives ?? null, similarCarsUsd: c.estimate.ok ? c.estimate.valueUsd : null, similarCars: c.estimate.ok ? c.estimate.comps : 0, basis: c.estimate.ok ? c.estimate.basis ?? null : null, score: c.score.total, grade: gradeWord(c.score.grade), plan: `#plan/${encodeURIComponent(c.listing.id)}` })
      return [
        { name: 'search_auctions', description: 'Search every auction Gavel reads live (eBay Motors, GSA Auctions, MarketCheck when connected) plus the member\'s imported lots, in plain English ("2015+ camry under 8k no damage in tx"). Returns real listings with price, end time, title, damage, similar-car value and score. Starter rules (clean title, little damage, runs) apply unless starter is false.', input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Plain-English search.' }, starter: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 25 } }, required: ['query'], additionalProperties: false },
          label: (i) => `Searched the auctions: ${s(i.query, 80)}`,
          run: async (i) => { const p = new URLSearchParams({ q: s(i.query, 160), starter: i.starter === false ? '0' : '1' }); const f = await buildFeed(p); return { kind: f.kind, understood: f.understood, hiddenByStarter: f.hidden, found: f.cards.length, cars: f.cards.slice(0, n(i.limit, 1, 25) ?? 10).map(brief), errors: f.errors } } },
        { name: 'find_deals', description: 'Gavel\'s deal finder: clean-title cars with little or no damage whose all-in cost (price, buyer fee, transport, likely materials, a cushion) fits the budget, ranked by estimated profit against similar cars. "deals" rest on sold or asking prices; "leads" rest mostly on bids still running.', input_schema: { type: 'object', properties: { budget: { type: 'number', minimum: 500 }, damage: { type: 'string', enum: ['none', 'minor'] }, minYear: { type: 'integer' }, minProfit: { type: 'number' }, makes: { type: 'array', items: { type: 'string' }, maxItems: 8 } }, required: ['budget'], additionalProperties: false },
          label: (i) => `Ran the deal finder at $${Math.round(Number(i.budget) || 0).toLocaleString('en-US')}`,
          run: async (i) => { const b = n(i.budget, 500, 5_000_000); if (!b) throw new Error('Give a budget of at least $500.'); const r = await dealsFor({ budget: b, maxDamage: i.damage === 'none' ? 'none' : 'minor', minYear: n(i.minYear, 1950, 2050), minProfitUsd: n(i.minProfit, 1, 1_000_000), makes: Array.isArray(i.makes) ? i.makes.map((m) => s(m, 40)).filter(Boolean).slice(0, 8) : undefined }); const pick = (d: typeof r.deals[number]) => ({ ...brief(d), allInUsd: d.allInUsd, estProfitUsd: d.spreadUsd, neverBidAboveUsd: d.ceilingUsd, materialsUsd: d.materialsUsd, evidence: d.evidence, cautions: d.cautions.slice(0, 4) }); return { kind: r.kind, budget: r.budget, considered: r.considered, excluded: r.excluded, deals: r.deals.slice(0, 8).map(pick), leads: r.leads.slice(0, 5).map(pick) } } },
        { name: 'car_details', description: 'Everything Gavel knows about one listing: the facts, the similar cars behind the estimate (sold, asking or open bid, with links), the bid plan (most to bid and why), and the materials it will likely need.', input_schema: { type: 'object', properties: { listingId: { type: 'string' } }, required: ['listingId'], additionalProperties: false },
          label: () => 'Opened a car\'s plan',
          run: async (i) => { const l = await ensureKnown(s(i.listingId, 200)); const settings = getSettings(); const card = await cardWithValue(l, settings); const plan = planFor(l, card.estimate, {}, settings); const m = materialsFor(l, now()); return { car: { ...brief(card), description: (l.description ?? '').slice(0, 1200), vin: l.vin ?? null, year: l.year ?? null, make: l.make ?? null, model: l.model ?? null, photos: l.photos.length }, similarCars: card.estimate.ok ? (card.estimate.used ?? []) : [], estimate: card.estimate, plan: { maxBidUsd: plan.maxBidUsd, lines: plan.lines }, materials: { expectedUsd: m.expectedUsd, items: m.items.map((x) => `${x.name} (${x.need}, $${x.lowUsd}-$${x.highUsd})`) }, redFlags: card.score.redFlags } } },
        { name: 'car_record', description: 'The public record for a year, make and model from NHTSA and fueleconomy.gov: recalls (a dealer fixes them free), owner complaints by component, crash ratings and fuel economy.', input_schema: { type: 'object', properties: { year: { type: 'integer' }, make: { type: 'string' }, model: { type: 'string' } }, required: ['year', 'make', 'model'], additionalProperties: false },
          label: (i) => `Checked recalls and complaints: ${n(i.year, 1950, 2050) ?? ''} ${s(i.make, 40)} ${s(i.model, 60)}`,
          run: async (i) => { const y = n(i.year, 1950, 2050); const mk = s(i.make, 40); const md = s(i.model, 60); if (!y || !mk || !md) throw new Error('Give the year, make and model.'); const timed: typeof fetch = (input, init) => fetchImpl(input, { ...init, signal: AbortSignal.timeout(8_000) }); const intel = await carIntel(y, mk, md, timed, now()); return { ...intel, summary: intelSummary(intel) } } },
        { name: 'auction_sites', description: 'The auction directory: every auction house Gavel knows (public, government, enthusiast, salvage, local, collector, dealer-only), who may buy there, the published buyer fee and its page, how to register, what the inventory is like, a beginner caution, and a ready-made search link on that site for a query. Use it to look across many auctions at once.', input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Optional search to build a link for on each site, e.g. "2016 Toyota Camry".' }, group: { type: 'string', enum: HOUSE_GROUPS.map((g) => g.id) }, publicOnly: { type: 'boolean' } }, additionalProperties: false },
          label: (i) => s(i.query, 60) ? `Looked across the auction sites for ${s(i.query, 60)}` : 'Read the auction directory',
          run: async (i) => { const q = s(i.query, 80); const groups = HOUSE_GROUPS.filter((g) => !i.group || g.id === i.group); return groups.map((g) => ({ group: g.title, bestFor: g.bestFor, houses: g.houses.map((id) => houseById(id)).filter((h): h is NonNullable<typeof h> => !!h && (!i.publicOnly || h.access !== 'dealer')).map((h) => ({ name: h.name, url: h.url, whoCanBuy: h.access, buyerFee: h.buyerFee, feePage: h.feeUrl, register: h.register, inventory: h.inventory, starterNote: h.starterNote, readByGavel: h.api === 'official', ...(q ? { searchLink: h.searchUrl(q) } : {}) })) })) } },
        { name: 'my_business', description: 'The member\'s own books: profit per company and overall, cash flow, cars owned and sold, money held in cars, and the partner\'s ranked briefing.', input_schema: { type: 'object', properties: {}, additionalProperties: false },
          label: () => 'Read your books',
          run: async () => { const inp = briefingFor(now()); return { report: inp.report, briefing: briefing(inp), cars: inp.cars.map((c) => ({ title: c.title, status: c.status, company: inp.companies.find((x) => x.id === c.companyId)?.name ?? null, purchaseUsd: c.purchaseUsd, totals: c.totals, targetSaleUsd: c.targetSaleUsd ?? null })), budgetUsd: inp.cashUsd ?? null } } },
        { name: 'my_journey', description: 'Where the member is on the twelve-step first-car journey, today\'s three tasks, their streak, their settings (goal, state, budget), and what they watch and have paper-bid on.', input_schema: { type: 'object', properties: {}, additionalProperties: false },
          label: () => 'Checked your progress',
          run: async () => { const t = now(); const c = coachState(t); const st = getSettings(); return { stage: c.stage.name, steps: JOURNEY.map((j, k) => ({ n: j.n, title: j.title, done: c.status[k].done })), today: c.today, streakDays: streak(c.st.days, t), settings: { goal: st.goal ?? null, state: st.homeState ?? null, budgetUsd: st.cashUsd ?? null, taxTitlePct: st.taxTitlePct ?? null }, watching: listWatch().slice(0, 12).map((w) => ({ id: w.listingId, title: w.title, source: w.snapshot?.source })), paperBids: listPaper().slice(0, 12).map((b) => ({ title: b.title, maxBidUsd: b.maxBidUsd, outcome: b.outcome ?? 'open' })), lookFor: LOOK_FOR } } },
        { name: 'knowledge', description: 'Gavel\'s built-in knowledge: auction house policies, state regulations and the glossary of auction words. Fast; use the web for anything newer or more specific.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
          label: (i) => `Looked it up: ${s(i.query, 60)}`,
          run: async (i) => searchKnowledge(s(i.query, 200), 6) },
        { name: 'estimate_pnl', description: 'Profit and loss for one car: purchase, buyer fee (from the auction\'s published schedule when houseId is given), transport, tax and title, materials, parts, labour, holding and selling costs, against a sale price. Returns each line with its source, break-even, and the sale price for a big margin.', input_schema: { type: 'object', properties: { buyUsd: { type: 'number' }, houseId: { type: 'string' }, transportUsd: { type: 'number' }, taxTitlePct: { type: 'number' }, materialsUsd: { type: 'number' }, partsUsd: { type: 'number' }, labourUsd: { type: 'number' }, sellingUsd: { type: 'number' }, saleUsd: { type: 'number' } }, required: ['buyUsd'], additionalProperties: false },
          label: () => 'Worked out a profit and loss',
          run: async (i) => estimatePnl(pnlInputFrom(i)) },
        { name: 'watch_car', description: 'Add a listing to the member\'s watchlist so Gavel alerts them when it is ending or the price moves. Only when the member asks or agrees.', input_schema: { type: 'object', properties: { listingId: { type: 'string' } }, required: ['listingId'], additionalProperties: false },
          label: () => 'Added a car to your watchlist',
          run: async (i) => { const l = await ensureKnown(s(i.listingId, 200)); addWatch(l); return { watching: l.title } } },
      ]
    }

    if (path === '/api/coach' && method === 'GET') {
      const t = now()
      const c = coachState(t)
      const thread = c.st.threads[c.st.threads.length - 1]
      return json(res, 200, {
        stage: { n: c.stage.n, name: c.stage.name, of: 6 },
        journey: JOURNEY.map((j, k) => ({ n: j.n, title: j.title, why: j.why, do: j.do, lookFor: j.lookFor ?? null, href: j.href, action: j.action, ask: j.ask, auto: !!j.auto, ...c.status[k] })),
        lookFor: LOOK_FOR,
        today: { date: dayKey(t), tasks: c.today, streak: streak(c.st.days, t) },
        headline: c.brief.headline,
        ai: await coachAiStatus(),
        thread: thread ? { id: thread.id, display: thread.display.slice(-40) } : null,
      })
    }
    if (path === '/api/coach/tick' && method === 'POST') {
      const body = await readJsonBody(req)
      const id = str(body.id, 60)
      const done = body.done === true
      const t = now()
      const st = readCoach()
      if (body.kind === 'step') {
        if (!JOURNEY.some((j) => j.id === id)) throw new HttpError(400, 'No journey step with that id.')
        st.ticked = done ? [...new Set([...st.ticked, id])] : st.ticked.filter((x) => x !== id)
      } else {
        if (!/^[a-z]+-[\w:.-]{1,120}$/.test(id)) throw new HttpError(400, 'No task with that id.')
        const day = dayKey(t)
        const list = st.days[day] ?? []
        st.days[day] = done ? [...new Set([...list, id])] : list.filter((x) => x !== id)
      }
      writeCoach(st)
      return json(res, 200, { ok: true, streak: streak(st.days, t) })
    }
    if (path === '/api/coach/new' && method === 'POST') {
      const st = readCoach()
      newThread(st, now())
      writeCoach(st)
      return json(res, 200, { ok: true })
    }
    if (path === '/api/coach/ask' && method === 'POST') {
      const body = await readJsonBody(req)
      const question = str(body.question, 2000).trim()
      if (!question) throw new HttpError(400, 'Ask your coach something.')
      const t = now()
      const c = coachState(t)
      const thread = currentThread(c.st, t)
      const st = getSettings()
      const listingId = str(body.listingId ?? '', 200)
      const note = [
        `(Today is ${new Date(t).toISOString().slice(0, 10)}. Member: stage "${c.stage.name}", next step "${c.stage.next?.title ?? 'all done'}", goal ${st.goal ?? 'not set'}, state ${st.homeState ?? 'not set'}, budget ${st.cashUsd ? '$' + st.cashUsd.toLocaleString('en-US') : 'not set'}.${listingId ? ` They are looking at listing ${listingId}.` : ''})`,
        carryOver(c.st, thread),
      ].filter(Boolean).join('\n')
      const userMsg: DisplayMsg = { role: 'user', text: question, at: t }
      const ai = await coachTurn(thread.api, `${note}\n\n${question}`, coachTools())
      let reply: DisplayMsg
      if (ai) {
        thread.api.push(...ai.appended)
        reply = { role: 'coach', text: ai.text, at: now(), source: 'ai', activity: ai.activity, citations: ai.citations }
      } else {
        const text = coachFromRules(question, { status: c.status, today: c.today, books: c.input, briefing: c.brief, stageName: c.stage.name })
        reply = { role: 'coach', text, at: now(), source: 'rules' }
      }
      thread.display.push(userMsg, reply)
      thread.turns++
      writeCoach(c.st)
      return json(res, 200, { reply, threadId: thread.id })
    }

    if (path === '/api/business/export.csv' && method === 'GET') {
      const only = str(url.searchParams.get('company') ?? '', 80) || undefined
      const csv = ledgerCsv(listGarage(), listCompanies(), only)
      res.setHeader('content-type', 'text/csv; charset=utf-8')
      res.setHeader('content-disposition', `attachment; filename="gavel-books-${new Date(now()).toISOString().slice(0, 10)}.csv"`)
      res.setHeader('cache-control', 'no-store')
      res.statusCode = 200
      res.end('\ufeff' + csv)
      return
    }

    if (path === '/api/business' && method === 'GET') {
      const t = now()
      const input = briefingFor(t)
      return json(res, 200, {
        report: input.report,
        briefing: briefing(input),
        companies: input.companies,
        cars: input.cars.map((c) => ({ ...c, materials: materialsFor({ ...carVehicle(c), mileage: c.mileage }, t) })),
      })
    }

    if (parts[1] === 'companies') {
      const t = now()
      const id = parts[2] ? decodeURIComponent(parts[2]) : ''
      try {
        if (path === '/api/companies' && method === 'POST') return json(res, 200, addCompany(await readJsonBody(req), t))
        if (id && parts.length === 3 && method === 'POST') return json(res, 200, updateCompany(id, await readJsonBody(req), t))
        if (id && parts.length === 3 && method === 'DELETE') {
          if (!removeCompany(id)) throw new HttpError(404, 'No company with that id.')
          return json(res, 200, { ok: true, carsUnassigned: unassignCompany(id) })
        }
        if (id && parts[3] === 'overhead' && parts.length === 4 && method === 'POST') return json(res, 200, addOverhead(id, await readJsonBody(req), t))
        if (id && parts[3] === 'overhead' && parts[4] && method === 'DELETE') return json(res, 200, removeOverhead(id, decodeURIComponent(parts[4]), t))
      } catch (e) {
        if (e instanceof HttpError) throw e
        throw new HttpError(/No company|No entry/.test(e instanceof Error ? e.message : '') ? 404 : 400, e instanceof Error ? e.message : 'That was not saved.')
      }
    }

    if (path === '/api/assistant/ask' && method === 'POST') {
      const body = await readJsonBody(req)
      const question = str(body.question, 1000).trim()
      if (!question) throw new HttpError(400, 'Ask a question about your business.')
      const input = briefingFor(now())
      const brief = briefing(input)
      const context = { settings: { cashUsd: input.cashUsd ?? null, goal: input.goal ?? null }, report: input.report, briefing: brief, companies: input.companies.map((c) => ({ ...c, notes: undefined })), cars: input.cars.map((c) => ({ title: c.title, company: c.companyId ?? null, status: c.status, boughtAt: c.boughtAt, purchaseUsd: c.purchaseUsd, costs: c.costs, income: c.income, totals: c.totals, targetSaleUsd: c.targetSaleUsd ?? null })) }
      const ai = await aiAdvise(question, context)
      return json(res, 200, ai ? { answer: ai, source: 'ai' } : answerFromBooks(question, input, brief))
    }

    if (path === '/api/materials' && method === 'GET') {
      const listingId = str(url.searchParams.get('listingId') ?? '', 200)
      if (listingId) {
        const l = await ensureKnown(listingId)
        return json(res, 200, { title: l.title, ...materialsFor(l, now()) })
      }
      const carId = str(url.searchParams.get('carId') ?? '', 80)
      const car = carId ? listGarage().find((c) => c.id === carId) : undefined
      if (!car) throw new HttpError(404, 'Give a listing or a car from your books.')
      return json(res, 200, { title: car.title, done: car.materialsDone ?? [], ...materialsFor({ ...carVehicle(car), mileage: car.mileage }, now()) })
    }

    if (path === '/api/pnl/prefill' && method === 'GET') {
      // What Gavel already knows about the car, so the estimator opens filled in. Every figure keeps its source.
      const settings = getSettings()
      const t = now()
      const listingId = str(url.searchParams.get('listingId') ?? '', 200)
      const carId = str(url.searchParams.get('carId') ?? '', 80)
      if (listingId) {
        const l = await ensureKnown(listingId)
        const card = await cardWithValue(l, settings)
        const price = l.currentBidUsd ?? l.buyNowUsd
        const m = materialsFor(l, t)
        const input: Partial<PnlInput> = { buyUsd: price, houseId: l.source, feePct: settings.feeOverrides?.[l.source], taxTitlePct: settings.taxTitlePct, materialsUsd: m.expectedUsd, materialsFromRanges: true }
        if (card.estimate.ok) Object.assign(input, { saleUsd: card.estimate.valueUsd, saleLowUsd: card.estimate.low, saleHighUsd: card.estimate.high })
        return json(res, 200, { title: l.title, kind: l.kind, input, estimate: card.estimate.ok ? { valueUsd: card.estimate.valueUsd, comps: card.estimate.comps, low: card.estimate.low, high: card.estimate.high } : null, materials: m })
      }
      const car = carId ? listGarage().find((c) => c.id === carId) : undefined
      if (!car) throw new HttpError(404, 'Give a listing or a car from your books.')
      const totals = totalsFor(car, t)
      const m = materialsFor({ ...carVehicle(car), mileage: car.mileage }, t)
      const done = new Set(car.materialsDone ?? [])
      const left = m.items.filter((x) => x.need !== 'check' && !done.has(x.id)).reduce((s, x) => s + (x.lowUsd + x.highUsd) / 2, 0)
      const input: Partial<PnlInput> = { buyUsd: car.purchaseUsd, spentUsd: totals.spentUsd, materialsUsd: Math.round(left), materialsFromRanges: true, saleUsd: car.targetSaleUsd }
      return json(res, 200, { title: car.title, kind: 'BOOKS', input, totals, materials: m })
    }

    if (path === '/api/pnl' && method === 'POST') {
      try {
        return json(res, 200, estimatePnl(pnlInputFrom(await readJsonBody(req))))
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : 'That could not be worked out.')
      }
    }

    if (path === '/api/parts' && method === 'GET') {
      const carId = str(url.searchParams.get('carId') ?? '', 80)
      const car = carId ? listGarage().find((c) => c.id === carId) : undefined
      if (carId && !car) throw new HttpError(404, 'No car with that id in your books.')
      let vehicle
      try {
        vehicle = vehicleFrom(car ? carVehicle(car) : { year: url.searchParams.get('year'), make: url.searchParams.get('make'), model: url.searchParams.get('model'), vin: url.searchParams.get('vin') })
      } catch (e) {
        throw new HttpError(400, car ? `${car.title}: add its year, make and model in the books first.` : e instanceof Error ? e.message : 'Pick a car.')
      }
      const q = url.searchParams.get('q')
      if (!q) return json(res, 200, { vehicle, categories: partCategories(), ebayConnected: ebayConfigured() })
      let query: string
      try { query = cleanQuery(q) } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : 'Say which part.') }
      let items: Awaited<ReturnType<typeof searchEbayParts>> = []
      let error: string | null = null
      if (ebayConfigured()) {
        const timed: typeof fetch = (input, init) => fetchImpl(input, { ...init, signal: AbortSignal.timeout(8_000) })
        try { items = await searchEbayParts(vehicle, query, timed) } catch (e) { error = session.role === 'owner' && e instanceof Error ? e.message : 'eBay did not answer just now. The store links below still work.' }
      }
      return json(res, 200, { vehicle, query, ebayConnected: ebayConfigured(), items, error, links: partLinks(vehicle, query) })
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
        const companies = f['companies.json'] === null || f['companies.json'] === undefined ? undefined : validateCompaniesFile(f['companies.json'])
        for (const [i, w] of (watch ?? []).entries()) if (!w || typeof (w as { listingId?: unknown }).listingId !== 'string') throw new Error(`watchlist[${i}] is missing its listing id.`)
        for (const [i, b] of (paper ?? []).entries()) if (!b || (b as { mode?: unknown }).mode !== 'PAPER' || typeof (b as { maxBidUsd?: unknown }).maxBidUsd !== 'number') throw new Error(`paper-bids[${i}] is not a paper bid.`)
        // Imports and sold prices are checked exactly like new input, so a hand-edited backup cannot slip anything past.
        const recheck = (name: string, wantSold: boolean) => list(name)?.map((x, i) => {
          try {
            const l = listingFromImport(importFieldsOf(x as Listing), now())
            if ((l.soldUsd !== undefined) !== wantSold) throw new Error(wantSold ? 'it has no sold price' : 'it has a sold price')
            return l
          } catch (e) { throw new Error(`${name.replace('.json', '')}[${i}]: ${e instanceof Error ? e.message : 'did not check out'}`) }
        })
        const imports = recheck('imports.json', false)
        const soldPrices = recheck('sold.json', true)
        if (f['settings.json'] && typeof f['settings.json'] === 'object') { updateSettings(f['settings.json']); restored.push('settings.json') }
        if (watch) { writeJson(userFile('watchlist.json'), watch); restored.push('watchlist.json') }
        if (paper) { writeJson(userFile('paper-bids.json'), paper); restored.push('paper-bids.json') }
        if (targets) { writeJson(userFile('targets.json'), targets); restored.push('targets.json') }
        if (alerts) { writeJson(userFile('alerts.json'), alerts.slice(0, 200)); restored.push('alerts.json') }
        if (companies) { writeJson(userFile('companies.json'), companies); restored.push('companies.json') }
        if (garage) { writeJson(userFile('garage.json'), garage); restored.push('garage.json') }
        if (imports) { writeJson(userFile('imports.json'), imports.slice(0, 500)); restored.push('imports.json') }
        if (soldPrices) { writeJson(userFile('sold.json'), soldPrices.slice(0, 1000)); restored.push('sold.json') }
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
      if (url.pathname === '/share' && req.method === 'GET') {
        // Android's share sheet (the manifest's share_target): a lot shared from an auction's app
        // opens the Import screen with the link and whatever text came with it.
        const q = url.searchParams
        const text = `${q.get('title') ?? ''}\n${q.get('text') ?? ''}`.trim().slice(0, 4000)
        const link = q.get('url') || /https?:\/\/\S+/.exec(text)?.[0] || ''
        const payload = encodeURIComponent(JSON.stringify({ u: /^https?:\/\//i.test(link) ? link.slice(0, 500) : '', t: text }))
        res.writeHead(302, { location: `/#import/${payload}`, 'cache-control': 'no-store' })
        res.end()
        return
      }
      if (url.pathname === '/healthz') {
        // For the host's health check: says the process answers, nothing more.
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
        res.end('ok')
        return
      }
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
    console.log(`  Members:     sign in with email + access code (issue codes on the Members page, or set GAVEL_MEMBER_CODES)`)
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
  startServer().then((started) => {
    // Hosts stop a service with SIGTERM. Finish open requests, then exit; files are written atomically either way.
    const stop = (signal: string) => {
      console.log(`  ${signal}: stopping.`)
      setTimeout(() => process.exit(0), 5000).unref()
      started.close().then(() => process.exit(0))
    }
    process.once('SIGTERM', () => stop('SIGTERM'))
    process.once('SIGINT', () => stop('SIGINT'))
  }).catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
