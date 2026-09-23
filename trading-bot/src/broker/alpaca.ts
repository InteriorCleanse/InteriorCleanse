/**
 * BROKER PORTFOLIO — read-only.
 *
 * Custom code to look at your real brokerage account (Alpaca) from inside the
 * bot. It reads the account balance and open positions and NOTHING ELSE. There
 * is deliberately no function here that can place, change or cancel an order,
 * so connecting real keys can show your portfolio but can never move your
 * money. Live execution stays gated exactly as before.
 *
 * SECURITY
 * - Keys come only from the environment (MRCASH_ALPACA_KEY / _SECRET). They are
 *   never written to the repo, the trade record, the ops log, or any response.
 * - The default endpoint is the PAPER account; live is reached only when you
 *   explicitly set MRCASH_ALPACA_MODE=live.
 * - Keys are sent solely to Alpaca over HTTPS, in request headers, and are
 *   redacted from every error surfaced to the UI.
 *
 * Alpaca's API is documented at https://docs.alpaca.markets/ ; the two
 * endpoints used are GET /v2/account and GET /v2/positions.
 */

export type BrokerPosition = {
  symbol: string
  qty: number
  side: 'long' | 'short'
  avgEntry: number
  marketValue: number
  unrealizedPl: number
  unrealizedPlpc: number
}

export type Portfolio = {
  kind: 'BROKER PORTFOLIO'
  /** Never LIVE-executing: this view only reads. */
  execution: 'READ-ONLY'
  connected: boolean
  mode: 'PAPER' | 'LIVE'
  asOf: number
  account: { equity: number; cash: number; buyingPower: number; currency: string; status: string } | null
  positions: BrokerPosition[]
  note: string
}

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/** Redact anything that could carry a key out of an error message. */
function safeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/[A-Za-z0-9]{16,}/g, '[redacted]').slice(0, 160)
}

export function alpacaConfig(): { key: string; secret: string; mode: 'PAPER' | 'LIVE'; base: string } | null {
  const key = process.env.MRCASH_ALPACA_KEY || ''
  const secret = process.env.MRCASH_ALPACA_SECRET || ''
  if (!key || !secret) return null
  const mode = (process.env.MRCASH_ALPACA_MODE || 'paper').toLowerCase() === 'live' ? 'LIVE' : 'PAPER'
  const base = process.env.MRCASH_ALPACA_URL || (mode === 'LIVE' ? 'https://api.alpaca.markets' : 'https://paper-api.alpaca.markets')
  return { key, secret, mode, base: base.replace(/\/$/, '') }
}

async function get(base: string, path: string, key: string, secret: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${base}${path}`, { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, accept: 'application/json' }, signal })
  if (res.status === 401 || res.status === 403) throw new Error('broker rejected the keys (check they are the right paper/live keys)')
  if (!res.ok) throw new Error(`broker returned HTTP ${res.status}`)
  return res.json()
}

/**
 * Read the account and open positions. Never throws: a missing key or a failed
 * call returns `connected:false` with a plain-English note, so the desk can
 * always render honestly.
 */
export async function fetchPortfolio(now = Date.now()): Promise<Portfolio> {
  const base: Portfolio = { kind: 'BROKER PORTFOLIO', execution: 'READ-ONLY', connected: false, mode: 'PAPER', asOf: now, account: null, positions: [], note: '' }
  const cfg = alpacaConfig()
  if (!cfg) return { ...base, note: 'Not connected. Set MRCASH_ALPACA_KEY and MRCASH_ALPACA_SECRET to your Alpaca PAPER keys to see your account here (read-only).' }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 8000)
  try {
    const [a, p] = await Promise.all([
      get(cfg.base, '/v2/account', cfg.key, cfg.secret, ac.signal) as Promise<Record<string, unknown>>,
      get(cfg.base, '/v2/positions', cfg.key, cfg.secret, ac.signal) as Promise<Array<Record<string, unknown>>>,
    ])
    const positions: BrokerPosition[] = (Array.isArray(p) ? p : []).map((x) => ({
      symbol: String(x.symbol ?? ''),
      qty: num(x.qty),
      side: String(x.side) === 'short' ? 'short' : 'long',
      avgEntry: num(x.avg_entry_price),
      marketValue: num(x.market_value),
      unrealizedPl: num(x.unrealized_pl),
      unrealizedPlpc: num(x.unrealized_plpc),
    }))
    return {
      ...base, connected: true, mode: cfg.mode,
      account: { equity: num(a.equity), cash: num(a.cash), buyingPower: num(a.buying_power), currency: String(a.currency ?? 'USD'), status: String(a.status ?? 'unknown') },
      positions,
      note: `${cfg.mode} account, read-only. ${positions.length} open position${positions.length === 1 ? '' : 's'}. Mr. Cash can see this but cannot trade it.`,
    }
  } catch (e) {
    return { ...base, mode: cfg.mode, note: `Could not read the ${cfg.mode} account: ${safeError(e)}` }
  } finally {
    clearTimeout(timer)
  }
}
