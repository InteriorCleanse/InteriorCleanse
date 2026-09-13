/**
 * The look-back test ("replay").
 *
 * Walks real past candles one at a time, pretending it can only see
 * what was known at that moment, and asks: when the bot would have
 * traded, what actually happened next?
 *
 *   raw     — no memory. The honest baseline.
 *   memory  — same walk, but memory may refuse setups that lost before.
 *
 * No peeking at the future, no invented candles, no nudged results.
 * Entries happen at the close of the signal candle; exits are judged on
 * the candles after it. If a candle hits both the stop and the target,
 * the bot assumes the stop — the pessimistic reading.
 */

import { config } from '../config.ts'
import { getCandles, getCandlesSince, INTERVAL_MS } from './market.ts'
import { IctEngine } from './ictStrategy.ts'
import { getCrossoverSignal } from './strategy.ts'
import { checkRisk } from './risk.ts'
import { consultMemory, describeKey } from './adaptiveFilter.ts'
import { addLesson, appendLedgerRow } from './memory.ts'
import { toET } from './sessions.ts'
import type { Breakdown, Candle, ReplaySummary, ReplayTrade, Signal, TradePlan } from './types.ts'

export type ReplayResult = {
  strategy: 'ict' | 'crossover'
  trades: ReplayTrade[]
  summary: ReplaySummary
  breakdowns: Breakdown[]
  candlesUsed: number
  days: number
  from: number
  to: number
  notes: string[]
}

type Options = { useMemory: boolean; writeMemory: boolean }

// ---------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------

function summarise(trades: ReplayTrade[], totalSetups: number, skipped: number): ReplaySummary {
  const taken = trades.filter((t) => !t.blockedByMemory)
  const wins = taken.filter((t) => t.outcome === 'WIN').length
  const losses = taken.filter((t) => t.outcome === 'LOSS').length
  const flat = taken.filter((t) => t.outcome === 'FLAT').length
  const withR = taken.filter((t) => t.rMultiple !== null)

  const totalPnlUsd = taken.reduce((s, t) => s + t.pnlUsd, 0)
  const totalR = withR.reduce((s, t) => s + (t.rMultiple ?? 0), 0)
  const grossWin = taken.filter((t) => t.pnlUsd > 0).reduce((s, t) => s + t.pnlUsd, 0)
  const grossLoss = Math.abs(taken.filter((t) => t.pnlUsd < 0).reduce((s, t) => s + t.pnlUsd, 0))

  let runPct = 0, peakPct = 0, ddPct = 0
  let runR = 0, peakR = 0, ddR = 0
  let streak = 0, worstStreak = 0
  for (const t of taken) {
    runPct += t.pnlPercent
    peakPct = Math.max(peakPct, runPct)
    ddPct = Math.max(ddPct, peakPct - runPct)
    if (t.rMultiple !== null) {
      runR += t.rMultiple
      peakR = Math.max(peakR, runR)
      ddR = Math.max(ddR, peakR - runR)
    }
    streak = t.outcome === 'LOSS' ? streak + 1 : 0
    worstStreak = Math.max(worstStreak, streak)
  }
  const sorted = [...taken].sort((a, b) => b.pnlPercent - a.pnlPercent)

  return {
    totalSetups,
    taken: taken.length,
    skipped,
    wins,
    losses,
    flat,
    winRate: taken.length ? wins / taken.length : null,
    avgPnlPercent: taken.length ? taken.reduce((s, t) => s + t.pnlPercent, 0) / taken.length : null,
    avgR: withR.length ? totalR / withR.length : null,
    expectancyR: withR.length ? totalR / withR.length : null,
    totalR,
    totalPnlUsd,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    bestTrade: sorted[0] ?? null,
    worstTrade: sorted[sorted.length - 1] ?? null,
    maxDrawdownR: withR.length ? ddR : null,
    maxDrawdownPercent: taken.length ? ddPct : null,
    longestLosingStreak: worstStreak,
    enoughData: totalSetups >= config.replay.minSetupsForConfidence,
  }
}

function breakdown(title: string, trades: ReplayTrade[], keyOf: (t: ReplayTrade) => string): Breakdown {
  const groups = new Map<string, ReplayTrade[]>()
  for (const t of trades.filter((x) => !x.blockedByMemory)) {
    const k = keyOf(t)
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  const rows = [...groups.entries()].map(([label, list]) => {
    const wins = list.filter((t) => t.outcome === 'WIN').length
    const withR = list.filter((t) => t.rMultiple !== null)
    const totalR = withR.reduce((s, t) => s + (t.rMultiple ?? 0), 0)
    return { label, trades: list.length, wins, winRate: list.length ? wins / list.length : null, totalR, avgR: withR.length ? totalR / withR.length : null }
  })
  rows.sort((a, b) => b.trades - a.trades)
  return { title, rows }
}

function recordLessons(trades: ReplayTrade[], notes: string[]): void {
  const byKey = new Map<string, ReplayTrade[]>()
  for (const t of trades.filter((x) => !x.blockedByMemory)) byKey.set(t.setupKey, [...(byKey.get(t.setupKey) ?? []), t])

  let wroteAny = false
  let foundQualifying = false
  for (const [key, list] of byKey) {
    const losses = list.filter((t) => t.outcome === 'LOSS').length
    const winRate = list.filter((t) => t.outcome === 'WIN').length / list.length
    const avg = list.reduce((s, t) => s + t.pnlPercent, 0) / list.length
    if (losses >= config.memory.skipAfterLosses && winRate < config.memory.skipIfWinRateBelow) {
      foundQualifying = true
      const added = addLesson(
        key,
        `"${describeKey(key)}" lost ${losses} of ${list.length} times over the last ${config.replay.lookbackDays} days (average ${avg.toFixed(2)}% after fees). Treat this setup with suspicion. [${key}]`,
      )
      if (added) wroteAny = true
    }
  }
  // Three situations, three messages. Saying "nothing to learn" when the
  // lesson was simply already on file would be a small lie.
  if (wroteAny) notes.push('A new lesson was written to data/learnings.md, because a setup lost repeatedly on real prices. Run `npm run replay:memory` to see the bot act on it.')
  else if (foundQualifying) notes.push('A losing setup showed up again, but its lesson was already on file, so nothing was duplicated.')
  else if (trades.length > 0) notes.push('No lesson was written. The real data did not show a setup that lost repeatedly, and I will not invent one to make the memory file look busy.')
}

// ---------------------------------------------------------------
// Trade management (shared)
// ---------------------------------------------------------------

type OpenTrade = { index: number; signal: Signal; plan: TradePlan; riskUsd: number; quantity: number; session: ReplayTrade['session'] }

/** Given an open trade and the candle after entry, did it end? */
function manage(open: OpenTrade, candles: Candle[], i: number): ReplayTrade | null {
  const c = candles[i]
  const { plan } = open
  const long = plan.direction === 'long'
  let exit: { price: number; reason: ReplayTrade['exitReason'] } | null = null

  const hitStop = long ? c.low <= plan.stop : c.high >= plan.stop
  const hitTarget = long ? c.high >= plan.takeProfit : c.low <= plan.takeProfit
  if (hitStop) exit = { price: plan.stop, reason: 'stop' } // pessimistic when both hit
  else if (hitTarget) exit = { price: plan.takeProfit, reason: 'target' }
  else if (i - open.index >= config.ict.maxHoldCandles) exit = { price: c.close, reason: 'time' }
  if (!exit) return null

  const dir = long ? 1 : -1
  const grossPct = ((exit.price - plan.entry) / plan.entry) * 100 * dir
  const pnlPercent = grossPct - config.feePercent * 2
  const pnlUsd = (pnlPercent / 100) * open.quantity * plan.entry
  const stopDistance = Math.abs(plan.entry - plan.stop)
  const feeR = ((config.feePercent * 2) / 100 * plan.entry) / stopDistance
  const rMultiple = ((exit.price - plan.entry) * dir) / stopDistance - feeR

  return {
    index: open.index,
    time: candles[open.index].closeTime,
    action: long ? 'BUY' : 'SELL',
    entryPrice: plan.entry,
    exitPrice: exit.price,
    exitTime: c.closeTime,
    exitReason: exit.reason,
    pnlPercent,
    pnlUsd,
    rMultiple,
    outcome: pnlPercent > 0.001 ? 'WIN' : pnlPercent < -0.001 ? 'LOSS' : 'FLAT',
    setupKey: open.signal.setupKey,
    session: open.session,
    quality: open.signal.quality,
    plan,
  }
}

function ledgerRowFor(t: ReplayTrade, mode: string): void {
  appendLedgerRow({
    timestamp: new Date(t.time).toISOString(),
    symbol: config.symbol,
    action: t.action,
    price: t.entryPrice,
    quantity: 0,
    reason: `${t.setupKey} — exit ${t.exitReason}${t.rMultiple !== null ? ` at ${t.rMultiple.toFixed(2)}R` : ''}`,
    mode,
    outcome: t.outcome,
    pnl: Number(t.pnlPercent.toFixed(4)),
  })
}

// ---------------------------------------------------------------
// The ICT replay
// ---------------------------------------------------------------

export async function runIctReplay(opts: Options): Promise<ReplayResult> {
  const stepMs = INTERVAL_MS[config.interval] ?? 300_000
  const warmupDays = 2
  const start = Date.now() - (config.replay.lookbackDays + warmupDays) * 86_400_000
  const candles = await getCandlesSince(config.symbol, config.interval, start)
  const testFrom = Date.now() - config.replay.lookbackDays * 86_400_000

  const engine = new IctEngine(candles)
  const trades: ReplayTrade[] = []
  const notes: string[] = []
  let totalSetups = 0
  let skipped = 0
  let open: OpenTrade | null = null
  let sawEvidence = false
  const mode = opts.useMemory ? 'replay-memory' : 'replay-raw'

  for (let i = 0; i < candles.length; i++) {
    const a = engine.step(i)

    if (open) {
      const done = manage(open, candles, i)
      if (done) {
        trades.push(done)
        engine.recordTrade(a.dayKey, done.rMultiple)
        if (opts.writeMemory) ledgerRowFor(done, mode)
        open = null
      }
      continue
    }
    if (candles[i].openTime < testFrom) continue // warm-up only

    const signal = a.signal
    if (signal.action !== 'BUY' && signal.action !== 'SELL' || !signal.plan) continue
    totalSetups++
    const risk = checkRisk(signal)
    if (!risk.approved) continue

    if (opts.useMemory) {
      const verdict = consultMemory(signal)
      if (!verdict.noEvidence) sawEvidence = true
      if (verdict.block) {
        skipped++
        // Still measure what WOULD have happened, so we can score the refusal honestly.
        const ghost: OpenTrade = { index: i, signal, plan: signal.plan, riskUsd: risk.riskUsd, quantity: risk.quantity, session: a.session }
        let result: ReplayTrade | null = null
        for (let j = i + 1; j < candles.length && !result; j++) result = manage(ghost, candles, j)
        if (result) trades.push({ ...result, blockedByMemory: true, blockReason: verdict.reason })
        appendLedgerRow({
          timestamp: new Date(candles[i].closeTime).toISOString(), symbol: config.symbol, action: 'SKIP', price: signal.price, quantity: 0,
          reason: `${signal.setupKey} — ${verdict.reason}`, mode, outcome: 'SKIPPED', pnl: 0,
        })
        continue
      }
    }
    open = { index: i, signal, plan: signal.plan, riskUsd: risk.riskUsd, quantity: risk.quantity, session: a.session }
  }
  if (open) notes.push('One trade was still open when the data ran out; it is not counted.')

  const summary = summarise(trades, totalSetups, skipped)
  if (opts.writeMemory && !opts.useMemory) recordLessons(trades, notes)
  if (opts.useMemory && !sawEvidence) notes.push('Memory had nothing to say about any of these setups, so this run is identical to the raw one. That is correct behaviour — run `npm run replay:raw` first to record real outcomes.')
  if (opts.useMemory && skipped > 0) notes.push(`Memory refused ${skipped} trade(s) the raw strategy would have taken. Each refusal is in data/ledger.csv with its reason.`)
  if (!summary.enoughData) notes.push(`Only ${totalSetups} setup(s) in ${config.replay.lookbackDays} days — fewer than the ${config.replay.minSetupsForConfidence} I'd want before trusting any number here. This model is picky by design; raise lookbackDays in config.ts for a bigger sample.`)
  notes.push('The look-back test has no historical news feed, so the news blackout was not applied. Live scans do apply it.')

  const sessionLabel = (s: ReplayTrade['session']) => (s ? config.ict.sessions[s].label : 'outside sessions')
  const breakdowns: Breakdown[] = [
    breakdown('By session', trades, (t) => sessionLabel(t.session)),
    breakdown('By direction', trades, (t) => (t.action === 'BUY' ? 'Longs' : 'Shorts')),
    breakdown('By level swept', trades, (t) => t.setupKey.split('|')[5]?.replace('-', ' ') ?? '?'),
    breakdown('By entry type', trades, (t) => (t.setupKey.endsWith('IFVG') ? 'Inverted gap' : 'Open gap')),
    breakdown('By weekday', trades, (t) => toET(t.time).weekdayName),
    breakdown('By exit', trades, (t) => t.exitReason),
  ]

  return {
    strategy: 'ict',
    trades,
    summary,
    breakdowns,
    candlesUsed: candles.length,
    days: Math.round((candles[candles.length - 1].closeTime - Math.max(testFrom, candles[0].openTime)) / 86_400_000),
    from: Math.max(testFrom, candles[0].openTime),
    to: candles[candles.length - 1].closeTime,
    notes: notes.concat(stepMs > 900_000 ? ['Candles bigger than 15m blur the session model — 5m is the intended setting.'] : []),
  }
}

// ---------------------------------------------------------------
// The crossover replay (the simple teaching strategy)
// ---------------------------------------------------------------

export async function runCrossoverReplay(opts: Options): Promise<ReplayResult> {
  const lookback = Math.min(5000, config.replay.lookbackDays * Math.round(86_400_000 / (INTERVAL_MS[config.interval] ?? 300_000)))
  const candles = await getCandles(config.symbol, config.interval, lookback)
  const trades: ReplayTrade[] = []
  const notes: string[] = []
  let totalSetups = 0
  let skipped = 0
  let sawEvidence = false
  const mode = opts.useMemory ? 'replay-memory' : 'replay-raw'
  const hold = config.crossover.holdCandles

  for (let i = config.crossover.slowMA; i < candles.length - hold; i++) {
    const signal = getCrossoverSignal(candles, i)
    if (signal.action !== 'BUY' && signal.action !== 'SELL') continue
    totalSetups++
    const risk = checkRisk(signal)
    if (!risk.approved) continue

    const entry = candles[i].close
    const exit = candles[i + hold].close
    const dir = signal.action === 'BUY' ? 1 : -1
    const pnlPercent = ((exit - entry) / entry) * 100 * dir - config.feePercent * 2
    const trade: ReplayTrade = {
      index: i, time: candles[i].closeTime, action: signal.action, entryPrice: entry, exitPrice: exit, exitTime: candles[i + hold].closeTime,
      exitReason: 'hold-period', pnlPercent, pnlUsd: (pnlPercent / 100) * risk.quantity * entry, rMultiple: null,
      outcome: pnlPercent > 0.001 ? 'WIN' : pnlPercent < -0.001 ? 'LOSS' : 'FLAT', setupKey: signal.setupKey, session: null,
    }

    if (opts.useMemory) {
      const verdict = consultMemory(signal)
      if (!verdict.noEvidence) sawEvidence = true
      if (verdict.block) {
        skipped++
        trades.push({ ...trade, blockedByMemory: true, blockReason: verdict.reason })
        appendLedgerRow({ timestamp: new Date(trade.time).toISOString(), symbol: config.symbol, action: 'SKIP', price: entry, quantity: 0, reason: `${signal.setupKey} — ${verdict.reason}`, mode, outcome: 'SKIPPED', pnl: 0 })
        continue
      }
    }
    trades.push(trade)
    if (opts.writeMemory) ledgerRowFor(trade, mode)
  }

  const summary = summarise(trades, totalSetups, skipped)
  if (opts.writeMemory && !opts.useMemory) recordLessons(trades, notes)
  if (opts.useMemory && !sawEvidence) notes.push('Memory had nothing to say about any of these signals, so this run is identical to the raw one. Run `npm run replay:raw` first.')
  if (!summary.enoughData) notes.push(`Only ${totalSetups} signal(s) in this window — treat the numbers as a demonstration, not evidence.`)

  return {
    strategy: 'crossover',
    trades,
    summary,
    breakdowns: [breakdown('By direction', trades, (t) => (t.action === 'BUY' ? 'Longs' : 'Shorts')), breakdown('By weekday', trades, (t) => toET(t.time).weekdayName)],
    candlesUsed: candles.length,
    days: Math.round((candles[candles.length - 1].closeTime - candles[0].openTime) / 86_400_000),
    from: candles[0].openTime,
    to: candles[candles.length - 1].closeTime,
    notes,
  }
}

export async function runReplay(opts: Options): Promise<ReplayResult> {
  return config.strategy === 'ict' ? runIctReplay(opts) : runCrossoverReplay(opts)
}

/** What the refused trades WOULD have done — the honest scoreboard for memory. */
export function scoreSkippedTrades(result: ReplayResult): { count: number; avoidedLoss: number; missedProfit: number; netUsd: number } {
  const blocked = result.trades.filter((t) => t.blockedByMemory)
  const losses = blocked.filter((t) => t.pnlUsd < 0).reduce((s, t) => s + t.pnlUsd, 0)
  const profits = blocked.filter((t) => t.pnlUsd > 0).reduce((s, t) => s + t.pnlUsd, 0)
  return { count: blocked.length, avoidedLoss: Math.abs(losses), missedProfit: profits, netUsd: -(losses + profits) }
}
