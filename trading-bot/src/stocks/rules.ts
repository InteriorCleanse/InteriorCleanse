/**
 * THE STOCK DESK'S RULES — the owner's momentum and relative-strength strategy,
 * as pure functions over bars and headlines. Nothing here fetches, stores or
 * trades; `desk.ts` runs it on a clock and keeps the PAPER ledger.
 *
 * The strategy, in the owner's words, and where each rule lives:
 *   long stock buys only, cash is a position, never force a trade ... decide()
 *   market check: SPY, QQQ, XLK, SMH, breadth, VIX, rates, rotation .. regime(), themeBoard()
 *   DSC rule (universe, liquidity, no gap chase, no midday chase) .... evaluate()
 *   sector-catalyst day playbook, second-order beneficiaries ........ catalystDay()
 *   never at the bell; first held pullback or retest 30-60 min in .... findSetup()
 *   research report before every buy ................................. report()
 *   25% per stock, about 3 per theme, medium risk ..................... size()
 *   stops first, then exits, trims at 2R, hold winners ............... manage()
 */
import type { Candle } from '../types.ts'
import { SECOND_ORDER, STOCK_OF, THEME_ETF, THEME_LABEL, UNIVERSE } from './universe.ts'
import type { Stock, Theme } from './universe.ts'
import type { Headline } from '../types.ts'

const MIN = 60_000
const DAY = 86_400_000

// ---------------------------------------------------------------- the clock

/** Central Time parts: the owner's schedule is written in CST/CDT. */
export function ctParts(now: number): { date: string; dow: number; mins: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
  const p = Object.fromEntries(f.formatToParts(new Date(now)).map((x) => [x.type, x.value]))
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return { date: `${p.year}-${p.month}-${p.day}`, dow, mins: (Number(p.hour) % 24) * 60 + Number(p.minute) }
}

export const PREMARKET_AT = 8 * 60 + 15 // 8:15 CT
export const OPEN_AT = 8 * 60 + 30 // 8:30 CT
export const CLOSE_AT = 15 * 60 // 3:00 CT

export type Phase = 'premarket' | 'regular' | 'closed'

/** Weekdays only. US market holidays are not in a feed here: on a holiday the scan simply finds no fresh bars and does nothing. */
export function phase(now: number): Phase {
  const { dow, mins } = ctParts(now)
  if (dow === 0 || dow === 6) return 'closed'
  if (mins >= PREMARKET_AT && mins < OPEN_AT) return 'premarket'
  if (mins >= OPEN_AT && mins < CLOSE_AT) return 'regular'
  return 'closed'
}

/**
 * When to wake next. During regular hours: the next quarter hour. Before the
 * premarket scan: at 8:15. Otherwise: sleep in blocks of about an hour, sized to
 * land on the next weekday's 8:15 premarket scan.
 */
export function nextWake(now: number): { at: number; why: string } {
  const { dow, mins } = ctParts(now)
  const weekday = dow >= 1 && dow <= 5
  const floorMin = now - (now % MIN)
  if (weekday && mins >= OPEN_AT && mins < CLOSE_AT) {
    const next = floorMin + (15 - (mins % 15)) * MIN
    return next >= floorMin + (CLOSE_AT - mins) * MIN ? { at: floorMin + (CLOSE_AT - mins) * MIN, why: 'the close' } : { at: next, why: 'the 15-minute cycle' }
  }
  if (weekday && mins >= PREMARKET_AT && mins < OPEN_AT) return { at: floorMin + (OPEN_AT - mins) * MIN, why: 'the open' }
  // minutes until the next weekday 8:15 CT
  let wait = weekday && mins < PREMARKET_AT ? PREMARKET_AT - mins : 24 * 60 - mins + PREMARKET_AT
  let d = weekday && mins < PREMARKET_AT ? dow : (dow + 1) % 7
  while (d === 0 || d === 6) { wait += 24 * 60; d = (d + 1) % 7 }
  const step = Math.min(wait, 60)
  return { at: floorMin + step * MIN, why: wait <= 60 ? 'the premarket scan' : 'an hourly check on the way to the premarket scan' }
}

// ---------------------------------------------------------------- the numbers

export type DailyStats = { prevClose: number; sma20: number; sma50: number; ret20: number; avgVol20: number; atr: number; high20: number; high10: number; low10: number; uptrend: boolean }

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

/** From completed daily bars (the forming day is never included). Null when there is too little history to judge. */
export function dailyStats(daily: Candle[]): DailyStats | null {
  if (daily.length < 25) return null
  const closes = daily.map((c) => c.close)
  const last = closes[closes.length - 1]
  const sma = (n: number) => avg(closes.slice(-n))
  const trs = daily.slice(-15).map((c, i, a) => (i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - a[i - 1].close), Math.abs(c.low - a[i - 1].close))))
  const sma20 = sma(20), sma50 = sma(Math.min(50, closes.length))
  return {
    prevClose: last, sma20, sma50,
    ret20: (last / closes[closes.length - 21] - 1) * 100,
    avgVol20: avg(daily.slice(-20).map((c) => c.volume)),
    atr: avg(trs.slice(1)),
    high20: Math.max(...daily.slice(-20).map((c) => c.high)),
    high10: Math.max(...daily.slice(-10).map((c) => c.high)),
    low10: Math.min(...daily.slice(-10).map((c) => c.low)),
    uptrend: last > sma20 && sma20 >= sma50 * 0.995,
  }
}

export type Intraday = { bars: Candle[]; open: number; last: number; gapPct: number; dayPct: number; orHigh: number; orLow: number; high: number; low: number; vwap: number; minsIn: number; premarketPct: number | null }

/** Today's regular-session 15-minute bars (8:30-3:00 CT), plus the premarket move when there is one. */
export function intraday(bars15: Candle[], prevClose: number, now: number): Intraday | null {
  const today = ctParts(now).date
  const pre = bars15.filter((b) => { const p = ctParts(b.openTime); return p.date === today && p.mins < OPEN_AT })
  const bars = bars15.filter((b) => { const p = ctParts(b.openTime); return p.date === today && p.mins >= OPEN_AT && p.mins < CLOSE_AT })
  const premarketPct = pre.length ? (pre[pre.length - 1].close / prevClose - 1) * 100 : null
  if (!bars.length) {
    if (!pre.length) return null
    // Before the open: only the premarket move is known. No session bars means no setup can form.
    const px = pre[pre.length - 1].close
    return { bars: [], open: px, last: px, gapPct: premarketPct as number, dayPct: premarketPct as number, orHigh: px, orLow: px, high: px, low: px, vwap: px, minsIn: ctParts(now).mins - OPEN_AT, premarketPct }
  }
  const or = bars.slice(0, 2)
  const vol = bars.reduce((a, b) => a + b.volume, 0)
  const last = bars[bars.length - 1].close
  return {
    bars, open: bars[0].open, last,
    gapPct: (bars[0].open / prevClose - 1) * 100,
    dayPct: (last / prevClose - 1) * 100,
    orHigh: Math.max(...or.map((b) => b.high)), orLow: Math.min(...or.map((b) => b.low)),
    high: Math.max(...bars.map((b) => b.high)), low: Math.min(...bars.map((b) => b.low)),
    vwap: vol > 0 ? bars.reduce((a, b) => a + ((b.high + b.low + b.close) / 3) * b.volume, 0) / vol : avg(bars.map((b) => b.close)),
    minsIn: ctParts(now).mins - OPEN_AT,
    premarketPct,
  }
}

// ---------------------------------------------------------------- the market check

export type Quote = { symbol: string; d: DailyStats | null; i: Intraday | null }
export type Regime = { state: 'RISK-ON' | 'MIXED' | 'RISK-OFF' | 'UNKNOWN'; score: number; aggression: number; breadth: number | null; lines: string[] }

const pct = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`

/** SPY, QQQ, XLK, SMH trend and day; universe breadth; the VIX proxy; rates. More aggressive only when tech leads and the market agrees. */
export function regime(q: Record<string, Quote>, universe: Quote[]): Regime {
  const idx = ['SPY', 'QQQ', 'XLK', 'SMH'].map((s) => q[s]).filter((x): x is Quote => !!x?.d)
  if (idx.length < 3) return { state: 'UNKNOWN', score: 0, aggression: 0, breadth: null, lines: ['The market check could not run: SPY, QQQ, XLK and SMH need daily history. No new buys until it can.'] }
  let score = 0
  const lines: string[] = []
  for (const x of idx) {
    const d = x.d as DailyStats, day = x.i?.dayPct ?? null
    if (d.uptrend) score += 1
    if (day !== null) score += day >= 0 ? 0.5 : day < -1 ? -0.5 : 0
    lines.push(`${x.symbol}: ${d.uptrend ? 'above' : 'below'} its 20-day average${day === null ? '' : `, ${pct(day)} today`}`)
  }
  const above = universe.filter((u) => u.d && (u.i?.last ?? u.d.prevClose) > u.d.sma20).length
  const judged = universe.filter((u) => u.d).length
  const breadth = judged ? above / judged : null
  if (breadth !== null) { score += breadth >= 0.6 ? 1 : breadth <= 0.35 ? -1 : 0; lines.push(`Breadth: ${Math.round(breadth * 100)}% of the universe is above its 20-day average`) }
  const vix = q.VIXY
  const vixStress = !!vix?.i && vix.i.dayPct > 5
  if (vix?.i) { if (vixStress) score -= 1.5; lines.push(`Volatility (VIXY, a VIX proxy): ${pct(vix.i.dayPct)} today${vixStress ? ', fear rising' : ''}`) }
  const ief = q.IEF
  if (ief?.i) { if (ief.i.dayPct < -0.5) score -= 0.5; lines.push(`Rates (IEF, bonds move opposite to yields): ${pct(ief.i.dayPct)} today${ief.i.dayPct < -0.5 ? ', yields jumping' : ''}`) }
  const spyDay = q.SPY?.i?.dayPct ?? 0
  const state: Regime['state'] = score < 2 || (spyDay < -1.5 && vixStress) ? 'RISK-OFF' : score >= 4.5 ? 'RISK-ON' : 'MIXED'
  return { state, score: Math.round(score * 10) / 10, aggression: state === 'RISK-ON' ? 1 : state === 'MIXED' ? 0.5 : 0, breadth, lines }
}

export type ThemeRow = { theme: Theme; label: string; dayPct: number; rs20: number; names: number }

/** Intra-tech rotation: which themes lead today and over 20 days, strongest first. */
export function themeBoard(q: Record<string, Quote>): ThemeRow[] {
  const by = new Map<Theme, Quote[]>()
  for (const s of UNIVERSE) { const x = q[s.symbol]; if (x?.d) by.set(s.theme, [...(by.get(s.theme) ?? []), x]) }
  const spy20 = q.SPY?.d?.ret20 ?? 0
  return [...by.entries()].map(([theme, xs]) => ({
    theme, label: THEME_LABEL[theme], names: xs.length,
    dayPct: avg(xs.filter((x) => x.i).map((x) => (x.i as Intraday).dayPct)),
    rs20: avg(xs.map((x) => (x.d as DailyStats).ret20)) - spy20,
  })).sort((a, b) => (b.dayPct + b.rs20 / 5) - (a.dayPct + a.rs20 / 5))
}

// ---------------------------------------------------------------- news

const POSITIVE = /\b(upgrade[sd]?|raises? (its )?(price target|guidance|outlook|forecast)|price target (raised|increase)|beats?|record (revenue|quarter)|launch(es|ed)?|unveil(s|ed)?|partnership|contract|order[s]? from|wins?|expands?|approv(al|ed|es))\b/i
const NEGATIVE = /\b(downgrade[sd]?|cuts? (its )?(price target|guidance|outlook|forecast)|miss(es|ed)?|probe|investigation|lawsuit|recall|delay(s|ed)?|halt(s|ed)?|short seller|fraud|guidance (cut|below)|plunge[sd]?)\b/i

export type NewsHit = { title: string; source: string; time: number; tone: 'positive' | 'negative' | 'neutral' }

export function newsFor(stock: Stock, headlines: Headline[], now: number, hours = 24): NewsHit[] {
  const terms = [stock.symbol.toLowerCase(), ...stock.aliases]
  return headlines
    .filter((h) => now - h.time <= hours * 3_600_000 && h.time <= now + 5 * MIN)
    .filter((h) => { const t = ` ${h.title.toLowerCase()} `; return terms.some((w) => (w.length <= 4 ? new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t) : t.includes(w))) })
    .map((h) => ({ title: h.title, source: h.source, time: h.time, tone: NEGATIVE.test(h.title) ? 'negative' as const : POSITIVE.test(h.title) ? 'positive' as const : 'neutral' as const }))
}

// ---------------------------------------------------------------- sector-catalyst day

export type CatalystDay = { theme: Theme; label: string; gappers: Array<{ symbol: string; gapPct: number }>; headline: string | null; secondOrder: Array<{ symbol: string; theme: Theme; gapPct: number; ownNews: string | null }> }

/**
 * One headline moving a whole theme: list the first-order gappers (often +3-7%,
 * poor buys at the open), map who supplies, connects, powers, fabricates or hosts
 * them, sweep those names for their own news, and rank by the smallest gap.
 */
export function catalystDay(q: Record<string, Quote>, headlines: Headline[], now: number): CatalystDay | null {
  const moveOf = (s: string) => q[s]?.i?.gapPct ?? q[s]?.i?.premarketPct ?? null
  let best: CatalystDay | null = null
  for (const theme of Object.keys(THEME_LABEL) as Theme[]) {
    const names = UNIVERSE.filter((u) => u.theme === theme && moveOf(u.symbol) !== null)
    const gappers = names.map((u) => ({ symbol: u.symbol, gapPct: moveOf(u.symbol) as number })).filter((g) => g.gapPct >= 3).sort((a, b) => b.gapPct - a.gapPct)
    if (gappers.length < 2 || gappers.length / Math.max(1, names.length) < 0.4) continue
    if (best && best.gappers.length >= gappers.length) continue
    const hit = gappers.flatMap((g) => newsFor(STOCK_OF[g.symbol], headlines, now, 18)).sort((a, b) => b.time - a.time)[0]
    const secondOrder = SECOND_ORDER[theme].flatMap((t) => UNIVERSE.filter((u) => u.theme === t)).map((u) => {
      const own = newsFor(u, headlines, now, 18).find((n) => n.tone === 'positive')
      return { symbol: u.symbol, theme: u.theme, gapPct: moveOf(u.symbol) ?? 0, ownNews: own ? own.title : null }
    }).filter((x) => x.gapPct < 3 && x.gapPct > -1).sort((a, b) => Number(!!b.ownNews) - Number(!!a.ownNews) || a.gapPct - b.gapPct) // a name gapping down is not riding the catalyst
    best = { theme, label: THEME_LABEL[theme], gappers, headline: hit ? hit.title : null, secondOrder }
  }
  return best
}

// ---------------------------------------------------------------- setups

export type Setup = { kind: 'pullback' | 'retest' | 'base-breakout'; entry: number; stop: number; level: number; note: string }

/**
 * Never at the bell. The first held pullback, or a breakout retest, about 30-60
 * minutes in; the stop goes below the pullback low. Null when there is no clean one.
 */
export function findSetup(i: Intraday, d: DailyStats): Setup | null {
  if (i.minsIn < 30 || i.bars.length < 3) return null
  const bars = i.bars, last = bars[bars.length - 1], prev = bars[bars.length - 2]
  const buf = d.atr * 0.1
  // breakout retest of the opening-range high (or the 10-day high for a base breakout)
  for (const [kind, level] of [['base-breakout', d.high10], ['retest', i.orHigh]] as const) {
    if (kind === 'base-breakout' && d.high10 - d.low10 > 2.5 * d.atr) continue // not a tight base
    const brokeAt = bars.findIndex((b, k) => k >= 2 && b.close > level)
    if (brokeAt < 0) continue
    const after = bars.slice(brokeAt + 1)
    const retest = after.find((b) => b.low <= level * 1.0025 && b.close > level)
    if (!retest || last.close <= level || last.close < retest.close * 0.997) continue
    const stop = Math.min(retest.low, level) - buf
    return { kind, entry: last.close, stop, level, note: `${kind === 'retest' ? 'Broke the opening-range high' : 'Broke out of a tight 10-day base'} at ${level.toFixed(2)}, came back to test it and held.` }
  }
  // first held pullback: a dip from the session high that holds the opening-range low / VWAP, then turns up
  const hiAt = bars.reduce((m, b, k) => (b.high > bars[m].high ? k : m), 0)
  const after = bars.slice(hiAt + 1)
  if (after.length >= 2) {
    const pullLow = Math.min(...after.map((b) => b.low))
    const depth = i.high - pullLow
    const held = pullLow >= Math.min(i.orLow, i.vwap) * 0.998 && pullLow >= d.prevClose * 0.995
    const turned = last.close > prev.high || (last.close > last.open && last.low > pullLow)
    if (depth >= 0.25 * d.atr && held && turned && last.close > pullLow) {
      return { kind: 'pullback', entry: last.close, stop: pullLow - buf, level: pullLow, note: `Pulled back ${depth.toFixed(2)} from the session high, held ${pullLow >= i.vwap ? 'VWAP' : 'the opening range'}, and turned up.` }
    }
  }
  return null
}

// ---------------------------------------------------------------- evaluation and the report

export type Account = { equity: number; cash: number; positions: Array<{ symbol: string; theme: Theme }> }

export type Report = {
  ticker: string; setup: string; marketRegime: string; relativeStrength: string; catalyst: string; fundamentals: string
  entry: number; stop: number; target: number; rewardRisk: number; positionSize: string; mainRisks: string[]
  confidence: number; finalDecision: 'BUY' | 'PASS'; why: string
}

export type Evaluation = { symbol: string; theme: Theme; verdict: 'BUY' | 'PASS' | 'WAIT' | 'SKIP'; reason: string; report?: Report; dollars?: number; setup?: Setup; thesisLevel?: number | null }

export const RULES = {
  maxPositionPct: 25, maxPerTheme: 3, riskPct: { 'RISK-ON': 1, MIXED: 0.5 } as Record<string, number>,
  maxGapPct: 3, minAvgVolume: 500_000, minRewardRisk: 2, buyScore: { 'RISK-ON': 65, MIXED: 75 } as Record<string, number>,
}

/** Dollars to put in: the risk budget over the stop distance, capped at 25% of the account and the cash on hand. */
export function size(equity: number, cash: number, entry: number, stop: number, reg: Regime['state']): number {
  const riskPct = RULES.riskPct[reg] ?? 0
  const perShare = entry - stop
  if (perShare <= 0 || riskPct <= 0) return 0
  const byRisk = (equity * riskPct / 100 / perShare) * entry
  return Math.max(0, Math.min(byRisk, equity * RULES.maxPositionPct / 100, cash))
}

export type Context = { q: Record<string, Quote>; reg: Regime; board: ThemeRow[]; cat: CatalystDay | null; headlines: Headline[]; now: number; feed: 'sip' | 'iex' }

/** DSC filters, the setup, the support it needs, the report, and the decision. PASS is the default. */
export function evaluate(stock: Stock, ctx: Context, acct: Account): Evaluation {
  const base = { symbol: stock.symbol, theme: stock.theme }
  const x = ctx.q[stock.symbol]
  if (!x?.d) return { ...base, verdict: 'SKIP', reason: 'not enough daily history to judge' }
  if (!x.i) return { ...base, verdict: 'WAIT', reason: 'no regular-session bars yet' }
  const d = x.d, i = x.i
  if (acct.positions.some((p) => p.symbol === stock.symbol)) return { ...base, verdict: 'SKIP', reason: 'already held' }
  if (ctx.feed === 'sip' && d.avgVol20 < RULES.minAvgVolume) return { ...base, verdict: 'SKIP', reason: `DSC: average volume ${Math.round(d.avgVol20).toLocaleString('en-US')} is under 500k` }
  if (i.gapPct > RULES.maxGapPct) return { ...base, verdict: 'PASS', reason: `gapped ${pct(i.gapPct)}: not chasing a gap above 3%` }
  if (i.minsIn < 30) return { ...base, verdict: 'WAIT', reason: 'never at the bell: the opening range is still forming' }
  if (i.minsIn >= 150 && (i.dayPct > 4 || i.last > d.sma20 + 3 * d.atr)) return { ...base, verdict: 'PASS', reason: `overextended midday move (${pct(i.dayPct)} on the day)` }
  if (!d.uptrend) return { ...base, verdict: 'PASS', reason: 'not a leader: below its 20-day average' }
  const news = newsFor(stock, ctx.headlines, ctx.now)
  const bad = news.find((n) => n.tone === 'negative')
  if (bad) return { ...base, verdict: 'PASS', reason: `negative news: "${bad.title}"` }
  if (acct.positions.filter((p) => p.theme === stock.theme).length >= RULES.maxPerTheme) return { ...base, verdict: 'PASS', reason: `already ${RULES.maxPerTheme} positions in ${THEME_LABEL[stock.theme]}` }

  const etf = THEME_ETF[stock.theme]
  const sec = ctx.q[etf]
  const rs20 = d.ret20 - (sec?.d?.ret20 ?? ctx.q.SPY?.d?.ret20 ?? 0)
  const rsDay = i.dayPct - (sec?.i?.dayPct ?? ctx.q.SPY?.i?.dayPct ?? 0)
  if (rs20 <= 0 && rsDay <= 0) return { ...base, verdict: 'PASS', reason: `no relative strength against ${etf} (20-day ${pct(rs20)}, today ${pct(rsDay)})` }

  const setup = findSetup(i, d)
  if (!setup) return { ...base, verdict: 'PASS', reason: 'no clean pullback or retest with a clear invalidation point' }

  const rank = ctx.board.findIndex((t) => t.theme === stock.theme)
  const sectorStrong = (sec?.i?.dayPct ?? 0) > 0 && rank >= 0 && rank < Math.ceil(ctx.board.length / 2)
  const good = news.find((n) => n.tone === 'positive')
  const second = ctx.cat?.secondOrder.find((s) => s.symbol === stock.symbol) ?? null
  const firstOrder = ctx.cat?.theme === stock.theme
  if (!good && !sectorStrong && !second) return { ...base, verdict: 'PASS', reason: 'a setup, but no catalyst, news or sector strength behind it (a technical setup alone is not enough)' }
  const thesisLevel = ctx.cat && (second || firstOrder) ? d.prevClose : null
  if (thesisLevel !== null && i.last < thesisLevel) return { ...base, verdict: 'PASS', reason: 'catalyst day, but the gap has filled below the prior close: the thesis is failing' }

  const risk = setup.entry - setup.stop
  if (risk <= 0) return { ...base, verdict: 'PASS', reason: 'no room between entry and stop' }
  const target = setup.entry + Math.max(RULES.minRewardRisk, Math.min(4, (d.high20 - setup.entry) / risk)) * risk
  const rr = (target - setup.entry) / risk

  let score = 40 + ({ retest: 15, pullback: 12, 'base-breakout': 10 } as const)[setup.kind]
  score += Math.max(0, Math.min(15, rs20 * 1.5 + rsDay * 3))
  if (second?.ownNews) score += 20
  else if (good) score += 15
  else if (sectorStrong) score += 8
  if (ctx.reg.state === 'RISK-ON') score += 10
  if (i.gapPct < 2) score += 5
  if (i.minsIn > 240) score -= 5
  if (risk / setup.entry > 0.025) score -= 5
  score = Math.max(0, Math.min(100, Math.round(score)))

  const dollars = size(acct.equity, acct.cash, setup.entry, setup.stop, ctx.reg.state)
  const minScore = RULES.buyScore[ctx.reg.state] ?? 101
  const risks = [
    `Stop at ${setup.stop.toFixed(2)} is ${((risk / setup.entry) * 100).toFixed(2)}% away; a close below it ends the trade.`,
    ctx.reg.state === 'MIXED' ? 'The market check is mixed: half-size risk and a higher bar.' : 'A broad risk-off turn would hit tech leaders together.',
    thesisLevel !== null ? `Catalyst day: a full gap fill below ${thesisLevel.toFixed(2)} would mean the thesis is failing.` : `${THEME_LABEL[stock.theme]} can rotate out even when this name holds up.`,
  ]
  if (ctx.feed === 'iex') risks.push('Volume is from the IEX feed only (a small slice of real volume); liquidity is assured by the curated universe, not measured here.')
  const buy = ctx.reg.state !== 'RISK-OFF' && ctx.reg.state !== 'UNKNOWN' && score >= minScore && rr >= RULES.minRewardRisk && dollars >= 50
  const why = buy ? `All rules pass and the score (${score}) clears the ${minScore} bar for a ${ctx.reg.state} market.`
    : ctx.reg.state === 'RISK-OFF' || ctx.reg.state === 'UNKNOWN' ? `The market check is ${ctx.reg.state}: no new buys.`
      : score < minScore ? `Score ${score} is under the ${minScore} bar for a ${ctx.reg.state} market.`
        : dollars < 50 ? 'Not enough cash for a meaningful position.' : `Reward/risk ${rr.toFixed(1)} is under 2.`
  const rep: Report = {
    ticker: stock.symbol,
    setup: `${setup.kind === 'retest' ? 'Breakout retest' : setup.kind === 'pullback' ? 'First held pullback' : 'Base breakout retest'}: ${setup.note}`,
    marketRegime: `${ctx.reg.state} (score ${ctx.reg.score}). ${ctx.reg.lines.slice(0, 2).join('; ')}.`,
    relativeStrength: `${pct(rs20)} over 20 days and ${pct(rsDay)} today against ${etf}; ${THEME_LABEL[stock.theme]} ranks ${rank + 1} of ${ctx.board.length} themes.`,
    catalyst: second?.ownNews ? `Second-order name on a ${ctx.cat?.label} catalyst day, with its own news: "${second.ownNews}"` : good ? `"${good.title}" (${good.source})` : second ? `Second-order beneficiary of today's ${ctx.cat?.label} move${ctx.cat?.headline ? `: "${ctx.cat.headline}"` : ''}` : `No company news; sector strength (${etf} ${pct(sec?.i?.dayPct ?? 0)}).`,
    fundamentals: `${stock.name}: an established ${THEME_LABEL[stock.theme].toLowerCase()} leader in the curated universe. No fundamentals feed is connected, so earnings dates and valuations are not checked here.`,
    entry: round(setup.entry), stop: round(setup.stop), target: round(target), rewardRisk: Math.round(rr * 10) / 10,
    positionSize: dollars > 0 ? `$${Math.round(dollars).toLocaleString('en-US')} (${((dollars / acct.equity) * 100).toFixed(1)}% of the account; risk ${RULES.riskPct[ctx.reg.state] ?? 0}% of equity to the stop)` : 'none',
    mainRisks: risks, confidence: score, finalDecision: buy ? 'BUY' : 'PASS', why,
  }
  return { ...base, verdict: buy ? 'BUY' : 'PASS', reason: why, report: rep, dollars: buy ? dollars : 0, setup, thesisLevel }
}

const round = (x: number) => Math.round(x * 100) / 100

// ---------------------------------------------------------------- managing what is open

export type Position = { symbol: string; theme: Theme; qty: number; entry: number; stop: number; initialStop: number; target: number; openedAt: number; thesisLevel: number | null; trimmed: boolean; setup: string }
export type Action = { type: 'EXIT' | 'TRIM' | 'HOLD'; symbol: string; price: number; why: string; fraction: number }

/**
 * Stops first: a breached stop sells the whole position this cycle, at the stop
 * or worse, and is never moved lower. Then the thesis, the regime and relative
 * strength. Trim at 2R or when overextended; hold winners while the trend holds.
 */
export function manage(p: Position, x: Quote | undefined, sector: Quote | undefined, reg: Regime, lastCheck: number): Action {
  const i = x?.i, d = x?.d
  if (!i || !d) return { type: 'HOLD', symbol: p.symbol, price: p.entry, why: 'no fresh bars this cycle; the stop is still watched', fraction: 0 }
  const recent = i.bars.filter((b) => b.openTime + 15 * MIN > lastCheck)
  const breach = recent.find((b) => b.low <= p.stop)
  if (breach) return { type: 'EXIT', symbol: p.symbol, price: Math.min(p.stop, breach.open), why: `stop ${p.stop.toFixed(2)} breached: sold in full, no second-guessing`, fraction: 1 }
  const last = i.last
  if (p.thesisLevel !== null && last < p.thesisLevel) return { type: 'EXIT', symbol: p.symbol, price: last, why: `catalyst gap filled below ${p.thesisLevel.toFixed(2)}: thesis failing`, fraction: 1 }
  if (reg.state === 'RISK-OFF') return { type: 'EXIT', symbol: p.symbol, price: last, why: 'the market regime turned risk-off', fraction: 1 }
  const secDay = sector?.i?.dayPct ?? null
  if (secDay !== null && secDay > 0.5 && i.dayPct < secDay - 2.5) return { type: 'EXIT', symbol: p.symbol, price: last, why: `underperforming its strong sector (${pct(i.dayPct)} against ${pct(secDay)})`, fraction: 1 }
  const r = (last - p.entry) / (p.entry - p.initialStop)
  if (!p.trimmed && r >= 2) return { type: 'TRIM', symbol: p.symbol, price: last, why: `reached ${r.toFixed(1)}R: taking half and moving the stop up to the entry`, fraction: 0.5 }
  if (!p.trimmed && last > d.sma20 + 3.5 * d.atr) return { type: 'TRIM', symbol: p.symbol, price: last, why: 'overextended from its 20-day average: taking half', fraction: 0.5 }
  return { type: 'HOLD', symbol: p.symbol, price: last, why: `trend and relative strength intact (${r >= 0 ? '+' : ''}${r.toFixed(2)}R)`, fraction: 0 }
}

export const _test = { DAY }
