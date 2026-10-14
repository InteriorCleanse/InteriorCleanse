/**
 * AI SECOND OPINION — Claude reads the market state Kestrel saw and makes its
 * own call, which is recorded before the outcome and scored against Kestrel's
 * on the same rule. The idea comes from "decision-layer" setups (a model is
 * given a structured state, not a chart, and returns a structured decision);
 * here the model is only ever a witness.
 *
 * Boxed in on purpose:
 * - It never trades. Nothing in the engine, fusion, risk, sizing, the paper
 *   trader or the live gate reads an opinion. It cannot place, block or resize
 *   anything. It is research: a forward record that answers, over time,
 *   whether the model adds anything Kestrel does not already see.
 * - Independent. The state holds numbers and enums Kestrel computed (price
 *   path, volatility, structure, session, order book, tape). It leaves out
 *   Kestrel's own verdict (the fused decision, the strategy votes, the
 *   signal, the bias), so the model cannot simply echo it. No third-party text
 *   (news headlines) goes in, so nothing in the prompt can be an instruction.
 * - Forward only. A language model cannot be backtested honestly: it may have
 *   read what happened in any past period. Opinions are therefore only taken
 *   live, timestamped, and scored after the horizon has passed. The prompt
 *   carries the time of day, never the date.
 * - Bounded cost. It asks only when a setup is forming or ready (LONG / SHORT
 *   / LONG WATCH / SHORT WATCH), at most once per 30 minutes unless Kestrel's
 *   call changes, under a daily cap (MRCASH_SECOND_OPINION_DAILY, default 24).
 *   MRCASH_SECOND_OPINION=0 turns it off.
 * - Honest scoring. One rule for both: after H candles, BUY was right if price
 *   rose more than the threshold, SELL if it fell more than the threshold,
 *   HOLD if it stayed inside it. The threshold is fixed at decision time from
 *   the volatility then. Under 30 scored calls the scoreboard says NOT ENOUGH
 *   DATA.
 */

import type { Snapshot } from '../bot.ts'
import { store } from '../store.ts'

export const LABEL = 'AI SECOND OPINION (Claude): paper research, never trades'
export const HORIZON = 12
export const MIN_SCORED = 30
const LOG_KEY = 'secondopinion:log'
const USAGE_KEY = 'secondopinion:usage'
const MAX_RECORDS = 1000
const MIN_GAP_MS = 30 * 60_000

export type Call = 'BUY' | 'SELL' | 'HOLD'

/** What the model is shown. Numbers and enums only. */
export type OpinionState = {
  symbol: string
  timeframe: string
  /** New York time of day and weekday; never the date. */
  nyTime: string
  weekday: string
  price: number
  returnsPct: { last1h: number | null; last4h: number | null; last24h: number | null }
  /** Average candle range over the last 14 candles, as % of price. */
  atrPct: number
  /** Last 12 candles' volume against the average of the last 288. */
  volumeRatio: number | null
  rangeToday: { highPct: number; lowPct: number } | null
  previousDay: { highPct: number; lowPct: number } | null
  session: string | null
  inKillzone: boolean
  structureTrend: 'bullish' | 'bearish' | null
  trend: 'uptrend' | 'downtrend' | 'range' | null
  trendStrength: number | null
  volatility: 'quiet' | 'normal' | 'wild' | null
  regime: { state: string; direction: string | null; confidence: number } | null
  book: { spreadPct: number; imbalance: number } | null
  tape: { buyShare: number; deltaUsd: number; tradesPerMinute: number } | null
  /** The last 24 closes, as % change from the first, oldest first. */
  path: number[]
  scoring: { horizonCandles: number; thresholdPct: number }
}

export type Opinion = { action: Call; confidence: number; reasoning: string[]; riskNotes: string; keyLevels: { entry: number | null; stop: number | null; target: number | null } | null }

export type Outcome = { scoredAt: number; closeAfter: number; returnPct: number; truth: Call; aiRight: boolean; engineRight: boolean }

export type OpinionRecord = {
  id: string
  at: number
  /** Open time of the candle the state was taken at. */
  candleTime: number
  symbol: string
  interval: string
  intervalMs: number
  state: OpinionState
  opinion: Opinion | null
  /** Kestrel's own call at the same moment, recorded side by side, for comparison only. */
  engine: { action: string; direction: 'long' | 'short' | null; score: number; call: Call }
  model: string
  costUsd: number
  error: string | null
  outcome: Outcome | null
}

export type SecondOpinionSettings = { enabled: boolean; dailyCap: number; model: string | null }

export function settings(env: NodeJS.ProcessEnv = process.env): SecondOpinionSettings {
  const cap = Number(env.MRCASH_SECOND_OPINION_DAILY)
  return {
    enabled: env.MRCASH_SECOND_OPINION !== '0',
    dailyCap: Number.isFinite(cap) && cap >= 0 ? Math.min(200, Math.floor(cap)) : 24,
    model: env.MRCASH_SECOND_OPINION_MODEL?.trim() || null,
  }
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d
const pct = (a: number, b: number) => (b ? round((a / b - 1) * 100) : 0)
const dayKey = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

/** Kestrel's action mapped onto the same three calls the model makes. A watch is a hold: nothing was done. */
export function engineCall(action: string | null | undefined): Call {
  return action === 'LONG' ? 'BUY' : action === 'SHORT' ? 'SELL' : 'HOLD'
}

/** Builds the state from a snapshot. Leaves out every field that carries Kestrel's own verdict. Null when there is too little to show. */
export function buildState(snap: Snapshot, opts: { symbol: string; interval: string; intervalMs: number }): OpinionState | null {
  const c = snap.candles
  if (c.length < 30) return null
  const last = c[c.length - 1]
  const price = last.close
  const back = (n: number) => (c.length > n ? pct(price, c[c.length - 1 - n].close) : null)
  const perHour = Math.max(1, Math.round(3_600_000 / opts.intervalMs))
  const recent = c.slice(-14)
  const atrPct = round(recent.reduce((s, k) => s + (k.high - k.low), 0) / recent.length / price * 100)
  const vol = c.slice(-288)
  const avgVol = vol.reduce((s, k) => s + k.volume, 0) / vol.length
  const last12 = c.slice(-12).reduce((s, k) => s + k.volume, 0) / Math.min(12, c.length)
  const today = dayKey(last.openTime)
  const todays = c.filter((k) => dayKey(k.openTime) === today)
  const a = snap.analysis
  const st = snap.state
  const book = snap.flow?.book ?? null
  const tape = snap.flow?.tape ?? null
  const first = c[Math.max(0, c.length - 24)].close
  const when = new Date(last.openTime)
  return {
    symbol: opts.symbol,
    timeframe: opts.interval,
    nyTime: when.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }),
    weekday: when.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' }),
    price,
    returnsPct: { last1h: back(perHour), last4h: back(perHour * 4), last24h: back(perHour * 24) },
    atrPct,
    volumeRatio: avgVol > 0 ? round(last12 / avgVol, 2) : null,
    rangeToday: todays.length ? { highPct: pct(Math.max(...todays.map((k) => k.high)), price), lowPct: pct(Math.min(...todays.map((k) => k.low)), price) } : null,
    previousDay: a?.previousDay ? { highPct: pct(a.previousDay.high, price), lowPct: pct(a.previousDay.low, price) } : null,
    session: a?.session ?? null,
    inKillzone: a?.inKillzone ?? false,
    structureTrend: a?.structureTrend ?? null,
    trend: st?.trend ?? null,
    trendStrength: st?.strength ?? null,
    volatility: st?.volatility ?? null,
    regime: st?.regime ? { state: st.regime.state, direction: st.regime.direction, confidence: st.regime.confidence } : null,
    book: book ? { spreadPct: round(book.spreadPct, 4), imbalance: round(book.imbalance, 3) } : null,
    tape: tape ? { buyShare: round(tape.buyShare, 3), deltaUsd: Math.round(tape.deltaUsd), tradesPerMinute: round(tape.tradesPerMinute, 1) } : null,
    path: c.slice(-24).map((k) => pct(k.close, first)),
    scoring: { horizonCandles: HORIZON, thresholdPct: thresholdFor(atrPct) },
  }
}

/** The move that counts as "it went somewhere": half a typical candle range, never below 0.15%. Fixed at decision time. */
export function thresholdFor(atrPct: number): number {
  return round(Math.max(0.15, atrPct * 0.5))
}

/** Whether this cycle deserves an opinion. Pure: the caller supplies the last record and today's usage. */
export function shouldAsk(snap: Snapshot, last: OpinionRecord | null, usedToday: number, s: SecondOpinionSettings, now: number): { ask: boolean; why: string } {
  if (!s.enabled) return { ask: false, why: 'turned off (MRCASH_SECOND_OPINION=0)' }
  const d = snap.decision
  if (!d || d.action === 'NO TRADE') return { ask: false, why: 'no setup forming' }
  if (usedToday >= s.dailyCap) return { ask: false, why: `daily cap of ${s.dailyCap} reached` }
  const candleTime = snap.candles[snap.candles.length - 1]?.openTime ?? 0
  if (last && last.candleTime === candleTime) return { ask: false, why: 'already asked on this candle' }
  if (last && last.engine.action === d.action && now - last.at < MIN_GAP_MS) return { ask: false, why: 'asked within the last 30 minutes and Kestrel\'s call has not changed' }
  return { ask: true, why: `Kestrel reads ${d.action}` }
}

// ---------------------------------------------------------------- the model call

export const SYSTEM = [
  'You are an independent second-opinion analyst for a PAPER-trading research bot. You are given a structured snapshot of one market at one moment: numbers and labels only.',
  'Decide what you would do for the next horizonCandles candles: BUY, SELL or HOLD. Your answer is recorded before the outcome and scored later; it never places, blocks or sizes a trade.',
  'Scoring rule: BUY is right if price ends the horizon more than thresholdPct higher; SELL if more than thresholdPct lower; HOLD if it ends within ±thresholdPct.',
  'Use only the numbers given. Do not assume anything about what happened after the snapshot. Choose HOLD when the evidence is mixed.',
  'confidence is your probability, from 0.34 to 0.95, that your call is right under the scoring rule. Give at most four short, specific reasons. Key levels are prices, or null when you have none.',
  'No hype, no certainty, no advice to anyone.',
].join(' ')

export const SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] },
    confidence: { type: 'number' },
    reasoning: { type: 'array', items: { type: 'string' } },
    risk_notes: { type: 'string' },
    key_levels: {
      type: 'object',
      properties: { entry: { anyOf: [{ type: 'number' }, { type: 'null' }] }, stop: { anyOf: [{ type: 'number' }, { type: 'null' }] }, target: { anyOf: [{ type: 'number' }, { type: 'null' }] } },
      required: ['entry', 'stop', 'target'],
      additionalProperties: false,
    },
  },
  required: ['action', 'confidence', 'reasoning', 'risk_notes', 'key_levels'],
  additionalProperties: false,
} as const

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

/** Validates the model's JSON. Anything malformed is refused rather than repaired. */
export function parseOpinion(j: unknown): Opinion {
  const o = (j ?? {}) as Record<string, unknown>
  if (o.action !== 'BUY' && o.action !== 'SELL' && o.action !== 'HOLD') throw new Error('The model returned no valid action.')
  const conf = Number(o.confidence)
  if (!Number.isFinite(conf)) throw new Error('The model returned no confidence.')
  const kl = (o.key_levels ?? null) as Record<string, unknown> | null
  const keyLevels = kl ? { entry: num(kl.entry), stop: num(kl.stop), target: num(kl.target) } : null
  return {
    action: o.action,
    confidence: round(Math.min(0.95, Math.max(0, conf > 1 ? conf / 100 : conf)), 2),
    reasoning: (Array.isArray(o.reasoning) ? o.reasoning : []).slice(0, 4).map((r) => clean(r, 200)).filter(Boolean),
    riskNotes: clean(o.risk_notes, 300),
    keyLevels: keyLevels && (keyLevels.entry || keyLevels.stop || keyLevels.target) ? keyLevels : null,
  }
}

export type AskFn = (system: string, user: string, schema: Record<string, unknown>, model: string | null) => Promise<{ json: unknown | null; refused: boolean; reason: string | null; costUsd: number; model: string }>

// ---------------------------------------------------------------- the record

export function readLog(): OpinionRecord[] { return store().getJson<OpinionRecord[]>(LOG_KEY) ?? [] }
function writeLog(rows: OpinionRecord[]): void { store().setJson(LOG_KEY, rows.slice(-MAX_RECORDS)) }

export function usedToday(now = Date.now()): number {
  const u = store().getJson<{ day: string; used: number }>(USAGE_KEY)
  return u && u.day === dayKey(now) ? u.used : 0
}
function countUse(now: number): void { store().setJson(USAGE_KEY, { day: dayKey(now), used: usedToday(now) + 1 }) }

/**
 * Takes one opinion on a snapshot and records it, whatever comes back (a
 * failed call is recorded with its error, so the log never hides gaps).
 * Every call that reached the model counts against the daily cap.
 */
export async function takeOpinion(snap: Snapshot, opts: { symbol: string; interval: string; intervalMs: number; ask: AskFn; now?: number; env?: NodeJS.ProcessEnv }): Promise<OpinionRecord | null> {
  const now = opts.now ?? Date.now()
  const state = buildState(snap, opts)
  if (!state) return null
  const d = snap.decision
  const candleTime = snap.candles[snap.candles.length - 1].openTime
  const rec: OpinionRecord = {
    id: `${opts.symbol}@${candleTime}`,
    at: now, candleTime, symbol: opts.symbol, interval: opts.interval, intervalMs: opts.intervalMs, state, opinion: null,
    engine: { action: d?.action ?? 'NO TRADE', direction: d?.direction ?? null, score: d?.score ?? 0, call: engineCall(d?.action) },
    model: settings(opts.env).model ?? '', costUsd: 0, error: null, outcome: null,
  }
  try {
    const r = await opts.ask(SYSTEM, `Market state:\n${JSON.stringify(state)}`, SCHEMA as unknown as Record<string, unknown>, settings(opts.env).model)
    countUse(now)
    rec.model = r.model; rec.costUsd = r.costUsd
    if (r.refused || !r.json) rec.error = r.reason ?? 'The model gave no answer.'
    else rec.opinion = parseOpinion(r.json)
  } catch (e) { rec.error = clean((e as Error).message, 300) }
  writeLog([...readLog().filter((x) => x.id !== rec.id), rec])
  return rec
}

// ---------------------------------------------------------------- scoring

type CandleLite = { openTime: number; close: number }
export type CandlesFn = (symbol: string, interval: string, fromOpenTime: number, toOpenTime: number) => CandleLite[]

/** The true call for a move, under the same rule both sides are scored on. */
export function truthFor(returnPct: number, thresholdPct: number): Call {
  return returnPct > thresholdPct ? 'BUY' : returnPct < -thresholdPct ? 'SELL' : 'HOLD'
}

/** Scores every record whose horizon has fully passed. Only candles strictly after the decision candle are read. Returns how many were scored. */
export function scoreDue(candles: CandlesFn, now = Date.now()): number {
  const rows = readLog()
  let n = 0
  for (const r of rows) {
    if (r.outcome || !r.opinion) continue
    const endOpen = r.candleTime + r.intervalMs * r.state.scoring.horizonCandles
    if (now < endOpen + r.intervalMs) continue // the horizon candle must have closed
    const after = candles(r.symbol, r.interval, r.candleTime + 1, endOpen)
    const last = after.filter((k) => k.openTime <= endOpen).sort((a, b) => a.openTime - b.openTime).pop()
    if (!last || last.openTime < endOpen) continue // a gap in the stored candles: leave it unscored rather than guess
    const returnPct = pct(last.close, r.state.price)
    const truth = truthFor(returnPct, r.state.scoring.thresholdPct)
    r.outcome = { scoredAt: now, closeAfter: last.close, returnPct, truth, aiRight: r.opinion.action === truth, engineRight: r.engine.call === truth }
    n++
  }
  if (n) writeLog(rows)
  return n
}

export type Scoreboard = {
  sampleStatus: 'NOT ENOUGH DATA' | 'SMALL SAMPLE'
  asked: number
  answered: number
  scored: number
  aiHitRate: number | null
  engineHitRate: number | null
  agreeRate: number | null
  whenTheyDisagree: { n: number; aiRight: number; engineRight: number; neither: number }
  calibration: Array<{ band: string; n: number; hitRate: number | null }>
  costUsd: number
  note: string
}

/** The comparison. Descriptive only, with its sample size on every number. */
export function scoreboard(rows: OpinionRecord[]): Scoreboard {
  const answered = rows.filter((r) => r.opinion)
  const scored = answered.filter((r) => r.outcome)
  const rate = (k: number, n: number) => (n ? round(k / n, 3) : null)
  const dis = scored.filter((r) => r.opinion!.action !== r.engine.call)
  const bands: Array<[string, number, number]> = [['under 0.5', 0, 0.5], ['0.5–0.6', 0.5, 0.6], ['0.6–0.7', 0.6, 0.7], ['0.7–0.8', 0.7, 0.8], ['0.8 and up', 0.8, 1.01]]
  const status = scored.length < MIN_SCORED ? 'NOT ENOUGH DATA' : 'SMALL SAMPLE'
  return {
    sampleStatus: status,
    asked: rows.length,
    answered: answered.length,
    scored: scored.length,
    aiHitRate: rate(scored.filter((r) => r.outcome!.aiRight).length, scored.length),
    engineHitRate: rate(scored.filter((r) => r.outcome!.engineRight).length, scored.length),
    agreeRate: rate(answered.filter((r) => r.opinion!.action === r.engine.call).length, answered.length),
    whenTheyDisagree: { n: dis.length, aiRight: dis.filter((r) => r.outcome!.aiRight).length, engineRight: dis.filter((r) => r.outcome!.engineRight).length, neither: dis.filter((r) => !r.outcome!.aiRight && !r.outcome!.engineRight).length },
    calibration: bands.map(([band, lo, hi]) => { const b = scored.filter((r) => r.opinion!.confidence >= lo && r.opinion!.confidence < hi); return { band, n: b.length, hitRate: rate(b.filter((r) => r.outcome!.aiRight).length, b.length) } }),
    costUsd: round(rows.reduce((s, r) => s + (r.costUsd || 0), 0), 4),
    note: status === 'NOT ENOUGH DATA'
      ? `${scored.length} of ${MIN_SCORED} scored calls so far. Hit rates on fewer than ${MIN_SCORED} are noise, so they are shown as tallies.`
      : `${scored.length} scored calls. A difference between the two hit rates is not evidence the model is better until it holds over hundreds of calls and different market regimes.`,
  }
}

// ---------------------------------------------------------------- the service

export type SecondOpinionService = { stop: () => void; askNow: (snap: Snapshot) => Promise<OpinionRecord | null>; busy: () => boolean }

/**
 * Subscribes to the engine's cycle event. On each cycle it scores whatever is
 * due and, when shouldAsk says so, takes one opinion in the background. The
 * engine never waits for it and never reads it.
 */
export function startSecondOpinion(opts: {
  on: (handler: (c: { at: number; snap: Snapshot }) => void) => () => void
  available: () => Promise<boolean>
  ask: AskFn
  candles: CandlesFn
  symbol: string
  interval: string
  intervalMs: number
  log?: (line: string) => void
}): SecondOpinionService {
  let inFlight = false
  const log = opts.log ?? (() => {})
  const take = async (snap: Snapshot): Promise<OpinionRecord | null> => {
    if (inFlight) throw new Error('An opinion is already being taken.')
    if (!(await opts.available())) throw new Error('No ANTHROPIC_API_KEY, so there is no second opinion. Add your key to .env to turn it on.')
    inFlight = true
    try {
      const r = await takeOpinion(snap, opts)
      if (r) log(r.opinion ? `second opinion: ${r.opinion.action} (${Math.round(r.opinion.confidence * 100)}%) vs Kestrel ${r.engine.action}` : `second opinion failed: ${r.error}`)
      return r
    } finally { inFlight = false }
  }
  const off = opts.on((c) => {
    try { const n = scoreDue(opts.candles, c.at); if (n) log(`second opinion: ${n} call(s) scored`) } catch (e) { log(`second opinion scoring: ${(e as Error).message}`) }
    const rows = readLog()
    const decision = shouldAsk(c.snap, rows[rows.length - 1] ?? null, usedToday(c.at), settings(), c.at)
    if (!decision.ask || inFlight) return
    take(c.snap).catch((e) => log(`second opinion: ${(e as Error).message}`))
  })
  return { stop: off, askNow: take, busy: () => inFlight }
}

export function status(available: boolean, now = Date.now()): { available: boolean; enabled: boolean; reason: string; usedToday: number; dailyCap: number; horizon: number; label: string } {
  const s = settings()
  const reason = !s.enabled ? 'Turned off with MRCASH_SECOND_OPINION=0.' : !available ? 'No ANTHROPIC_API_KEY in .env, so Claude cannot give a second opinion.' : usedToday(now) >= s.dailyCap ? `Today's cap of ${s.dailyCap} opinions is used up; it resets at midnight New York time.` : 'Asks when a setup is forming or ready, at most every 30 minutes.'
  return { available: available && s.enabled, enabled: s.enabled, reason, usedToday: usedToday(now), dailyCap: s.dailyCap, horizon: HORIZON, label: LABEL }
}
