/**
 * News and the economic calendar: what's scheduled, what's being
 * talked about, and what's likely to move price.
 *
 * Two kinds of input:
 *   - The economic CALENDAR: scheduled events with an impact rating.
 *     These are the ones that matter most, because everyone knows the
 *     exact minute they land. "High" impact = stand aside.
 *   - HEADLINES from a few free feeds, scored by what they mention.
 *
 * Nothing here predicts direction. It ranks attention. And if a feed is
 * down, the bot says so — it never fills the gap with old news dressed
 * up as fresh.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config, newsSources } from '../config.ts'
import { DATA_DIR, ensureDataDir } from './memory.ts'
import type { CalendarEvent, Headline, NewsReport } from './types.ts'

const CACHE_PATH = join(DATA_DIR, 'news-cache.json')

/** What to look for in a headline, how much it matters, and why. */
const TOPICS: Array<{ tag: string; weight: number; pattern: RegExp; why: string }> = [
  { tag: 'Fed', weight: 5, pattern: /\b(fed|fomc|powell|federal reserve|rate (hike|cut|decision)|interest rates?)\b/i, why: 'The Fed sets the price of money. Rate expectations move every risk asset, Bitcoin included.' },
  { tag: 'Inflation', weight: 5, pattern: /\b(cpi|pce|inflation|ppi)\b/i, why: 'Inflation prints decide what the Fed does next. Hot = tighter = risk-off.' },
  { tag: 'Jobs', weight: 4, pattern: /\b(nfp|non-?farm|payrolls|jobless|unemployment|jobs report)\b/i, why: 'Labour data is the other half of the Fed\'s mandate. Big surprises move everything.' },
  { tag: 'ETF flows', weight: 4, pattern: /\b(etf|ibit|fbtc|gbtc|inflows?|outflows?)\b/i, why: 'ETF flows are the clearest daily read on institutional demand.' },
  { tag: 'Regulation', weight: 3, pattern: /\b(sec|cftc|regulat|lawsuit|ban(ned)?|congress|senate|bill|executive order|legislation)\b/i, why: 'Regulatory headlines change who is allowed to buy — and how fast they can sell.' },
  { tag: 'Hack / exploit', weight: 4, pattern: /\b(hack(ed|er)?|exploit|drained|breach|stolen)\b/i, why: 'Hacks trigger forced selling and a flight to safety inside crypto.' },
  { tag: 'Liquidations', weight: 3, pattern: /\b(liquidat|cascade|leverage|open interest|funding rate)\b/i, why: 'Leverage is fuel. Liquidation cascades are how a 2% move becomes 8%.' },
  { tag: 'Stablecoins', weight: 3, pattern: /\b(tether|usdt|usdc|circle|stablecoin|depeg)\b/i, why: 'Stablecoins are the plumbing. A wobble there hits everything at once.' },
  { tag: 'Exchanges', weight: 2, pattern: /\b(binance|coinbase|kraken|bybit|okx|exchange (halt|outage|withdraw))\b/i, why: 'Exchange trouble means trapped liquidity and panic.' },
  { tag: 'Macro / geopolitics', weight: 3, pattern: /\b(tariff|war|sanction|treasury|yields?|dollar|dxy|recession|gdp)\b/i, why: 'Bitcoin trades like a high-beta risk asset when the macro tape gets loud.' },
  { tag: 'Whales / on-chain', weight: 2, pattern: /\b(whale|on-chain|wallet|mt\.? gox|government (sale|sell)|miner)\b/i, why: 'Large known holders moving coins is supply that can hit the market.' },
  { tag: 'MicroStrategy / treasuries', weight: 2, pattern: /\b(microstrategy|strategy inc|saylor|treasury compan|bitcoin purchase)\b/i, why: 'Corporate buyers are a steady bid; a pause from them gets noticed.' },
  { tag: 'Price action', weight: 1, pattern: /\b(all-time high|ath|record high|crash|plunge|surge|rally|dump)\b/i, why: 'Loud price headlines tell you where the crowd\'s attention is.' },
]

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, '')
    .trim()
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (mr-cash paper bot; +local)', accept: 'application/json, application/rss+xml, text/xml, */*' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------
// Parsers — pure functions, so the self-test can check them offline
// ---------------------------------------------------------------

export function parseCalendar(json: string): CalendarEvent[] {
  const raw = JSON.parse(json)
  if (!Array.isArray(raw)) throw new Error('calendar is not a list')
  const impacts = new Set(['High', 'Medium', 'Low', 'Holiday'])
  return raw
    .map((e: Record<string, unknown>) => ({
      title: String(e.title ?? ''),
      country: String(e.country ?? ''),
      time: new Date(String(e.date ?? '')).getTime(),
      impact: (impacts.has(String(e.impact)) ? String(e.impact) : 'Unknown') as CalendarEvent['impact'],
      forecast: String(e.forecast ?? ''),
      previous: String(e.previous ?? ''),
      actual: e.actual !== undefined ? String(e.actual) : undefined,
    }))
    .filter((e: CalendarEvent) => Number.isFinite(e.time) && e.title)
}

export function parseRss(xml: string, source: string): Array<Pick<Headline, 'title' | 'link' | 'source' | 'time'>> {
  const items: Array<Pick<Headline, 'title' | 'link' | 'source' | 'time'>> = []
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml))) {
    const block = m[1]
    const pick = (tag: string) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block)
      return r ? decodeEntities(r[1]) : ''
    }
    const title = pick('title')
    if (!title) continue
    const link = pick('link') || (/<link[^>]*href="([^"]+)"/i.exec(block)?.[1] ?? '')
    const dateText = pick('pubDate') || pick('dc:date') || pick('published')
    const time = dateText ? new Date(dateText).getTime() : Date.now()
    items.push({ title, link, source, time: Number.isFinite(time) ? time : Date.now() })
  }
  return items
}

/** Scores a headline: what it's about, how much that matters, and how fresh it is. */
export function scoreHeadline(h: Pick<Headline, 'title' | 'link' | 'source' | 'time'>, now = Date.now()): Headline {
  const tags: string[] = []
  const whys: string[] = []
  let weight = 0
  for (const t of TOPICS) {
    if (t.pattern.test(h.title)) {
      tags.push(t.tag)
      whys.push(t.why)
      weight += t.weight
    }
  }
  const ageHours = Math.max(0, (now - h.time) / 3_600_000)
  const freshness = Math.exp(-ageHours / 12) // half as important every ~8 hours
  const score = weight * (0.35 + 0.65 * freshness)
  return {
    ...h,
    score,
    tags,
    whyItMatters: whys[0] ?? 'General market chatter. Worth a glance, not a plan.',
  }
}

function dedupe(headlines: Headline[]): Headline[] {
  const seen: Headline[] = []
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((w) => w.length > 3)
  outer: for (const h of headlines) {
    const words = new Set(norm(h.title))
    for (const s of seen) {
      const other = norm(s.title)
      const overlap = other.filter((w) => words.has(w)).length
      if (overlap >= Math.min(4, Math.floor(other.length * 0.6))) continue outer
    }
    seen.push(h)
  }
  return seen
}

function blackoutsFrom(events: CalendarEvent[]): NewsReport['blackouts'] {
  const pad = config.ict.newsBlackoutMinutes * 60_000
  return events
    .filter((e) => (config.news.blackoutImpacts as string[]).includes(e.impact))
    .filter((e) => config.news.currencies.includes(e.country))
    .map((e) => ({ start: e.time - pad, end: e.time + pad, title: `${e.country} ${e.title}` }))
}

export function buildReport(
  calendar: CalendarEvent[],
  rawHeadlines: Array<Pick<Headline, 'title' | 'link' | 'source' | 'time'>>,
  errors: string[],
  now = Date.now(),
): NewsReport {
  const relevant = calendar.filter((e) => config.news.currencies.includes(e.country) || e.impact === 'High')
  const headlines = dedupe(rawHeadlines.map((h) => scoreHeadline(h, now)).sort((a, b) => b.score - a.score)).slice(0, 25)
  return {
    fetchedAt: now,
    fromCache: false,
    calendar: relevant.sort((a, b) => a.time - b.time),
    headlines,
    standouts: headlines.filter((h) => h.score >= 3).slice(0, 5),
    blackouts: blackoutsFrom(relevant),
    errors,
  }
}

// ---------------------------------------------------------------
// Fetching, with a cache so feeds aren't hammered
// ---------------------------------------------------------------

function readCache(): NewsReport | null {
  if (!existsSync(CACHE_PATH)) return null
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as NewsReport
  } catch {
    return null
  }
}

export async function getNews(force = false): Promise<NewsReport> {
  const cached = readCache()
  const maxAge = config.news.cacheMinutes * 60_000
  if (!force && cached && Date.now() - cached.fetchedAt < maxAge) {
    return { ...cached, fromCache: true }
  }

  const errors: string[] = []
  let calendar: CalendarEvent[] = []
  try {
    calendar = parseCalendar(await fetchText(newsSources.calendar))
  } catch (err) {
    errors.push(`Economic calendar (${new URL(newsSources.calendar).host}): ${err instanceof Error ? err.message : String(err)}`)
  }

  const raw: Array<Pick<Headline, 'title' | 'link' | 'source' | 'time'>> = []
  await Promise.all(
    newsSources.headlines.map(async (feed) => {
      try {
        raw.push(...parseRss(await fetchText(feed.url), feed.name))
      } catch (err) {
        errors.push(`${feed.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }),
  )

  // Everything failed: fall back to the stale cache, but say so loudly.
  if (calendar.length === 0 && raw.length === 0) {
    if (cached) {
      const ageMin = Math.round((Date.now() - cached.fetchedAt) / 60_000)
      return { ...cached, fromCache: true, errors: [...errors, `Every feed failed just now, so this is the cached copy from ${ageMin} minutes ago. Treat it as stale.`] }
    }
    return { fetchedAt: Date.now(), fromCache: false, calendar: [], headlines: [], standouts: [], blackouts: [], errors: [...errors, 'No news available and no cache. The strategy will run without a news blackout — check a calendar yourself.'] }
  }

  const report = buildReport(calendar, raw, errors)
  try {
    ensureDataDir()
    writeFileSync(CACHE_PATH, JSON.stringify(report))
  } catch {
    // A cache write failing is not worth stopping for.
  }
  return report
}

/** Tries every feed and reports each one, for `npm run doctor`. */
export async function probeNews(): Promise<Array<{ name: string; ok: boolean; detail: string }>> {
  const out: Array<{ name: string; ok: boolean; detail: string }> = []
  try {
    const n = parseCalendar(await fetchText(newsSources.calendar)).length
    out.push({ name: 'calendar', ok: true, detail: `${n} events this week` })
  } catch (err) {
    out.push({ name: 'calendar', ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
  for (const feed of newsSources.headlines) {
    try {
      const n = parseRss(await fetchText(feed.url), feed.name).length
      out.push({ name: feed.name, ok: true, detail: `${n} headlines` })
    } catch (err) {
      out.push({ name: feed.name, ok: false, detail: err instanceof Error ? err.message : String(err) })
    }
  }
  return out
}

/** Is this instant inside a high-impact blackout window? */
export function isBlackout(time: number, report: NewsReport): { title: string } | null {
  for (const b of report.blackouts) if (time >= b.start && time <= b.end) return { title: b.title }
  return null
}

/** Today's and upcoming events, soonest first. */
export function upcomingEvents(report: NewsReport, now = Date.now(), hours = 36): CalendarEvent[] {
  return report.calendar.filter((e) => e.time >= now - 3_600_000 && e.time <= now + hours * 3_600_000)
}

/** A compact text version for the AI assistant and the brief. */
export function summarizeNews(report: NewsReport, now = Date.now()): string {
  const lines: string[] = []
  const soon = upcomingEvents(report, now)
  if (soon.length) {
    lines.push('Scheduled events (next 36h):')
    for (const e of soon.slice(0, 10)) {
      lines.push(`  - ${new Date(e.time).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} ET  [${e.impact}] ${e.country} ${e.title}${e.forecast ? ` (forecast ${e.forecast}, previous ${e.previous})` : ''}`)
    }
  } else {
    lines.push('No scheduled events found in the next 36 hours.')
  }
  if (report.standouts.length) {
    lines.push('Headlines that stand out:')
    for (const h of report.standouts) lines.push(`  - [${h.tags.join(', ') || 'general'}] ${h.title} (${h.source})`)
  }
  if (report.errors.length) lines.push('Feed problems: ' + report.errors.join(' | '))
  return lines.join('\n')
}
