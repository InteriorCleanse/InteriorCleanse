/**
 * The 24/7 paper trader — the part that learns as it trades.
 *
 * When the checklist passes and risk and memory agree, this opens a
 * PAPER position and then babysits it candle by candle: stop, target,
 * or time. When it closes, three things happen:
 *   1. the outcome goes into the ledger, so memory can refuse the setup
 *      next time if it keeps failing;
 *   2. a lesson is written if that exact setup has now failed enough;
 *   3. a journal entry is created with what the bot saw, so you only
 *      add how you felt.
 *
 * Nothing here talks to an exchange. A "position" is a record in
 * data/positions.json and a line in data/equity.csv.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.ts'
import { DATA_DIR, ensureDataDir, appendLedgerRow, readLedger, addLesson } from './memory.ts'
import { tradingDayKey } from './sessions.ts'
import { describeKey } from './adaptiveFilter.ts'
import { upsertEntry } from './journal.ts'
import type { Candle, RiskDecision, Signal, TradePlan } from './types.ts'

export const POSITIONS_PATH = join(DATA_DIR, 'positions.json')
export const EQUITY_PATH = join(DATA_DIR, 'equity.csv')

export type PaperPosition = {
  id: string
  openedAt: number
  dayKey: string
  session: string
  setupKey: string
  direction: 'long' | 'short'
  entry: number
  stop: number
  target: number
  quantity: number
  riskUsd: number
  quality: number
  reason: string
  status: 'open' | 'closed'
  closedAt?: number
  exit?: number
  exitReason?: 'target' | 'stop' | 'time' | 'manual'
  rMultiple?: number
  pnlUsd?: number
  candlesHeld?: number
}

type Store = { open: PaperPosition[]; closed: PaperPosition[] }

export function readPositions(): Store {
  if (!existsSync(POSITIONS_PATH)) return { open: [], closed: [] }
  try {
    const s = JSON.parse(readFileSync(POSITIONS_PATH, 'utf8')) as Store
    return { open: s.open ?? [], closed: s.closed ?? [] }
  } catch {
    return { open: [], closed: [] }
  }
}

function writePositions(s: Store): void {
  ensureDataDir()
  writeFileSync(POSITIONS_PATH, JSON.stringify({ open: s.open, closed: s.closed.slice(-500) }, null, 2) + '\n')
}

// ---------------------------------------------------------------
// Pure pieces — the self-test checks these
// ---------------------------------------------------------------

/** Walks the candles after entry and finds the first exit, if any. */
export function evaluateExit(pos: PaperPosition, candles: Candle[]): { exit: number; reason: PaperPosition['exitReason']; time: number; candlesHeld: number } | null {
  const long = pos.direction === 'long'
  let held = 0
  for (const c of candles) {
    if (c.openTime < pos.openedAt) continue
    held++
    const hitStop = long ? c.low <= pos.stop : c.high >= pos.stop
    const hitTarget = long ? c.high >= pos.target : c.low <= pos.target
    if (hitStop) return { exit: pos.stop, reason: 'stop', time: c.closeTime, candlesHeld: held } // pessimistic when both hit
    if (hitTarget) return { exit: pos.target, reason: 'target', time: c.closeTime, candlesHeld: held }
    if (held >= config.ict.maxHoldCandles) return { exit: c.close, reason: 'time', time: c.closeTime, candlesHeld: held }
  }
  return null
}

/** R and dollars for a given exit, fees on both sides. */
export function closeMetrics(pos: PaperPosition, exit: number): { rMultiple: number; pnlUsd: number; pnlPercent: number } {
  const dir = pos.direction === 'long' ? 1 : -1
  const dist = Math.abs(pos.entry - pos.stop)
  const grossPct = ((exit - pos.entry) / pos.entry) * 100 * dir
  const pnlPercent = grossPct - config.feePercent * 2
  const pnlUsd = (pnlPercent / 100) * pos.quantity * pos.entry
  const feeR = ((config.feePercent * 2) / 100 * pos.entry) / dist
  return { rMultiple: ((exit - pos.entry) * dir) / dist - feeR, pnlUsd, pnlPercent }
}

export function unrealized(pos: PaperPosition, price: number): { rMultiple: number; pnlUsd: number } {
  const m = closeMetrics(pos, price)
  return { rMultiple: m.rMultiple, pnlUsd: m.pnlUsd }
}

// ---------------------------------------------------------------
// Opening, managing, closing
// ---------------------------------------------------------------

export function openPosition(signal: Signal, risk: RiskDecision, session: string): PaperPosition {
  const plan = signal.plan as TradePlan
  const store = readPositions()
  const pos: PaperPosition = {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    openedAt: signal.time,
    dayKey: tradingDayKey(signal.time),
    session,
    setupKey: signal.setupKey,
    direction: plan.direction,
    entry: plan.entry,
    stop: plan.stop,
    target: plan.takeProfit,
    quantity: risk.quantity,
    riskUsd: risk.riskUsd,
    quality: signal.quality ?? 0,
    reason: signal.reason,
    status: 'open',
  }
  store.open.push(pos)
  writePositions(store)
  return pos
}

function finalize(store: Store, pos: PaperPosition, exit: number, reason: PaperPosition['exitReason'], time: number, candlesHeld: number): PaperPosition {
  const m = closeMetrics(pos, exit)
  const closed: PaperPosition = { ...pos, status: 'closed', closedAt: time, exit, exitReason: reason, rMultiple: m.rMultiple, pnlUsd: m.pnlUsd, candlesHeld }
  store.open = store.open.filter((p) => p.id !== pos.id)
  store.closed.push(closed)
  writePositions(store)

  const outcome = m.pnlPercent > 0.001 ? 'WIN' : m.pnlPercent < -0.001 ? 'LOSS' : 'FLAT'
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
  ensureDataDir()
  if (!existsSync(EQUITY_PATH)) writeFileSync(EQUITY_PATH, 'timestamp,equity,rMultiple,setupKey\n')
  appendFileSync(EQUITY_PATH, `${new Date(time).toISOString()},${equity().toFixed(4)},${m.rMultiple.toFixed(3)},${pos.setupKey}\n`)
  learnFromLedger(pos.setupKey)

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
    notes: `Opened and closed by Mr. Cash on paper (${reason}). Add how you felt when the alert came in, and whether you'd have taken it.`,
    botSnapshot: { decision: pos.direction === 'long' ? 'BUY' : 'SELL', firstFail: null, bias: '', state: pos.reason, quality: pos.quality },
  })
  return closed
}

/** Checks every open position against the latest candles. Returns the ones that just closed. */
export function managePositions(candles: Candle[]): PaperPosition[] {
  const store = readPositions()
  const closed: PaperPosition[] = []
  for (const pos of [...store.open]) {
    const e = evaluateExit(pos, candles)
    if (e) closed.push(finalize(store, pos, e.exit, e.reason, e.time, e.candlesHeld))
  }
  return closed
}

/** You can flatten a paper position by hand from the app. */
export function closeManually(id: string, price: number): PaperPosition | null {
  const store = readPositions()
  const pos = store.open.find((p) => p.id === id)
  if (!pos) return null
  return finalize(store, pos, price, 'manual', Date.now(), 0)
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

export function todaysPaperStats(dayKey: string): { trades: number; lossesR: number } {
  const s = readPositions()
  const today = [...s.open, ...s.closed].filter((p) => p.dayKey === dayKey)
  return { trades: today.length, lossesR: today.reduce((sum, p) => sum + (p.rMultiple !== undefined && p.rMultiple < 0 ? -p.rMultiple : 0), 0) }
}

export function paperStats(price?: number) {
  const s = readPositions()
  const closed = s.closed
  const wins = closed.filter((p) => (p.rMultiple ?? 0) > 0.05).length
  const losses = closed.filter((p) => (p.rMultiple ?? 0) < -0.05).length
  const totalR = closed.reduce((sum, p) => sum + (p.rMultiple ?? 0), 0)
  const openUnreal = price !== undefined ? s.open.reduce((sum, p) => sum + unrealized(p, price).pnlUsd, 0) : 0
  let run = config.accountSizeUsd
  const curve = closed.map((p) => { run += p.pnlUsd ?? 0; return { time: p.closedAt ?? 0, equity: run, r: p.rMultiple ?? 0 } })
  return {
    startUsd: config.accountSizeUsd,
    equityUsd: equity(),
    equityWithOpenUsd: equity() + openUnreal,
    open: s.open.map((p) => ({ ...p, unrealized: price !== undefined ? unrealized(p, price) : null })),
    closed: closed.slice(-50).reverse(),
    trades: closed.length,
    wins,
    losses,
    winRate: wins + losses ? wins / (wins + losses) : null,
    totalR,
    expectancyR: closed.length ? totalR / closed.length : null,
    curve,
  }
}
