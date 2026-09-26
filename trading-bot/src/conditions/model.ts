/**
 * MARKET CONDITIONS — is this a market worth being in right now? Pure: no
 * network, no clock (everything takes `now`), nothing here places an order.
 *
 * Each market gets a set of readings from its own closed candles, its trading
 * hours and the economic calendar, and a grade:
 *
 *   good      nothing in the way.
 *   caution   something is off (elevated volatility, chop, thin volume, an
 *             event within two hours, a gap) but nothing disqualifying.
 *   poor      a hard condition: a shock candle (≥ 3× its average range),
 *             disorderly volatility (≥ 97th percentile of its own recent
 *             history), or a high-impact release for its currency inside the
 *             event window (15 minutes before to 30 after).
 *   closed    its market is shut (weekend, holiday, options after the bell).
 *   blind     the feed is stale or missing; nothing is inferred.
 *
 * Then the cross-market picture: how many markets are in poor shape at once
 * (stress breadth), which currencies are strong or weak against the others,
 * and the risk tone. Every threshold is written here in the open; none of it
 * has been tested as a trading rule, and the readings are labelled READING.
 */
import type { Candle } from '../types.ts'
import { marketHours, type AssetClass, type HoursReading } from './hours.ts'

export type Grade = 'good' | 'caution' | 'poor' | 'closed' | 'blind'
export type Level = 'ok' | 'caution' | 'poor' | 'info'

export type Reading = { key: string; label: string; level: Level; value: string; text: string }

export type CalendarLite = { time: number; country: string; impact: string; title: string }

export type MarketInput = {
  key: string
  label: string
  kind: 'crypto' | 'forex' | 'stock' | 'index'
  symbol: string
  /** Closed candles, oldest first. */
  candles: Candle[]
  /** The feed's own verdict: live, stale, closed (session), no data. */
  feed: 'live' | 'stale' | 'closed' | 'no data'
  provenance: string
  changePct24h: number | null
}

export type MarketCondition = {
  key: string
  label: string
  kind: MarketInput['kind']
  asset: AssetClass
  grade: Grade
  score: number | null
  hours: HoursReading
  readings: Reading[]
  headline: string
  provenance: string
}

export const THRESHOLDS = {
  shockX: 3, bigX: 2,
  disorderlyPct: 0.97, elevatedPct: 0.85, deadPct: 0.10,
  chopEr: 0.15, thinVol: 0.3,
  eventBeforeMin: 15, eventAfterMin: 30, eventSoonMin: 120,
  gapX: 1.5, minCandles: 60,
  stressPoorShare: 0.35, stressElevatedShare: 0.5,
} as const

export const CONDITIONS_NOTE = 'A reading of market conditions, not a signal. The thresholds are written in the open and have not been tested as a trading rule.'

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d
const assetOf = (k: MarketInput['kind']): AssetClass => (k === 'crypto' ? 'crypto' : k === 'forex' ? 'forex' : 'stock')

function trueRanges(c: Candle[]): number[] {
  const out: number[] = []
  for (let i = 1; i < c.length; i++) out.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)))
  return out
}
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** The currencies a market answers to, for the calendar. */
export function currenciesOf(m: Pick<MarketInput, 'kind' | 'symbol'>): string[] {
  if (m.kind === 'forex' && m.symbol.length === 6) return [m.symbol.slice(0, 3), m.symbol.slice(3)]
  return ['USD'] // crypto quoted in USDT, US stocks, US index and commodity funds
}

/** Grade one market. */
export function assessOne(m: MarketInput, calendar: CalendarLite[], now: number): MarketCondition {
  const asset = assetOf(m.kind)
  const hours = marketHours(asset, now)
  const readings: Reading[] = []
  const add = (key: string, label: string, level: Level, value: string, text: string) => readings.push({ key, label, level, value, text })
  const base = { key: m.key, label: m.label, kind: m.kind, asset, hours, provenance: m.provenance }

  if (!hours.open) {
    add('hours', 'Session', 'info', hours.label, hours.opensInMin !== null ? `Opens in ${fmtMin(hours.opensInMin)}.` : 'Closed.')
    return { ...base, grade: 'closed', score: null, readings, headline: `${m.label}: ${hours.label.toLowerCase()}.` }
  }
  if (m.feed === 'stale' || m.feed === 'no data' || m.candles.length < THRESHOLDS.minCandles) {
    add('feed', 'Feed', 'info', m.feed === 'no data' ? 'no data' : m.candles.length < THRESHOLDS.minCandles ? `${m.candles.length} candles` : 'stale', 'Not enough fresh candles to read this market. Nothing is inferred.')
    return { ...base, grade: 'blind', score: null, readings, headline: `${m.label}: NOT ENOUGH DATA.` }
  }

  const c = m.candles.slice(-220)
  const tr = trueRanges(c)
  const last = c[c.length - 1], prev = c[c.length - 2]
  const atrPrior = mean(tr.slice(-15, -1))
  const lastTr = tr[tr.length - 1]
  const atrPct = (i: number) => mean(tr.slice(Math.max(0, i - 13), i + 1)) / c[i + 1].close
  const series: number[] = []
  for (let i = 13; i < tr.length; i++) series.push(atrPct(i))
  const nowAtr = series[series.length - 1]
  const pct = series.length ? series.filter((v) => v <= nowAtr).length / series.length : 0.5

  // 1. Session phase.
  const thinPhase = hours.phase === 'pre-market' || hours.phase === 'after-hours' || hours.phase === 'rollover'
  add('hours', 'Session', thinPhase ? 'caution' : 'ok', hours.label, thinPhase ? 'Thin hours: wider spreads and jumpier fills.' : hours.phase === '24/7' ? 'Crypto never closes.' : 'Main session.')
  // 2. Shock candle.
  const shockX = atrPrior > 0 ? lastTr / atrPrior : 0
  add('shock', 'Last candle', shockX >= THRESHOLDS.shockX ? 'poor' : shockX >= THRESHOLDS.bigX ? 'caution' : 'ok', `${round(shockX, 1)}× avg range`,
    shockX >= THRESHOLDS.shockX ? 'A shock candle: price just moved three times its normal hourly range. Spreads widen and stops slip.' : shockX >= THRESHOLDS.bigX ? 'A big candle: twice the normal range.' : 'Normal-sized candle.')
  // 3. Volatility regime against its own history.
  add('vol', 'Volatility', pct >= THRESHOLDS.disorderlyPct ? 'poor' : pct >= THRESHOLDS.elevatedPct || pct <= THRESHOLDS.deadPct ? 'caution' : 'ok', `${Math.round(pct * 100)}th pct · ${round(nowAtr * 100, 2)}%/h`,
    pct >= THRESHOLDS.disorderlyPct ? 'Disorderly: volatility is in the top 3% of its own recent history.' : pct >= THRESHOLDS.elevatedPct ? 'Elevated: busier than 85% of recent hours.' : pct <= THRESHOLDS.deadPct ? 'Dead: quieter than 90% of recent hours; moves may not cover costs.' : 'Normal for this market.')
  // 4. Direction quality (efficiency ratio over a day of hourly candles).
  const n = Math.min(24, c.length - 1)
  let path = 0; for (let i = c.length - n; i < c.length; i++) path += Math.abs(c[i].close - c[i - 1].close)
  const er = path > 0 ? Math.abs(last.close - c[c.length - 1 - n].close) / path : 0
  add('chop', 'Direction', er < THRESHOLDS.chopEr ? 'caution' : 'ok', `${Math.round(er * 100)}% efficient`, er < THRESHOLDS.chopEr ? 'Chop: price went back and forth and got nowhere over the last day.' : er > 0.5 ? 'Clean: moves are carrying through.' : 'Mixed.')
  // 5. Participation.
  const vols = c.map((k) => k.volume).filter((v) => v > 0)
  if (vols.length >= 40) {
    const recent = mean(vols.slice(-6)), med = median(vols.slice(-100))
    const r = med > 0 ? recent / med : 1
    add('volume', 'Participation', r < THRESHOLDS.thinVol ? 'caution' : 'ok', `${round(r, 2)}× usual`, r < THRESHOLDS.thinVol ? 'Thin: well under the usual volume for this market.' : r > 2 ? 'Heavy: twice the usual volume.' : 'Usual volume.')
  }
  // 6. Gap between the last two candles (overnight/weekend opens).
  const gapX = atrPrior > 0 ? Math.abs(last.open - prev.close) / atrPrior : 0
  if (gapX >= THRESHOLDS.gapX) add('gap', 'Gap', 'caution', `${round(gapX, 1)}× avg range`, `Opened ${last.open > prev.close ? 'above' : 'below'} the last close by more than its normal hourly range.`)
  // 7. The calendar.
  const cur = currenciesOf(m)
  const high = calendar.filter((e) => e.impact === 'High' && cur.includes(e.country))
  const inWindow = high.find((e) => now >= e.time - THRESHOLDS.eventBeforeMin * 60_000 && now <= e.time + THRESHOLDS.eventAfterMin * 60_000)
  const soon = high.filter((e) => e.time > now && e.time - now <= THRESHOLDS.eventSoonMin * 60_000).sort((a, b) => a.time - b.time)[0]
  if (inWindow) add('news', 'News', 'poor', `${inWindow.country} ${inWindow.title}`.slice(0, 60), `Inside the event window for a high-impact ${inWindow.country} release (${THRESHOLDS.eventBeforeMin} min before to ${THRESHOLDS.eventAfterMin} after).`)
  else if (soon) add('news', 'News', 'caution', `${soon.country} ${soon.title} in ${fmtMin(Math.round((soon.time - now) / 60_000))}`.slice(0, 70), 'A high-impact release for this market\'s currency is less than two hours away.')
  else add('news', 'News', 'ok', 'clear', `No high-impact ${cur.join('/')} release in the next two hours.`)

  const poor = readings.filter((r) => r.level === 'poor'), caution = readings.filter((r) => r.level === 'caution')
  const score = Math.max(0, Math.min(100, 100 - poor.length * 40 - caution.length * 12))
  const grade: Grade = poor.length ? 'poor' : score < 60 ? 'caution' : caution.length ? 'caution' : 'good'
  const headline = poor.length ? `${m.label}: ${poor.map((r) => r.label.toLowerCase()).join(', ')} — stand aside.` : caution.length ? `${m.label}: ${caution.map((r) => r.label.toLowerCase()).join(', ')} to watch.` : `${m.label}: clear.`
  return { ...base, grade, score, readings, headline }
}

export function fmtMin(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), mm = min % 60
  if (h < 48) return mm ? `${h}h ${mm}m` : `${h}h`
  return `${Math.round(h / 24)} days`
}

/* ---------------- cross-market ---------------- */

export const MAJORS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF'] as const

/**
 * Currency strength from the watched USD pairs: each currency's 24h move
 * against the dollar (USD itself at 0), then centred on the average, so the
 * list reads strongest to weakest. A currency with no watched pair is left out.
 */
export function currencyStrength(markets: MarketInput[]): Array<{ ccy: string; score: number; pairs: string[] }> | null {
  const vsUsd = new Map<string, { v: number; pair: string }>([['USD', { v: 0, pair: '—' }]])
  for (const m of markets) {
    if (m.kind !== 'forex' || m.changePct24h === null || m.feed !== 'live' || m.symbol.length !== 6) continue
    const b = m.symbol.slice(0, 3), q = m.symbol.slice(3)
    if (q === 'USD') vsUsd.set(b, { v: m.changePct24h, pair: m.label })
    else if (b === 'USD') vsUsd.set(q, { v: -m.changePct24h, pair: m.label })
  }
  if (vsUsd.size < 3) return null
  const avg = mean([...vsUsd.values()].map((x) => x.v))
  return [...vsUsd.entries()].map(([ccy, x]) => ({ ccy, score: round(x.v - avg, 3), pairs: [x.pair] })).sort((a, b) => b.score - a.score)
}

export type Tone = { tone: 'risk-on' | 'risk-off' | 'mixed' | 'NOT ENOUGH DATA'; votes: string[] }

/** Risk tone from what is moving: equities vs havens (gold, Treasuries, yen, franc). Descriptive only. */
export function riskTone(markets: MarketInput[], strength: ReturnType<typeof currencyStrength>): Tone {
  const ch = (sym: string) => markets.find((m) => m.symbol === sym && m.feed === 'live')?.changePct24h ?? null
  const votes: string[] = []; let on = 0, off = 0
  const eq = [ch('SPY'), ch('QQQ')].filter((v): v is number => v !== null)
  if (eq.length) { const e = mean(eq); if (e > 0.3) { on++; votes.push(`stocks up ${round(e, 2)}%`) } else if (e < -0.3) { off++; votes.push(`stocks down ${round(e, 2)}%`) } }
  const btc = ch('BTCUSDT'); if (btc !== null) { if (btc > 1.5) { on++; votes.push(`bitcoin up ${round(btc, 1)}%`) } else if (btc < -1.5) { off++; votes.push(`bitcoin down ${round(btc, 1)}%`) } }
  const gld = ch('GLD'); if (gld !== null) { if (gld > 0.5) { off++; votes.push(`gold bid ${round(gld, 2)}%`) } else if (gld < -0.5) { on++; votes.push(`gold offered ${round(gld, 2)}%`) } }
  const ief = ch('IEF'); if (ief !== null) { if (ief > 0.25) { off++; votes.push('Treasuries bid') } else if (ief < -0.25) { on++; votes.push('Treasuries offered') } }
  if (strength) { const top = strength.slice(0, 2).map((s) => s.ccy); if (top.includes('JPY') || top.includes('CHF')) { off++; votes.push(`havens lead FX (${top.join(', ')})`) } else if (top.includes('AUD')) { on++; votes.push('AUD leads FX') } }
  if (on + off === 0) return { tone: eq.length || btc !== null ? 'mixed' : 'NOT ENOUGH DATA', votes }
  return { tone: on >= off + 2 ? 'risk-on' : off >= on + 2 ? 'risk-off' : 'mixed', votes }
}

export type AssetPanel = { asset: AssetClass; label: string; hours: HoursReading; markets: number; poor: number; caution: number; good: number; worst: Grade | null; via: string | null }

export type ConditionsReport = {
  label: 'READING'
  asOf: number
  verdict: 'GOOD' | 'CAUTION' | 'POOR' | 'NOT ENOUGH DATA'
  /** Would the conditions guard stop new entries on this reading? */
  wouldStop: boolean
  reasons: string[]
  engine: MarketCondition | null
  stress: { level: 'calm' | 'elevated' | 'stressed' | 'NOT ENOUGH DATA'; poorShare: number | null; elevatedShare: number | null; assessed: number }
  strength: ReturnType<typeof currencyStrength>
  /** False at the weekend: the strength list is then the last session's move, not a live one. */
  fxOpen: boolean
  tone: Tone
  assets: AssetPanel[]
  markets: MarketCondition[]
  thresholds: typeof THRESHOLDS
  note: string
}

/**
 * The whole picture. `engineKey` names the market the paper engine trades
 * (BTCUSDT): the verdict is POOR when that market is poor, or when stress is
 * market-wide; NOT ENOUGH DATA when the engine's own market cannot be read.
 */
export function assessConditions(inp: { markets: MarketInput[]; calendar: CalendarLite[]; now: number; engineKey: string; engine?: MarketInput | null }): ConditionsReport {
  const { markets, calendar, now } = inp
  const rows = markets.map((m) => assessOne(m, calendar, now))
  const engineInput = inp.engine ?? markets.find((m) => m.key === inp.engineKey) ?? null
  const engine = engineInput ? (inp.engine ? assessOne(inp.engine, calendar, now) : rows.find((r) => r.key === inp.engineKey) ?? null) : null
  const live = rows.filter((r) => r.grade !== 'closed' && r.grade !== 'blind')
  const poorShare = live.length ? live.filter((r) => r.grade === 'poor').length / live.length : null
  const elevatedShare = live.length ? live.filter((r) => r.readings.some((x) => x.key === 'vol' && x.level !== 'ok' && !/Dead/.test(x.text))).length / live.length : null
  const stressLevel = live.length < 3 ? 'NOT ENOUGH DATA' as const
    : (poorShare! >= THRESHOLDS.stressPoorShare || elevatedShare! >= THRESHOLDS.stressElevatedShare) ? 'stressed' as const
    : (poorShare! > 0.15 || elevatedShare! > 0.3) ? 'elevated' as const : 'calm' as const

  const reasons: string[] = []
  let verdict: ConditionsReport['verdict']
  if (!engine || engine.grade === 'blind') { verdict = 'NOT ENOUGH DATA'; reasons.push('The engine\'s own market cannot be read yet, so no verdict is given.') }
  else {
    if (engine.grade === 'poor') reasons.push(engine.headline)
    if (stressLevel === 'stressed') reasons.push(`Market-wide stress: ${Math.round((poorShare ?? 0) * 100)}% of open markets in poor shape, ${Math.round((elevatedShare ?? 0) * 100)}% with elevated volatility.`)
    verdict = reasons.length ? 'POOR' : engine.grade === 'caution' || stressLevel === 'elevated' ? 'CAUTION' : 'GOOD'
    if (verdict === 'CAUTION') reasons.push(engine.grade === 'caution' ? engine.headline : 'Stress is building across markets.')
    if (verdict === 'GOOD') reasons.push(engine.grade === 'closed' ? engine.headline : 'The engine\'s market is clear and no market-wide stress.')
  }

  const strength = currencyStrength(markets)
  const tone = riskTone(markets, strength)
  const panel = (asset: AssetClass, label: string, pick: (r: MarketCondition) => boolean, via: string | null, hoursAsset: AssetClass = asset): AssetPanel => {
    const rs = rows.filter(pick)
    const order: Grade[] = ['poor', 'caution', 'good', 'blind', 'closed']
    const h = marketHours(hoursAsset, now)
    const worst = rs.length ? order.find((g) => rs.some((r) => r.grade === g)) ?? null : null
    return { asset, label, hours: h, markets: rs.length, poor: rs.filter((r) => r.grade === 'poor').length, caution: rs.filter((r) => r.grade === 'caution').length, good: rs.filter((r) => r.grade === 'good').length, worst: h.open ? worst : 'closed', via }
  }
  const assets: AssetPanel[] = [
    panel('crypto', 'Crypto', (r) => r.kind === 'crypto', null),
    panel('forex', 'Forex', (r) => r.kind === 'forex', 'Kraken FX book'),
    panel('stock', 'Stocks', (r) => r.kind === 'stock' || r.kind === 'index', null),
    panel('option', 'Options', (r) => r.kind === 'stock' || r.kind === 'index', 'the underlying stocks and ETFs'),
    panel('future', 'Futures', (r) => r.kind === 'index', 'index and commodity funds (SPY for ES, QQQ for NQ, GLD for gold, USO for crude, IEF for 10y)'),
  ]
  return {
    label: 'READING', asOf: now, verdict, wouldStop: verdict === 'POOR', reasons, engine,
    stress: { level: stressLevel, poorShare: poorShare === null ? null : round(poorShare, 3), elevatedShare: elevatedShare === null ? null : round(elevatedShare, 3), assessed: live.length },
    strength, fxOpen: marketHours('forex', now).open, tone, assets, markets: rows, thresholds: THRESHOLDS, note: CONDITIONS_NOTE,
  }
}
