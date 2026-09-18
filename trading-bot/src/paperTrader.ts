/**
 * The 24/7 paper trader — the part that learns as it trades.
 *
 * When the checklist passes and risk and memory agree, this QUEUES a
 * paper order. Nothing fills at the signal price: the order fills on the
 * NEXT candle's open, plus spread and slippage, exactly as sim/fills.ts
 * says a real order would — or it is MISSED if price ran away first.
 * Then it babysits the position candle by candle: stop (a little worse
 * than the stop price), target (only when price trades through), or
 * time. When it closes, three things happen:
 *   1. the outcome goes into the ledger, so memory can refuse the setup
 *      next time if it keeps failing;
 *   2. a lesson is written if that exact setup has now failed enough;
 *   3. a journal entry is created with what the bot saw, so you only
 *      add how you felt.
 *
 * Nothing here talks to an exchange. A "position" is a row in the store,
 * mirrored to data/positions.json and data/equity.csv for reading.
 */

import { existsSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.ts'
import { DATA_DIR, ensureDataDir, appendLedgerRow, readLedger, addLesson } from './memory.ts'
import { store } from './store.ts'
import { tradingDayKey } from './sessions.ts'
import { describeKey } from './adaptiveFilter.ts'
import { upsertEntry } from './journal.ts'
import { sizeForStop } from './risk.ts'
import { applyFilters } from './risk/filters.ts'
import { defaultAssumptions, simulateEntry, exitOnCandle, simulateExit } from './sim/fills.ts'
import type { ExecutionAssumptions, EntryFill } from './sim/fills.ts'
import { tradeMetrics, classifyOutcome } from './sim/trades.ts'
import type { TradeOutcome } from './sim/trades.ts'
import { recordPaperResult } from './vault/store.ts'
import type { Candle, RiskDecision, Signal, TradePlan } from './types.ts'

export const POSITIONS_PATH = join(DATA_DIR, 'positions.json')
export const EQUITY_PATH = join(DATA_DIR, 'equity.csv')

export type PaperPosition = {
  id: string
  /** The close time of the signal candle — the moment the order was queued. */
  openedAt: number
  dayKey: string
  session: string
  setupKey: string
  direction: 'long' | 'short'
  /** The price the signal wanted. */
  intendedEntry: number
  /** The simulated fill once filled; equals intendedEntry while pending. */
  entry: number
  stop: number
  target: number
  quantity: number
  riskUsd: number
  quality: number
  reason: string
  /** ATR at signal time, for the drift check. */
  atr: number
  /**
   * pending — queued, fills at the next candle's open
   * open    — filled, being managed
   * closed  — done (exitReason says how; 'missed' means it never filled)
   */
  status: 'pending' | 'open' | 'closed'
  filledAt?: number
  /** Spread and slippage paid on entry, in dollars. */
  entryCostUsd?: number
  /** Which strategy produced this order — 'fused', 'session-ifvg', 'crossover', etc. For per-strategy paper metrics. */
  strategyId?: string
  /** The market regime the engine read at the moment the order was decided ('trending-up', 'ranging', …). For the validation regime breakdown. Undefined when the tape wasn't trusted enough to classify. */
  regime?: string
  /** The order book best bid/ask at the moment the order was decided, and the spread it implied. Phase 18 observability. */
  observedBid?: number
  observedAsk?: number
  observedSpreadPct?: number
  /** The slippage the fill model assumed, in bps, so it can be checked against the observed book later. */
  assumedSlippageBps?: number
  /** How long between deciding the order and it filling, in ms (fill latency). */
  latencyMs?: number
  closedAt?: number
  exit?: number
  exitReason?: 'target' | 'stop' | 'time' | 'manual' | 'missed'
  rMultiple?: number
  pnlUsd?: number
  feesUsd?: number
  /**
   * The ENGINE's own win/loss/flat verdict for this trade, recorded at close so
   * every panel reports the same thing. Absent on positions closed before this
   * field existed, and on missed orders (which were never trades).
   */
  outcome?: TradeOutcome
  candlesHeld?: number
  /** Why it was missed, when it was. */
  note?: string
  /** What the engine could see when it decided. Absent on positions opened before this field existed. */
  snapshot?: DecisionSnapshot
  /**
   * RECONCILIATION FIELDS — the only fields the store will let anything change on
   * a closed record. Excursions are walked from stored candles after the fact.
   */
  mae?: number | null
  mfe?: number | null
  reconciledAt?: number
  reconciliationNote?: string
}

type Store = { open: PaperPosition[]; closed: PaperPosition[] }

/** `open` includes pending orders — they count toward "nothing else may open" and the daily limits. */
export function readPositions(): Store {
  return { open: [...store().positions<PaperPosition>('pending'), ...store().positions<PaperPosition>('open')], closed: store().positions<PaperPosition>('closed') }
}

/** Saves one position to the store and refreshes the readable mirror. */
function savePosition(pos: PaperPosition): void {
  store().savePosition(pos)
  const s = readPositions()
  ensureDataDir()
  writeFileSync(POSITIONS_PATH, JSON.stringify({ open: s.open, closed: s.closed.slice(-500) }, null, 2) + '\n')
}

// ---------------------------------------------------------------
// Pure pieces — the self-test checks these
// ---------------------------------------------------------------

/** How far a filled position has come, at a given price, as if closed there by a market order. */
export function closeMetrics(pos: PaperPosition, exit: number, reason: PaperPosition['exitReason'] = 'manual', a: ExecutionAssumptions = defaultAssumptions()) {
  const m = tradeMetrics({ direction: pos.direction, fill: pos.entry, stop: pos.stop, exit, exitReason: reason === 'missed' || reason === undefined ? 'manual' : reason, quantity: pos.quantity }, a)
  return { rMultiple: m.rMultiple, pnlUsd: m.pnlUsd, pnlPercent: m.pnlPercent, feesUsd: m.feesUsd }
}

export function unrealized(pos: PaperPosition, price: number): { rMultiple: number; pnlUsd: number } {
  if (pos.status === 'pending') return { rMultiple: 0, pnlUsd: 0 }
  const m = closeMetrics(pos, price, 'time')
  return { rMultiple: m.rMultiple, pnlUsd: m.pnlUsd }
}

/**
 * Walks the candles after the fill and finds the first exit, if any.
 * For a pending position it first fills it (or misses it) on the entry candle.
 */
export function evaluateExit(pos: PaperPosition, candles: Candle[], a: ExecutionAssumptions = defaultAssumptions()): { exit: number; reason: PaperPosition['exitReason']; time: number; candlesHeld: number } | null {
  const intent = { direction: pos.direction, intendedEntry: pos.intendedEntry, stop: pos.stop, target: pos.target, atr: pos.atr }
  let fill: EntryFill
  if (pos.status === 'pending') {
    const signalIndex = candles.findIndex((c) => c.closeTime >= pos.openedAt && c.openTime <= pos.openedAt)
    if (signalIndex < 0) {
      // The signal candle is no longer in the window: fill at the first candle after the signal.
      const first = candles.findIndex((c) => c.openTime > pos.openedAt)
      if (first < 0) return null
      const r = simulateEntry(intent, candles, first - 1 < 0 ? 0 : first - 1, { ...a, latencyCandles: first - 1 < 0 ? 0 : a.latencyCandles })
      if (!r.filled) return r.reason === 'missed' ? { exit: 0, reason: 'missed', time: candles[first].openTime, candlesHeld: 0 } : null
      fill = r.fill
    } else {
      const r = simulateEntry(intent, candles, signalIndex, a)
      if (!r.filled) return r.reason === 'missed' ? { exit: 0, reason: 'missed', time: candles[signalIndex + a.latencyCandles]?.openTime ?? pos.openedAt, candlesHeld: 0 } : null
      fill = r.fill
    }
  } else {
    const idx = candles.findIndex((c) => c.openTime >= (pos.filledAt ?? pos.openedAt))
    if (idx < 0) return null
    fill = { price: pos.entry, time: pos.filledAt ?? pos.openedAt, index: idx, costPerUnit: 0 }
  }
  const e = simulateExit(intent, fill, candles, a)
  return e ? { exit: e.price, reason: e.reason, time: e.time, candlesHeld: e.candlesHeld } : null
}

// ---------------------------------------------------------------
// Opening, filling, managing, closing
// ---------------------------------------------------------------

/** Queues a paper order. It fills on the next candle, or is missed. */
/**
 * THE DECISION-TIME SNAPSHOT.
 *
 * Everything the analyst layer will later attribute a result to has to be
 * written down at the moment the order is decided — not recovered afterwards
 * from a feature engine that has since seen the outcome. This is that record.
 * It is captured by the watch loop from state already in scope at the decision
 * (the features, the fused decision, the signal's evidence, the risk verdict,
 * the news read) and stored on the position verbatim.
 *
 * It is observability, not behaviour: nothing in entry, exit, sizing, fill or
 * risk reads it, and a position opened with or without one is the same
 * position. A test pins that.
 *
 * By construction it contains NO outcome field. `sanitizeSnapshot` copies only
 * the keys declared here, so an exit price, an R or a close time smuggled in
 * under any name cannot survive into the stored record.
 */
export type DecisionSnapshot = {
  /** Deterministic: `${setupKey}@${signal time}`. The same signal always has the same id. */
  signalId: string
  symbol: string
  interval: string
  engineVersion: string
  featureVersion: number
  volatility: 'quiet' | 'normal' | 'wild' | null
  fusedScore: number | null
  fusedAction: string | null
  confirms: string[]
  invalidates: string[]
  contributors: Array<{ id: string; action: string; confidence: number }>
  /** The winning signal's own evidence steps, as the strategy wrote them. */
  evidence: Array<{ step: string; passed: boolean; detail: string }>
  riskChecks: Array<{ rule: string; passed: boolean; detail: string }>
  riskVetoedBy: string | null
  /** Minutes until the next high-impact blackout begins; null when none is scheduled ahead. */
  newsMinutes: number | null
  inBlackout: boolean | null
}

const isFiniteNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const str = (x: unknown): string => (typeof x === 'string' ? x : '')

/** Keep only the declared snapshot fields, each type-checked. Anything else — including any outcome field — is dropped. */
export function sanitizeSnapshot(raw: unknown): DecisionSnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const steps = (xs: unknown): Array<{ step: string; passed: boolean; detail: string }> =>
    Array.isArray(xs) ? xs.filter((e) => e && typeof e === 'object').map((e) => ({ step: str((e as Record<string, unknown>).step), passed: (e as Record<string, unknown>).passed === true, detail: str((e as Record<string, unknown>).detail) })) : []
  return {
    signalId: str(r.signalId),
    symbol: str(r.symbol),
    interval: str(r.interval),
    engineVersion: str(r.engineVersion),
    featureVersion: isFiniteNum(r.featureVersion) ? r.featureVersion : 0,
    volatility: r.volatility === 'quiet' || r.volatility === 'normal' || r.volatility === 'wild' ? r.volatility : null,
    fusedScore: isFiniteNum(r.fusedScore) ? r.fusedScore : null,
    fusedAction: typeof r.fusedAction === 'string' ? r.fusedAction : null,
    confirms: Array.isArray(r.confirms) ? r.confirms.filter((x): x is string => typeof x === 'string') : [],
    invalidates: Array.isArray(r.invalidates) ? r.invalidates.filter((x): x is string => typeof x === 'string') : [],
    contributors: Array.isArray(r.contributors)
      ? r.contributors.filter((c) => c && typeof c === 'object').map((c) => ({ id: str((c as Record<string, unknown>).id), action: str((c as Record<string, unknown>).action), confidence: isFiniteNum((c as Record<string, unknown>).confidence) ? ((c as Record<string, unknown>).confidence as number) : 0 }))
      : [],
    evidence: steps(r.evidence),
    riskChecks: Array.isArray(r.riskChecks) ? r.riskChecks.filter((c) => c && typeof c === 'object').map((c) => ({ rule: str((c as Record<string, unknown>).rule), passed: (c as Record<string, unknown>).passed === true, detail: str((c as Record<string, unknown>).detail) })) : [],
    riskVetoedBy: typeof r.riskVetoedBy === 'string' ? r.riskVetoedBy : null,
    newsMinutes: isFiniteNum(r.newsMinutes) ? r.newsMinutes : null,
    inBlackout: typeof r.inBlackout === 'boolean' ? r.inBlackout : null,
  }
}

/** How close the next high-impact blackout is, at the decision instant. Pure. */
export function newsProximity(blackouts: Array<{ start: number; end: number }> | null | undefined, at: number): { newsMinutes: number | null; inBlackout: boolean | null } {
  if (!blackouts) return { newsMinutes: null, inBlackout: null }
  const inBlackout = blackouts.some((b) => at >= b.start && at <= b.end)
  const ahead = blackouts.map((b) => b.start - at).filter((d) => d >= 0)
  return { newsMinutes: ahead.length ? Math.round(Math.min(...ahead) / 60_000) : null, inBlackout }
}

/** What the market looked like at the moment the order was decided. Recorded for honesty about spread and slippage. */
export type DecisionObservation = { bid?: number; ask?: number; strategyId?: string; regime?: string; snapshot?: DecisionSnapshot }

export function openPosition(signal: Signal, risk: RiskDecision, session: string, atr = 0, obs: DecisionObservation = {}): PaperPosition {
  const plan = signal.plan as TradePlan
  const spreadPct = obs.bid && obs.ask && obs.bid > 0 && obs.ask > 0 ? ((obs.ask - obs.bid) / ((obs.ask + obs.bid) / 2)) * 100 : undefined
  const pos: PaperPosition = {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    openedAt: signal.time,
    dayKey: tradingDayKey(signal.time),
    session,
    setupKey: signal.setupKey,
    direction: plan.direction,
    intendedEntry: plan.entry,
    entry: plan.entry,
    stop: plan.stop,
    target: plan.takeProfit,
    quantity: risk.quantity,
    riskUsd: risk.riskUsd,
    quality: signal.quality ?? 0,
    reason: signal.reason,
    atr,
    status: 'pending',
    strategyId: obs.strategyId,
    regime: obs.regime,
    observedBid: obs.bid,
    observedAsk: obs.ask,
    observedSpreadPct: spreadPct,
    assumedSlippageBps: config.execution.slippageBps,
    snapshot: sanitizeSnapshot(obs.snapshot),
  }
  savePosition(pos)
  return pos
}

/**
 * Size the position at the price it actually filled at — the fill is rarely the
 * signal price, and the risk percent is owed to the real stop distance — and
 * then put that size through the SAME exchange filters the risk engine applied
 * when it approved the order.
 *
 * The filter pass used to be missing here, so the rounding `assess` had done was
 * silently thrown away at fill time and the position was recorded at a size the
 * venue could not have accepted. With Binance BTCUSDT's real values the risk
 * engine approves 0.00083 (a whole number of 0.00001 steps) and this function
 * stored 0.000833017619655484 — not a multiple of the step, not placeable.
 * `filters.ts` says exactly why that matters: "Even on paper, sizing that
 * ignores these is a lie about what could actually be filled."
 *
 * Every filter ships at 0, so this is a no-op today and no recorded number
 * moves; it starts mattering when Phase 20 sets the venue's real values, which
 * is precisely the run-up to risking money.
 *
 * Returns a MISSED position when the filtered size is not placeable — a venue
 * that would have rejected the order did not give us a fill, and inventing one
 * is the same lie in a different place.
 */
function fillPosition(pos: PaperPosition, fill: EntryFill): PaperPosition {
  const sized = sizeForStop(fill.price, pos.stop)
  const filt = applyFilters(sized.quantity, fill.price, config.risk.filters)
  if (!filt.ok) return missPosition(pos, fill.time, `the venue would have rejected the order at the fill price — ${filt.reason}`)
  // Risk follows the size that could actually be placed, not the one before rounding.
  const riskUsd = filt.quantity * Math.abs(fill.price - pos.stop)
  const filled: PaperPosition = { ...pos, status: 'open', entry: fill.price, filledAt: fill.time, quantity: filt.quantity, riskUsd, entryCostUsd: fill.costPerUnit * filt.quantity, latencyMs: Math.max(0, fill.time - pos.openedAt) }
  savePosition(filled)
  return filled
}

function missPosition(pos: PaperPosition, time: number, note: string): PaperPosition {
  const missed: PaperPosition = { ...pos, status: 'closed', closedAt: time, exitReason: 'missed', rMultiple: 0, pnlUsd: 0, feesUsd: 0, candlesHeld: 0, note }
  savePosition(missed)
  appendLedgerRow({ timestamp: new Date(time).toISOString(), symbol: config.symbol, action: 'SKIP', price: pos.intendedEntry, quantity: 0, reason: `${pos.setupKey} — MISSED: ${note}`, mode: 'live-paper', outcome: 'MISSED', pnl: 0 })
  return missed
}

/**
 * A real, actionable setup that was refused before it could ever be queued —
 * the kill switch was on, the data was stale, and so on. It is recorded as a
 * missed trade with the reason, so the paper record shows what the edge would
 * have faced, not a flattering count of only the trades that happened to run.
 */
export function recordMissedSignal(signal: Signal, reason: string, obs: DecisionObservation = {}): PaperPosition {
  const plan = signal.plan as TradePlan
  const spreadPct = obs.bid && obs.ask && obs.bid > 0 && obs.ask > 0 ? ((obs.ask - obs.bid) / ((obs.ask + obs.bid) / 2)) * 100 : undefined
  const missed: PaperPosition = {
    id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    openedAt: signal.time, dayKey: tradingDayKey(signal.time), session: '', setupKey: signal.setupKey,
    direction: plan.direction, intendedEntry: plan.entry, entry: plan.entry, stop: plan.stop, target: plan.takeProfit,
    quantity: 0, riskUsd: 0, quality: signal.quality ?? 0, reason: signal.reason, atr: 0,
    status: 'closed', closedAt: signal.time, exitReason: 'missed', rMultiple: 0, pnlUsd: 0, feesUsd: 0, candlesHeld: 0,
    note: reason, strategyId: obs.strategyId, regime: obs.regime, observedBid: obs.bid, observedAsk: obs.ask, observedSpreadPct: spreadPct,
    snapshot: sanitizeSnapshot(obs.snapshot),
  }
  savePosition(missed)
  appendLedgerRow({ timestamp: new Date(signal.time).toISOString(), symbol: config.symbol, action: 'SKIP', price: plan.entry, quantity: 0, reason: `${signal.setupKey} — MISSED: ${reason}`, mode: 'live-paper', outcome: 'MISSED', pnl: 0 })
  return missed
}

function finalize(pos: PaperPosition, exit: number, reason: Exclude<PaperPosition['exitReason'], 'missed' | undefined>, time: number, candlesHeld: number): PaperPosition {
  const m = closeMetrics(pos, exit, reason)
  // One verdict, computed once by the engine's canonical rule, recorded on the
  // position AND written to the ledger — so no reporting path has to re-derive it.
  const outcome = classifyOutcome(m.pnlPercent)
  const closed: PaperPosition = { ...pos, status: 'closed', closedAt: time, exit, exitReason: reason, rMultiple: m.rMultiple, pnlUsd: m.pnlUsd, feesUsd: m.feesUsd, outcome, candlesHeld }
  savePosition(closed)

  appendLedgerRow({
    timestamp: new Date(time).toISOString(),
    symbol: config.symbol,
    action: pos.direction === 'long' ? 'BUY' : 'SELL',
    price: pos.entry,
    quantity: pos.quantity,
    reason: `${pos.setupKey} — live paper trade, exit ${reason} at ${m.rMultiple.toFixed(2)}R`,
    mode: 'live-paper',
    outcome,
    pnl: Number(m.pnlPercent.toFixed(4)),
  })
  const eq = equity()
  store().appendEquity({ timestamp: new Date(time).toISOString(), equity: Number(eq.toFixed(4)), r: Number(m.rMultiple.toFixed(3)), setupKey: pos.setupKey })
  ensureDataDir()
  if (!existsSync(EQUITY_PATH)) writeFileSync(EQUITY_PATH, 'timestamp,equity,rMultiple,setupKey\n')
  appendFileSync(EQUITY_PATH, `${new Date(time).toISOString()},${eq.toFixed(4)},${m.rMultiple.toFixed(3)},${pos.setupKey}\n`)
  learnFromLedger(pos.setupKey)
  // Feed the vault: a real paper result flows to the passport of this strategy
  // (a no-op for the frozen session model, which has no passport). This is how
  // decay and champion-challenger see live results as they arrive.
  try { recordPaperResult(pos.strategyId, m.rMultiple, time) } catch { /* the vault is best-effort; a paper trade still records */ }

  upsertEntry({
    tradeTime: pos.openedAt,
    symbol: config.symbol,
    direction: pos.direction,
    session: pos.session,
    setupKey: pos.setupKey,
    entry: pos.entry,
    stop: pos.stop,
    target: pos.target,
    exit,
    execution: 3,
    followedPlan: null,
    emotions: [],
    tags: ['bot paper trade'],
    notes: `Opened and closed by Mr. Cash on paper (${reason}). Intended entry $${pos.intendedEntry.toFixed(2)}, filled at $${pos.entry.toFixed(2)}. Add how you felt when the alert came in, and whether you'd have taken it.`,
    botSnapshot: { decision: pos.direction === 'long' ? 'BUY' : 'SELL', firstFail: null, bias: '', state: pos.reason, quality: pos.quality },
  })
  return closed
}

/**
 * Checks every pending and open position against the latest candles.
 * Returns the positions that changed state: filled, missed or closed.
 */
export function managePositions(candles: Candle[], a: ExecutionAssumptions = defaultAssumptions()): PaperPosition[] {
  const changed: PaperPosition[] = []
  for (let pos of readPositions().open) {
    if (pos.status === 'pending') {
      const signalIndex = candles.findIndex((c) => c.closeTime >= pos.openedAt && c.openTime <= pos.openedAt)
      const intent = { direction: pos.direction, intendedEntry: pos.intendedEntry, stop: pos.stop, target: pos.target, atr: pos.atr }
      const r = simulateEntry(intent, candles, signalIndex < 0 ? Math.max(0, candles.findIndex((c) => c.openTime > pos.openedAt) - 1) : signalIndex, a)
      if (!r.filled) {
        if (r.reason === 'missed') changed.push(missPosition(pos, candles[candles.length - 1].closeTime, r.detail))
        continue // the entry candle has not closed yet
      }
      const placed = fillPosition(pos, r.fill)
      changed.push(placed)
      // A size the venue would have rejected is a miss, not a fill — there is
      // no open position to manage from here.
      if (placed.status !== 'open') continue
      pos = placed
      // Manage from the fill candle onward, in the same pass.
      let held = 0
      for (let i = r.fill.index; i < candles.length; i++) {
        held++
        const e = exitOnCandle(intent, candles[i], held, a)
        if (e) { changed.push(finalize(pos, e.price, e.reason, e.time, held)); break }
      }
      continue
    }
    const e = evaluateExit(pos, candles, a)
    if (e && e.reason !== 'missed') changed.push(finalize(pos, e.exit, e.reason as 'target' | 'stop' | 'time', e.time, e.candlesHeld))
  }
  return changed
}

/** You can flatten a paper position by hand from the app. A pending order is simply cancelled. */
export function closeManually(id: string, price: number): PaperPosition | null {
  const pos = readPositions().open.find((p) => p.id === id)
  if (!pos) return null
  if (pos.status === 'pending') return missPosition(pos, Date.now(), 'cancelled by you before it filled')
  return finalize(pos, price, 'manual', Date.now(), 0)
}

// ---------------------------------------------------------------
// Learning and reporting
// ---------------------------------------------------------------

/** Looks at everything memory knows about a setup and writes a lesson if it has earned one. */
export function learnFromLedger(setupKey: string): boolean {
  const rows = readLedger().filter((r) => r.reason.includes(setupKey) && (r.outcome === 'WIN' || r.outcome === 'LOSS' || r.outcome === 'FLAT'))
  if (!rows.length) return false
  const losses = rows.filter((r) => r.outcome === 'LOSS').length
  const winRate = rows.filter((r) => r.outcome === 'WIN').length / rows.length
  const avg = rows.reduce((s, r) => s + r.pnl, 0) / rows.length
  if (losses >= config.memory.skipAfterLosses && winRate < config.memory.skipIfWinRateBelow) {
    return addLesson(setupKey, `"${describeKey(setupKey)}" has lost ${losses} of ${rows.length} times (average ${avg.toFixed(2)}% after fees), counting live paper trades. Treat this setup with suspicion. [${setupKey}]`)
  }
  return false
}

export function equity(): number {
  return config.accountSizeUsd + readPositions().closed.reduce((s, p) => s + (p.pnlUsd ?? 0), 0)
}

/** The highest the paper equity curve has reached (chronological closes), for the drawdown cap. */
export function equityPeak(): number {
  const closed = readPositions().closed.filter((p) => p.exitReason !== 'missed').slice().sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))
  let run = config.accountSizeUsd
  let peak = run
  for (const p of closed) { run += p.pnlUsd ?? 0; if (run > peak) peak = run }
  return peak
}

/** Total notional value of the open paper positions (filled ones), at their entry. */
export function openNotionalUsd(): number {
  return readPositions().open.filter((p) => p.status === 'open').reduce((s, p) => s + p.entry * p.quantity, 0)
}

/** Today's trade count and losses. Missed orders do not count as trades. */
export function todaysPaperStats(dayKey: string): { trades: number; lossesR: number } {
  const s = readPositions()
  const today = [...s.open, ...s.closed].filter((p) => p.dayKey === dayKey && p.exitReason !== 'missed')
  return { trades: today.length, lossesR: today.reduce((sum, p) => sum + (p.rMultiple !== undefined && p.rMultiple < 0 ? -p.rMultiple : 0), 0) }
}

/**
 * THE one reader of a paper trade's outcome. Every panel — the paper account,
 * the per-strategy metrics, the validation breakdowns — goes through this, so a
 * trade cannot be a win on one screen and a scratch on the next.
 *
 * Prefers the verdict the engine RECORDED at close. For positions closed before
 * that field existed, the exact percent is recovered from the dollars
 * (`pnlUsd = pnlPercent/100 × notional`, so the division is exact) and run
 * through the same canonical rule. Only when even that is impossible does it
 * fall back to the sign of R — and that case is flagged by returning FLAT for a
 * trade it genuinely cannot classify, rather than guessing a winner.
 */
export function paperOutcome(p: PaperPosition): TradeOutcome | 'MISSED' {
  if (p.exitReason === 'missed') return 'MISSED'
  if (p.outcome) return p.outcome
  const notional = p.entry * p.quantity
  if (typeof p.pnlUsd === 'number' && notional > 0) return classifyOutcome((p.pnlUsd / notional) * 100)
  return 'FLAT'
}

export function paperStats(price?: number) {
  const s = readPositions()
  const closed = s.closed.filter((p) => p.exitReason !== 'missed')
  const missed = s.closed.filter((p) => p.exitReason === 'missed').length
  const wins = closed.filter((p) => paperOutcome(p) === 'WIN').length
  const losses = closed.filter((p) => paperOutcome(p) === 'LOSS').length
  const totalR = closed.reduce((sum, p) => sum + (p.rMultiple ?? 0), 0)
  const openUnreal = price !== undefined ? s.open.reduce((sum, p) => sum + unrealized(p, price).pnlUsd, 0) : 0
  let run = config.accountSizeUsd
  const curve = closed.map((p) => { run += p.pnlUsd ?? 0; return { time: p.closedAt ?? 0, equity: run, r: p.rMultiple ?? 0 } })
  return {
    startUsd: config.accountSizeUsd,
    equityUsd: equity(),
    equityWithOpenUsd: equity() + openUnreal,
    open: s.open.map((p) => ({ ...p, unrealized: price !== undefined ? unrealized(p, price) : null })),
    closed: s.closed.slice(-50).reverse(),
    trades: closed.length,
    missed,
    wins,
    losses,
    winRate: wins + losses ? wins / (wins + losses) : null,
    totalR,
    expectancyR: closed.length ? totalR / closed.length : null,
    costsUsd: closed.reduce((sum, p) => sum + (p.feesUsd ?? 0) + (p.entryCostUsd ?? 0), 0),
    curve,
  }
}
