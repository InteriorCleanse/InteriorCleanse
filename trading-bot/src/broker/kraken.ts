/**
 * KRAKEN PORTFOLIO — read-only.
 *
 * Lets Mr. Cash see your real Kraken account: what you hold and what it is
 * worth in US dollars. It reads and NOTHING ELSE. The client can call exactly
 * two endpoints, both balance queries, and has no function that can place,
 * change or cancel an order, move funds, or withdraw.
 *
 * TWO LOCKS, NOT ONE
 * 1. This code: the only paths it will sign are in READ_PATHS below. A test
 *    fails if an order, withdrawal or transfer endpoint ever appears here.
 * 2. Kraken itself: create the API key with ONLY the "Query Funds" permission
 *    (docs/BROKER.md walks through it). Kraken then refuses anything else from
 *    that key, even if some future code tried. Belt and braces.
 *
 * SECURITY
 * - The key and secret come only from the environment (MRCASH_KRAKEN_KEY /
 *   MRCASH_KRAKEN_SECRET). They are never written to the repo, the record, the
 *   ops log, or any response, and are redacted from every error.
 * - They are sent only to Kraken over HTTPS: the key in the API-Key header, and
 *   the secret never at all — it only signs the request (HMAC-SHA512), so the
 *   secret itself never leaves your machine.
 *
 * Kraken's REST API: https://docs.kraken.com/api/ — private calls are POSTs
 * signed with API-Sign = base64(HMAC-SHA512(path + SHA256(nonce + body), secret)).
 */
import { createHash, createHmac } from 'node:crypto'

/** The only private endpoints this client may call. Both need just "Query Funds". */
export const READ_PATHS = ['/0/private/Balance', '/0/private/TradeBalance'] as const
type ReadPath = (typeof READ_PATHS)[number]

export type KrakenHolding = { asset: string; code: string; qty: number }

export type KrakenPortfolio = {
  kind: 'BROKER PORTFOLIO'
  broker: 'KRAKEN'
  /** Never executing: this view only reads. */
  execution: 'READ-ONLY'
  connected: boolean
  /** Kraken has no paper account, so a connected key is your real account — read, never traded. */
  mode: 'LIVE ACCOUNT · READ-ONLY'
  asOf: number
  account: { totalUsd: number; equityUsd: number } | null
  holdings: KrakenHolding[]
  note: string
}

/** Kraken's legacy asset codes, mapped to the names people use. Anything else passes through. */
const ASSET_NAMES: Record<string, string> = {
  XXBT: 'BTC', XBT: 'BTC', XETH: 'ETH', ETH2: 'ETH', XXRP: 'XRP', XLTC: 'LTC', XXLM: 'XLM', XXDG: 'DOGE', XDG: 'DOGE',
  XETC: 'ETC', XXMR: 'XMR', XZEC: 'ZEC', XREP: 'REP', XMLN: 'MLN',
  ZUSD: 'USD', ZEUR: 'EUR', ZGBP: 'GBP', ZCAD: 'CAD', ZJPY: 'JPY', ZAUD: 'AUD', ZCHF: 'CHF',
}
export function assetName(code: string): string {
  const base = code.split('.')[0] // staking and earn balances carry suffixes like ETH2.S or DOT.F
  return ASSET_NAMES[base] ?? base
}

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/** Redact anything that could carry a key out of an error message. */
function safeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/[A-Za-z0-9+/=]{16,}/g, '[redacted]').slice(0, 160)
}

export function krakenConfig(): { key: string; secret: string; base: string } | null {
  const key = process.env.MRCASH_KRAKEN_KEY || ''
  const secret = process.env.MRCASH_KRAKEN_SECRET || ''
  if (!key || !secret) return null
  const base = (process.env.MRCASH_KRAKEN_URL || 'https://api.kraken.com').replace(/\/$/, '')
  return { key, secret, base }
}

/** Kraken's request signature. Pure, so it can be checked against Kraken's own documented example. */
export function krakenSignature(path: string, nonce: string, body: string, secretB64: string): string {
  const sha = createHash('sha256').update(nonce + body).digest()
  return createHmac('sha512', Buffer.from(secretB64, 'base64')).update(Buffer.concat([Buffer.from(path), sha])).digest('base64')
}

// Kraken requires each nonce to be larger than the last one used with the key.
let lastNonce = 0
function nextNonce(now: number): string {
  lastNonce = Math.max(lastNonce + 1, now * 1000)
  return String(lastNonce)
}

async function readPrivate(cfg: { key: string; secret: string; base: string }, path: ReadPath, params: Record<string, string>, signal: AbortSignal, now: number): Promise<Record<string, unknown>> {
  if (!READ_PATHS.includes(path)) throw new Error('refused: not a read-only endpoint') // unreachable by type; kept as a runtime guard
  const nonce = nextNonce(now)
  const body = new URLSearchParams({ nonce, ...params }).toString()
  const res = await fetch(`${cfg.base}${path}`, {
    method: 'POST', signal, body,
    headers: { 'API-Key': cfg.key, 'API-Sign': krakenSignature(path, nonce, body, cfg.secret), 'content-type': 'application/x-www-form-urlencoded; charset=utf-8', accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Kraken returned HTTP ${res.status}`)
  const j = await res.json() as { error?: unknown[]; result?: Record<string, unknown> }
  const errors = Array.isArray(j.error) ? j.error.map(String) : []
  if (errors.length) {
    if (errors.some((x) => /Permission denied/i.test(x))) throw new Error('Kraken refused: the key needs the "Query Funds" permission')
    if (errors.some((x) => /Invalid key|Invalid signature/i.test(x))) throw new Error('Kraken rejected the key or secret — check both were copied in full')
    if (errors.some((x) => /Invalid nonce/i.test(x))) throw new Error('Kraken rejected the nonce — this key may be in use by another app; give Mr. Cash its own key')
    throw new Error(`Kraken said: ${errors.join('; ')}`)
  }
  return j.result ?? {}
}

/**
 * Read the balances and the account's total value in USD. Never throws: a
 * missing key or a failed call returns `connected:false` with a plain-English
 * note, so the app can always render honestly.
 */
export async function fetchKrakenPortfolio(now = Date.now()): Promise<KrakenPortfolio> {
  const base: KrakenPortfolio = { kind: 'BROKER PORTFOLIO', broker: 'KRAKEN', execution: 'READ-ONLY', connected: false, mode: 'LIVE ACCOUNT · READ-ONLY', asOf: now, account: null, holdings: [], note: '' }
  const cfg = krakenConfig()
  if (!cfg) return { ...base, note: 'Not connected. Set MRCASH_KRAKEN_KEY and MRCASH_KRAKEN_SECRET to a Kraken API key that has ONLY the "Query Funds" permission (see docs/BROKER.md).' }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 8000)
  try {
    // Sequential on purpose: Kraken wants each nonce larger than the last one it saw.
    const bal = await readPrivate(cfg, '/0/private/Balance', {}, ac.signal, now)
    const tb = await readPrivate(cfg, '/0/private/TradeBalance', { asset: 'ZUSD' }, ac.signal, now)
    const holdings: KrakenHolding[] = Object.entries(bal)
      .map(([code, qty]) => ({ code, asset: assetName(code), qty: num(qty) }))
      .filter((h) => h.qty > 0)
      .sort((a, b) => a.asset.localeCompare(b.asset))
    return {
      ...base, connected: true,
      account: { totalUsd: num(tb.eb), equityUsd: num(tb.e) },
      holdings,
      note: `Your real Kraken account, read-only. ${holdings.length} asset${holdings.length === 1 ? '' : 's'} held. Mr. Cash can see this but cannot trade, move or withdraw it.`,
    }
  } catch (e) {
    return { ...base, note: `Could not read Kraken: ${safeError(e)}` }
  } finally {
    clearTimeout(timer)
  }
}

/** Which brokers are wired up, without touching the network or revealing anything secret. */
export function brokerStatus() {
  return {
    execution: 'READ-ONLY' as const,
    brokers: [
      { id: 'kraken', name: 'Kraken', markets: 'crypto', configured: !!krakenConfig(), route: '/api/portfolio/kraken', built: true },
      { id: 'alpaca', name: 'Alpaca', markets: 'stocks, options, crypto', configured: !!(process.env.MRCASH_ALPACA_KEY && process.env.MRCASH_ALPACA_SECRET), route: '/api/portfolio', built: true },
      { id: 'tastytrade', name: 'tastytrade', markets: 'stocks, options, futures', configured: false, route: null, built: false },
      { id: 'coinbase', name: 'Coinbase', markets: 'crypto', configured: false, route: null, built: false },
      { id: 'robinhood', name: 'Robinhood', markets: 'crypto (official API covers crypto only)', configured: false, route: null, built: false },
      { id: 'webull', name: 'Webull', markets: 'stocks, options', configured: false, route: null, built: false },
      { id: 'cryptocom', name: 'Crypto.com', markets: 'crypto', configured: false, route: null, built: false },
    ],
    note: 'Every connection is read-only: it shows balances and holdings and cannot trade. Keys live only in environment variables on your PC.',
  }
}
