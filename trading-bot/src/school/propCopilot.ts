/**
 * CHALLENGE COPILOT — the pre-trade check a prop-firm trader runs before every
 * order, and Kestrel's own setups sized for the challenge account.
 *
 * Most challenges are failed by size, not by the trade idea: a stop that is
 * too wide for the risk, a position that would break the daily limit if it
 * stops out, a trade taken into high-impact news. The copilot answers, for
 * one planned trade on the owner's own firm rules:
 *  - the exact size in lots or contracts for the instrument, rounded down to
 *    what the platform accepts, and the dollars it risks at the stop;
 *  - whether a full stop-out would break the daily loss limit or the maximum
 *    loss floor, given the balance, today's start and the high-water mark the
 *    owner typed from their platform;
 *  - news, reward-to-risk and size cautions;
 *  - a verdict: GO, CAUTION or NO, with every reason.
 *
 * Kestrel sends no order. The owner reads the size and places the trade on
 * the firm's platform. Nothing here is read by the engine, risk, sizing or
 * the live gate. Pure functions, no I/O.
 *
 * Instrument values:
 *  - EXCHANGE: CME futures contract sizes, fixed by the exchange.
 *  - STANDARD: forex lots of 100,000 units of the base currency.
 *  - TYPICAL: CFD contract sizes differ between platforms. The default is a
 *    common one; the owner checks the platform's contract specification and
 *    types the real value if it differs.
 */

import type { CalendarEvent, TradePlan } from '../types.ts'
import type { ChallengeRules } from './propFirm.ts'

export type InstrumentKind = 'futures' | 'forex' | 'cfd'
export type Instrument = {
  id: string
  label: string
  kind: InstrumentKind
  unit: 'contract' | 'lot'
  /** Profit or loss for one contract or lot when price moves 1.0, in the quote currency (USD unless usdQuote is false). */
  pointValue: number
  /** False for USD-base forex pairs (USDJPY, USDCAD, USDCHF): the point value is in the quote currency and is converted at the entry price. */
  usdQuote: boolean
  minSize: number
  step: number
  spec: 'EXCHANGE' | 'STANDARD' | 'TYPICAL'
  /** Follows Bitcoin, so Kestrel's BTCUSDT setups can be sized on it. */
  tracksBtc: boolean
  note: string
}

const fut = (id: string, label: string, pointValue: number, note: string, tracksBtc = false): Instrument => ({ id, label, kind: 'futures', unit: 'contract', pointValue, usdQuote: true, minSize: 1, step: 1, spec: 'EXCHANGE', tracksBtc, note })
const fx = (id: string, usdQuote: boolean): Instrument => ({ id, label: `${id.slice(0, 3)}/${id.slice(3)}`, kind: 'forex', unit: 'lot', pointValue: 100_000, usdQuote, minSize: 0.01, step: 0.01, spec: 'STANDARD', tracksBtc: false, note: usdQuote ? '1 lot = 100,000 units; a 0.0001 move is $10 per lot.' : `1 lot = 100,000 USD; the value of a move is converted at the ${id.slice(3)} price.` })
const cfd = (id: string, label: string, pointValue: number, note: string, tracksBtc = false): Instrument => ({ id, label, kind: 'cfd', unit: 'lot', pointValue, usdQuote: true, minSize: 0.01, step: 0.01, spec: 'TYPICAL', tracksBtc, note })

export const INSTRUMENTS: Instrument[] = [
  fut('MBT', 'Micro Bitcoin futures (CME)', 0.1, '0.1 bitcoin per contract: a $1 move is $0.10.', true),
  fut('BTC', 'Bitcoin futures (CME)', 5, '5 bitcoin per contract: a $1 move is $5.', true),
  fut('MES', 'Micro E-mini S&P 500 (CME)', 5, '$5 per index point.'),
  fut('ES', 'E-mini S&P 500 (CME)', 50, '$50 per index point.'),
  fut('MNQ', 'Micro E-mini Nasdaq-100 (CME)', 2, '$2 per index point.'),
  fut('NQ', 'E-mini Nasdaq-100 (CME)', 20, '$20 per index point.'),
  fut('MGC', 'Micro Gold (COMEX)', 10, '10 troy ounces: a $1 move is $10.'),
  fut('GC', 'Gold (COMEX)', 100, '100 troy ounces: a $1 move is $100.'),
  fut('MCL', 'Micro WTI Crude (NYMEX)', 100, '100 barrels: a $1 move is $100.'),
  fut('CL', 'WTI Crude (NYMEX)', 1000, '1,000 barrels: a $1 move is $1,000.'),
  fx('EURUSD', true), fx('GBPUSD', true), fx('AUDUSD', true), fx('NZDUSD', true),
  fx('USDJPY', false), fx('USDCAD', false), fx('USDCHF', false),
  cfd('BTCUSD', 'Bitcoin CFD (BTCUSD)', 1, 'Commonly 1 bitcoin per lot. Check your platform\'s contract specification.', true),
  cfd('XAUUSD', 'Gold CFD (XAUUSD)', 100, 'Commonly 100 ounces per lot. Check your platform\'s contract specification.'),
  cfd('US500', 'S&P 500 index CFD', 1, 'Varies by platform: $1, $10 or more per point per lot. Check the contract specification and type the real value.'),
  cfd('US100', 'Nasdaq-100 index CFD', 1, 'Varies by platform: $1, $10 or more per point per lot. Check the contract specification and type the real value.'),
  cfd('US30', 'Dow 30 index CFD', 1, 'Varies by platform: $1, $10 or more per point per lot. Check the contract specification and type the real value.'),
]

export const instrumentById = (id: string | null | undefined): Instrument | null => INSTRUMENTS.find((i) => i.id === id) ?? null

// ---------------------------------------------------------------- the owner's account picture

export type CopilotProfile = {
  instrumentId: string
  /** Typed from the platform's contract specification when it differs from the default. Null = use the instrument's value. */
  pointValueOverride: number | null
  /** Round-trip commission per lot or contract, in dollars. */
  commission: number
  /** Risk per trade, % of the starting balance. Never above 5. */
  riskPct: number
  /** Which phase of the rules the account is in (0 = first). */
  phaseIndex: number
  /** From the platform, as of updatedAt. */
  balance: number
  /** Balance at the firm's day reset today. */
  dayStartBalance: number
  /** Highest balance (or end-of-day balance, for end-of-day trailing) since the phase started. */
  highWater: number
  /** The firm's maximum position size, if it has one. */
  maxSize: number | null
  updatedAt: number
}

const num = (v: unknown, lo: number, hi: number, fb: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb }

export function sanitiseProfile(input: unknown, accountSize: number, now = Date.now()): CopilotProfile {
  const r = (input ?? {}) as Record<string, unknown>
  const inst = instrumentById(String(r.instrumentId ?? '')) ?? INSTRUMENTS[0]
  const pv = r.pointValueOverride === null || r.pointValueOverride === undefined || r.pointValueOverride === '' ? null : num(r.pointValueOverride, 0.0001, 1_000_000, inst.pointValue)
  const balance = num(r.balance, 1, 100_000_000, accountSize)
  const max = r.maxSize === null || r.maxSize === undefined || r.maxSize === '' ? null : num(r.maxSize, 0.01, 100_000, 1)
  return {
    instrumentId: inst.id,
    pointValueOverride: pv,
    commission: num(r.commission, 0, 1_000, 0),
    riskPct: Math.round(num(r.riskPct, 0.05, 5, 0.5) * 100) / 100,
    phaseIndex: Math.floor(num(r.phaseIndex, 0, 3, 0)),
    balance,
    dayStartBalance: num(r.dayStartBalance, 1, 100_000_000, balance),
    highWater: Math.max(num(r.highWater, 1, 100_000_000, Math.max(balance, accountSize)), balance),
    maxSize: max,
    updatedAt: now,
  }
}

// ---------------------------------------------------------------- sizing

export type Sizing = {
  instrument: string
  unit: 'contract' | 'lot'
  size: number
  /** The size before rounding down to the platform's step. */
  rawSize: number
  distance: number
  /** Dollars per 1.0 move for one contract or lot, as used. */
  valuePerPoint: number
  /** Dollars lost on one contract or lot at the stop, commission included. */
  lossPerUnit: number
  riskUsd: number
  /** Dollars at risk at the rounded size. */
  actualRiskUsd: number
  rewardUsd: number | null
  rr: number | null
  tooSmall: boolean
  /** The least a single minimum-size position risks at this stop. */
  minRiskUsd: number
  cappedByMaxSize: boolean
  specNote: string
}

const dec = (step: number) => Math.max(0, Math.round(-Math.log10(step)))
const floorTo = (x: number, step: number) => { const d = dec(step); return Number((Math.floor(x / step + 1e-9) * step).toFixed(d)) }

/** Sizes one trade so a full stop-out costs at most riskUsd. Throws a plain-English error on impossible input. */
export function sizeTrade(i: Instrument, p: { entry: number; stop: number; target?: number | null; riskUsd: number; commission?: number; pointValueOverride?: number | null; maxSize?: number | null }): Sizing {
  if (!(p.entry > 0) || !(p.stop > 0)) throw new Error('Entry and stop must be prices above zero.')
  const distance = Math.abs(p.entry - p.stop)
  if (distance <= 0) throw new Error('The stop must be away from the entry.')
  if (!(p.riskUsd > 0)) throw new Error('Risk must be above zero.')
  const base = p.pointValueOverride ?? i.pointValue
  const valuePerPoint = i.usdQuote || p.pointValueOverride ? base : base / p.entry
  const commission = Math.max(0, p.commission ?? 0)
  const lossPerUnit = distance * valuePerPoint + commission
  const rawSize = p.riskUsd / lossPerUnit
  let size = floorTo(rawSize, i.step)
  let cappedByMaxSize = false
  if (p.maxSize != null && size > p.maxSize) { size = floorTo(p.maxSize, i.step); cappedByMaxSize = true }
  const tooSmall = size < i.minSize
  if (tooSmall) size = 0
  const actualRiskUsd = Math.round(size * lossPerUnit * 100) / 100
  let rewardUsd: number | null = null, rr: number | null = null
  if (p.target != null && p.target > 0) {
    const move = Math.abs(p.target - p.entry)
    rewardUsd = Math.round((size * (move * valuePerPoint - commission)) * 100) / 100
    rr = Math.round((move / distance) * 100) / 100
  }
  return {
    instrument: i.id, unit: i.unit, size, rawSize: Math.round(rawSize * 10_000) / 10_000, distance, valuePerPoint, lossPerUnit: Math.round(lossPerUnit * 100) / 100,
    riskUsd: p.riskUsd, actualRiskUsd, rewardUsd, rr, tooSmall, minRiskUsd: Math.round(i.minSize * lossPerUnit * 100) / 100, cappedByMaxSize,
    specNote: p.pointValueOverride ? `Using your value of $${p.pointValueOverride} per point per ${i.unit}.` : i.note,
  }
}

// ---------------------------------------------------------------- the rule check

export type CheckLine = { id: string; level: 'ok' | 'warn' | 'fail'; label: string; detail: string }
export type CopilotCheck = { verdict: 'GO' | 'CAUTION' | 'NO'; lines: CheckLine[]; dailyRoom: number | null; floor: number; floorRoom: number; phase: string }

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })

/** The maximum-loss floor for the phase, from the starting size and the high-water mark the owner typed. */
export function floorFor(rules: ChallengeRules, phaseIndex: number, highWater: number): number {
  const p = rules.phases[Math.min(phaseIndex, rules.phases.length - 1)]
  const maxLoss = rules.accountSize * p.maxLossPct / 100
  if (p.drawdownMode === 'static') return rules.accountSize - maxLoss
  const f = Math.max(highWater, rules.accountSize) - maxLoss
  return p.trailStopsAtStart ? Math.min(f, rules.accountSize) : f
}

export function checkTrade(rules: ChallengeRules, profile: CopilotProfile, trade: { direction: 'long' | 'short'; entry: number; stop: number; target?: number | null }, sizing: Sizing, opts: { news?: CalendarEvent[]; now?: number; profileSaved?: boolean } = {}): CopilotCheck {
  const now = opts.now ?? Date.now()
  const phase = rules.phases[Math.min(profile.phaseIndex, rules.phases.length - 1)]
  const lines: CheckLine[] = []
  const add = (id: string, level: CheckLine['level'], label: string, detail: string) => lines.push({ id, level, label, detail })

  if (opts.profileSaved === false) add('profile', 'warn', 'Example balances', 'Your balances are not saved yet, so this check assumes a fresh account. Enter today\'s numbers from your platform first.')

  const wrongSide = trade.direction === 'long' ? trade.stop >= trade.entry : trade.stop <= trade.entry
  if (wrongSide) add('stop-side', 'fail', 'Stop on the wrong side', `A ${trade.direction} needs its stop ${trade.direction === 'long' ? 'below' : 'above'} the entry.`)

  if (sizing.tooSmall) add('size', 'fail', 'Too small to trade', `Even the minimum ${sizing.unit} risks ${money(sizing.minRiskUsd)} at this stop, more than your ${money(sizing.riskUsd)}. Tighten the stop or skip the trade.`)
  else add('size', 'ok', 'Size', `${sizing.size} ${sizing.unit}${sizing.size === 1 ? '' : 's'} risks ${money(sizing.actualRiskUsd)} at the stop${sizing.cappedByMaxSize ? ', capped at your firm\'s maximum size' : ''}.`)

  const risk = sizing.actualRiskUsd
  let dailyRoom: number | null = null
  if (phase.maxDailyLossPct !== null) {
    const limit = rules.accountSize * phase.maxDailyLossPct / 100
    const used = Math.max(0, profile.dayStartBalance - profile.balance)
    dailyRoom = Math.round((limit - used) * 100) / 100
    if (dailyRoom <= 0) add('daily', 'fail', 'Daily limit', `Today's loss limit is already used up (${money(used)} of ${money(limit)}). Stop for today.`)
    else if (risk >= dailyRoom) add('daily', 'fail', 'Daily limit', `A full stop-out (${money(risk)}) would break today's limit: only ${money(dailyRoom)} of room is left.`)
    else if (risk > dailyRoom * 0.5) add('daily', 'warn', 'Daily limit', `This one trade uses ${Math.round(risk / dailyRoom * 100)}% of today's remaining room (${money(dailyRoom)}).`)
    else add('daily', 'ok', 'Daily limit', `${money(dailyRoom)} of room left today; this trade risks ${Math.round(risk / dailyRoom * 100)}% of it.`)
  } else add('daily', 'ok', 'Daily limit', 'This phase has no daily loss limit.')

  const floor = Math.round(floorFor(rules, profile.phaseIndex, profile.highWater) * 100) / 100
  const floorRoom = Math.round((profile.balance - floor) * 100) / 100
  if (floorRoom <= 0) add('max-loss', 'fail', 'Maximum loss', `The balance is at or under the floor (${money(floor)}).`)
  else if (risk >= floorRoom) add('max-loss', 'fail', 'Maximum loss', `A full stop-out would take the balance to the ${phase.drawdownMode === 'static' ? 'fixed' : 'trailing'} floor of ${money(floor)}.`)
  else if (risk > floorRoom * 0.5) add('max-loss', 'warn', 'Maximum loss', `This trade risks ${Math.round(risk / floorRoom * 100)}% of the room above the floor (${money(floorRoom)}).`)
  else add('max-loss', 'ok', 'Maximum loss', `${money(floorRoom)} above the ${phase.drawdownMode === 'static' ? 'fixed' : 'trailing'} floor of ${money(floor)}.`)

  const pctOfAccount = risk / rules.accountSize * 100
  if (pctOfAccount > 2) add('risk-size', 'warn', 'Risk per trade', `${pctOfAccount.toFixed(1)}% of the account on one trade. Traders who pass usually risk 0.25–1%.`)

  if (sizing.rr !== null) {
    if (sizing.rr < 1) add('reward', 'warn', 'Reward to risk', `The target is only ${sizing.rr}× the stop distance.`)
    else add('reward', 'ok', 'Reward to risk', `${sizing.rr} : 1${sizing.rewardUsd !== null ? `, about ${money(sizing.rewardUsd)} at the target` : ''}.`)
  }

  const soon = (opts.news ?? []).filter((e) => e.impact === 'High' && Math.abs(e.time - now) <= 30 * 60_000)
  if (soon.length) add('news', 'warn', 'High-impact news', `${soon.map((e) => `${e.country} ${e.title} at ${hhmm(e.time)}`).slice(0, 3).join('; ')}. Check your firm's news rule; many forbid trading in the minutes around it.`)
  else if (opts.news) add('news', 'ok', 'News', 'No high-impact release within 30 minutes on Kestrel\'s calendar.')

  if (phase.consistencyMaxDayPct !== null) add('consistency', 'ok', 'Consistency rule', `Keep any single day's profit under ${phase.consistencyMaxDayPct}% of your total profit.`)

  const ageH = (now - profile.updatedAt) / 3_600_000
  if (ageH > 12) add('stale', 'warn', 'Balances may be old', `You last updated the balance ${Math.round(ageH)} hours ago. Copy today's numbers from your platform first.`)

  const verdict = lines.some((l) => l.level === 'fail') ? 'NO' : lines.some((l) => l.level === 'warn') ? 'CAUTION' : 'GO'
  return { verdict, lines, dailyRoom, floor, floorRoom, phase: phase.name }
}

// ---------------------------------------------------------------- Kestrel setups, sized for the challenge

export type SizedAlert = {
  at: number
  signalTime: number
  direction: 'long' | 'short'
  entry: number
  stop: number
  target: number | null
  instrument: string
  sizing: Sizing | null
  check: CopilotCheck | null
  note: string
}

/**
 * Sizes one of Kestrel's BTCUSDT setups for the challenge account. Only
 * Bitcoin instruments can be sized from a Bitcoin setup; prices come from
 * Binance, so the levels are close to, not the same as, the platform's.
 */
export function alertFor(plan: TradePlan, signalTime: number, rules: ChallengeRules, profile: CopilotProfile, opts: { news?: CalendarEvent[]; now?: number } = {}): SizedAlert {
  const now = opts.now ?? Date.now()
  const i = instrumentById(profile.instrumentId)
  const base = { at: now, signalTime, direction: plan.direction, entry: plan.entry, stop: plan.stop, target: plan.takeProfit ?? null, instrument: profile.instrumentId }
  if (!i || !i.tracksBtc) return { ...base, sizing: null, check: null, note: `Kestrel's setups are on Bitcoin. Pick a Bitcoin instrument (Micro Bitcoin futures, Bitcoin futures or a BTCUSD CFD) to get them sized for your account.` }
  try {
    const sizing = sizeTrade(i, { entry: plan.entry, stop: plan.stop, target: plan.takeProfit, riskUsd: rules.accountSize * profile.riskPct / 100, commission: profile.commission, pointValueOverride: profile.pointValueOverride, maxSize: profile.maxSize })
    const check = checkTrade(rules, profile, { direction: plan.direction, entry: plan.entry, stop: plan.stop, target: plan.takeProfit }, sizing, { news: opts.news, now })
    return { ...base, sizing, check, note: 'Levels are from Binance BTCUSDT; your platform\'s price differs a little. Keep the stop distance, re-read the levels on your platform, and place the order yourself.' }
  } catch (e) { return { ...base, sizing: null, check: null, note: (e as Error).message } }
}
