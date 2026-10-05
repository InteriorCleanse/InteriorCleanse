/**
 * PROP FIRM ACADEMY — how funded-trader challenges work, taught with
 * Kestrel's own record and your own journal, from choosing a firm to a payout.
 *
 * A prop firm sells an evaluation ("challenge"): trade a simulated account,
 * hit a profit target without breaking a daily loss limit or a maximum loss
 * limit, over at least a minimum number of trading days. Pass and the firm
 * offers a funded account that pays a share of profits. Almost everything
 * that fails a challenge is a rule breach, not a bad market read, so this
 * module is mostly rules arithmetic:
 *
 *   - a rule model that covers the common shapes (static, end-of-day trailing
 *     and intraday trailing drawdown, daily loss, minimum days, time limit,
 *     consistency rule);
 *   - example templates, clearly marked EXAMPLE: no firm's real rules are
 *     stored here, because firms change them and the owner must copy the
 *     exact numbers from their firm's current rulebook;
 *   - an evaluator that replays a list of closed trades through the rules and
 *     says, trade by trade, where the challenge stood and what broke it;
 *   - risk arithmetic (how many straight losses the limits allow at a given
 *     risk per trade) and a seeded Monte Carlo under the learner's OWN typed
 *     assumptions, labelled SIMULATED;
 *   - the journey, step by step, with what you do, what Kestrel does, and the
 *     traps.
 *
 * Boxed in on purpose:
 * - Kestrel does NOT trade a prop account. It has no connection to any firm,
 *   broker or platform and gains none here. You place the trades; Kestrel
 *   explains, tracks the rules and warns. See BOT_POLICY for why.
 * - Nothing here is read by the engine, fusion, risk, sizing or any strategy.
 * - Results over Kestrel's paper record are labelled PAPER and carry a sample
 *   status; with a thin record the honest answer is NOT ENOUGH DATA.
 *
 * Pure functions, no I/O.
 */

export type DrawdownMode = 'static' | 'trailing-eod' | 'trailing-intraday'

export type PhaseRules = {
  name: string
  /** Profit target as % of the starting balance. null = no target (a funded account). */
  profitTargetPct: number | null
  /** Daily loss limit as % of the starting balance, measured from the balance at the day's reset. null = none. */
  maxDailyLossPct: number | null
  /** Maximum loss as % of the starting balance. */
  maxLossPct: number
  drawdownMode: DrawdownMode
  /** Trailing modes only: the floor stops rising once it reaches the starting balance (common on futures evaluations). */
  trailStopsAtStart: boolean
  minTradingDays: number
  /** Calendar days allowed from the first trade. null = unlimited. */
  maxCalendarDays: number | null
  /** Best single day may be at most this % of total profit when the target is checked. null = no consistency rule. */
  consistencyMaxDayPct: number | null
}

export type ChallengeRules = {
  label: string
  accountSize: number
  /** IANA time zone and hour at which the firm's trading day resets. */
  dayResetTz: string
  dayResetHour: number
  phases: PhaseRules[]
}

export type ChallengeTemplate = ChallengeRules & {
  id: string
  market: 'cfd-forex-crypto' | 'futures'
  summary: string
  /** Always true: these are teaching shapes, not any firm's current rules. */
  example: true
}

const phase = (p: Partial<PhaseRules> & Pick<PhaseRules, 'name' | 'maxLossPct'>): PhaseRules => ({
  profitTargetPct: null, maxDailyLossPct: null, drawdownMode: 'static', trailStopsAtStart: false, minTradingDays: 0, maxCalendarDays: null, consistencyMaxDayPct: null, ...p,
})

/**
 * EXAMPLE shapes only. The numbers are in the range the industry commonly
 * uses, so the arithmetic is realistic, but they are not any named firm's
 * rules. Copy your firm's exact rules into "My rules" before relying on a result.
 */
export const TEMPLATES: ChallengeTemplate[] = [
  {
    id: 'two-step', example: true, market: 'cfd-forex-crypto', label: 'Two-step evaluation (EXAMPLE)', accountSize: 100_000, dayResetTz: 'Europe/Prague', dayResetHour: 0,
    summary: 'The classic CFD/forex/crypto shape: a larger target in phase 1, a smaller one in phase 2, the same static limits throughout, then a funded account with the limits and no target.',
    phases: [
      phase({ name: 'Phase 1', profitTargetPct: 8, maxDailyLossPct: 5, maxLossPct: 10, minTradingDays: 4 }),
      phase({ name: 'Phase 2', profitTargetPct: 5, maxDailyLossPct: 5, maxLossPct: 10, minTradingDays: 4 }),
      phase({ name: 'Funded', maxDailyLossPct: 5, maxLossPct: 10 }),
    ],
  },
  {
    id: 'one-step', example: true, market: 'cfd-forex-crypto', label: 'One-step evaluation (EXAMPLE)', accountSize: 100_000, dayResetTz: 'Europe/Prague', dayResetHour: 0,
    summary: 'One phase with a bigger target and tighter limits; the maximum loss trails the highest closing balance until it reaches the start.',
    phases: [
      phase({ name: 'Evaluation', profitTargetPct: 10, maxDailyLossPct: 3, maxLossPct: 6, drawdownMode: 'trailing-eod', trailStopsAtStart: true, minTradingDays: 3 }),
      phase({ name: 'Funded', maxDailyLossPct: 3, maxLossPct: 6, drawdownMode: 'trailing-eod', trailStopsAtStart: true }),
    ],
  },
  {
    id: 'futures-eod', example: true, market: 'futures', label: 'Futures, end-of-day trailing (EXAMPLE)', accountSize: 50_000, dayResetTz: 'America/New_York', dayResetHour: 17,
    summary: 'The common futures shape: no daily limit in this example, a maximum loss that trails the end-of-day high until it reaches the start, and a consistency rule on the best day.',
    phases: [
      phase({ name: 'Evaluation', profitTargetPct: 6, maxLossPct: 4, drawdownMode: 'trailing-eod', trailStopsAtStart: true, minTradingDays: 2, consistencyMaxDayPct: 50 }),
      phase({ name: 'Funded', maxLossPct: 4, drawdownMode: 'trailing-eod', trailStopsAtStart: true }),
    ],
  },
  {
    id: 'futures-intraday', example: true, market: 'futures', label: 'Futures, intraday trailing (EXAMPLE)', accountSize: 50_000, dayResetTz: 'America/New_York', dayResetHour: 17,
    summary: 'The strictest common shape: the maximum loss trails the highest balance reached during the day, including open profit, until it reaches the start.',
    phases: [
      phase({ name: 'Evaluation', profitTargetPct: 6, maxLossPct: 5, drawdownMode: 'trailing-intraday', trailStopsAtStart: true, minTradingDays: 1, consistencyMaxDayPct: 30 }),
      phase({ name: 'Funded', maxLossPct: 5, drawdownMode: 'trailing-intraday', trailStopsAtStart: true }),
    ],
  },
]

// ---------------------------------------------------------------- validation

const num = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}
const pctOrNull = (v: unknown, lo: number, hi: number): number | null => (v === null || v === undefined || v === '' ? null : num(v, lo, hi, lo))
const tzOk = (tz: string) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false } }

/** Turns untrusted input into rules with every number clamped to a sane range. Throws a plain-English error when it cannot. */
export function sanitiseRules(input: unknown): ChallengeRules {
  const r = (input ?? {}) as Record<string, unknown>
  const phasesIn = Array.isArray(r.phases) ? r.phases.slice(0, 4) : []
  if (!phasesIn.length) throw new Error('Give at least one phase.')
  const tz = typeof r.dayResetTz === 'string' && tzOk(r.dayResetTz) ? r.dayResetTz : 'America/New_York'
  const phases = phasesIn.map((p0, i) => {
    const p = (p0 ?? {}) as Record<string, unknown>
    const mode: DrawdownMode = p.drawdownMode === 'trailing-eod' || p.drawdownMode === 'trailing-intraday' ? p.drawdownMode : 'static'
    return {
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 40) : `Phase ${i + 1}`,
      profitTargetPct: pctOrNull(p.profitTargetPct, 0.1, 100),
      maxDailyLossPct: pctOrNull(p.maxDailyLossPct, 0.1, 50),
      maxLossPct: num(p.maxLossPct, 0.1, 90, 10),
      drawdownMode: mode,
      trailStopsAtStart: Boolean(p.trailStopsAtStart),
      minTradingDays: Math.floor(num(p.minTradingDays, 0, 60, 0)),
      maxCalendarDays: p.maxCalendarDays === null || p.maxCalendarDays === undefined || p.maxCalendarDays === '' ? null : Math.floor(num(p.maxCalendarDays, 1, 365, 30)),
      consistencyMaxDayPct: pctOrNull(p.consistencyMaxDayPct, 5, 100),
    }
  })
  return {
    label: typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 60) : 'My rules',
    accountSize: num(r.accountSize, 1_000, 2_000_000, 100_000),
    dayResetTz: tz,
    dayResetHour: Math.floor(num(r.dayResetHour, 0, 23, 0)),
    phases,
  }
}

// ---------------------------------------------------------------- the evaluator

export type ChallengeTrade = {
  /** When the trade closed (ms). */
  at: number
  /** Profit or loss in account dollars for THIS challenge's account size. */
  pnl: number
  /** Unrealised peak profit during the trade, in the same dollars, when known (intraday trailing uses it). */
  peakPnl?: number
}

export type PhaseStatus = 'PASSED' | 'FAILED' | 'IN PROGRESS' | 'NOT STARTED' | 'FUNDED, WITHIN RULES'
export type Breach = { rule: 'daily-loss' | 'max-loss' | 'time-limit'; at: number; detail: string }

export type PhaseResult = {
  name: string
  status: PhaseStatus
  startedAt: number | null
  endedAt: number | null
  trades: number
  tradingDays: number
  balance: number
  /** The level the balance must stay above. */
  floor: number
  highWater: number
  profit: number
  /** % of the target reached, 0–100+, when there is a target. */
  targetProgressPct: number | null
  /** Worst single-day loss as % of the daily limit used (0–100+), when there is a daily limit. */
  worstDayUsePct: number | null
  /** Best day as % of total profit, when there is profit. */
  bestDaySharePct: number | null
  /** Why the target, though reached, has not passed yet. */
  waitingOn: string[]
  breach: Breach | null
  /** Plain-English log of the moments that mattered. */
  story: string[]
  curve: Array<{ at: number; balance: number; floor: number }>
}

export type ChallengeResult = {
  rules: ChallengeRules
  phases: PhaseResult[]
  /** Index of the phase the run ended in. */
  reached: number
  summary: string
  approximations: string[]
}

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const pct = (n: number, d = 1) => `${n.toFixed(d)}%`

/** The firm's trading day for a timestamp: the calendar date in its time zone after shifting back by the reset hour. */
export function firmDayKey(ms: number, tz: string, resetHour: number): string {
  // Date formatting with a time zone is slow; every zone offset is a multiple of 15 minutes, so cache per quarter hour.
  const k = `${tz}|${resetHour}|${Math.floor(ms / 900_000)}`
  const hit = dayKeyCache.get(k)
  if (hit) return hit
  if (dayKeyCache.size > 50_000) dayKeyCache.clear()
  const d = new Date(ms - resetHour * 3_600_000).toLocaleDateString('en-CA', { timeZone: tz })
  dayKeyCache.set(k, d)
  return d
}
const dayKeyCache = new Map<string, string>()

function emptyPhase(p: PhaseRules, size: number): PhaseResult {
  const floor = size * (1 - p.maxLossPct / 100)
  return { name: p.name, status: 'NOT STARTED', startedAt: null, endedAt: null, trades: 0, tradingDays: 0, balance: size, floor, highWater: size, profit: 0, targetProgressPct: p.profitTargetPct === null ? null : 0, worstDayUsePct: p.maxDailyLossPct === null ? null : 0, bestDaySharePct: null, waitingOn: [], breach: null, story: [], curve: [] }
}

/**
 * Replays closed trades, oldest first, through every phase. A passed phase
 * starts the next one fresh at the starting balance with the next trade, the
 * way firms issue a new account for each phase.
 *
 * Measured on closed trades. Firms that measure the daily limit or the
 * trailing high on live equity (open profit and loss) are stricter than this:
 * an open trade can breach a rule before it closes. `peakPnl`, when given,
 * lets intraday trailing see the open-profit high.
 */
export function evaluateChallenge(rulesIn: ChallengeRules, tradesIn: ChallengeTrade[]): ChallengeResult {
  const rules = rulesIn
  const size = rules.accountSize
  const trades = tradesIn.filter((t) => Number.isFinite(t.at) && Number.isFinite(t.pnl)).slice().sort((a, b) => a.at - b.at)
  const results = rules.phases.map((p) => emptyPhase(p, size))
  let k = 0
  let i = 0
  while (k < rules.phases.length && i < trades.length) {
    const p = rules.phases[k]
    const r = results[k]
    r.status = p.profitTargetPct === null ? 'FUNDED, WITHIN RULES' : 'IN PROGRESS'
    let balance = size
    let hwm = size
    const maxLoss = size * p.maxLossPct / 100
    const dailyLimit = p.maxDailyLossPct === null ? null : size * p.maxDailyLossPct / 100
    const target = p.profitTargetPct === null ? null : size * (1 + p.profitTargetPct / 100)
    const floorOf = (h: number) => {
      if (p.drawdownMode === 'static') return size - maxLoss
      const f = h - maxLoss
      return p.trailStopsAtStart ? Math.min(f, size) : f
    }
    let floor = floorOf(hwm)
    const dayPnl = new Map<string, number>()
    let day = ''
    let dayStart = balance
    let worstDayLoss = 0
    let ended = false
    r.startedAt = trades[i].at
    r.curve.push({ at: trades[i].at, balance, floor })
    for (; i < trades.length; i++) {
      const t = trades[i]
      const d = firmDayKey(t.at, rules.dayResetTz, rules.dayResetHour)
      if (d !== day) {
        // End of the previous day: the end-of-day trailing floor moves up to the closing high.
        if (day && p.drawdownMode === 'trailing-eod' && balance > hwm) { hwm = balance; floor = floorOf(hwm) }
        day = d
        dayStart = balance
      }
      if (p.maxCalendarDays !== null && r.startedAt !== null && t.at - r.startedAt > p.maxCalendarDays * 86_400_000) {
        r.breach = { rule: 'time-limit', at: t.at, detail: `${p.maxCalendarDays} calendar days ran out before the target was reached.` }
        r.status = 'FAILED'; r.endedAt = t.at; r.story.push(`Time limit: ${p.maxCalendarDays} days passed with the target not reached.`)
        ended = true; i++; break
      }
      if (p.drawdownMode === 'trailing-intraday') {
        const peak = balance + Math.max(0, t.peakPnl ?? 0)
        if (peak > hwm) { hwm = peak; floor = floorOf(hwm) }
      }
      balance += t.pnl
      r.trades++
      dayPnl.set(d, (dayPnl.get(d) ?? 0) + t.pnl)
      if (p.drawdownMode === 'trailing-intraday' && balance > hwm) { hwm = balance; floor = floorOf(hwm) }
      const dayLoss = dayStart - balance
      if (dayLoss > worstDayLoss) worstDayLoss = dayLoss
      r.curve.push({ at: t.at, balance, floor })
      if (dailyLimit !== null && dayLoss >= dailyLimit - 1e-9) {
        r.breach = { rule: 'daily-loss', at: t.at, detail: `Lost ${money(dayLoss)} on ${d} against a daily limit of ${money(dailyLimit)}.` }
        r.status = 'FAILED'; r.endedAt = t.at; r.story.push(`${d}: daily loss limit hit (${money(dayLoss)} of ${money(dailyLimit)}). The account is closed.`)
        ended = true; i++; break
      }
      if (balance <= floor + 1e-9) {
        r.breach = { rule: 'max-loss', at: t.at, detail: `Balance ${money(balance)} fell to the ${p.drawdownMode === 'static' ? 'fixed' : 'trailing'} floor of ${money(floor)}.` }
        r.status = 'FAILED'; r.endedAt = t.at; r.story.push(`${d}: maximum loss hit — balance ${money(balance)}, floor ${money(floor)}. The account is closed.`)
        ended = true; i++; break
      }
      if (dailyLimit !== null && dayLoss >= dailyLimit * 0.7 && !r.story.some((s) => s.startsWith(`${d}: used`))) r.story.push(`${d}: used ${pct(dayLoss / dailyLimit * 100, 0)} of the daily loss limit. A disciplined trader stops for the day around here.`)
      if (target !== null && balance >= target) {
        const days = dayPnl.size
        const profit = balance - size
        const best = Math.max(...dayPnl.values())
        const share = profit > 0 ? best / profit * 100 : 100
        const waiting: string[] = []
        if (days < p.minTradingDays) waiting.push(`${p.minTradingDays - days} more trading day${p.minTradingDays - days === 1 ? '' : 's'} (minimum ${p.minTradingDays})`)
        if (p.consistencyMaxDayPct !== null && share > p.consistencyMaxDayPct) waiting.push(`consistency: the best day is ${pct(share, 0)} of profit, the rule allows ${pct(p.consistencyMaxDayPct, 0)}`)
        r.waitingOn = waiting
        if (!waiting.length) {
          r.status = 'PASSED'; r.endedAt = t.at
          r.story.push(`${d}: target reached at ${money(balance)} after ${days} trading day${days === 1 ? '' : 's'} and ${r.trades} trades. ${k + 1 < rules.phases.length ? `On to ${rules.phases[k + 1].name}.` : ''}`.trim())
          ended = true; i++; break
        }
      } else r.waitingOn = []
    }
    r.balance = balance
    r.floor = floor
    r.highWater = Math.max(hwm, balance)
    r.profit = balance - size
    r.tradingDays = dayPnl.size
    r.targetProgressPct = p.profitTargetPct === null ? null : Math.max(0, (balance - size) / (size * p.profitTargetPct / 100) * 100)
    r.worstDayUsePct = dailyLimit === null ? null : worstDayLoss / dailyLimit * 100
    const profit = balance - size
    r.bestDaySharePct = profit > 0 && dayPnl.size ? Math.max(...dayPnl.values()) / profit * 100 : null
    if (!ended && r.waitingOn.length) r.story.push(`Target reached; still waiting on ${r.waitingOn.join(' and ')}.`)
    if (r.status === 'PASSED') k++
    else break
  }
  const reached = Math.min(k, rules.phases.length - 1)
  const last = results[reached]
  const summary = !trades.length
    ? 'No closed trades to replay yet.'
    : last.status === 'FAILED' ? `Failed ${last.name}: ${last.breach?.detail ?? ''}`
    : last.status === 'PASSED' ? `Passed every phase in ${trades.length} trades.`
    : last.status === 'FUNDED, WITHIN RULES' ? `Reached ${last.name} and is still within its rules (${money(last.profit)} since it started).`
    : `In ${last.name}: ${money(last.profit)} so far, ${pct(last.targetProgressPct ?? 0, 0)} of the target, ${last.tradingDays} trading day${last.tradingDays === 1 ? '' : 's'}.`
  const approximations = ['Measured on closed trades. A firm that checks live equity can close an account during an open losing trade even if it later recovers.']
  if (rules.phases.some((p) => p.drawdownMode === 'trailing-intraday') && !trades.some((t) => t.peakPnl !== undefined)) approximations.push('Intraday trailing needs each trade\'s open-profit peak; without it the trailing high is taken from closed balances, which is kinder than the real rule.')
  return { rules, phases: results, reached, summary, approximations }
}

// ---------------------------------------------------------------- risk arithmetic

export type RiskRoom = {
  riskPct: number
  riskUsd: number
  /** Full 1R losses in a row before the daily limit, per phase. null when there is no daily limit. */
  lossesToDailyLimit: number | null
  lossesToMaxLoss: number
  /** Full 1R winners needed to reach the target (ignoring losses), per phase. */
  winnersToTarget: number | null
  verdict: string
}

/** How much room the limits leave at a given risk per trade, for each phase. Arithmetic, not a forecast. */
export function riskRoom(rules: ChallengeRules, riskPct: number): Array<RiskRoom & { phase: string }> {
  const r = Math.min(10, Math.max(0.05, riskPct))
  const riskUsd = rules.accountSize * r / 100
  return rules.phases.map((p) => {
    const toDaily = p.maxDailyLossPct === null ? null : Math.floor(p.maxDailyLossPct / r + 1e-9)
    const toMax = Math.floor(p.maxLossPct / r + 1e-9)
    const toTarget = p.profitTargetPct === null ? null : Math.ceil(p.profitTargetPct / r - 1e-9)
    const tight = Math.min(toDaily ?? Infinity, toMax)
    const verdict = tight <= 2 ? `Too big: ${tight} straight loss${tight === 1 ? '' : 'es'} end${tight === 1 ? 's' : ''} the account. Losing streaks of 4–6 are ordinary for any method.`
      : tight <= 4 ? `Tight: ${tight} straight losses end the account or the day. Most traders who pass risk less than this.`
      : `Room for ${tight} straight losses before a limit. ${toTarget !== null ? `The target is ${toTarget} full winners away.` : ''}`.trim()
    return { phase: p.name, riskPct: r, riskUsd, lossesToDailyLimit: toDaily, lossesToMaxLoss: toMax, winnersToTarget: toTarget, verdict }
  })
}

// ---------------------------------------------------------------- Monte Carlo under the learner's assumptions

/** Small deterministic PRNG so a simulation can be repeated exactly. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export type MonteCarlo = {
  assumptions: { winRatePct: number; rewardR: number; riskPct: number; tradesPerDay: number; maxTrades: number; runs: number; seed: number }
  /** Fraction of runs that passed the FIRST phase. */
  passFirstPhase: number
  failDaily: number
  failMaxLoss: number
  unfinished: number
  medianTradesToPass: number | null
  provenance: 'SIMULATED'
  note: string
}

/**
 * Plays the first phase many times with trades drawn from the win rate and
 * reward the learner typed (each loss is −1R, each win +rewardR, at riskPct of
 * the account). It answers "if my numbers were true, how often would these
 * rules let me through?" — a statement about the rules and the assumptions,
 * never about Kestrel or the market.
 */
export function simulatePass(rules: ChallengeRules, a: { winRatePct: number; rewardR: number; riskPct: number; tradesPerDay?: number; maxTrades?: number; runs?: number; seed?: number }): MonteCarlo {
  const assumptions = {
    winRatePct: num(a.winRatePct, 1, 99, 45), rewardR: num(a.rewardR, 0.1, 10, 1.5), riskPct: num(a.riskPct, 0.05, 10, 0.5),
    tradesPerDay: Math.floor(num(a.tradesPerDay, 1, 20, 2)), maxTrades: Math.floor(num(a.maxTrades, 10, 1000, 200)), runs: Math.floor(num(a.runs, 100, 5000, 1000)), seed: Math.floor(num(a.seed, 1, 2 ** 31, 7)),
  }
  const one: ChallengeRules = { ...rules, phases: [rules.phases[0]] }
  const rand = mulberry32(assumptions.seed)
  const riskUsd = rules.accountSize * assumptions.riskPct / 100
  let pass = 0, daily = 0, maxl = 0, open = 0
  const toPass: number[] = []
  const day0 = Date.UTC(2026, 0, 5, 14)
  for (let run = 0; run < assumptions.runs; run++) {
    const trades: ChallengeTrade[] = []
    for (let n = 0; n < assumptions.maxTrades; n++) {
      const win = rand() * 100 < assumptions.winRatePct
      trades.push({ at: day0 + Math.floor(n / assumptions.tradesPerDay) * 86_400_000 + (n % assumptions.tradesPerDay) * 60_000, pnl: win ? riskUsd * assumptions.rewardR : -riskUsd })
    }
    const res = evaluateChallenge(one, trades).phases[0]
    if (res.status === 'PASSED') { pass++; toPass.push(res.trades) }
    else if (res.breach?.rule === 'daily-loss') daily++
    else if (res.breach?.rule === 'max-loss') maxl++
    else open++
  }
  toPass.sort((x, y) => x - y)
  const n = assumptions.runs
  return {
    assumptions, passFirstPhase: pass / n, failDaily: daily / n, failMaxLoss: maxl / n, unfinished: open / n,
    medianTradesToPass: toPass.length ? toPass[Math.floor(toPass.length / 2)] : null,
    provenance: 'SIMULATED',
    note: `SIMULATED under YOUR assumptions (${assumptions.winRatePct}% wins, ${assumptions.rewardR}R winners, ${assumptions.riskPct}% risk). Real win rates drift, streaks cluster, and fees and slippage cost more than zero. This describes the rules, not what will happen.`,
  }
}

// ---------------------------------------------------------------- today's room

export type TodayRoom = { day: string; dayPnl: number; dailyRoom: number | null; maxLossRoom: number; tradesAtRisk: number | null; message: string }

/** Where the current phase stands today: how much can still be lost before each limit. */
export function todayRoom(result: ChallengeResult, riskPct: number, now = Date.now()): TodayRoom | null {
  const k = result.reached
  const r = result.phases[k]
  const p = result.rules.phases[k]
  if (r.status === 'NOT STARTED' || r.status === 'FAILED' || r.status === 'PASSED') return null
  const day = firmDayKey(now, result.rules.dayResetTz, result.rules.dayResetHour)
  const pts = r.curve.filter((c) => firmDayKey(c.at, result.rules.dayResetTz, result.rules.dayResetHour) === day)
  const before = r.curve.filter((c) => firmDayKey(c.at, result.rules.dayResetTz, result.rules.dayResetHour) < day)
  const dayStart = before.length ? before[before.length - 1].balance : result.rules.accountSize
  const dayPnl = (pts.length ? pts[pts.length - 1].balance : dayStart) - dayStart
  const dailyLimit = p.maxDailyLossPct === null ? null : result.rules.accountSize * p.maxDailyLossPct / 100
  const dailyRoom = dailyLimit === null ? null : Math.max(0, dailyLimit + Math.min(0, dayPnl))
  const maxLossRoom = Math.max(0, r.balance - r.floor)
  const room = Math.min(dailyRoom ?? Infinity, maxLossRoom)
  const riskUsd = result.rules.accountSize * Math.max(0.05, riskPct) / 100
  const tradesAtRisk = Number.isFinite(room) ? Math.floor(room / riskUsd + 1e-9) : null
  const message = tradesAtRisk === null ? 'No limit applies today.'
    : tradesAtRisk <= 1 ? `Stop for today: one more full loss at ${riskPct}% risk would breach a limit.`
    : `${money(room)} of room left today: ${tradesAtRisk} full losses at ${riskPct}% risk before a limit.`
  return { day, dayPnl, dailyRoom, maxLossRoom, tradesAtRisk, message }
}

// ---------------------------------------------------------------- the journey

export type JourneyStep = { id: string; stage: string; title: string; why: string; youDo: string[]; kestrelHelps: string; watchOut: string[] }

export const JOURNEY: JourneyStep[] = [
  {
    id: 'understand', stage: 'Before you pay', title: 'Understand what you are buying',
    why: 'A prop firm sells you an evaluation on a simulated account. Most of a firm\'s revenue typically comes from evaluation fees, and most evaluations end in a rule breach. Funded accounts are often simulated too: the firm pays you a share of the simulated profit.',
    youDo: ['Treat the fee as money you may lose, the way you would a course fee.', 'Read the firm\'s terms for who owns the account, how payouts are calculated, and when they can refuse one.'],
    kestrelHelps: 'The Concepts view under Prop firms explains each rule with a quiz; this page shows every rule working on real trade sequences.',
    watchOut: ['Marketing that shows payouts but not how many evaluations fail.', 'Firms with no history, no published rules, or rules that live only in a Discord.'],
  },
  {
    id: 'market', stage: 'Before you pay', title: 'Pick the market and platform you will actually trade',
    why: 'Firms split into futures firms (CME contracts through platforms like Tradovate, Rithmic or NinjaTrader) and CFD/forex/crypto firms (MetaTrader 5, cTrader, DXtrade, Match-Trader and similar). Kestrel studies Bitcoin, which shows up as a CFD or crypto pair on the second kind and as Micro Bitcoin futures on CME.',
    youDo: ['Choose one market you already study, not the one with the cheapest challenge.', 'Open the firm\'s free trial or demo if it has one and check the spread and commission on your instrument.'],
    kestrelHelps: 'Kestrel\'s paper record and research are on BTCUSDT. Costs on a CFD or futures account differ; enter them honestly in your own journal.',
    watchOut: ['A CFD price feed can differ from the exchange price Kestrel reads.', 'Weekend gaps: crypto trades on weekends, many CFD accounts must be flat.'],
  },
  {
    id: 'diligence', stage: 'Before you pay', title: 'Check the firm',
    why: 'Prop firms are mostly not regulated as brokers. The protection you have is the written rulebook and the firm\'s track record of paying.',
    youDo: ['Find the full rules in writing: targets, daily loss and how it is measured (balance or equity, and at what reset time), maximum loss type, minimum days, time limit, consistency rule, news restrictions, weekend holding, maximum lot size.', 'Find the automation policy in writing: are expert advisors, bots, copy trading and third-party signals allowed?', 'Check how long they have operated, the payout split and schedule, KYC country restrictions, reset and refund terms.'],
    kestrelHelps: 'Copy the rules into "My rules" here; the simulator then holds you to exactly those numbers.',
    watchOut: ['"Prohibited strategies" clauses broad enough to refuse any payout.', 'Rules that changed recently without notice.', 'A daily limit measured on equity at a reset time in another time zone.'],
  },
  {
    id: 'rehearse', stage: 'Before you pay', title: 'Rehearse the rules before risking a fee',
    why: 'You can find out for free whether your trading survives the rules. Most failed challenges fail on day-one sizing.',
    youDo: ['Pick a risk per trade that leaves room for at least five straight losses before the daily limit.', 'Run the rules over your own journal and over Kestrel\'s paper record here.', 'Decide your personal daily stop, smaller than the firm\'s, and write it down.'],
    kestrelHelps: 'Risk room, the challenge replay and the Monte Carlo (under your own numbers) are on this page.',
    watchOut: ['Sizing up to "pass faster": the target does not have a deadline in most evaluations, the limits do.'],
  },
  {
    id: 'phase1', stage: 'The challenge', title: 'Phase 1: trade your plan, inside the limits',
    why: 'The target is reached by not breaking rules for long enough while your method works.',
    youDo: ['Each morning: check the economic calendar and the firm\'s news rule, note today\'s room, and set your daily stop.', 'Log every trade in Kestrel\'s journal with the challenge tag, so the tracker here is current.', 'Stop for the day when you hit your personal stop.'],
    kestrelHelps: 'Today\'s room shows how many full losses are left before a limit. The Desk and Market read explain what Kestrel sees; you decide and place the trade yourself.',
    watchOut: ['Revenge trading after the first loss of the day.', 'Holding through high-impact news when the firm forbids it.'],
  },
  {
    id: 'phase2', stage: 'The challenge', title: 'Phase 2 (verification): same discipline, smaller target',
    why: 'Phase 2 usually has the same limits and a smaller target. Traders fail it by relaxing.',
    youDo: ['Keep the same risk per trade as phase 1.', 'Reset the tracker to Phase 2 by starting a new journal tag.'],
    kestrelHelps: 'The replay starts each phase fresh at the starting balance, the way firms issue a new account.',
    watchOut: ['Trading more because the target looks easy.'],
  },
  {
    id: 'kyc', stage: 'Getting funded', title: 'Identity check and the trader agreement',
    why: 'Before funding, firms verify your identity and ask you to sign an agreement. That agreement, not the website, governs payouts.',
    youDo: ['Read the payout, termination and prohibited-practice clauses before signing.', 'Keep copies of every rule page and email.'],
    kestrelHelps: 'Nothing to automate here. Kestrel stores none of your identity documents.',
    watchOut: ['Clauses that let the firm review all past trades and refuse a payout for any "abuse".'],
  },
  {
    id: 'funded', stage: 'Getting funded', title: 'The funded account: the rules continue',
    why: 'Funded accounts keep the loss limits and often add payout conditions such as minimum profitable days or a consistency rule.',
    youDo: ['Keep the same risk per trade. A funded breach closes the account and the fee is gone.', 'Read the payout conditions and track them.'],
    kestrelHelps: 'The Funded phase in the replay tracks the limits with no target.',
    watchOut: ['Risking more because "it is the firm\'s money": the account closes all the same.'],
  },
  {
    id: 'payout', stage: 'Getting funded', title: 'Payouts, scaling, and tax',
    why: 'A payout is income. Many firms treat traders as independent contractors and do not withhold tax.',
    youDo: ['Request payouts on the firm\'s schedule and keep records.', 'Ask a tax professional how prop payouts are taxed where you live.'],
    kestrelHelps: 'Your journal keeps the trade record you will want at tax time.',
    watchOut: ['Scaling plans that raise the account size but also the profit target.'],
  },
  {
    id: 'fail', stage: 'If it goes wrong', title: 'When a challenge fails',
    why: 'Failure is the common outcome and the useful thing is the record of why.',
    youDo: ['Read the breach in the replay: which rule, which day, after which trade.', 'Review that day in the journal before buying a reset.'],
    kestrelHelps: 'The replay names the exact trade and rule; the Journal coach looks for the habit behind it.',
    watchOut: ['Buying resets the same day as the failure.'],
  },
]

/** Why Kestrel teaches and tracks prop challenges but does not trade them. Shown on the page as is. */
export const BOT_POLICY: string[] = [
  'Kestrel is a paper-trading research bot. It has no connection to any broker, prop firm or trading platform and gains none here. It will not place trades on a challenge or funded account.',
  'Many firms restrict or ban expert advisors, bots, copy trading and third-party signals, and can void a challenge or refuse a payout over it. Check your firm\'s automation policy in writing.',
  'Kestrel has no real paper track record yet (NOT ENOUGH REAL PAPER DATA), so nothing supports risking a fee on its signals.',
  'What it does instead: explains every rule, replays trade sequences through your firm\'s exact rules, shows today\'s room before each trade, and teaches the process step by step. You make every trading decision and place every order yourself.',
]
