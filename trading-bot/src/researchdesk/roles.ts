/**
 * THE RESEARCH DESK — six roles, one watchlist, and a short list of decision
 * cards. The idea comes from the "Grok Bot research desk" guide: Scout flags,
 * Hunter scores, Reporter explains, Whale adds the big-money angle, Skeptic
 * tries to kill the idea, and Chief passes along only what survives, at most
 * three cards a day.
 *
 * Here the six are plain functions over data Kestrel already reads: the
 * market watch (hourly candles), the news feed, the economic calendar and the
 * public insider filings. They never trade, never size anything and never
 * feed the engine. The owner's files (watchlist, alert rules, checklist,
 * limits) are the owner's: no role changes them.
 *
 * Honest limits, said once here and again on the page:
 *   - the market watch keeps days of hourly history, not years, so "highest
 *     in 12 months" and "the last 3 months" are measured over the stored
 *     window, and the window's length is printed beside every such reading;
 *   - earnings dates are not in the calendar feed, so that checklist line is
 *     UNKNOWN for single stocks unless a macro release already fails it;
 *   - there is no free large-transfer feed for crypto wired in, so Whale says
 *     NOT CONNECTED for coins rather than guessing.
 *
 * Pure functions. No I/O.
 */

import type { Candle, CalendarEvent, Headline } from '../types.ts'
import type { MarketKind } from '../markets/sources.ts'
import type { InsiderTrade } from '../bigmoney/parse.ts'

// ---------------------------------------------------------------- the owner's files

export type DeskConfig = {
  /** Market-watch keys (`kind:SYMBOL`). Empty means every watched market. */
  watchlist: string[]
  rules: {
    /** Flag a stock or fund that moves at least this much in a day. */
    stockMovePct: number
    /** Flag a coin that moves at least this much in 24 hours. */
    coinMovePct: number
    /** Flag a currency pair that moves at least this much in a day. */
    fxMovePct: number
    /** Flag when the day's volume is at least this many times the usual day. */
    volumeMult: number
    /** Flag a close at the highest or lowest of the stored window. */
    extremes: boolean
  }
  /** Checklist line 2 ("a company or project I actually understand"): the keys the owner has marked. */
  understood: string[]
  /** How many of the six checklist lines must PASS before Chief will consider a card. */
  minPass: number
  limits: {
    maxCardsPerDay: number
    maxNewIdeasPerWeek: number
    /** Kinds the owner does not want ideas about at all. */
    excludeKinds: MarketKind[]
  }
}

/** The guide's example files, as defaults. They are examples to edit, not recommendations. */
export const DEFAULT_CONFIG: DeskConfig = {
  watchlist: [],
  rules: { stockMovePct: 5, coinMovePct: 8, fxMovePct: 1, volumeMult: 2, extremes: true },
  understood: [],
  minPass: 4,
  limits: { maxCardsPerDay: 3, maxNewIdeasPerWeek: 2, excludeKinds: [] },
}

const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }
const KINDS: MarketKind[] = ['crypto', 'forex', 'stock', 'index']

/** Clean an owner-submitted config: every number bounded, every list of known shape. Never throws. */
export function sanitizeConfig(raw: unknown, base: DeskConfig = DEFAULT_CONFIG): DeskConfig {
  const r = (raw ?? {}) as Partial<DeskConfig> & { rules?: Partial<DeskConfig['rules']>; limits?: Partial<DeskConfig['limits']> }
  const keys = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).slice(0, 40)).filter((x) => /^[a-z]+:[A-Z0-9.\-]+$/.test(x)))].slice(0, 40) : [])
  return {
    watchlist: r.watchlist !== undefined ? keys(r.watchlist) : base.watchlist,
    rules: {
      stockMovePct: num(r.rules?.stockMovePct, 0.5, 50, base.rules.stockMovePct),
      coinMovePct: num(r.rules?.coinMovePct, 0.5, 80, base.rules.coinMovePct),
      fxMovePct: num(r.rules?.fxMovePct, 0.1, 20, base.rules.fxMovePct),
      volumeMult: num(r.rules?.volumeMult, 1.1, 20, base.rules.volumeMult),
      extremes: r.rules?.extremes === undefined ? base.rules.extremes : r.rules.extremes === true,
    },
    understood: r.understood !== undefined ? keys(r.understood) : base.understood,
    minPass: Math.round(num(r.minPass, 1, 6, base.minPass)),
    limits: {
      maxCardsPerDay: Math.round(num(r.limits?.maxCardsPerDay, 0, 10, base.limits.maxCardsPerDay)),
      maxNewIdeasPerWeek: Math.round(num(r.limits?.maxNewIdeasPerWeek, 0, 50, base.limits.maxNewIdeasPerWeek)),
      excludeKinds: Array.isArray(r.limits?.excludeKinds) ? (r.limits!.excludeKinds as unknown[]).map(String).filter((k): k is MarketKind => (KINDS as string[]).includes(k)) : base.limits.excludeKinds,
    },
  }
}

// ---------------------------------------------------------------- shared readings

const DAY = 86_400_000
const HOUR = 3_600_000
const pct = (v: number, d = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`

export type MarketInput = {
  key: string
  kind: MarketKind
  symbol: string
  label: string
  status: 'live' | 'stale' | 'closed' | 'no data'
  price: number | null
  changePct24h: number | null
  candles: Candle[]
  provenance: string
}

/** Daily buckets from hourly candles (UTC days for crypto and FX, New York days for stocks). */
export function days(c: Candle[], kind: MarketKind): Array<{ day: string; open: number; close: number; high: number; low: number; volume: number; lastAt: number }> {
  const tz = kind === 'stock' || kind === 'index' ? 'America/New_York' : 'UTC'
  const map = new Map<string, { day: string; open: number; close: number; high: number; low: number; volume: number; lastAt: number }>()
  for (const k of c) {
    const day = new Date(k.openTime).toLocaleDateString('en-CA', { timeZone: tz })
    const d = map.get(day)
    if (!d) map.set(day, { day, open: k.open, close: k.close, high: k.high, low: k.low, volume: k.volume, lastAt: k.closeTime })
    else { d.close = k.close; d.high = Math.max(d.high, k.high); d.low = Math.min(d.low, k.low); d.volume += k.volume; d.lastAt = k.closeTime }
  }
  return [...map.values()]
}

export type Window = { days: number; high: number; low: number; changePct: number; volumeRatio: number | null }

/**
 * What the stored window says, measured against the LAST 24 HOURS (the same
 * span as the day's change): the range before them, the change over the whole
 * window, and the last 24 hours' volume against the usual 24 hours before.
 */
export function window(m: MarketInput): Window | null {
  const c = m.candles
  if (c.length < 48) return null
  const end = c[c.length - 1].closeTime
  const cut = end - 24 * HOUR
  const past = c.filter((k) => k.closeTime <= cut), last = c.filter((k) => k.closeTime > cut)
  if (past.length < 24 || !last.length) return null
  const blocks: number[] = []
  for (let t = cut; t - 24 * HOUR >= past[0].openTime; t -= 24 * HOUR) blocks.push(past.filter((k) => k.closeTime <= t && k.closeTime > t - 24 * HOUR).reduce((a, k) => a + k.volume, 0))
  const usual = blocks.length ? blocks.reduce((a, v) => a + v, 0) / blocks.length : 0
  const lastVol = last.reduce((a, k) => a + k.volume, 0)
  return {
    days: Math.max(1, Math.round((end - c[0].openTime) / DAY)),
    high: Math.max(...past.map((k) => k.high)),
    low: Math.min(...past.map((k) => k.low)),
    changePct: ((c[c.length - 1].close - c[0].open) / c[0].open) * 100,
    volumeRatio: usual > 0 && lastVol > 0 ? lastVol / usual : null,
  }
}

// ---------------------------------------------------------------- Scout

export type FlagRule = 'move' | 'volume' | 'high' | 'low'
export type Flag = { key: string; label: string; kind: MarketKind; symbol: string; rule: FlagRule; direction: 'up' | 'down'; text: string; price: number; at: number; provenance: string }

/** Scout: check each market against the owner's rules, and nothing else. No flag is invented to look busy. */
export function scout(markets: MarketInput[], cfg: DeskConfig, now: number): { flags: Flag[]; skipped: string[] } {
  const flags: Flag[] = [], skipped: string[] = []
  const list = cfg.watchlist.length ? markets.filter((m) => cfg.watchlist.includes(m.key)) : markets
  for (const m of list) {
    if (m.status !== 'live' || m.price === null) { skipped.push(`${m.label}: ${m.status === 'closed' ? 'market closed' : m.status === 'stale' ? 'data is stale' : 'no data'}, not scanned`); continue }
    const w = window(m)
    const dir: 'up' | 'down' = (m.changePct24h ?? 0) >= 0 ? 'up' : 'down'
    const base = { key: m.key, label: m.label, kind: m.kind, symbol: m.symbol, price: m.price, at: now, provenance: m.provenance }
    const limit = m.kind === 'crypto' ? cfg.rules.coinMovePct : m.kind === 'forex' ? cfg.rules.fxMovePct : cfg.rules.stockMovePct
    if (m.changePct24h !== null && Math.abs(m.changePct24h) >= limit) flags.push({ ...base, rule: 'move', direction: dir, text: `${pct(m.changePct24h)} in 24 hours (rule: ${limit}%)` })
    if (w && w.volumeRatio !== null && w.volumeRatio >= cfg.rules.volumeMult && m.kind !== 'forex') flags.push({ ...base, rule: 'volume', direction: dir, text: `volume ${w.volumeRatio.toFixed(1)}× the usual 24 hours over ${w.days} stored days (rule: ${cfg.rules.volumeMult}×)` })
    if (w && cfg.rules.extremes && m.price > w.high) flags.push({ ...base, rule: 'high', direction: 'up', text: `above the highest price of the stored ${w.days} days before the last 24 hours (${w.high.toPrecision(6)})` })
    if (w && cfg.rules.extremes && m.price < w.low) flags.push({ ...base, rule: 'low', direction: 'down', text: `below the lowest price of the stored ${w.days} days before the last 24 hours (${w.low.toPrecision(6)})` })
  }
  return { flags, skipped }
}

// ---------------------------------------------------------------- Reporter

const ALIASES: Record<string, string[]> = {
  BTC: ['bitcoin', 'btc'], ETH: ['ethereum', 'ether', 'eth'], SOL: ['solana'], XRP: ['xrp', 'ripple'], BNB: ['bnb', 'binance coin'], DOGE: ['dogecoin', 'doge'],
  AAPL: ['apple'], NVDA: ['nvidia'], TSLA: ['tesla'], MSFT: ['microsoft'], AMZN: ['amazon'], META: ['meta', 'facebook'], GOOGL: ['alphabet', 'google'], AMD: ['amd'], COST: ['costco'],
  SPY: ['s&p 500', 's&p', 'stocks'], QQQ: ['nasdaq'], DIA: ['dow'], GLD: ['gold'], SLV: ['silver'], USO: ['oil', 'crude'], UNG: ['natural gas'], IEF: ['treasur', 'yields'],
  EUR: ['euro', 'ecb'], GBP: ['pound', 'sterling', 'boe'], JPY: ['yen', 'boj'], CHF: ['franc', 'snb'], CAD: ['canadian dollar', 'loonie'], AUD: ['aussie', 'rba'],
}

/** The words a headline must contain to be about this market. */
export function termsFor(kind: MarketKind, symbol: string, label: string): string[] {
  const base = kind === 'crypto' ? symbol.replace(/(USDT|USDC|USD|BUSD)$/, '') : symbol
  const parts = kind === 'forex' ? [base.slice(0, 3), base.slice(3, 6)] : [base]
  const t = new Set<string>()
  for (const p of parts) { for (const a of ALIASES[p] ?? []) t.add(a); if (p.length >= 3 && kind !== 'forex') t.add(p.toLowerCase()) }
  const word = label.split(/[\s/(]/)[0].toLowerCase()
  if (word.length >= 4 && !/^(s&p|the)$/.test(word)) t.add(word)
  return [...t]
}

const POS = /\b(beat|beats|surge|surges|soar|record high|approv|upgrade|rall(y|ies)|jump|gain|inflow|partnership|buyback|raises guidance)\w*/i
const NEG = /\b(miss|misses|plunge|slump|tumble|recall|lawsuit|probe|downgrade|hack|exploit|outflow|cut|cuts|layoff|ban|fraud|halt|sell-off|selloff|crash)\w*/i
const SOCIAL = /\b(x\.com|twitter|reddit|forum|telegram|discord|tiktok|stocktwits)\b/i

export type NewsNote = {
  verdict: 'CONFIRMED' | 'RUMOUR' | 'NO CLEAR CAUSE'
  cause: string
  confirmedBy: number
  sentiment: 'Positive' | 'Negative' | 'Mixed' | '—'
  sources: Array<{ title: string; source: string; time: number; link: string }>
  oldest: number | null
}

/** Reporter: why did it move? Two independent outlets in the last 48 hours make a confirmed cause; one is a rumour; none is "no clear cause". */
export function reporter(f: Pick<Flag, 'kind' | 'symbol' | 'label'>, headlines: Headline[] | null, now: number): NewsNote {
  if (!headlines) return { verdict: 'NO CLEAR CAUSE', cause: 'The news feed is not connected, so no cause was looked for.', confirmedBy: 0, sentiment: '—', sources: [], oldest: null }
  const terms = termsFor(f.kind, f.symbol, f.label)
  const hits = headlines.filter((h) => now - h.time <= 48 * HOUR && h.time <= now && terms.some((w) => h.title.toLowerCase().includes(w))).sort((a, b) => b.time - a.time)
  if (!hits.length) return { verdict: 'NO CLEAR CAUSE', cause: `No clear cause found: no headline in the last 48 hours mentions ${f.label}.`, confirmedBy: 0, sentiment: '—', sources: [], oldest: null }
  const outlets = new Set(hits.filter((h) => !SOCIAL.test(h.source) && !SOCIAL.test(h.link)).map((h) => h.source.toLowerCase()))
  const pos = hits.filter((h) => POS.test(h.title)).length, neg = hits.filter((h) => NEG.test(h.title)).length
  const sentiment: NewsNote['sentiment'] = pos && neg ? 'Mixed' : pos ? 'Positive' : neg ? 'Negative' : 'Mixed'
  const verdict: NewsNote['verdict'] = outlets.size >= 2 ? 'CONFIRMED' : 'RUMOUR'
  const top = hits[0]
  return {
    verdict, confirmedBy: outlets.size, sentiment,
    cause: verdict === 'CONFIRMED' ? `"${top.title.slice(0, 140)}" (${top.source})` : `RUMOUR: only ${outlets.size ? 'one outlet' : 'social posts'} so far: "${top.title.slice(0, 120)}" (${top.source})`,
    sources: hits.slice(0, 4).map((h) => ({ title: h.title.slice(0, 160), source: h.source, time: h.time, link: h.link })),
    oldest: Math.min(...hits.map((h) => h.time)),
  }
}

// ---------------------------------------------------------------- Whale

export type WhaleNote = { status: 'UNUSUAL' | 'NOTHING UNUSUAL' | 'NOT CONNECTED'; lines: string[] }

/** Whale: insider open-market buying and selling for stocks; coins say NOT CONNECTED rather than guess. Big money moving does not say where the price goes. */
export function whale(f: Pick<Flag, 'kind' | 'symbol'>, insiders: InsiderTrade[] | null, now: number): WhaleNote {
  if (f.kind === 'crypto') return { status: 'NOT CONNECTED', lines: ['No large-transfer tracker is wired in for coins. Whale reports nothing rather than guess a wallet.'] }
  if (f.kind === 'forex') return { status: 'NOTHING UNUSUAL', lines: ['Currency pairs have no insider filings.'] }
  if (!insiders) return { status: 'NOT CONNECTED', lines: ['The insider-filings feed is not connected.'] }
  const recent = insiders.filter((t) => t.ticker === f.symbol && (t.side === 'buy' || t.side === 'sell') && t.filed && now - Date.parse(t.filed) <= 30 * DAY)
  if (!recent.length) return { status: 'NOTHING UNUSUAL', lines: ['No open-market insider buying or selling filed in the last 30 days.'] }
  const usd = (v: number | null) => (v === null ? 'value not stated' : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}k`)
  const buys = recent.filter((t) => t.side === 'buy'), unplanned = recent.filter((t) => t.side === 'sell' && !t.plan)
  const lines = recent.slice(0, 4).map((t) => `${t.who}${t.role ? ` (${t.role})` : ''} ${t.side === 'buy' ? 'bought' : 'sold'} ${usd(t.value)} on ${t.date ?? '?'}${t.plan ? ', under a pre-arranged plan (routine)' : ''}.`)
  return { status: buys.length || unplanned.length ? 'UNUSUAL' : 'NOTHING UNUSUAL', lines }
}

// ---------------------------------------------------------------- Hunter

export type Line = { n: number; test: string; result: 'PASS' | 'FAIL' | 'UNKNOWN'; evidence: string }

export const CHECKLIST = [
  'Is there a confirmed news reason?',
  'Is the company or project one I actually understand?',
  'Is the move in the same direction as the trend of the stored window?',
  'No earnings report or big scheduled event in the next 7 days?',
  'Is volume above normal?',
  'Could I explain this idea to a friend in two sentences?',
] as const

/** Hunter: the owner's six-line checklist, line by line, with the evidence. UNKNOWN when a line cannot be checked; never PASS on a hunch. */
export function hunter(f: Flag, m: MarketInput, news: NewsNote, calendar: CalendarEvent[] | null, cfg: DeskConfig, now: number): { lines: Line[]; score: number } {
  const w = window(m)
  const lines: Line[] = []
  lines.push({ n: 1, test: CHECKLIST[0], result: news.verdict === 'CONFIRMED' ? 'PASS' : 'FAIL', evidence: news.verdict === 'CONFIRMED' ? `${news.confirmedBy} outlets` : news.verdict === 'RUMOUR' ? 'rumour only' : 'no clear cause found' })
  lines.push({ n: 2, test: CHECKLIST[1], result: cfg.understood.includes(f.key) ? 'PASS' : 'UNKNOWN', evidence: cfg.understood.includes(f.key) ? 'you marked it' : 'yours to answer: mark it in the desk settings' })
  if (!w) lines.push({ n: 3, test: CHECKLIST[2], result: 'UNKNOWN', evidence: 'fewer than 3 stored days' })
  else { const same = (w.changePct >= 0) === (f.direction === 'up'); lines.push({ n: 3, test: CHECKLIST[2], result: same ? 'PASS' : 'FAIL', evidence: `${pct(w.changePct)} over ${w.days} stored days (the guide asks for 3 months; this is what is stored)` }) }
  if (!calendar) lines.push({ n: 4, test: CHECKLIST[3], result: 'UNKNOWN', evidence: 'the calendar is not connected' })
  else {
    const ccy = f.kind === 'forex' ? [f.symbol.slice(0, 3), f.symbol.slice(3, 6)] : ['USD']
    const ev = calendar.find((e) => e.impact === 'High' && e.time > now && e.time - now <= 7 * DAY && ccy.includes(e.country))
    if (ev) lines.push({ n: 4, test: CHECKLIST[3], result: 'FAIL', evidence: `${ev.country} ${ev.title} on ${new Date(ev.time).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}` })
    else if (f.kind === 'stock') lines.push({ n: 4, test: CHECKLIST[3], result: 'UNKNOWN', evidence: 'no high-impact release; earnings dates are not in the feed, so check the company calendar' })
    else lines.push({ n: 4, test: CHECKLIST[3], result: 'PASS', evidence: 'no high-impact release in 7 days' })
  }
  if (!w || w.volumeRatio === null) lines.push({ n: 5, test: CHECKLIST[4], result: 'UNKNOWN', evidence: 'no usable volume history' })
  else lines.push({ n: 5, test: CHECKLIST[4], result: w.volumeRatio > 1 ? 'PASS' : 'FAIL', evidence: `${w.volumeRatio.toFixed(1)}× the usual 24 hours` })
  lines.push({ n: 6, test: CHECKLIST[5], result: 'UNKNOWN', evidence: 'yours to answer on the card' })
  return { lines, score: lines.filter((l) => l.result === 'PASS').length }
}

// ---------------------------------------------------------------- Skeptic

export type SkepticNote = { limits: 'PASSES LIMITS' | 'BREAKS LIMITS'; broken: string | null; reasons: string[]; provesWrong: string; flags: string[] }

/** Skeptic: the "no" voice. Three reasons it could go wrong, what proves it wrong, and the owner's limits. Not balanced on purpose. */
export function skeptic(f: Flag, m: MarketInput, news: NewsNote, hunt: { lines: Line[] }, whaleNote: WhaleNote, cfg: DeskConfig, ideasThisWeek: number, now: number): SkepticNote {
  const w = window(m)
  const reasons: string[] = []
  const line = (n: number) => hunt.lines.find((l) => l.n === n)!
  if (line(3).result === 'FAIL') reasons.push(`The move runs against the stored window's direction (${line(3).evidence}). Moves against the trend fail often.`)
  if (line(4).result === 'FAIL') reasons.push(`A scheduled release is coming: ${line(4).evidence}. Prices swing hardest on those days.`)
  if (news.verdict !== 'CONFIRMED') reasons.push(news.verdict === 'RUMOUR' ? 'The cause rests on a single source. One source is a rumour, not a reason.' : 'Nobody has explained the move. A move with no confirmed cause is the most dangerous kind.')
  if (line(5).result === 'FAIL') reasons.push(`Volume is not above normal (${line(5).evidence}): few people are behind this move.`)
  if (whaleNote.status === 'UNUSUAL' && whaleNote.lines.some((l) => / sold /.test(l)) && f.direction === 'up') reasons.push('Insiders have been selling outside a pre-arranged plan while the price rises.')
  if (f.rule === 'move' && Math.abs(m.changePct24h ?? 0) >= 2 * (f.kind === 'crypto' ? cfg.rules.coinMovePct : cfg.rules.stockMovePct)) reasons.push(`The day's move is more than twice the alert line: chasing a move that size means buying after it happened.`)
  const unknown = hunt.lines.filter((l) => l.result === 'UNKNOWN')
  if (unknown.length) reasons.push(`${unknown.length} checklist line${unknown.length === 1 ? ' is' : 's are'} unanswered (${unknown.map((l) => l.n).join(', ')}): the score is a floor, not a verdict.`)
  if (w) reasons.push(`Only ${w.days} days of history are stored. A longer view could tell a different story.`)
  reasons.push('A flag is a description of what already happened. It says nothing about what happens next.')
  const flags: string[] = []
  if (news.confirmedBy <= 1) flags.push('single source or none')
  if (news.oldest !== null && now - news.oldest > 48 * HOUR) flags.push('news older than 48 hours')
  const provesWrong = w ? (f.direction === 'up' ? `A close back below ${w.low.toPrecision(6)}, the low of the stored days before the last 24 hours.` : `A further fall below ${Math.min(w.low, m.price ?? w.low).toPrecision(6)}, today's low point or the stored low, whichever is lower.`) : 'Not enough stored history to name a level.'
  let broken: string | null = null
  if (cfg.limits.excludeKinds.includes(f.kind)) broken = `no ${f.kind} ideas`
  else if (ideasThisWeek >= cfg.limits.maxNewIdeasPerWeek) broken = `max ${cfg.limits.maxNewIdeasPerWeek} new ideas per week (${ideasThisWeek} already)`
  return { limits: broken ? 'BREAKS LIMITS' : 'PASSES LIMITS', broken, reasons: reasons.slice(0, 3), provesWrong, flags }
}

// ---------------------------------------------------------------- Chief

export type Idea = { id: string; at: number; flag: Flag; flags: Flag[]; news: NewsNote; hunt: { lines: Line[]; score: number }; whale: WhaleNote; skeptic: SkepticNote }

export type Card = {
  id: string
  at: number
  key: string
  label: string
  kind: MarketKind
  rule: FlagRule
  direction: 'up' | 'down'
  price: number
  whatHappened: string
  why: string
  bigMoney: string
  fit: string
  against: string
  provesWrong: string
  limits: 'PASSES LIMITS'
  sources: Array<{ title: string; source: string; time: number; link: string }>
  choice: 'research' | 'watch' | 'ignore' | null
}

/** Chief: only what passed the checklist line, has a confirmed cause and passes the limits, best fit first, at most the daily cap. Everything else is logged, not sent. */
export function chief(ideas: Idea[], cfg: DeskConfig, sentToday: number): { cards: Card[]; held: Array<{ idea: Idea; why: string }> } {
  const held: Array<{ idea: Idea; why: string }> = []
  const ok: Idea[] = []
  for (const i of ideas) {
    if (i.hunt.score < cfg.minPass) held.push({ idea: i, why: `checklist ${i.hunt.score}/6, under ${cfg.minPass}` })
    else if (i.news.verdict !== 'CONFIRMED') held.push({ idea: i, why: i.news.verdict === 'RUMOUR' ? 'rumour only' : 'no confirmed cause' })
    else if (i.skeptic.limits !== 'PASSES LIMITS') held.push({ idea: i, why: `breaks limits: ${i.skeptic.broken}` })
    else ok.push(i)
  }
  ok.sort((a, b) => b.hunt.score - a.hunt.score || b.news.confirmedBy - a.news.confirmedBy)
  const room = Math.max(0, cfg.limits.maxCardsPerDay - sentToday)
  for (const i of ok.slice(room)) held.push({ idea: i, why: `daily cap of ${cfg.limits.maxCardsPerDay} cards reached` })
  const cards = ok.slice(0, room).map((i): Card => ({
    id: i.id, at: i.at, key: i.flag.key, label: i.flag.label, kind: i.flag.kind, rule: i.flag.rule, direction: i.flag.direction, price: i.flag.price,
    whatHappened: `${i.flag.label}: ${i.flags.map((f) => f.text).join('; ')}`,
    why: i.news.cause,
    bigMoney: i.whale.status === 'UNUSUAL' ? i.whale.lines[0] : i.whale.status === 'NOT CONNECTED' ? `not connected (${i.whale.lines[0]})` : 'nothing unusual',
    fit: `${i.hunt.score}/6 on your checklist${i.hunt.lines.some((l) => l.result === 'UNKNOWN') ? ` (${i.hunt.lines.filter((l) => l.result === 'UNKNOWN').map((l) => `line ${l.n}`).join(', ')} unknown)` : ''}`,
    against: i.skeptic.reasons[0] ?? '—',
    provesWrong: i.skeptic.provesWrong,
    limits: 'PASSES LIMITS',
    sources: i.news.sources,
    choice: null,
  }))
  return { cards, held }
}

// ---------------------------------------------------------------- the scorecard and the dry run

/** The close on the Nth market day after `at`, from the stored candles, or null if that day has not happened yet. */
export function closeAfter(c: Candle[], kind: MarketKind, at: number, n: number): number | null {
  const after = days(c.filter((k) => k.openTime >= at), kind)
  return after.length > n ? after[n].close : null
}

export type ScoreRow = { rule: FlagRule; cards: number; checked5: number; followed5: number; checked20: number; followed20: number; status: 'OK' | 'NOT ENOUGH DATA' }

/** Per alert rule: of the cards whose 5- and 20-day closes are known, how many moved the way the flag did. A tally, not advice. */
export function tally(cards: Array<Pick<Card, 'rule' | 'direction' | 'price'> & { after5: number | null; after20: number | null }>): ScoreRow[] {
  const rules: FlagRule[] = ['move', 'volume', 'high', 'low']
  return rules.map((rule) => {
    const cs = cards.filter((c) => c.rule === rule)
    const follow = (c: typeof cs[number], p: number | null) => (p === null ? null : c.direction === 'up' ? p > c.price : p < c.price)
    const f5 = cs.map((c) => follow(c, c.after5)).filter((x) => x !== null), f20 = cs.map((c) => follow(c, c.after20)).filter((x) => x !== null)
    return { rule, cards: cs.length, checked5: f5.length, followed5: f5.filter(Boolean).length, checked20: f20.length, followed20: f20.filter(Boolean).length, status: f5.length >= 10 ? 'OK' : 'NOT ENOUGH DATA' }
  })
}

/** How many flags the rules would have raised on each stored day: the noise meter the guide asks for before going live. */
export function dryRun(markets: MarketInput[], cfg: DeskConfig): { byDay: Array<{ day: string; flags: number; which: string[] }>; perDay: number; advice: string; daysChecked: number } {
  const byDay = new Map<string, string[]>()
  const list = cfg.watchlist.length ? markets.filter((m) => cfg.watchlist.includes(m.key)) : markets
  for (const m of list) {
    const d = days(m.candles, m.kind)
    const limit = m.kind === 'crypto' ? cfg.rules.coinMovePct : m.kind === 'forex' ? cfg.rules.fxMovePct : cfg.rules.stockMovePct
    for (let i = 2; i < d.length; i++) {
      const prev = d.slice(1, i), today = d[i]
      const ch = ((today.close - d[i - 1].close) / d[i - 1].close) * 100
      const usual = prev.reduce((a, x) => a + x.volume, 0) / prev.length
      const hits: string[] = []
      if (Math.abs(ch) >= limit) hits.push(`${m.label} ${pct(ch)}`)
      if (m.kind !== 'forex' && usual > 0 && today.volume >= cfg.rules.volumeMult * usual) hits.push(`${m.label} volume ${(today.volume / usual).toFixed(1)}×`)
      if (cfg.rules.extremes && i >= 3) { const hi = Math.max(...d.slice(0, i).map((x) => x.high)), lo = Math.min(...d.slice(0, i).map((x) => x.low)); if (today.close > hi) hits.push(`${m.label} new high`); if (today.close < lo) hits.push(`${m.label} new low`) }
      if (hits.length) byDay.set(today.day, [...(byDay.get(today.day) ?? []), ...hits])
      else if (!byDay.has(today.day)) byDay.set(today.day, [])
    }
  }
  const rows = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, which]) => ({ day, flags: which.length, which }))
  const total = rows.reduce((a, r) => a + r.flags, 0)
  const perDay = rows.length ? total / rows.length : 0
  const advice = !rows.length ? 'NOT ENOUGH DATA: no stored days to replay yet.' : perDay > 3 ? `About ${perDay.toFixed(1)} flags a day: too noisy. Tighten the rules (for example 7% instead of 5%).` : total === 0 ? `No flags in ${rows.length} days: the rules may be too tight to ever fire. Loosen them a little.` : `About ${perDay.toFixed(1)} flags a day: within the guide's 0 to 3.`
  return { byDay: rows, perDay: Math.round(perDay * 10) / 10, advice, daysChecked: rows.length }
}
