/**
 * PREDICTION MARKETS — public, read-only quotes from two venues.
 *
 *   Polymarket  Gamma API   GET /markets?active=true&closed=false   (no key)
 *   Kalshi      Trade API   GET /trade-api/v2/markets?status=open   (no key)
 *
 * Both are normalised into one `PmMarket` shape: a YES price between 0 and 1,
 * the best bid and ask, the spread, a day's volume, liquidity, when the
 * market closes, and, once it has closed, how it resolved. Nothing here
 * places an order or holds a key: the desk that reads these has no wallet
 * and no account. Parsers are pure so the fixtures in the tests can be
 * SYNTHETIC without touching the network.
 */

export type Venue = 'polymarket' | 'kalshi'

export type PmMarket = {
  /** `${venue}:${id}` */
  key: string
  venue: Venue
  id: string
  question: string
  url: string
  /** The venue's own grouping (an event with several outcomes), when it has one. */
  eventId: string | null
  category: string
  /** The YES mid, 0..1. */
  yes: number
  bid: number | null
  ask: number | null
  spread: number | null
  volume24h: number
  liquidity: number
  /** ms since epoch, or null when the venue gives no close time. */
  endsAt: number | null
  /** YES price change over the last day, in probability points, when the venue gives it. */
  change24h: number | null
  closed: boolean
  /** Only once the venue has settled the market. */
  outcome: 'YES' | 'NO' | null
}

export const polymarketBase = () => (process.env.MRCASH_POLYMARKET_URL || 'https://gamma-api.polymarket.com').replace(/\/$/, '')
export const kalshiBase = () => (process.env.MRCASH_KALSHI_URL || 'https://api.elections.kalshi.com').replace(/\/$/, '')

const num = (v: unknown): number | null => { const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(n) ? n : null }
const prob = (v: unknown): number | null => { const n = num(v); return n === null ? null : n >= 0 && n <= 1 ? n : null }
const asList = (v: unknown): unknown[] => { if (Array.isArray(v)) return v; if (typeof v === 'string') { try { const j = JSON.parse(v); return Array.isArray(j) ? j : [] } catch { return [] } } return [] }
const r4 = (v: number | null) => (v === null ? null : Math.round(v * 1e4) / 1e4)
const clean = (s: unknown, max = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Polymarket's Gamma rows: prices come as JSON strings inside strings, and a settled market shows 1/0 outcome prices. */
export function parsePolymarket(body: unknown): PmMarket[] {
  const rows = Array.isArray(body) ? body : asList((body as { data?: unknown })?.data)
  const out: PmMarket[] = []
  for (const r of rows as Array<Record<string, unknown>>) {
    if (!r || typeof r !== 'object') continue
    const id = clean(r.id ?? r.conditionId, 80)
    const question = clean(r.question ?? r.title)
    if (!id || !question) continue
    const outcomes = asList(r.outcomes).map((o) => String(o).toUpperCase())
    const prices = asList(r.outcomePrices).map(prob)
    const yesIdx = Math.max(0, outcomes.indexOf('YES'))
    const yesPrice = prices[yesIdx] ?? null
    const bid = prob(r.bestBid), ask = prob(r.bestAsk)
    const yes = yesPrice ?? (bid !== null && ask !== null ? (bid + ask) / 2 : null)
    if (yes === null) continue
    const closed = r.closed === true || r.active === false
    const settled = closed && prices.length >= 2 && prices.every((p) => p === 0 || p === 1)
    const outcome: PmMarket['outcome'] = settled ? (prices[yesIdx] === 1 ? 'YES' : 'NO') : null
    const events = asList(r.events) as Array<Record<string, unknown>>
    const eventId = clean(r.eventId ?? (events[0] && events[0].id) ?? '', 80) || null
    const slug = clean(r.slug, 160)
    const endsAt = r.endDate ? Date.parse(String(r.endDate)) : NaN
    out.push({
      key: `polymarket:${id}`, venue: 'polymarket', id, question, url: slug ? `https://polymarket.com/market/${slug}` : 'https://polymarket.com',
      eventId, category: clean(r.category ?? (events[0] && events[0].category) ?? 'other', 40) || 'other',
      yes, bid, ask, spread: r4(num(r.spread) ?? (bid !== null && ask !== null ? ask - bid : null)),
      volume24h: num(r.volume24hr) ?? num(r.volume24hrClob) ?? 0, liquidity: num(r.liquidityNum) ?? num(r.liquidity) ?? 0,
      endsAt: Number.isFinite(endsAt) ? endsAt : null, change24h: num(r.oneDayPriceChange), closed, outcome,
    })
  }
  return out
}

/** Kalshi quotes in cents; `result` is 'yes' or 'no' once settled. */
export function parseKalshi(body: unknown): PmMarket[] {
  const rows = asList((body as { markets?: unknown })?.markets ?? body)
  const out: PmMarket[] = []
  for (const r of rows as Array<Record<string, unknown>>) {
    if (!r || typeof r !== 'object') continue
    const id = clean(r.ticker, 80)
    const question = clean(r.title ?? r.subtitle)
    if (!id || !question) continue
    const c = (k: string) => { const n = num(r[k]); return n === null ? null : n > 1 ? n / 100 : n }
    const bid = c('yes_bid'), ask = c('yes_ask'), last = c('last_price')
    const yes = bid !== null && ask !== null && ask > 0 ? (bid + ask) / 2 : last
    if (yes === null) continue
    const status = clean(r.status, 20).toLowerCase()
    const result = clean(r.result, 10).toLowerCase()
    const closed = status === 'closed' || status === 'settled' || status === 'finalized'
    const endsAt = r.close_time ? Date.parse(String(r.close_time)) : NaN
    const prev = c('previous_price')
    out.push({
      key: `kalshi:${id}`, venue: 'kalshi', id, question, url: `https://kalshi.com/markets/${encodeURIComponent(id.split('-')[0].toLowerCase())}`,
      eventId: clean(r.event_ticker, 80) || null, category: clean(r.category, 40) || 'other',
      yes, bid, ask, spread: r4(bid !== null && ask !== null ? ask - bid : null),
      volume24h: num(r.volume_24h) ?? 0, liquidity: (num(r.liquidity) ?? 0) / 100,
      endsAt: Number.isFinite(endsAt) ? endsAt : null, change24h: r4(prev !== null && last !== null ? last - prev : null),
      closed, outcome: result === 'yes' ? 'YES' : result === 'no' ? 'NO' : null,
    })
  }
  return out
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
export type SourceResult = { ok: true; markets: PmMarket[] } | { ok: false; reason: string }

const safeReason = (e: unknown) => String((e as Error)?.message ?? e).replace(/https?:\/\/\S+/g, '[url]').slice(0, 120)

async function getJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (mr-cash paper desk; +local)' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally { clearTimeout(timer) }
}

/** The most-traded open markets on Polymarket. */
export async function fetchPolymarket(limit = 200, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<SourceResult> {
  try {
    const body = await getJson(`${polymarketBase()}/markets?active=true&closed=false&archived=false&limit=${Math.min(500, limit)}&order=volume24hr&ascending=false`, fetchImpl)
    return { ok: true, markets: parsePolymarket(body) }
  } catch (e) { return { ok: false, reason: `Polymarket: ${safeReason(e)}` } }
}

/** The open markets on Kalshi, one page. */
export async function fetchKalshi(limit = 200, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<SourceResult> {
  try {
    const body = await getJson(`${kalshiBase()}/trade-api/v2/markets?status=open&limit=${Math.min(1000, limit)}`, fetchImpl)
    return { ok: true, markets: parseKalshi(body) }
  } catch (e) { return { ok: false, reason: `Kalshi: ${safeReason(e)}` } }
}

/** One market by key, for settling a paper position after it leaves the open list. */
export async function fetchOne(key: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<PmMarket | null> {
  const [venue, ...rest] = key.split(':')
  const id = rest.join(':')
  try {
    if (venue === 'polymarket') { const m = parsePolymarket([await getJson(`${polymarketBase()}/markets/${encodeURIComponent(id)}`, fetchImpl)]); return m[0] ?? null }
    if (venue === 'kalshi') { const b = await getJson(`${kalshiBase()}/trade-api/v2/markets/${encodeURIComponent(id)}`, fetchImpl) as { market?: unknown }; const m = parseKalshi([b?.market ?? b]); return m[0] ?? null }
  } catch { /* unreachable venue: the position stays open, not guessed */ }
  return null
}
