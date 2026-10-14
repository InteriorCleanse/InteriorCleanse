/**
 * POLITICIAN WATCHER — the owner's "trading watcher" brief, built on the
 * congress trades Big Money already reads from Quiver Quantitative.
 *
 * Every time it runs, in order:
 *  1. find trades the watched members of Congress disclosed since the last
 *     check (the first check looks back 14 days, so it does not flood);
 *  2. if there is nothing new, the report says "Nothing new";
 *  3. for each new trade: ticker, buy or sell, the size range, the date they
 *     traded and the date they disclosed it;
 *  4. whether it overlaps anything in the linked brokerage account
 *     (read-only, src/broker/alpaca.ts);
 *  5. the price on the day they traded against today's, so the owner sees
 *     how much of the move is already gone;
 *  6. three lines: what to do, how much of the balance to risk (the stock
 *     desk's own 1%, never above the owner's cap, at most 5%), and what
 *     would prove it wrong;
 *  7. it only ever proposes. Kestrel sends no order anywhere; "Log as a paper
 *     plan" writes the idea into the owner's own journal when they confirm.
 *
 * The plan is a fixed rule, not a forecast and not a model's guess, so it can
 * be tested and read: disclosures arrive up to 45 days late, so a buy that
 * already ran more than 10% is "watch, don't chase", a buy that fell more
 * than 10% is "their trade is losing too", and only a buy still near the
 * member's price becomes a small PAPER IDEA with a stop 5% under that price.
 * Sales are never copied: members sell for taxes, diversification or ethics
 * rules. Nothing here is read by the engine, risk, sizing or the live gate.
 */

import type { CongressTrade } from './parse.ts'
import { store } from '../store.ts'

export const LABEL = 'POLITICIAN WATCHER: public disclosures, paper ideas only, Kestrel sends no orders'
const SETTINGS_KEY = 'polwatch:settings'
const SEEN_KEY = 'polwatch:seen'
const REPORTS_KEY = 'polwatch:reports'
const FIRST_LOOKBACK_DAYS = 14
const DESK_RISK_PCT = 1
export const MAX_RISK_PCT = 5
export const DEFAULT_NAMES = 'Nancy Pelosi'

export type WatchSettings = { names: string[]; riskCapPct: number }

export type Holding = { symbol: string; qty: number; side: 'long' | 'short'; marketValue: number }
export type PortfolioView = { connected: boolean; equity: number | null; positions: Holding[]; note: string }

export type Plan = { action: 'PAPER IDEA' | 'WATCH' | 'NO ACTION' | 'REVIEW HOLDING'; lines: [string, string, string]; riskPct: number; entry: number | null; stop: number | null; shares: number | null; riskUsd: number | null }

export type WatchItem = {
  key: string
  who: string
  chamber: string | null
  party: string | null
  ticker: string
  side: CongressTrade['side']
  transaction: string
  range: string | null
  traded: string | null
  reported: string | null
  lagDays: number | null
  overlap: { connected: boolean; held: boolean; qty: number | null; side: 'long' | 'short' | null; marketValue: number | null }
  prices: { tradeDay: number | null; now: number | null; movePct: number | null; note: string }
  plan: Plan
}

export type WatchReport = { at: number; names: string[]; firstCheck: boolean; nothingNew: boolean; items: WatchItem[]; congressRows: number; note: string }

// ---------------------------------------------------------------- settings

const cleanName = (s: unknown) => String(s ?? '').replace(/[^\p{L}\p{M}'. -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60)

export function sanitiseSettings(input: unknown): WatchSettings {
  const r = (input ?? {}) as Record<string, unknown>
  const names = (Array.isArray(r.names) ? r.names : String(r.names ?? '').split(',')).map(cleanName).filter((n) => n.length >= 2)
  const cap = Number(r.riskCapPct)
  return { names: [...new Set(names)].slice(0, 10), riskCapPct: Number.isFinite(cap) ? Math.round(Math.min(MAX_RISK_PCT, Math.max(0.1, cap)) * 10) / 10 : MAX_RISK_PCT }
}

export function readSettings(env: NodeJS.ProcessEnv = process.env): WatchSettings {
  const saved = store().getJson<WatchSettings | null>(SETTINGS_KEY)
  if (saved) return sanitiseSettings(saved)
  // The owner chose Nancy Pelosi; MRCASH_WATCH_POLITICIANS or the list saved on the page replaces it.
  return sanitiseSettings({ names: env.MRCASH_WATCH_POLITICIANS ?? DEFAULT_NAMES, riskCapPct: env.MRCASH_WATCH_RISK_CAP ?? MAX_RISK_PCT })
}
export function saveSettings(input: unknown): WatchSettings { const s = sanitiseSettings(input); store().setJson(SETTINGS_KEY, s); return s }

// ---------------------------------------------------------------- matching and memory

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Every word of the watched name appears in the filer's name: "Pelosi" matches "Nancy Pelosi"; "Nancy Pelosi" does not match "Nancy Mace". */
export function matches(watch: string, who: string): boolean {
  const w = norm(watch).split(' ').filter(Boolean), h = ` ${norm(who)} `
  return w.length > 0 && w.every((t) => h.includes(` ${t} `))
}

export const tradeKey = (c: CongressTrade) => [norm(c.who), c.ticker, c.side, c.traded ?? '', c.reported ?? '', c.range ?? ''].join('|')

function readSeen(): Set<string> | null { const s = store().getJson<string[] | null>(SEEN_KEY); return s ? new Set(s) : null }
function writeSeen(s: Set<string>): void { store().setJson(SEEN_KEY, [...s].slice(-5000)) }
export function readReports(): WatchReport[] { return store().getJson<WatchReport[]>(REPORTS_KEY) ?? [] }

// ---------------------------------------------------------------- prices and the plan

const round2 = (n: number) => Math.round(n * 100) / 100
const shortDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'the trade date')
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** The close on the trade date, or the last session before it when they traded on a weekend or holiday. */
export function closeOn(bars: Array<{ openTime: number; close: number }>, day: string | null): number | null {
  if (!day) return null
  // Compare New York calendar days: a daily bar opens at midnight New York, which is already the next day in UTC offsets west of it.
  const nyDay = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const before = bars.filter((b) => nyDay(b.openTime) <= day)
  return before.length ? before[before.length - 1].close : null
}

/** The fixed rule behind the three lines. Pure, so every branch is tested. */
export function planFor(t: Pick<WatchItem, 'ticker' | 'side' | 'traded'>, held: WatchItem['overlap'], prices: WatchItem['prices'], equity: number | null, capPct: number): Plan {
  const riskPct = Math.min(DESK_RISK_PCT, capPct, MAX_RISK_PCT)
  const none = (action: Plan['action'], a: string, b: string, c: string): Plan => ({ action, lines: [a, b, c], riskPct: 0, entry: null, stop: null, shares: null, riskUsd: null })
  if (t.side === 'other') return none('NO ACTION', 'Not a buy or a sale (an exchange or similar), so there is nothing to act on.', 'Risk: 0%.', 'Nothing to prove wrong.')
  if (t.side === 'sell') {
    if (held.held) return none('REVIEW HOLDING', `You hold ${t.ticker}. One member's sale is weak evidence on its own; recheck your own reason for holding.`, 'Risk: no new money.', 'It gets stronger if two or more members or company insiders also sell within 30 days.')
    return none('NO ACTION', 'A sale. Members sell for taxes, diversification or ethics rules, so there is nothing to copy.', 'Risk: 0%.', 'It would matter if several members or insiders sold the same stock within 30 days.')
  }
  const { tradeDay, now, movePct } = prices
  if (tradeDay === null || now === null || movePct === null) return none('WATCH', `Watch ${t.ticker} only: Kestrel could not read its prices, so it cannot say how much of the move is gone.`, 'Risk: 0% until prices are readable.', 'Connect stock prices (MRCASH_ALPACA_KEY) to get a plan.')
  if (movePct > 10) return none('WATCH', `Watch, don't chase: ${t.ticker} is already ${movePct.toFixed(1)}% above where they bought on ${shortDate(t.traded)}. The disclosure is late by design.`, 'Risk: 0% now.', `Interesting again only on a pullback toward ${money(tradeDay)}, their price.`)
  if (movePct < -10) return none('WATCH', `Watch only: ${t.ticker} is ${Math.abs(movePct).toFixed(1)}% below where they bought, so their trade is losing too.`, 'Risk: 0% now.', `Worth a look only after a close back above ${money(tradeDay)}.`)
  const entry = now
  let stop = round2(Math.min(tradeDay, now) * 0.95)
  if (stop >= entry) stop = round2(entry * 0.95)
  const perShare = entry - stop
  const riskUsd = equity !== null ? round2(equity * riskPct / 100) : null
  const shares = riskUsd !== null && perShare > 0 ? Math.floor(riskUsd / perShare) : null
  const heldNote = held.held ? ` You already hold ${held.qty ?? ''} ${t.ticker}; this would add to it.`.replace('  ', ' ') : ''
  return {
    action: 'PAPER IDEA', riskPct, entry, stop, shares, riskUsd,
    lines: [
      `Paper idea: buy ${t.ticker} near ${money(entry)}${shares !== null ? `, at most ${shares} share${shares === 1 ? '' : 's'}` : ''}. It is ${movePct >= 0 ? '+' : ''}${movePct.toFixed(1)}% from their price.${heldNote}`,
      `Risk ${riskPct}% of your balance${riskUsd !== null ? ` (${money(riskUsd)})` : ''} to a stop at ${money(stop)}; your cap is ${capPct}%.`,
      `Wrong if: a daily close below ${money(stop)}, 5% under the price on the day they traded.`,
    ],
  }
}

// ---------------------------------------------------------------- one check

export type WatchDeps = {
  /** Congress rows as Big Money read them. */
  congress: () => CongressTrade[]
  portfolio: () => Promise<PortfolioView>
  /** Daily bars per ticker from `startMs` to now. Missing tickers simply have no entry. */
  bars: (tickers: string[], startMs: number) => Promise<Record<string, Array<{ openTime: number; close: number }>> | null>
  now?: number
}

/**
 * Runs the brief once. New trades are remembered so they are reported once.
 * The first check (no memory yet) reports only trades disclosed in the last
 * 14 days and remembers the rest silently.
 */
export async function runCheck(deps: WatchDeps, settings = readSettings()): Promise<WatchReport> {
  const now = deps.now ?? Date.now()
  const rows = deps.congress()
  const base = { at: now, names: settings.names, congressRows: rows.length }
  if (!settings.names.length) {
    const r: WatchReport = { ...base, firstCheck: false, nothingNew: true, items: [], note: 'No politicians on the watch list yet. Add names to start.' }
    return r
  }
  const seen = readSeen()
  const firstCheck = seen === null
  const memory = seen ?? new Set<string>()
  const cutoff = new Date(now - FIRST_LOOKBACK_DAYS * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const watched = rows.filter((c) => settings.names.some((n) => matches(n, c.who)))
  const fresh: CongressTrade[] = []
  for (const c of watched) {
    const k = tradeKey(c)
    if (memory.has(k)) continue
    memory.add(k)
    if (!firstCheck || (c.reported ?? c.traded ?? '') >= cutoff) fresh.push(c)
  }
  writeSeen(memory)

  let items: WatchItem[] = []
  if (fresh.length) {
    const pf = await deps.portfolio().catch(() => ({ connected: false, equity: null, positions: [], note: 'The brokerage account could not be read.' }) as PortfolioView)
    const tickers = [...new Set(fresh.map((c) => c.ticker))]
    const earliest = Math.min(...fresh.map((c) => Date.parse(`${c.traded ?? c.reported ?? ''}T00:00:00Z`)).filter(Number.isFinite), now)
    const bars = await deps.bars(tickers, earliest - 7 * 86_400_000).catch(() => null)
    items = fresh.map((c) => {
      const h = pf.positions.find((p) => p.symbol.toUpperCase() === c.ticker.toUpperCase())
      const overlap = { connected: pf.connected, held: !!h, qty: h?.qty ?? null, side: h?.side ?? null, marketValue: h?.marketValue ?? null }
      const b = bars?.[c.ticker] ?? []
      const tradeDay = closeOn(b, c.traded)
      const nowPx = b.length ? b[b.length - 1].close : null
      const movePct = tradeDay && nowPx ? Math.round((nowPx / tradeDay - 1) * 1000) / 10 : null
      const prices = { tradeDay, now: nowPx, movePct, note: bars === null ? 'Stock prices are not connected (MRCASH_ALPACA_KEY).' : b.length ? 'Daily closes; "now" is the latest close or today\'s bar so far.' : `No daily bars for ${c.ticker}.` }
      return {
        key: tradeKey(c), who: c.who, chamber: c.chamber, party: c.party, ticker: c.ticker, side: c.side, transaction: c.transaction,
        range: c.range, traded: c.traded, reported: c.reported, lagDays: c.lagDays, overlap, prices,
        plan: planFor(c, overlap, prices, pf.connected ? pf.equity : null, settings.riskCapPct),
      }
    })
  }
  const report: WatchReport = {
    ...base, firstCheck, nothingNew: items.length === 0, items,
    note: items.length === 0 ? 'Nothing new.' : `${items.length} new trade${items.length === 1 ? '' : 's'} from ${[...new Set(items.map((i) => i.who))].join(', ')}.${firstCheck ? ` First check: only trades disclosed in the last ${FIRST_LOOKBACK_DAYS} days are shown; older ones are remembered as seen.` : ''}`,
  }
  store().setJson(REPORTS_KEY, [report, ...readReports()].slice(0, 50))
  return report
}

/** Clears the "already seen" memory so the next check starts fresh (the 14-day look-back again). */
export function resetMemory(): void { store().setJson(SEEN_KEY, null) }

/** The journal entry for a confirmed paper plan. The owner's own record; nothing is sent anywhere. */
export function journalEntryFor(item: WatchItem): Record<string, unknown> {
  return {
    tradeTime: Date.now(), symbol: item.ticker, direction: 'long', session: 'stocks', setupKey: 'politician-watch',
    entry: item.plan.entry, stop: item.plan.stop, target: null, exit: null, outcome: 'open', execution: 3, followedPlan: null,
    emotions: [], tags: [], wentWell: '', improve: '', lesson: '',
    notes: `PAPER PLAN from the politician watcher. ${item.who} disclosed a ${item.side} of ${item.ticker} (${item.range ?? 'size not given'}) traded ${item.traded ?? '?'}, reported ${item.reported ?? '?'}. ${item.plan.lines.join(' ')}`.slice(0, 1000),
  }
}
