/**
 * Extended paper validation (the validation stage).
 *
 * This module MEASURES a paper-trading run against real market data. It never
 * tunes anything: paper results are validation data, not a fitting target, and
 * nothing here changes a strategy rule or a parameter. It reads what actually
 * happened — the closed paper positions, the vault passports, the equity curve,
 * the feed and soak health — and answers one question honestly: is the sample
 * yet big and clean enough to trust, and if so, is the edge surviving contact
 * with real spread, real slippage, real missed fills and real regimes?
 *
 * The exit criterion is a set of explicit GATES, not a date and not a P&L
 * target. Until every gate is met the verdict is INSUFFICIENT SAMPLE, and the
 * report says exactly which gate is short and by how much. Missing data is
 * reported as missing (null / UNAVAILABLE), never fabricated.
 *
 * Everything here is pure over its inputs, so the self-test and the unit tests
 * can pin it, and the server just assembles the inputs from the store.
 */

import { config, LIVE_TRADING_ENABLED } from '../../config.ts'
import { paperOutcome } from '../paperTrader.ts'
import { tradingDayKey } from '../sessions.ts'
import type { PaperPosition } from '../paperTrader.ts'
import type { Passport } from '../vault/passport.ts'
import { paperByStrategy, comparePaperToOos, strategyOf } from './metrics.ts'
import type { PaperStrategyMetrics, PaperVsOos } from './metrics.ts'
import { detectDecay, rollingExpectancy } from '../vault/decay.ts'

const WEEK = 7 * 86_400_000
const HOUR = 3_600_000

// ---------------------------------------------------------------
// The frozen profile
// ---------------------------------------------------------------

export type ValidationProfile = {
  profile: string
  version: string
  liveTradingEnabled: boolean
  market: { symbol: string; interval: string }
  strategyEngine: 'ict' | 'crossover'
  fusionDrivesTrading: boolean
  risk: { maxOpenPositions: number; maxDrawdownPercent: number; maxCandleAgeSec: number; maxSpreadPct: number; riskPerTradePercent: number; maxTradesPerDay: number; dailyLossLimitR: number }
  execution: { spreadBps: number; slippageBps: number; targetTouchBps: number; latencyCandles: number; maxEntryDriftAtr: number; takerFeePercent: number; makerFeePercent: number }
  data: { provider: string; stream: boolean; staleAfterMs: number; maxCandleAgeSec: number }
  sessions: { killzones: string[]; timezone: string; skipWeekends: boolean }
  gates: typeof config.paperValidation.gates
  shadowReadiness: typeof config.paperValidation.shadowReadiness
}

/** A snapshot of the frozen profile the run is measured under. Reads config; changes nothing. */
export function validationProfile(version = '0.0.0'): ValidationProfile {
  return {
    profile: config.paperValidation.profile,
    version,
    liveTradingEnabled: LIVE_TRADING_ENABLED as boolean,
    market: { symbol: config.symbol, interval: config.interval },
    strategyEngine: config.strategy,
    fusionDrivesTrading: config.fusion.driveTrading,
    risk: {
      maxOpenPositions: config.risk.maxOpenPositions,
      maxDrawdownPercent: config.risk.maxDrawdownPercent,
      maxCandleAgeSec: config.risk.maxCandleAgeSec,
      maxSpreadPct: config.risk.maxSpreadPct,
      riskPerTradePercent: config.riskPerTradePercent,
      maxTradesPerDay: config.ict.maxTradesPerDay,
      dailyLossLimitR: config.ict.dailyLossLimitR,
    },
    execution: { ...config.execution },
    data: {
      provider: process.env.MRCASH_MARKET_URL ? 'custom (MRCASH_MARKET_URL)' : 'Binance public (data-api.binance.vision)',
      stream: config.data.stream,
      staleAfterMs: config.data.staleAfterMs,
      maxCandleAgeSec: config.risk.maxCandleAgeSec,
    },
    sessions: { killzones: [...config.ict.killzones], timezone: config.ict.timezone, skipWeekends: config.ict.skipWeekends },
    gates: config.paperValidation.gates,
    shadowReadiness: config.paperValidation.shadowReadiness,
  }
}

// ---------------------------------------------------------------
// Order-flow honesty label
// ---------------------------------------------------------------

export type OrderFlowLabel = 'REAL' | 'ESTIMATED' | 'UNAVAILABLE'

/**
 * What the recorded order-flow observation for a position actually is. REAL when
 * the live book ticker gave a bid AND an ask at decision time; UNAVAILABLE when
 * it did not. Paper never estimates the book from candles, so ESTIMATED is
 * reserved and never claimed here — the label stays honest.
 */
export function orderFlowLabel(p: PaperPosition): OrderFlowLabel {
  if (typeof p.observedBid === 'number' && typeof p.observedAsk === 'number' && p.observedBid > 0 && p.observedAsk > 0) return 'REAL'
  return 'UNAVAILABLE'
}

// ---------------------------------------------------------------
// The per-trade paper journal
// ---------------------------------------------------------------

export type PaperTradeJournalRow = {
  id: string
  queuedAt: number
  filledAt: number | null
  closedAt: number | null
  dayKey: string
  session: string
  regime: string
  strategyId: string
  setupKey: string
  direction: 'long' | 'short'
  intendedEntry: number
  fill: number | null
  stop: number
  target: number
  quantity: number
  riskUsd: number
  quality: number
  observedBid: number | null
  observedAsk: number | null
  observedSpreadPct: number | null
  orderFlow: OrderFlowLabel
  assumedSlippageBps: number | null
  latencyMs: number | null
  candlesHeld: number | null
  exitReason: string | null
  exit: number | null
  rMultiple: number | null
  pnlUsd: number | null
  costsUsd: number | null
  reason: string
}

/** The per-trade paper journal — every TAKEN trade, with what the bot saw and what happened. */
export function perTradeJournal(closed: PaperPosition[]): PaperTradeJournalRow[] {
  return closed
    .filter((p) => p.exitReason !== 'missed')
    .slice()
    .sort((a, b) => (b.closedAt ?? b.openedAt) - (a.closedAt ?? a.openedAt))
    .map((p) => ({
      id: p.id,
      queuedAt: p.openedAt,
      filledAt: p.filledAt ?? null,
      closedAt: p.closedAt ?? null,
      dayKey: p.dayKey,
      session: p.session || '—',
      regime: p.regime ?? 'unavailable',
      strategyId: strategyOf(p),
      setupKey: p.setupKey,
      direction: p.direction,
      intendedEntry: p.intendedEntry,
      fill: p.status === 'closed' && p.exitReason !== 'missed' ? p.entry : p.filledAt ? p.entry : null,
      stop: p.stop,
      target: p.target,
      quantity: p.quantity,
      riskUsd: p.riskUsd,
      quality: p.quality,
      observedBid: p.observedBid ?? null,
      observedAsk: p.observedAsk ?? null,
      observedSpreadPct: p.observedSpreadPct ?? null,
      orderFlow: orderFlowLabel(p),
      assumedSlippageBps: p.assumedSlippageBps ?? null,
      latencyMs: p.latencyMs ?? null,
      candlesHeld: p.candlesHeld ?? null,
      exitReason: p.exitReason ?? null,
      exit: p.exit ?? null,
      rMultiple: p.rMultiple ?? null,
      pnlUsd: p.pnlUsd ?? null,
      costsUsd: (p.feesUsd ?? 0) + (p.entryCostUsd ?? 0),
      reason: p.reason,
    }))
}

// ---------------------------------------------------------------
// The NO-TRADE journal — refused / missed setups, with the reason
// ---------------------------------------------------------------

export type NoTradeCategory = 'risk-veto' | 'stale-data' | 'kill-switch' | 'price-ran-away' | 'cancelled' | 'other'

export type NoTradeRow = {
  at: number
  dayKey: string
  regime: string
  strategyId: string
  setupKey: string
  direction: 'long' | 'short'
  intendedEntry: number
  stop: number
  target: number
  quality: number
  category: NoTradeCategory
  reason: string
  observedSpreadPct: number | null
}

function noTradeCategory(note: string | undefined): NoTradeCategory {
  const n = (note ?? '').toLowerCase()
  if (n.includes('kill')) return 'kill-switch'
  if (n.includes('stale') || n.includes('fresh data')) return 'stale-data'
  if (n.includes('cancelled')) return 'cancelled'
  if (n.includes('drift') || n.includes('ran')) return 'price-ran-away'
  if (n.includes('veto') || n.includes('risk') || n.includes('spread') || n.includes('exposure') || n.includes('drawdown') || n.includes('limit')) return 'risk-veto'
  return 'other'
}

/** The no-trade journal — every real setup that was refused before it could run, with why and its risk category. */
export function noTradeJournal(closed: PaperPosition[]): NoTradeRow[] {
  return closed
    .filter((p) => p.exitReason === 'missed')
    .slice()
    .sort((a, b) => (b.closedAt ?? b.openedAt) - (a.closedAt ?? a.openedAt))
    .map((p) => ({
      at: p.closedAt ?? p.openedAt,
      dayKey: p.dayKey,
      regime: p.regime ?? 'unavailable',
      strategyId: strategyOf(p),
      setupKey: p.setupKey,
      direction: p.direction,
      intendedEntry: p.intendedEntry,
      stop: p.stop,
      target: p.target,
      quality: p.quality,
      category: noTradeCategory(p.note),
      reason: p.note ?? 'refused',
      observedSpreadPct: p.observedSpreadPct ?? null,
    }))
}

// ---------------------------------------------------------------
// Performance breakdowns (by session, by regime, by outcome) — NOT ranked by raw return
// ---------------------------------------------------------------

export type Breakdown = {
  key: string
  taken: number
  wins: number
  losses: number
  flat: number
  winRate: number | null
  avgR: number | null
  totalR: number
  avgObservedSpreadPct: number | null
}

/** The engine's verdict, via the one shared reader — never a local threshold. */
function outcomeOf(p: PaperPosition): 'win' | 'loss' | 'flat' {
  const o = paperOutcome(p)
  return o === 'WIN' ? 'win' : o === 'LOSS' ? 'loss' : 'flat'
}

/** Group taken trades by a key and summarise each bucket honestly (win rate + expectancy, not a P&L leaderboard). */
export function performanceBy(closed: PaperPosition[], keyFn: (p: PaperPosition) => string): Breakdown[] {
  const taken = closed.filter((p) => p.exitReason !== 'missed')
  const byKey = new Map<string, PaperPosition[]>()
  for (const p of taken) { const k = keyFn(p) || '—'; byKey.set(k, [...(byKey.get(k) ?? []), p]) }
  const out: Breakdown[] = []
  for (const [key, list] of byKey) {
    const wins = list.filter((p) => outcomeOf(p) === 'win').length
    const losses = list.filter((p) => outcomeOf(p) === 'loss').length
    const flat = list.filter((p) => outcomeOf(p) === 'flat').length
    const decided = wins + losses
    const totalR = list.reduce((s, p) => s + (p.rMultiple ?? 0), 0)
    const spreads = list.map((p) => p.observedSpreadPct).filter((x): x is number => typeof x === 'number')
    out.push({
      key, taken: list.length, wins, losses, flat,
      winRate: decided > 0 ? wins / decided : null,
      avgR: list.length ? totalR / list.length : null,
      totalR,
      avgObservedSpreadPct: spreads.length ? spreads.reduce((s, x) => s + x, 0) / spreads.length : null,
    })
  }
  // Sorted by sample size, then key — deliberately NOT by return, so a lucky bucket never floats to the top.
  return out.sort((a, b) => b.taken - a.taken || a.key.localeCompare(b.key))
}

export const bySession = (closed: PaperPosition[]): Breakdown[] => performanceBy(closed, (p) => p.session || 'outside-session')
export const byRegime = (closed: PaperPosition[]): Breakdown[] => performanceBy(closed, (p) => p.regime ?? 'unavailable')
export const byOutcome = (closed: PaperPosition[]): Breakdown[] => performanceBy(closed, (p) => outcomeOf(p))

// ---------------------------------------------------------------
// Strategy correlation / redundancy
// ---------------------------------------------------------------

export type CorrelationPair = { a: string; b: string; correlation: number | null; sharedDays: number; note: string }
export type CorrelationResult = { pairs: CorrelationPair[]; redundant: string[][]; note: string }

/** Daily total-R series per strategy, keyed by trading day. Only taken trades. */
function dailyRByStrategy(closed: PaperPosition[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const p of closed) {
    if (p.exitReason === 'missed') continue
    const id = strategyOf(p)
    const day = m.get(id) ?? new Map<string, number>()
    day.set(p.dayKey, (day.get(p.dayKey) ?? 0) + (p.rMultiple ?? 0))
    m.set(id, day)
  }
  return m
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((s, x) => s + x, 0) / n
  const my = ys.reduce((s, y) => s + y, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

/**
 * Which strategies move together — the redundancy check. Correlates the per-day
 * R series over the days two strategies BOTH traded. A pair needs at least a few
 * shared days to be scored at all; anything thinner is reported as insufficient
 * overlap, never guessed. Pairs at or above 0.7 are clustered as redundant.
 */
export function strategyCorrelations(closed: PaperPosition[], minSharedDays = 3, redundantAt = 0.7): CorrelationResult {
  const daily = dailyRByStrategy(closed)
  const ids = [...daily.keys()].sort()
  const pairs: CorrelationPair[] = []
  const adj = new Map<string, Set<string>>()
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j]
      const da = daily.get(a)!, db = daily.get(b)!
      const shared = [...da.keys()].filter((k) => db.has(k)).sort()
      const xs = shared.map((k) => da.get(k)!)
      const ys = shared.map((k) => db.get(k)!)
      const corr = shared.length >= minSharedDays ? pearson(xs, ys) : null
      const note = shared.length < minSharedDays
        ? `Only ${shared.length} shared day(s) — need ${minSharedDays} before a correlation means anything.`
        : corr === null ? 'No variance on the shared days to correlate.'
        : corr >= redundantAt ? `Move together (${corr.toFixed(2)}) — likely redundant; two versions of the same bet.`
        : corr <= -redundantAt ? `Move oppositely (${corr.toFixed(2)}) — a natural hedge.`
        : `Largely independent (${corr.toFixed(2)}).`
      pairs.push({ a, b, correlation: corr, sharedDays: shared.length, note })
      if (corr !== null && corr >= redundantAt) {
        if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set())
        adj.get(a)!.add(b); adj.get(b)!.add(a)
      }
    }
  }
  // Connected components over the "redundant" edges → clusters.
  const seen = new Set<string>()
  const redundant: string[][] = []
  for (const id of ids) {
    if (seen.has(id) || !adj.has(id)) continue
    const stack = [id]; const group: string[] = []
    while (stack.length) { const cur = stack.pop()!; if (seen.has(cur)) continue; seen.add(cur); group.push(cur); for (const nb of adj.get(cur) ?? []) if (!seen.has(nb)) stack.push(nb) }
    if (group.length > 1) redundant.push(group.sort())
  }
  const note = ids.length < 2
    ? 'Only one strategy is trading on paper, so there is nothing to correlate yet.'
    : pairs.every((p) => p.correlation === null) ? 'Not enough overlapping days yet to correlate any pair.'
    : redundant.length ? `${redundant.length} redundant cluster(s) found — strategies inside a cluster are largely the same bet.`
    : 'No redundant clusters — the strategies that trade are largely independent so far.'
  return { pairs, redundant, note }
}

// ---------------------------------------------------------------
// Decay monitoring per strategy
// ---------------------------------------------------------------

export type DecayHealth = 'HEALTHY' | 'WATCH' | 'DECAYING' | 'RETIRED' | 'INSUFFICIENT SAMPLE'
export type DecayRollup = {
  strategyId: string
  status: DecayHealth
  trades: number
  rollingExpectancy: number | null
  oosFloorR: number | null
  reason: string
  hasPassport: boolean
}

/** Recent taken R-multiples for a strategy, chronological. */
function recentRFor(closed: PaperPosition[], strategyId: string): number[] {
  return closed
    .filter((p) => p.exitReason !== 'missed' && strategyOf(p) === strategyId)
    .slice()
    .sort((a, b) => (a.closedAt ?? a.openedAt) - (b.closedAt ?? b.openedAt))
    .map((p) => p.rMultiple ?? 0)
}

/**
 * A decay reading per strategy. When a passport exists, its OOS lower bound is
 * the floor and its own decay status is authoritative. When there is no passport
 * (the frozen session model), we monitor the rolling expectancy against a "not
 * losing" floor of 0 — flagged only once the sample clears decayMinTrades, so a
 * cold streak on ten trades is never called decay.
 */
export function decayByStrategy(closed: PaperPosition[], passports: Passport[]): DecayRollup[] {
  const byId = paperByStrategy(closed)
  const out: DecayRollup[] = []
  for (const m of byId) {
    if (m.taken === 0) continue
    const recentR = recentRFor(closed, m.strategyId)
    const passport = passports.find((p) => p.strategyId === m.strategyId)
    const window = config.vault.decayWindow
    const rolling = rollingExpectancy(recentR, window)
    if (passport) {
      const status: DecayHealth =
        passport.status === 'retired' ? 'RETIRED'
        : passport.decay.decaying ? 'DECAYING'
        : passport.status === 'watch' ? 'WATCH'
        : recentR.length < config.vault.decayMinTrades ? 'INSUFFICIENT SAMPLE'
        : (rolling !== null && rolling < passport.oosLowerAvgR) ? 'WATCH'
        : 'HEALTHY'
      out.push({ strategyId: m.strategyId, status, trades: recentR.length, rollingExpectancy: rolling, oosFloorR: passport.oosLowerAvgR, reason: passport.decay.reason, hasPassport: true })
      continue
    }
    // No passport: monitor against "not losing", but never flag under the minimum sample.
    const d = detectDecay(recentR, 0, { expectedAvgR: 0 })
    const status: DecayHealth =
      recentR.length < config.vault.decayMinTrades ? 'INSUFFICIENT SAMPLE'
      : d.decaying ? 'DECAYING'
      : (rolling !== null && rolling < 0) ? 'WATCH'
      : 'HEALTHY'
    const reason = recentR.length < config.vault.decayMinTrades
      ? `Only ${recentR.length} paper trade(s); need ${config.vault.decayMinTrades} before judging decay. No passport/out-of-sample floor — monitored on rolling expectancy only.`
      : d.reason + ' No passport; floor is simply "not losing".'
    out.push({ strategyId: m.strategyId, status, trades: recentR.length, rollingExpectancy: rolling, oosFloorR: null, reason, hasPassport: false })
  }
  return out
}

// ---------------------------------------------------------------
// AI-vs-engine consistency
// ---------------------------------------------------------------

export type AiConsistency = { consistent: boolean; engineDecision: string; aiDecision: string; narrationValid: boolean; flags: string[] }

/**
 * Does what the AI tells the human match what the engine actually decided? The
 * CIO call is, by construction, the fused decision after risk; the narrator is
 * validated against the same context. This flags any divergence anyway — a
 * belt-and-braces check so a drift between the words and the engine can never go
 * unnoticed.
 */
export function aiEngineConsistency(engineDecision: string, aiDecision: string, narrationValid: boolean): AiConsistency {
  const flags: string[] = []
  if (aiDecision !== engineDecision) flags.push(`AI says "${aiDecision}" but the engine decided "${engineDecision}".`)
  if (!narrationValid) flags.push('The narration failed validation (a missing section or a number not in the engine context) and fell back to the deterministic explanation.')
  return { consistent: flags.length === 0, engineDecision, aiDecision, narrationValid, flags }
}

// ---------------------------------------------------------------
// System soak
// ---------------------------------------------------------------

export type SoakMetrics = {
  uptimeHours: number
  feedOk: boolean
  storeOk: boolean
  /** Process starts on record. 1 means never restarted. Null when the boot log is unreadable. */
  starts: number | null
  /** Starts that had to re-adopt a live position. Null when not tracked. */
  recoveries: number | null
  met: boolean
  note: string
}

/**
 * How the 24/7 process is holding up: continuous uptime, feed and store health,
 * and how many times the soak clock has been reset.
 *
 * `recoveries` used to default to 0 when no caller supplied it — and no caller
 * ever did, so it serialised out of the API as a permanent zero that looked
 * measured. It is now `null` when unknown, because "we did not track this" and
 * "it never happened" are different facts and only one of them was true.
 *
 * The restart count matters more than it looks. This gate wants 168 CONTINUOUS
 * hours and measures uptime from process start, so a single restart on day six
 * sends it back to zero. An operator staring at "12h of the 168h soak" after a
 * month of running needs to be told why.
 */
export function soakMetrics(input: { uptimeSec: number; feedOk: boolean; storeOk: boolean; starts?: number; recoveries?: number }): SoakMetrics {
  const uptimeHours = input.uptimeSec / 3600
  const need = config.paperValidation.gates.minSoakHours
  const met = uptimeHours >= need && input.feedOk && input.storeOk
  const starts = input.starts ?? null
  const restarts = starts === null ? null : Math.max(0, starts - 1)
  const resets = restarts === null
    ? ' Restarts are not being counted on this run.'
    : restarts === 0
      ? ' Never restarted.'
      : ` The clock has been reset ${restarts} time${restarts === 1 ? '' : 's'} by a restart.`
  const note = met
    ? `Soaking cleanly: ${uptimeHours.toFixed(1)}h continuous, feed and store healthy.${resets}`
    : `Up ${uptimeHours.toFixed(1)}h of the ${need}h soak${!input.feedOk ? ', feed unhealthy' : ''}${!input.storeOk ? ', store unhealthy' : ''}. Uptime resets on restart.${resets}`
  return { uptimeHours, feedOk: input.feedOk, storeOk: input.storeOk, starts, recoveries: input.recoveries ?? null, met, note }
}

// ---------------------------------------------------------------
// Data quality
// ---------------------------------------------------------------

export type DataQuality = { signalsSeen: number; staleOrKillMissed: number; quality: number | null; note: string }

/**
 * The share of actionable signals that were seen on a fresh, trusted feed. A
 * signal refused for stale data or a kill switch is a data/availability failure;
 * everything else counted. Null (and so a failed gate) until at least one signal
 * has been seen — never a fabricated 100%.
 */
export function dataQuality(closed: PaperPosition[]): DataQuality {
  const decided = closed.filter((p) => p.exitReason !== undefined)
  const signalsSeen = decided.length
  const staleOrKillMissed = decided.filter((p) => {
    if (p.exitReason !== 'missed') return false
    const c = noTradeCategory(p.note)
    return c === 'stale-data' || c === 'kill-switch'
  }).length
  const quality = signalsSeen > 0 ? (signalsSeen - staleOrKillMissed) / signalsSeen : null
  const note = quality === null
    ? 'No signals seen yet — data quality cannot be measured.'
    : `${signalsSeen - staleOrKillMissed} of ${signalsSeen} signals on a fresh, trusted feed (${(quality * 100).toFixed(1)}%).`
  return { signalsSeen, staleOrKillMissed, quality, note }
}

// ---------------------------------------------------------------
// The gates
// ---------------------------------------------------------------

export type Gate = { id: string; label: string; met: boolean; value: number | null; threshold: number; unit: string; detail: string }
export type ValidationVerdict = 'INSUFFICIENT SAMPLE' | 'GATES MET'
export type GatesResult = { verdict: ValidationVerdict; gates: Gate[]; metCount: number; total: number; progressPct: number }

/** Peak-to-trough drawdown of a cumulative equity curve, in percent. */
function drawdownPercent(curve: { equity: number }[], startUsd: number): number {
  let peak = startUsd
  let maxDd = 0
  for (const pt of curve) { if (pt.equity > peak) peak = pt.equity; if (peak > 0) maxDd = Math.max(maxDd, ((peak - pt.equity) / peak) * 100) }
  return maxDd
}

/**
 * Evaluate every gate. A gate whose value can't be measured yet (null) is NOT
 * met — the whole point is to refuse to pretend. The verdict is GATES MET only
 * when all gates pass; otherwise INSUFFICIENT SAMPLE.
 */
export function evaluateGates(input: {
  closed: PaperPosition[]
  passports: Passport[]
  curve: { equity: number }[]
  startUsd: number
  soak: SoakMetrics
  quality: DataQuality
}): GatesResult {
  const g = config.paperValidation.gates
  const taken = input.closed.filter((p) => p.exitReason !== 'missed')
  const byStrategy = paperByStrategy(input.closed).filter((m) => m.taken > 0)
  const comparison = comparePaperToOos(byStrategy, input.passports)

  // Span in weeks across all taken trades.
  const times = taken.map((p) => p.closedAt ?? p.openedAt).filter((t) => t > 0)
  const weeks = times.length >= 2 ? (Math.max(...times) - Math.min(...times)) / WEEK : 0

  // Regime + session coverage (only regimes/sessions we could actually label).
  const regimes = new Set(taken.map((p) => p.regime).filter((r): r is string => typeof r === 'string' && r !== 'unavailable'))
  const sessions = new Set(taken.map((p) => p.session).filter((s) => !!s))

  // Worst paper-vs-OOS shortfall, among strategies with both numbers.
  const shortfalls = comparison.map((c) => c.delta).filter((d): d is number => typeof d === 'number').map((d) => -d) // positive = paper below OOS
  const worstShortfall = shortfalls.length ? Math.max(...shortfalls) : null

  /**
   * WHY THIS GATE IS NOT MET, AND WHETHER WAITING WILL FIX IT.
   *
   * These are different situations and the old wording ("no strategy has both a
   * paper and an out-of-sample number to compare YET") described only the first:
   *
   *   a) Nothing has traded. Time fixes this.
   *   b) Something has traded for weeks, and none of it has an out-of-sample
   *      number to be compared against. **Time does not fix this.** An OOS
   *      reference here comes from a vault passport, and passports are minted
   *      only from factory campaign survivors — so a run whose trades come from
   *      a built-in strategy can hit 8/9 and stay there for ever, with the gate
   *      reporting a soft "yet" the whole time.
   *
   * Verified by running the gates over a flawless sample: 60 winning trades,
   * 8 weeks, 2 regimes, 2 sessions, 100% data quality, 400h soak, 0% drawdown —
   * still INSUFFICIENT SAMPLE at 8/9, permanently. A dead end that reads like a
   * queue is worse than a dead end that says so.
   */
  const tradingIds = byStrategy.map((m) => m.strategyId)
  const withOos = comparison.filter((c) => c.oosAvgR !== null).map((c) => c.strategyId)
  const stuck = tradingIds.length > 0 && withOos.length === 0
  const stabilityDetail = worstShortfall !== null
    ? `Worst shortfall below the out-of-sample floor is ${worstShortfall.toFixed(3)}R (allowed ${g.maxPaperVsOosShortfallR}R).`
    : stuck
      ? `${tradingIds.join(', ')} ${tradingIds.length === 1 ? 'is' : 'are'} trading on paper with no out-of-sample passport to be measured against, so THIS GATE CANNOT PASS however long the run continues — waiting will not resolve it. An out-of-sample expectancy has to exist for the strategy that is actually trading. See docs/FINAL_PRODUCTION_READINESS.md, "The stability gate is unreachable".`
      : 'No strategy has traded yet, so there is nothing to compare against out-of-sample.'

  // Smallest per-strategy trade count among strategies that have traded.
  const minPerStrategy = byStrategy.length ? Math.min(...byStrategy.map((m) => m.taken)) : null

  const dd = input.curve.length ? drawdownPercent(input.curve, input.startUsd) : null

  const gates: Gate[] = [
    { id: 'tradesTotal', label: 'Total taken trades', value: taken.length, threshold: g.minTradesTotal, unit: 'trades', met: taken.length >= g.minTradesTotal, detail: `${taken.length}/${g.minTradesTotal} taken paper trades across the system.` },
    { id: 'tradesPerStrategy', label: 'Trades per strategy', value: minPerStrategy, threshold: g.minTradesPerStrategy, unit: 'trades', met: minPerStrategy !== null && minPerStrategy >= g.minTradesPerStrategy, detail: minPerStrategy === null ? 'No strategy has traded yet.' : `The thinnest strategy has ${minPerStrategy}/${g.minTradesPerStrategy} trades.` },
    { id: 'weeks', label: 'Calendar span', value: Number(weeks.toFixed(2)), threshold: g.minWeeks, unit: 'weeks', met: weeks >= g.minWeeks, detail: `${weeks.toFixed(1)}/${g.minWeeks} weeks between the first and last taken trade.` },
    { id: 'regimes', label: 'Regimes covered', value: regimes.size, threshold: g.minRegimesCovered, unit: 'regimes', met: regimes.size >= g.minRegimesCovered, detail: regimes.size ? `Traded in: ${[...regimes].sort().join(', ')}.` : 'No regime could be labelled yet.' },
    { id: 'sessions', label: 'Sessions covered', value: sessions.size, threshold: g.minSessionsCovered, unit: 'sessions', met: sessions.size >= g.minSessionsCovered, detail: sessions.size ? `Traded in: ${[...sessions].sort().join(', ')}.` : 'No session could be labelled yet.' },
    { id: 'dataQuality', label: 'Data quality', value: input.quality.quality === null ? null : Number((input.quality.quality * 100).toFixed(1)), threshold: g.minDataQuality * 100, unit: '%', met: input.quality.quality !== null && input.quality.quality >= g.minDataQuality, detail: input.quality.note },
    { id: 'stability', label: 'Paper vs out-of-sample', value: worstShortfall === null ? null : Number(worstShortfall.toFixed(3)), threshold: g.maxPaperVsOosShortfallR, unit: 'R shortfall', met: worstShortfall !== null && worstShortfall <= g.maxPaperVsOosShortfallR, detail: stabilityDetail },
    // "Max drawdown" reads as the worst the account ever got. It is not: the
    // curve has one point per CLOSE, so an open position sitting underwater is
    // invisible to it and the figure understates the real low-water mark — in
    // the permissive direction, on a gate whose job is to cap risk. Nothing here
    // tracks per-trade excursion, so the honest move is to say which drawdown
    // this is rather than to imply the other one.
    { id: 'drawdown', label: 'Max drawdown (closed trades)', value: dd === null ? null : Number(dd.toFixed(1)), threshold: g.maxDrawdownPercent, unit: '%', met: dd !== null && dd <= g.maxDrawdownPercent, detail: dd === null ? 'No closed trades to draw an equity curve yet.' : `Peak-to-trough paper drawdown is ${dd.toFixed(1)}% (cap ${g.maxDrawdownPercent}%), measured between closed trades — an open position's unrealised loss is not in this figure.` },
    { id: 'soak', label: 'System soak', value: Number(input.soak.uptimeHours.toFixed(1)), threshold: g.minSoakHours, unit: 'hours', met: input.soak.met, detail: input.soak.note },
  ]

  const metCount = gates.filter((x) => x.met).length
  return {
    verdict: metCount === gates.length ? 'GATES MET' : 'INSUFFICIENT SAMPLE',
    gates,
    metCount,
    total: gates.length,
    progressPct: Math.round((metCount / gates.length) * 100),
  }
}

// ---------------------------------------------------------------
// Shadow readiness (prepared, never activated)
// ---------------------------------------------------------------

export type ShadowReadiness = { status: 'SHADOW_READY' | 'NOT_READY'; reasons: string[]; blockers: string[] }

/**
 * Whether the run is ready to PREPARE shadow trading — never to start it. Turning
 * shadow on remains a deliberate, separate human action (config.shadow.enabled +
 * a read-only key). This only reports readiness.
 */
export function shadowReadiness(gates: GatesResult, hasReadOnlyKey: boolean): ShadowReadiness {
  const cfg = config.paperValidation.shadowReadiness
  const blockers: string[] = []
  if (cfg.requirePaperGatesMet && gates.verdict !== 'GATES MET') blockers.push(`Paper gates not met yet (${gates.metCount}/${gates.total}).`)
  if (cfg.requireReadOnlyKey && !hasReadOnlyKey) blockers.push('No read-only exchange key is present (EXCHANGE_API_KEY / EXCHANGE_API_SECRET).')
  const reasons = [
    'Shadow builds the exact order it WOULD send against the live venue and scores it from real trades. It never sends — the recorder has no order path.',
    `The next stage would need at least ${cfg.minShadowOrders} scored shadow orders before shadow itself is validated.`,
    'Activation stays manual: set config.shadow.enabled and provide a read-only key. Nothing here flips it.',
  ]
  return { status: blockers.length === 0 ? 'SHADOW_READY' : 'NOT_READY', reasons, blockers }
}

// ---------------------------------------------------------------
// The full report + the daily text
// ---------------------------------------------------------------

export type ValidationReport = {
  generatedAt: number
  profile: ValidationProfile
  gates: GatesResult
  byStrategy: PaperStrategyMetrics[]
  comparison: PaperVsOos[]
  bySession: Breakdown[]
  byRegime: Breakdown[]
  byOutcome: Breakdown[]
  correlations: CorrelationResult
  decay: DecayRollup[]
  soak: SoakMetrics
  quality: DataQuality
  orderFlow: { real: number; unavailable: number; estimated: number; note: string }
  shadow: ShadowReadiness & { scoredOrders: number }
  aiConsistency: AiConsistency | null
  journalCount: number
  noTradeCount: number
}

export type ValidationReportInput = {
  closed: PaperPosition[]
  passports: Passport[]
  curve: { equity: number }[]
  startUsd: number
  soak: SoakMetrics
  version: string
  hasReadOnlyKey: boolean
  shadowScoredOrders: number
  aiConsistency: AiConsistency | null
}

/** Assemble the whole validation report from already-collected, real data. Pure. */
export function buildValidationReport(input: ValidationReportInput): ValidationReport {
  const quality = dataQuality(input.closed)
  const gates = evaluateGates({ closed: input.closed, passports: input.passports, curve: input.curve, startUsd: input.startUsd, soak: input.soak, quality })
  const byStrategy = paperByStrategy(input.closed).filter((m) => m.taken > 0 || m.missed > 0)
  const journal = perTradeJournal(input.closed)
  const noTrade = noTradeJournal(input.closed)
  const real = journal.filter((r) => r.orderFlow === 'REAL').length
  const unavailable = journal.filter((r) => r.orderFlow === 'UNAVAILABLE').length
  return {
    generatedAt: Date.now(),
    profile: validationProfile(input.version),
    gates,
    byStrategy,
    comparison: comparePaperToOos(byStrategy.filter((m) => m.taken > 0), input.passports),
    bySession: bySession(input.closed),
    byRegime: byRegime(input.closed),
    byOutcome: byOutcome(input.closed),
    correlations: strategyCorrelations(input.closed),
    decay: decayByStrategy(input.closed, input.passports),
    soak: input.soak,
    quality,
    orderFlow: { real, unavailable, estimated: 0, note: 'REAL = live book bid/ask at decision time. UNAVAILABLE = the book was not trusted. Paper never estimates the book from candles, so ESTIMATED is always 0 here.' },
    shadow: { ...shadowReadiness(gates, input.hasReadOnlyKey), scoredOrders: input.shadowScoredOrders },
    aiConsistency: input.aiConsistency,
    journalCount: journal.length,
    noTradeCount: noTrade.length,
  }
}

const fmtR = (r: number | null): string => (r === null ? '—' : (r >= 0 ? '+' : '') + r.toFixed(3) + 'R')
const fmtPct = (p: number | null): string => (p === null ? '—' : p.toFixed(1) + '%')

/**
 * The daily PAPER VALIDATION REPORT, as plain text — for the runbook, a cron, or
 * a glance.
 *
 * The date is the ICT TRADING day (`tradingDayKey`, rolling at 18:00 ET), the
 * same calendar every trade in the report is bucketed by. It used to be the UTC
 * date of `generatedAt`, which disagrees for two hours a day in summer and one
 * in winter — 18:00–19:59 ET and 18:00–18:59 ET respectively, which is exactly
 * the "end of the day, run the report" window for a system whose day rolls at
 * 18:00. A report run then was headed with the PREVIOUS day's date while
 * containing the current trading day's trades.
 */
export function renderDailyReport(r: ValidationReport): string {
  const d = tradingDayKey(r.generatedAt)
  const L: string[] = []
  L.push(`PAPER VALIDATION REPORT — trading day ${d} (rolls 18:00 ET)`)
  L.push(`Profile ${r.profile.profile} · ${r.profile.market.symbol} ${r.profile.market.interval} · live trading ${r.profile.liveTradingEnabled ? 'ENABLED(!)' : 'disabled'}`)
  L.push('')
  L.push(`VERDICT: ${r.gates.verdict}  (${r.gates.metCount}/${r.gates.total} gates, ${r.gates.progressPct}%)`)
  for (const g of r.gates.gates) L.push(`  [${g.met ? 'x' : ' '}] ${g.label}: ${g.value === null ? '—' : g.value}${g.unit ? ' ' + g.unit : ''} / ${g.threshold} — ${g.detail}`)
  L.push('')
  L.push('PER STRATEGY (win rate + expectancy, not a P&L leaderboard):')
  if (!r.byStrategy.length) L.push('  (no strategy has traded on paper yet)')
  for (const m of r.byStrategy) L.push(`  ${m.strategyId}: ${m.taken} taken, ${m.missed} missed, win ${fmtPct(m.winRate === null ? null : m.winRate * 100)}, avg ${fmtR(m.avgR)}, obs spread ${m.avgObservedSpreadPct === null ? '—' : m.avgObservedSpreadPct.toFixed(3) + '%'}`)
  L.push('')
  L.push('PAPER vs OUT-OF-SAMPLE:')
  if (!r.comparison.length) L.push('  (nothing to compare yet)')
  for (const c of r.comparison) L.push(`  ${c.strategyId}: paper ${fmtR(c.paperAvgR)} vs OOS ${fmtR(c.oosAvgR)} (Δ ${fmtR(c.delta)}) — ${c.note}`)
  L.push('')
  L.push('BY REGIME:')
  if (!r.byRegime.length) L.push('  (none)')
  for (const b of r.byRegime) L.push(`  ${b.key}: ${b.taken} trades, win ${fmtPct(b.winRate === null ? null : b.winRate * 100)}, avg ${fmtR(b.avgR)}`)
  L.push('')
  L.push('BY SESSION:')
  if (!r.bySession.length) L.push('  (none)')
  for (const b of r.bySession) L.push(`  ${b.key}: ${b.taken} trades, win ${fmtPct(b.winRate === null ? null : b.winRate * 100)}, avg ${fmtR(b.avgR)}`)
  L.push('')
  L.push('DECAY:')
  if (!r.decay.length) L.push('  (none)')
  for (const dd of r.decay) L.push(`  ${dd.strategyId}: ${dd.status} — ${dd.reason}`)
  L.push('')
  L.push('CORRELATION / REDUNDANCY:')
  L.push('  ' + r.correlations.note)
  for (const cl of r.correlations.redundant) L.push(`  redundant cluster: ${cl.join(' + ')}`)
  L.push('')
  L.push(`ORDER FLOW: ${r.orderFlow.real} REAL, ${r.orderFlow.unavailable} UNAVAILABLE, ${r.orderFlow.estimated} ESTIMATED.`)
  L.push(`DATA QUALITY: ${r.quality.note}`)
  L.push(`SOAK: ${r.soak.note}`)
  if (r.aiConsistency) L.push(`AI vs ENGINE: ${r.aiConsistency.consistent ? 'consistent' : 'MISMATCH — ' + r.aiConsistency.flags.join(' ')}`)
  L.push('')
  L.push(`SHADOW: ${r.shadow.status} (${r.shadow.scoredOrders} scored orders).`)
  for (const b of r.shadow.blockers) L.push(`  blocker: ${b}`)
  L.push('')
  L.push('Reminder: paper is validation data. Do not tune any parameter to these results.')
  return L.join('\n')
}
