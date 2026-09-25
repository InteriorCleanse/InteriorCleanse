/**
 * BIG MONEY sources: where the filings and volume leaders come from.
 *
 * - Quiver Quantitative (MRCASH_QUIVER_KEY): congress trades, insider trades,
 *   off-exchange volume. Paid; the key goes in .env only.
 * - SEC EDGAR (MRCASH_SEC_CONTACT): insider Form 4 filings, free. The SEC
 *   asks every automated client to identify itself with a contact in the
 *   User-Agent, so without one this source stays off.
 * - Alpaca market data (the existing read-only keys): the most-active stocks
 *   by volume, and the day's biggest movers.
 *
 * Every call is a GET to a data endpoint. Nothing here can place an order,
 * and keys travel only in request headers, never in URLs or logs.
 */
import { alpacaConfig } from '../broker/alpaca.ts'
import { alpacaDataBase, safeReason, type FetchLike } from '../markets/sources.ts'
import { calendarDay, form4FilingsFrom, parseForm4Xml, parseQuiverCongress, parseQuiverInsiders, parseQuiverOffExchange, type CongressTrade, type InsiderTrade, type OffExchange } from './parse.ts'

export type SourceState = { status: 'CONNECTED' | 'NOT CONNECTED' | 'NOT IN PLAN' | 'ERROR' | 'OVERRIDE'; detail: string }
type Result<T> = { ok: true; data: T } | { ok: false; state: SourceState }

const TIMEOUT = 20_000
const trim = (u: string) => u.replace(/\/$/, '')

async function getJson(url: string, headers: Record<string, string>, fetchImpl: FetchLike): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    const res = await fetchImpl(url, { headers: { accept: 'application/json', ...headers }, signal: controller.signal })
    let body: unknown = null
    try { body = await res.json() } catch { body = null }
    return { status: res.status, body }
  } finally { clearTimeout(timer) }
}

/* ------------------------------- Quiver ------------------------------- */

export const quiverBase = () => trim(process.env.MRCASH_QUIVER_URL || 'https://api.quiverquant.com')
export const quiverKey = () => (process.env.MRCASH_QUIVER_KEY || '').trim() || null

async function quiver<T>(path: string, parse: (b: unknown) => T, fetchImpl: FetchLike): Promise<Result<T>> {
  const key = quiverKey()
  if (!key) return { ok: false, state: { status: 'NOT CONNECTED', detail: 'Add a Quiver Quantitative API key as MRCASH_QUIVER_KEY in .env to see congress and off-exchange data.' } }
  try {
    const { status, body } = await getJson(`${quiverBase()}${path}`, { Authorization: `Token ${key}` }, fetchImpl)
    if (status === 401 || status === 403) return { ok: false, state: { status: 'ERROR', detail: 'Quiver rejected the key.' } }
    if (typeof body === 'string' && /upgrade/i.test(body)) return { ok: false, state: { status: 'NOT IN PLAN', detail: 'This dataset is not in your Quiver plan.' } }
    if (status >= 400) return { ok: false, state: { status: 'ERROR', detail: `Quiver returned HTTP ${status}.` } }
    return { ok: true, data: parse(body) }
  } catch (e) { return { ok: false, state: { status: 'ERROR', detail: `Quiver: ${safeReason(e)}` } } }
}

export const fetchCongress = (f: FetchLike = fetch as unknown as FetchLike) => quiver<CongressTrade[]>('/beta/live/congresstrading', parseQuiverCongress, f)
export const fetchQuiverInsiders = (f: FetchLike = fetch as unknown as FetchLike) => quiver<InsiderTrade[]>('/beta/live/insiders', parseQuiverInsiders, f)
export const fetchOffExchange = (f: FetchLike = fetch as unknown as FetchLike) => quiver<OffExchange[]>('/beta/live/offexchange', parseQuiverOffExchange, f)

/* ------------------------------- SEC EDGAR ------------------------------- */

export const secContact = () => (process.env.MRCASH_SEC_CONTACT || '').trim() || null
export const secWww = () => trim(process.env.MRCASH_SEC_URL || 'https://www.sec.gov')
export const secData = () => trim(process.env.MRCASH_SEC_DATA_URL || 'https://data.sec.gov')
const secHeaders = () => ({ 'User-Agent': `Mr. Cash paper-trading research tool (${secContact()})` })
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

let tickerMap: { at: number; map: Map<string, number> } | null = null

/** SEC's own ticker → CIK list, kept for a day. */
async function cikFor(tickers: string[], fetchImpl: FetchLike, now: number): Promise<Map<string, number>> {
  if (!tickerMap || now - tickerMap.at > 86_400_000) {
    const { status, body } = await getJson(`${secWww()}/files/company_tickers.json`, secHeaders(), fetchImpl)
    if (status >= 400 || !body || typeof body !== 'object') throw new Error(`SEC ticker list returned HTTP ${status}`)
    const map = new Map<string, number>()
    for (const v of Object.values(body as Record<string, { cik_str?: number; ticker?: string }>)) if (v?.ticker && Number.isFinite(v.cik_str)) map.set(String(v.ticker).toUpperCase(), Number(v.cik_str))
    tickerMap = { at: now, map }
  }
  const out = new Map<string, number>()
  for (const t of tickers) { const c = tickerMap.map.get(t.toUpperCase()); if (c) out.set(t.toUpperCase(), c) }
  return out
}

/** Recent Form 4 filings for each ticker, parsed from the raw XML. Remembers what it has already read. */
export async function fetchSecInsiders(tickers: string[], opts: { days?: number; perTicker?: number; now?: number; seen?: Map<string, InsiderTrade[]>; fetchImpl?: FetchLike; gapMs?: number } = {}): Promise<Result<InsiderTrade[]>> {
  if (!secContact()) return { ok: false, state: { status: 'NOT CONNECTED', detail: 'Set MRCASH_SEC_CONTACT in .env to your name or email: the SEC requires one on automated requests. Then insider filings load free from EDGAR.' } }
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike)
  const now = opts.now ?? Date.now()
  const gap = opts.gapMs ?? 150 // well under the SEC's ten requests a second
  const since = calendarDay(now - (opts.days ?? 90) * 86_400_000)
  const seen = opts.seen ?? new Map<string, InsiderTrade[]>()
  const out: InsiderTrade[] = []
  try {
    const ciks = await cikFor(tickers, fetchImpl, now)
    for (const [t, cik] of ciks) {
      await pause(gap)
      const { status, body } = await getJson(`${secData()}/submissions/CIK${String(cik).padStart(10, '0')}.json`, secHeaders(), fetchImpl)
      if (status >= 400) continue
      for (const f of form4FilingsFrom(body, { since, max: opts.perTicker ?? 8 })) {
        const cached = seen.get(f.accession)
        if (cached) { out.push(...cached); continue }
        await pause(gap)
        const url = `${secWww()}/Archives/edgar/data/${cik}/${f.accession.replace(/-/g, '')}/${f.xmlFile}`
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), TIMEOUT)
        try {
          const res = await fetchImpl(url, { headers: secHeaders(), signal: controller.signal }) as unknown as { ok: boolean; text?: () => Promise<string> }
          if (!res.ok || typeof res.text !== 'function') continue
          const rows = parseForm4Xml(await res.text(), { filed: f.filed, accession: f.accession }).filter((r) => r.ticker === t)
          seen.set(f.accession, rows)
          out.push(...rows)
        } finally { clearTimeout(timer) }
      }
    }
    return { ok: true, data: out }
  } catch (e) { return { ok: false, state: { status: 'ERROR', detail: `SEC EDGAR: ${safeReason(e)}` } } }
}

/* ------------------------------- Alpaca screener ------------------------------- */

export type Mover = { symbol: string; changePct: number | null; price: number | null }
export type Active = { symbol: string; volume: number | null; trades: number | null }

/** The most-active stocks by volume, and the biggest gainers and losers, from Alpaca's screener. */
export async function fetchLeaders(fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<Result<{ mostActive: Active[]; gainers: Mover[]; losers: Mover[]; asOf: string | null }>> {
  const cfg = alpacaConfig()
  if (!cfg) return { ok: false, state: { status: 'NOT CONNECTED', detail: 'Add read-only Alpaca keys (MRCASH_ALPACA_KEY / _SECRET) to see the most-traded stocks.' } }
  const h = { 'APCA-API-KEY-ID': cfg.key, 'APCA-API-SECRET-KEY': cfg.secret }
  try {
    const [a, m] = await Promise.all([
      getJson(`${alpacaDataBase()}/v1beta1/screener/stocks/most-actives?by=volume&top=20`, h, fetchImpl),
      getJson(`${alpacaDataBase()}/v1beta1/screener/stocks/movers?top=10`, h, fetchImpl),
    ])
    if (a.status === 401 || a.status === 403) return { ok: false, state: { status: 'ERROR', detail: 'Alpaca rejected the keys for market data.' } }
    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null)
    const ab = (a.body ?? {}) as { most_actives?: Array<Record<string, unknown>>; last_updated?: string }
    const mb = (m.body ?? {}) as { gainers?: Array<Record<string, unknown>>; losers?: Array<Record<string, unknown>> }
    const mover = (x: Record<string, unknown>): Mover => ({ symbol: String(x.symbol ?? ''), changePct: n(x.percent_change), price: n(x.price) })
    return {
      ok: true,
      data: {
        mostActive: (ab.most_actives ?? []).map((x) => ({ symbol: String(x.symbol ?? ''), volume: n(x.volume), trades: n(x.trade_count) })).filter((x) => x.symbol),
        gainers: (mb.gainers ?? []).map(mover).filter((x) => x.symbol),
        losers: (mb.losers ?? []).map(mover).filter((x) => x.symbol),
        asOf: ab.last_updated ? String(ab.last_updated) : null,
      },
    }
  } catch (e) { return { ok: false, state: { status: 'ERROR', detail: `Alpaca: ${safeReason(e)}` } } }
}
