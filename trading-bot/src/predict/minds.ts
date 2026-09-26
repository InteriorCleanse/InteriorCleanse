/**
 * THE TEN MINDS — ten readers of one prediction market, and a council.
 *
 * The viral "Grok bot" story is one model with one instruction. The bots that
 * do this seriously run several models side by side and keep score of each.
 * That is the shape here: ten minds read the same market, each from one
 * angle, each says what it sees and how sure it is, and the council combines
 * the ones that gave a number. Every mind is scored on its own after the
 * market resolves (src/predict/desk.ts), so the record shows which angles
 * know something and which are noise.
 *
 * Every rule here is hand-set and openly untested as a trading rule. A mind
 * that has no opinion says QUIET; one that lacks the data it needs says BLIND
 * and names what it is waiting on. None of them invents a fact: the only
 * numbers are the venue's prices and volumes, the news feed and the
 * calendar, and, when the owner turns it on, a language model's own estimate
 * with its reasons.
 *
 * Pure functions. Nothing here reads the engine, and nothing here trades.
 */

import type { CalendarEvent, Headline } from '../types.ts'
import type { PmMarket } from './sources.ts'

export type MindId = 'crowd' | 'longshot' | 'clock' | 'drift' | 'depth' | 'spread' | 'headlines' | 'calendar' | 'family' | 'oracle'

export type MindRead = {
  id: MindId
  name: string
  /** One line: what this mind looks at. Fixed. */
  role: string
  /** Its probability that the market resolves YES, or null when it only speaks to confidence. */
  p: number | null
  /** How much weight it asks for, 0..1. */
  confidence: number
  lean: 'yes' | 'no' | 'none'
  for: string[]
  against: string[]
  status: 'SPOKE' | 'QUIET' | 'BLIND'
  waitingOn: string | null
}

/** What a language model returned, when the owner turned that mind on. */
export type OracleRead = { p: number; confidence: number; for: string[]; against: string[]; model: string; at: number }

export type MindInput = {
  market: PmMarket
  /** Other markets in the same event (the other outcomes), excluding this one. */
  siblings: PmMarket[]
  headlines: Headline[] | null
  calendar: CalendarEvent[] | null
  /** 'off' when MRCASH_PREDICT_AI is not set; null when on but not asked yet. */
  oracle: OracleRead | null | 'off'
  now: number
}

/** The creator's reported parameters, kept as written and labelled as his. */
export const PARAMS = {
  /** Flag a market when the council differs from the price by at least this much. */
  mispricing: 0.08,
  /** No paper position larger than this share of the bankroll. */
  positionCap: 0.06,
  /** Rescan cadence in minutes. */
  everyMinutes: 10,
  /** The desk's own guards, not the creator's. */
  minConfidence: 0.35,
  maxSpread: 0.08,
  minLiquidityUsd: 1_000,
  maxOpen: 10,
  maxDaysToClose: 60,
  minHoursToClose: 1,
  startingBankrollUsd: 100,
  /** Below this many resolved positions, a mind's score is NOT ENOUGH DATA. */
  minResolved: 30,
} as const

export const MIND_META: Record<MindId, { name: string; role: string }> = {
  crowd: { name: 'CROWD', role: 'The price itself: the market\'s own probability' },
  longshot: { name: 'LONGSHOT', role: 'The favourite–longshot bias at the edges' },
  clock: { name: 'CLOCK', role: 'How much time is left for the thing to happen' },
  drift: { name: 'DRIFT', role: 'Which way the price moved in the last day' },
  depth: { name: 'DEPTH', role: 'How much money stands behind the price' },
  spread: { name: 'SPREAD', role: 'What a fill actually costs' },
  headlines: { name: 'HEADLINES', role: 'What the news feed says about it' },
  calendar: { name: 'CALENDAR', role: 'A scheduled release that decides it' },
  family: { name: 'FAMILY', role: 'Whether the event\'s outcomes add up' },
  oracle: { name: 'ORACLE', role: 'A language model\'s estimate, with its reasons' },
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const pts = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)} pts`
const cents = (v: number) => `${Math.round(v * 100)}¢`
const usd = (v: number) => v >= 1_000_000 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`
const hours = (ms: number) => ms / 3_600_000

function mind(id: MindId, r: Partial<MindRead>): MindRead {
  return { id, name: MIND_META[id].name, role: MIND_META[id].role, p: null, confidence: 0, lean: 'none', for: [], against: [], status: 'QUIET', waitingOn: null, ...r }
}
const blind = (id: MindId, waitingOn: string) => mind(id, { status: 'BLIND', waitingOn })

const STOP = new Set(['will', 'the', 'this', 'that', 'with', 'from', 'than', 'have', 'been', 'before', 'after', 'about', 'which', 'what', 'when', 'over', 'under', 'into', 'more', 'less', 'their', 'there', 'other', 'between', 'through', 'market', 'price', 'reach', 'above', 'below', 'close', 'week', 'month', 'year', '2024', '2025', '2026', '2027'])
/** Words a headline would have to share with the question to be about it. */
export function keywords(question: string): string[] {
  const words = question.toLowerCase().replace(/[^a-z0-9$%.\s-]/g, ' ').split(/\s+/).map((w) => w.replace(/^[.-]+|[.-]+$/g, ''))
  return [...new Set(words.filter((w) => (w.length >= 4 && !STOP.has(w)) || /^\$?\d[\d,.]*[kmb%]?$/.test(w)))].slice(0, 12)
}

export function crowdMind(i: MindInput): MindRead {
  const m = i.market
  // One voice among ten, not the anchor: the council measures its distance from this price, so the price must not also dominate the council.
  const conf = clamp(0.2 + m.liquidity / 200_000, 0.2, 0.6)
  return mind('crowd', { p: m.yes, confidence: conf, lean: m.yes >= 0.5 ? 'yes' : 'no', status: 'SPOKE', for: [`The market prices YES at ${cents(m.yes)}: that is the crowd's probability, and the strongest prior there is.`, `${usd(m.volume24h)} traded in the last day; ${usd(m.liquidity)} of liquidity.`], against: ['A price is what the last traders agreed, not what is true; thin markets are moved by one order.'] })
}

export function longshotMind(i: MindInput): MindRead {
  const y = i.market.yes
  if (y < 0.12) return mind('longshot', { p: y * 0.75, confidence: 0.35, lean: 'no', status: 'SPOKE', for: [`Contracts priced under ${cents(0.12)} have historically paid out less often than their price implies (the favourite–longshot bias). Reads ${cents(y)} as nearer ${cents(y * 0.75)}.`], against: ['A documented tendency across many markets, not a law; untested on this venue by this desk.'] })
  if (y > 0.88) return mind('longshot', { p: y + (1 - y) * 0.25, confidence: 0.35, lean: 'yes', status: 'SPOKE', for: [`Heavy favourites over ${cents(0.88)} have historically paid out slightly more often than their price. Reads ${cents(y)} as nearer ${cents(y + (1 - y) * 0.25)}.`], against: ['The gain is small and a fee can eat it; one surprise wipes out many small wins.'] })
  return mind('longshot', { against: [`At ${cents(y)} the price is in the middle, where this bias has nothing to say.`] })
}

const MUST_HAPPEN = /\b(by|before|until|reach|hit|announce|sign|pass|launch|release|confirm|resign|win|approve|cross|exceed|above|below)\b/i
export function clockMind(i: MindInput): MindRead {
  const m = i.market
  if (m.endsAt === null) return blind('clock', 'a close time from the venue')
  const left = hours(m.endsAt - i.now)
  if (left <= 0) return mind('clock', { against: ['Past its close time; waiting on the venue to resolve it.'] })
  const days = left / 24
  const when = left < 48 ? `${Math.round(left)} hours` : `${Math.round(days)} days`
  if (left <= 72 && m.yes >= 0.15 && m.yes <= 0.6 && MUST_HAPPEN.test(m.question)) {
    const p = m.yes * (0.7 + 0.3 * (left / 72))
    return mind('clock', { p, confidence: 0.3, lean: 'no', status: 'SPOKE', for: [`${when} left and it has not happened yet: things that need to happen by a date mostly do not happen at the last minute. Reads ${cents(m.yes)} as ${cents(p)}.`], against: ['Some events are scheduled for the final day (a vote, a release), and then the clock says nothing.'] })
  }
  if (left <= 72 && m.yes >= 0.75) {
    const p = m.yes + (1 - m.yes) * 0.15
    return mind('clock', { p, confidence: 0.25, lean: 'yes', status: 'SPOKE', for: [`${when} left with YES at ${cents(m.yes)}: little time for a reversal. Reads it as ${cents(p)}.`], against: ['The last day is exactly when a surprise is most expensive.'] })
  }
  return mind('clock', { against: [days > 3 ? `${when} to go: too much time for the clock alone to say anything.` : `${when} left but the price (${cents(m.yes)}) and the question give the clock no lean.`] })
}

export function driftMind(i: MindInput): MindRead {
  const m = i.market
  if (m.change24h === null) return blind('drift', 'a day of price history from the venue')
  const p = clamp(m.yes + 0.5 * m.change24h, 0.01, 0.99)
  const big = Math.abs(m.change24h) >= 0.05
  return mind('drift', { p, confidence: big ? 0.4 : 0.25, lean: m.change24h > 0.01 ? 'yes' : m.change24h < -0.01 ? 'no' : 'none', status: 'SPOKE', for: [`Moved ${pts(m.change24h)} in the last day${big ? ', a big move: someone learned something' : ''}. Leans half of that move forward, to ${cents(p)}.`], against: ['Momentum in these markets reverses as often as it continues, and a day is a short window.'] })
}

export function depthMind(i: MindInput): MindRead {
  const m = i.market
  const thin = m.liquidity < PARAMS.minLiquidityUsd || m.volume24h < 500
  if (thin) return mind('depth', { confidence: 0.1, status: 'SPOKE', against: [`Thin: ${usd(m.liquidity)} of liquidity and ${usd(m.volume24h)} traded today. One order can move this price; the mid is not a probability.`] })
  const deep = m.liquidity >= 10_000
  return mind('depth', { confidence: deep ? 0.8 : 0.5, status: 'SPOKE', for: [`${deep ? 'Deep' : 'Adequate'}: ${usd(m.liquidity)} of liquidity, ${usd(m.volume24h)} traded today.`] })
}

export function spreadMind(i: MindInput): MindRead {
  const m = i.market
  if (m.spread === null || m.bid === null || m.ask === null) return blind('spread', 'a bid and an ask from the venue')
  if (m.spread >= PARAMS.maxSpread) return mind('spread', { confidence: 0.1, status: 'SPOKE', against: [`Spread ${cents(m.spread)} (${cents(m.bid)} bid, ${cents(m.ask)} ask): the mid is a guess, and a fill costs half of that before any edge.`] })
  return mind('spread', { confidence: m.spread <= 0.02 ? 0.8 : 0.5, status: 'SPOKE', for: [`Spread ${cents(m.spread)} (${cents(m.bid)} bid, ${cents(m.ask)} ask): a fill near the mid is realistic.`] })
}

export function headlinesMind(i: MindInput): MindRead {
  if (!i.headlines) return blind('headlines', 'the news feed')
  const kw = keywords(i.market.question)
  if (!kw.length) return mind('headlines', { against: ['The question has no words a headline could share.'] })
  const need = Math.min(2, kw.length)
  const recent = i.headlines.filter((h) => i.now - h.time <= 72 * 3_600_000)
  const hits = recent.map((h) => ({ h, n: kw.filter((k) => h.title.toLowerCase().includes(k)).length })).filter((x) => x.n >= need).sort((a, b) => b.n - a.n || b.h.time - a.h.time)
  if (!hits.length) return mind('headlines', { confidence: 0.3, status: 'SPOKE', against: [`No headline in the feed (${recent.length} in three days) mentions it: the desk is reading only the price.`] })
  const ago = (t: number) => { const h = hours(i.now - t); return h < 1 ? 'just now' : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago` }
  return mind('headlines', { confidence: clamp(0.2 + 0.15 * hits.length, 0.2, 0.7), status: 'SPOKE', for: hits.slice(0, 3).map((x) => `"${x.h.title.slice(0, 110)}" (${x.h.source}, ${ago(x.h.time)})`), against: ['Coverage says the question is live; it does not say which way. The desk does not guess a headline\'s direction.'] })
}

const MACRO: Array<[RegExp, RegExp]> = [[/\b(fed|fomc|rate cut|rate hike|powell|interest rate)/i, /\b(fomc|fed|rate decision|interest rate)/i], [/\b(cpi|inflation)\b/i, /\bcpi\b/i], [/\b(jobs|payrolls|unemployment)\b/i, /\b(non-?farm|payrolls|unemployment)/i], [/\bgdp\b/i, /\bgdp\b/i], [/\b(pce)\b/i, /\bpce\b/i]]
export function calendarMind(i: MindInput): MindRead {
  if (!i.calendar) return blind('calendar', 'the economic calendar')
  const m = i.market
  const horizon = m.endsAt ?? i.now + 7 * 86_400_000
  const ahead = i.calendar.filter((e) => e.time > i.now && e.time <= horizon && (e.impact === 'High' || e.impact === 'Medium'))
  const kw = keywords(m.question)
  const hit = ahead.find((e) => MACRO.some(([q, ev]) => q.test(m.question) && ev.test(e.title)) || kw.filter((k) => k.length >= 5 && e.title.toLowerCase().includes(k)).length >= 1)
  if (!hit) return mind('calendar', { against: [ahead.length ? `Nothing on the calendar before it closes speaks to this question (${ahead.length} releases checked).` : 'Nothing scheduled before it closes.'] })
  const when = new Date(hit.time).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return mind('calendar', { confidence: 0.25, status: 'SPOKE', against: [`Decided by a scheduled release: ${hit.country} ${hit.title} on ${when} ET (${hit.impact.toLowerCase()} impact). The price will jump then, not drift; until then any edge is a guess about that print.`] })
}

export function familyMind(i: MindInput): MindRead {
  const m = i.market
  if (!i.siblings.length) return mind('family', { against: ['A single market, no other outcomes to add up.'] })
  const sum = m.yes + i.siblings.reduce((a, s) => a + s.yes, 0)
  if (sum > 1.03) {
    const p = m.yes / sum
    return mind('family', { p, confidence: 0.4, lean: 'no', status: 'SPOKE', for: [`The event's ${i.siblings.length + 1} outcomes add up to ${Math.round(sum * 100)}%, so each is overpriced. Dividing through reads ${cents(m.yes)} as ${cents(p)}.`], against: ['Outcomes that are not mutually exclusive can legitimately add up to more than 100%.'] })
  }
  return mind('family', { against: [`The event's ${i.siblings.length + 1} outcomes add up to ${Math.round(sum * 100)}%: nothing to correct.`] })
}

export function oracleMind(i: MindInput): MindRead {
  if (i.oracle === 'off') return blind('oracle', 'MRCASH_PREDICT_AI=1 and an ANTHROPIC_API_KEY in .env (costs money per market asked)')
  if (i.oracle === null) return blind('oracle', 'its turn: it is asked only about markets the other nine already flag, at most once an hour each')
  const o = i.oracle
  return mind('oracle', { p: clamp(o.p, 0.01, 0.99), confidence: clamp(o.confidence, 0.05, 0.8), lean: o.p >= 0.5 ? 'yes' : 'no', status: 'SPOKE', for: o.for.slice(0, 4), against: [...o.against.slice(0, 4), `A language model's estimate (${o.model}), from the question, the price and the headlines it was shown. It can be confidently wrong.`] })
}

export function readMinds(i: MindInput): MindRead[] {
  return [crowdMind(i), longshotMind(i), clockMind(i), driftMind(i), depthMind(i), spreadMind(i), headlinesMind(i), calendarMind(i), familyMind(i), oracleMind(i)]
}

export type Council = {
  key: string
  venue: PmMarket['venue']
  question: string
  url: string
  category: string
  endsAt: number | null
  /** The market's YES mid. */
  market: number
  /** The council's probability of YES, or null when no mind gave a number. */
  p: number | null
  /** p − market, in probability points. */
  edge: number | null
  confidence: number
  /** The side the edge favours. */
  side: 'YES' | 'NO' | null
  flagged: boolean
  /** Why it is, or is not, flagged. */
  reasons: string[]
  spoke: number
  blind: number
  minds: MindRead[]
  liquidity: number
  spread: number | null
  volume24h: number
}

/** Combine the minds: a confidence-weighted mean of the ones that gave a number, and the mean confidence of every mind that spoke. */
export function council(m: PmMarket, minds: MindRead[], now: number): Council {
  const voiced = minds.filter((x) => x.status === 'SPOKE' && x.p !== null)
  const spoke = minds.filter((x) => x.status === 'SPOKE')
  const w = voiced.reduce((a, x) => a + Math.max(0.05, x.confidence), 0)
  const p = voiced.length ? voiced.reduce((a, x) => a + x.p! * Math.max(0.05, x.confidence), 0) / w : null
  const confidence = spoke.length ? spoke.reduce((a, x) => a + x.confidence, 0) / spoke.length : 0
  const edge = p === null ? null : p - m.yes
  const side: Council['side'] = edge === null || Math.abs(edge) < 1e-9 ? null : edge > 0 ? 'YES' : 'NO'
  const reasons: string[] = []
  if (m.closed) reasons.push('closed')
  if (m.yes < 0.03 || m.yes > 0.97) reasons.push(`priced at ${cents(m.yes)}: too near certain to pay for the risk of being wrong`)
  if (edge === null) reasons.push('no mind gave a number')
  else if (Math.abs(edge) < PARAMS.mispricing) reasons.push(`council ${cents(p!)} vs market ${cents(m.yes)}: ${pts(edge)}, under the ${Math.round(PARAMS.mispricing * 100)}-point line`)
  if (confidence < PARAMS.minConfidence) reasons.push(`confidence ${Math.round(confidence * 100)}%, under ${Math.round(PARAMS.minConfidence * 100)}%`)
  if (m.spread !== null && m.spread > PARAMS.maxSpread) reasons.push(`spread ${cents(m.spread)} would eat the edge`)
  if (m.liquidity < PARAMS.minLiquidityUsd) reasons.push(`only ${usd(m.liquidity)} of liquidity`)
  if (m.endsAt !== null && m.endsAt - now > PARAMS.maxDaysToClose * 86_400_000) reasons.push(`closes in ${Math.round((m.endsAt - now) / 86_400_000)} days: capital tied up too long`)
  if (m.endsAt !== null && m.endsAt - now < PARAMS.minHoursToClose * 3_600_000) reasons.push('closes within the hour')
  const flagged = reasons.length === 0
  if (flagged) reasons.push(`council ${cents(p!)} vs market ${cents(m.yes)}: ${pts(edge!)} for ${side}, confidence ${Math.round(confidence * 100)}%`)
  return { key: m.key, venue: m.venue, question: m.question, url: m.url, category: m.category, endsAt: m.endsAt, market: m.yes, p, edge, confidence, side, flagged, reasons, spoke: spoke.length, blind: minds.filter((x) => x.status === 'BLIND').length, minds, liquidity: m.liquidity, spread: m.spread, volume24h: m.volume24h }
}

export type PaperSize = { side: 'YES' | 'NO'; price: number; pSide: number; contracts: number; stake: number; kellyNote: string; capped: boolean }

/**
 * A paper stake: a quarter-Kelly on the council's probability for the side,
 * at the price a fill would actually cost (the ask for YES, one minus the bid
 * for NO), capped at the creator's 6% of bankroll. Contracts pay $1 each.
 */
export function paperSize(c: Council, m: PmMarket, bankroll: number): PaperSize | null {
  if (!c.flagged || c.p === null || c.side === null) return null
  const price = Math.round((c.side === 'YES' ? (m.ask ?? m.yes) : 1 - (m.bid ?? m.yes)) * 1e4) / 1e4
  if (!(price > 0.01 && price < 0.99)) return null
  const pSide = c.side === 'YES' ? c.p : 1 - c.p
  // The same arithmetic as the school's kellyFraction, kept here so the desk imports nothing from the school layer:
  // f* = (b·p − q) / b with b the net odds (1 − price) / price, a quarter of it, capped.
  const b = (1 - price) / price
  const full = Math.max(0, (b * pSide - (1 - pSide)) / b)
  const suggested = Math.min(PARAMS.positionCap, full * 0.25)
  const stake = Math.floor(bankroll * suggested * 100) / 100
  if (stake < 1) return null
  const contracts = Math.floor((stake / price) * 100) / 100
  const kellyNote = full === 0 ? 'No positive expectation at these odds; Kelly says do not bet.' : `Full Kelly ${(full * 100).toFixed(1)}% of bankroll; at a quarter of it and a ${(PARAMS.positionCap * 100).toFixed(0)}% cap, ${(suggested * 100).toFixed(1)}%. Full Kelly assumes p is exactly right; it never is.`
  return { side: c.side, price, pSide, contracts, stake: Math.round(contracts * price * 100) / 100, kellyNote, capped: suggested >= PARAMS.positionCap - 1e-9 }
}
