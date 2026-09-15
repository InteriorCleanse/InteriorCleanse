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
 * Orders fill the way the simulator in sim/fills.ts says they would:
 * the entry at the NEXT candle's open plus spread and slippage, stops a
 * little worse than the stop price, targets only when price trades
 * through them, fees on both sides. When a candle hits both the stop
 * and the target, the stop wins. A setup whose next candle opens too far
 * from the intended price is counted as MISSED, not chased.
 *
 * `fillModel: 'ideal'` reproduces the old optimistic model (fill at the
 * signal close, exits at exact prices) so the two can be compared.
 */

import { config } from '../config.ts'
import { INTERVAL_MS } from './market.ts'
import { getCandles, getCandlesSince } from './data/candleStore.ts'
import { IctEngine } from './ictStrategy.ts'
import { getCrossoverSignal } from './strategy.ts'
import { checkRisk, sizeForStop } from './risk.ts'
import { consultMemory, describeKey } from './adaptiveFilter.ts'
import { addLesson, appendLedgerRow } from './memory.ts'
import { toET } from './sessions.ts'
import { contextFor, enabledStrategies, getStrategy, strategyIds } from './strategies/registry.ts'
import type { StrategyVote } from './strategies/types.ts'
import { defaultAssumptions, IDEAL_ASSUMPTIONS, simulateEntry, exitOnCandle, simulateExit } from './sim/fills.ts'
import type { ExecutionAssumptions, EntryFill, Intent } from './sim/fills.ts'
import { tradeMetrics } from './sim/trades.ts'
import type { Breakdown, Candle, ReplaySummary, ReplayTrade, Signal, TradePlan } from './types.ts'

export type FillModel = 'realistic' | 'ideal'

export type ReplayResult = {
  strategy: string
  fillModel: FillModel
  assumptions: ExecutionAssumptions
  trades: ReplayTrade[]
  summary: ReplaySummary
  breakdowns: Breakdown[]
  candlesUsed: number
  days: number
  from: number
  to: number
  notes: string[]
}

type Options = { useMemory: boolean; writeMemory: boolean; fillModel?: FillModel }

function assumptionsFor(model: FillModel): ExecutionAssumptions {
  return model === 'ideal' ? IDEAL_ASSUMPTIONS : defaultAssumptions()
}

// ---------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------

function summarise(trades: ReplayTrade[], totalSetups: number, skipped: number, missed: number): ReplaySummary {
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
    missed,
    costsUsd: taken.reduce((s, t) => s + t.costsUsd, 0),
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

/** A signal waiting for its entry candle, or an entered trade waiting for its exit. */
type OpenTrade = {
  signalIndex: number
  signal: Signal
  plan: TradePlan
  intent: Intent
  session: ReplayTrade['session']
  fill?: EntryFill
  quantity: number
  held: number
}

function finishTrade(open: OpenTrade, exit: { price: number; time: number; reason: ReplayTrade['exitReason'] }, candles: Candle[], a: ExecutionAssumptions): ReplayTrade {
  const fill = open.fill!
  const m = tradeMetrics({ direction: open.plan.direction, fill: fill.price, stop: open.plan.stop, exit: exit.price, exitReason: exit.reason === 'hold-period' ? 'time' : exit.reason, quantity: open.quantity }, a)
  const slippageUsd = fill.costPerUnit * open.quantity + (exit.reason === 'stop' || exit.reason === 'time' ? Math.abs(exit.price - (exit.reason === 'stop' ? open.plan.stop : exit.price)) * open.quantity : 0)
  return {
    index: open.signalIndex,
    time: candles[open.signalIndex].closeTime,
    action: open.plan.direction === 'long' ? 'BUY' : 'SELL',
    intendedEntry: open.intent.intendedEntry,
    entryPrice: fill.price,
    entryTime: fill.time,
    exitPrice: exit.price,
    exitTime: exit.time,
    exitReason: exit.reason,
    costsUsd: m.feesUsd + slippageUsd,
    pnlPercent: m.pnlPercent,
    pnlUsd: m.pnlUsd,
    rMultiple: m.rMultiple,
    outcome: m.outcome,
    setupKey: open.signal.setupKey,
    session: open.session,
    quality: open.signal.quality,
    plan: open.plan,
  }
}

/** Given a trade and candle `i`: fill it if it is the entry candle, else see whether the trade ends here. */
function step(open: OpenTrade, candles: Candle[], i: number, a: ExecutionAssumptions): { done: ReplayTrade } | { missed: string } | null {
  if (!open.fill) {
    if (i < open.signalIndex + a.latencyCandles) return null
    const entry = simulateEntry(open.intent, candles, open.signalIndex, a)
    if (!entry.filled) return { missed: entry.detail }
    open.fill = entry.fill
    // Size from the fill, and refuse if the drift ate the reward-to-risk.
    const sized = sizeForStop(entry.fill.price, open.plan.stop)
    const risk = checkRisk(open.signal, { entry: entry.fill.price })
    if (!risk.approved) return { missed: `Filled at $${entry.fill.price.toFixed(2)} but the risk check refused it: ${risk.reason}` }
    open.quantity = sized.quantity
  }
  open.held++
  const e = exitOnCandle(open.intent, candles[i], open.held, a)
  return e ? { done: finishTrade(open, e, candles, a) } : null
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
  const fillModel: FillModel = opts.fillModel ?? 'realistic'
  const a = assumptionsFor(fillModel)
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
  let missed = 0
  let open: OpenTrade | null = null
  let sawEvidence = false
  const mode = opts.useMemory ? 'replay-memory' : 'replay-raw'

  for (let i = 0; i < candles.length; i++) {
    const analysis = engine.step(i)

    if (open) {
      const r = step(open, candles, i, a)
      if (r && 'done' in r) {
        trades.push(r.done)
        engine.recordTrade(analysis.dayKey, r.done.rMultiple)
        if (opts.writeMemory) ledgerRowFor(r.done, mode)
        open = null
      } else if (r && 'missed' in r) {
        missed++
        open = null
      }
      continue
    }
    if (candles[i].openTime < testFrom) continue // warm-up only

    const signal = analysis.signal
    if (signal.action !== 'BUY' && signal.action !== 'SELL' || !signal.plan) continue
    totalSetups++
    const risk = checkRisk(signal)
    if (!risk.approved) continue
    const intent: Intent = { direction: signal.plan.direction, intendedEntry: signal.plan.entry, stop: signal.plan.stop, target: signal.plan.takeProfit, atr: analysis.atr }

    if (opts.useMemory) {
      const verdict = consultMemory(signal)
      if (!verdict.noEvidence) sawEvidence = true
      if (verdict.block) {
        skipped++
        // Still measure what WOULD have happened, so we can score the refusal honestly.
        const entry = simulateEntry(intent, candles, i, a)
        if (entry.filled) {
          const exit = simulateExit(intent, entry.fill, candles, a)
          if (exit) {
            const ghost: OpenTrade = { signalIndex: i, signal, plan: signal.plan, intent, session: analysis.session, fill: entry.fill, quantity: sizeForStop(entry.fill.price, signal.plan.stop).quantity, held: exit.candlesHeld }
            trades.push({ ...finishTrade(ghost, exit, candles, a), blockedByMemory: true, blockReason: verdict.reason })
          }
        }
        appendLedgerRow({
          timestamp: new Date(candles[i].closeTime).toISOString(), symbol: config.symbol, action: 'SKIP', price: signal.price, quantity: 0,
          reason: `${signal.setupKey} — ${verdict.reason}`, mode, outcome: 'SKIPPED', pnl: 0,
        })
        continue
      }
    }
    open = { signalIndex: i, signal, plan: signal.plan, intent, session: analysis.session, quantity: risk.quantity, held: 0 }
    if (a.latencyCandles <= 0) {
      // The idealised model fills on the signal candle itself; nothing else happens on that candle.
      open.fill = { price: signal.plan.entry, time: candles[i].closeTime, index: i, costPerUnit: 0 }
    }
  }
  if (open) notes.push(open.fill ? 'One trade was still open when the data ran out; it is not counted.' : 'One setup was still waiting for its entry candle when the data ran out; it is not counted.')

  const summary = summarise(trades, totalSetups, skipped, missed)
  if (opts.writeMemory && !opts.useMemory) recordLessons(trades, notes)
  if (opts.useMemory && !sawEvidence) notes.push('Memory had nothing to say about any of these setups, so this run is identical to the raw one. That is correct behaviour — run `npm run replay:raw` first to record real outcomes.')
  if (opts.useMemory && skipped > 0) notes.push(`Memory refused ${skipped} trade(s) the raw strategy would have taken. Each refusal is in data/ledger.csv with its reason.`)
  if (!summary.enoughData) notes.push(`Only ${totalSetups} setup(s) in ${config.replay.lookbackDays} days — fewer than the ${config.replay.minSetupsForConfidence} I'd want before trusting any number here. This model is picky by design; raise lookbackDays in config.ts for a bigger sample.`)
  if (fillModel === 'realistic') {
    notes.push(`Fills are simulated honestly: entry at the next candle's open plus ${a.spreadBps / 2 + a.slippageBps} bp, stops ${a.spreadBps / 2 + a.slippageBps} bp worse than the stop, targets only when price trades ${a.targetTouchBps} bp through them, ${a.takerFeePercent}% taker / ${a.makerFeePercent}% maker fees. Costs came to $${summary.costsUsd.toFixed(3)} across ${summary.taken} trade(s).`)
    if (missed > 0) notes.push(`${missed} setup(s) were missed because the next candle opened more than ${a.maxEntryDriftAtr} ATR from the intended entry. Not chasing is part of the model.`)
  } else {
    notes.push('IDEAL fill model: entries at the signal close, exits at exact prices, no spread or slippage. This is the old optimistic model, shown for comparison only.')
  }
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
    fillModel,
    assumptions: a,
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
  const fillModel: FillModel = opts.fillModel ?? 'realistic'
  const a = assumptionsFor(fillModel)
  const lookback = Math.min(5000, config.replay.lookbackDays * Math.round(86_400_000 / (INTERVAL_MS[config.interval] ?? 300_000)))
  const candles = await getCandles(config.symbol, config.interval, lookback)
  const trades: ReplayTrade[] = []
  const notes: string[] = []
  let totalSetups = 0
  let skipped = 0
  let sawEvidence = false
  const mode = opts.useMemory ? 'replay-memory' : 'replay-raw'
  const hold = config.crossover.holdCandles
  const lag = Math.max(0, a.latencyCandles)

  for (let i = config.crossover.slowMA; i < candles.length - hold - lag; i++) {
    const signal = getCrossoverSignal(candles, i)
    if (signal.action !== 'BUY' && signal.action !== 'SELL') continue
    totalSetups++
    const risk = checkRisk(signal)
    if (!risk.approved) continue

    const dir = signal.action === 'BUY' ? 1 : -1
    const entryCandle = candles[i + lag]
    const cost = (p: number) => p * (a.spreadBps / 2 + a.slippageBps) / 10_000
    const entry = lag > 0 ? entryCandle.open + dir * cost(entryCandle.open) : candles[i].close
    const exitCandle = candles[i + lag + hold]
    const exit = lag > 0 ? exitCandle.close - dir * cost(exitCandle.close) : exitCandle.close
    const feePct = a.takerFeePercent * 2
    const pnlPercent = ((exit - entry) / entry) * 100 * dir - feePct
    const notional = risk.quantity * entry
    const trade: ReplayTrade = {
      index: i, time: candles[i].closeTime, action: signal.action, intendedEntry: candles[i].close, entryPrice: entry, entryTime: entryCandle.openTime, exitPrice: exit, exitTime: exitCandle.closeTime,
      exitReason: 'hold-period', costsUsd: (feePct / 100) * notional + (lag > 0 ? (cost(entryCandle.open) + cost(exitCandle.close)) * risk.quantity : 0),
      pnlPercent, pnlUsd: (pnlPercent / 100) * notional, rMultiple: null,
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

  const summary = summarise(trades, totalSetups, skipped, 0)
  if (opts.writeMemory && !opts.useMemory) recordLessons(trades, notes)
  if (opts.useMemory && !sawEvidence) notes.push('Memory had nothing to say about any of these signals, so this run is identical to the raw one. Run `npm run replay:raw` first.')
  if (!summary.enoughData) notes.push(`Only ${totalSetups} signal(s) in this window — treat the numbers as a demonstration, not evidence.`)
  notes.push(fillModel === 'realistic' ? 'Fills simulated: entry at the next candle open and exit at the close after the hold, each with spread and slippage; taker fees both sides.' : 'IDEAL fill model, for comparison only.')

  return {
    strategy: 'crossover',
    fillModel,
    assumptions: a,
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

// ---------------------------------------------------------------
// Per-strategy replay (Phase 10): any one strategy, on its own
// ---------------------------------------------------------------

function voteToSignal(vote: StrategyVote, candle: Candle): Signal {
  return { action: vote.action, reason: vote.reason, price: candle.close, time: candle.closeTime, setupKey: vote.setupKey, evidence: vote.evidence, plan: vote.plan, quality: vote.confidence }
}

/**
 * Replay one named strategy over the look-back window. The session model and
 * the crossover keep their own dedicated replays (so their numbers are
 * unchanged); every other strategy is walked here, reading the same feature
 * snapshots the app produces and filling through the same honest simulator.
 */
export async function runStrategyReplay(id: string, opts: Options): Promise<ReplayResult> {
  if (id === 'session-ifvg') return { ...(await runIctReplay(opts)), strategy: id }
  if (id === 'crossover') return { ...(await runCrossoverReplay(opts)), strategy: id }
  const strat = getStrategy(id)
  if (!strat) throw new Error(`Unknown strategy "${id}". Known: ${strategyIds().join(', ')}`)
  const a = assumptionsFor(opts.fillModel ?? 'realistic')
  const stepMs = INTERVAL_MS[config.interval] ?? 300_000
  const start = Date.now() - (config.replay.lookbackDays + 2) * 86_400_000
  const candles = await getCandlesSince(config.symbol, config.interval, start)
  const testFrom = Date.now() - config.replay.lookbackDays * 86_400_000
  const engine = new IctEngine(candles)
  const trades: ReplayTrade[] = []
  const notes: string[] = []
  let totalSetups = 0
  let missed = 0
  let open: OpenTrade | null = null
  const mode = 'replay-raw'

  for (let i = 0; i < candles.length; i++) {
    const analysis = engine.step(i)
    if (open) {
      const r = step(open, candles, i, a)
      if (r && 'done' in r) { trades.push(r.done); engine.recordTrade(analysis.dayKey, r.done.rMultiple); if (opts.writeMemory) ledgerRowFor(r.done, mode); open = null }
      else if (r && 'missed' in r) { missed++; open = null }
      continue
    }
    if (candles[i].openTime < testFrom) continue
    const vote = strat.evaluate(contextFor(analysis, candles))
    if ((vote.action !== 'BUY' && vote.action !== 'SELL') || !vote.plan) continue
    totalSetups++
    const signal = voteToSignal(vote, candles[i])
    const risk = checkRisk(signal)
    if (!risk.approved) continue
    const intent: Intent = { direction: vote.plan.direction, intendedEntry: vote.plan.entry, stop: vote.plan.stop, target: vote.plan.takeProfit, atr: analysis.atr }
    open = { signalIndex: i, signal, plan: vote.plan, intent, session: analysis.session, quantity: risk.quantity, held: 0 }
    if (a.latencyCandles <= 0) open.fill = { price: vote.plan.entry, time: candles[i].closeTime, index: i, costPerUnit: 0 }
  }
  if (open) notes.push('One trade was still open when the data ran out; it is not counted.')

  const summary = summarise(trades, totalSetups, missed ? totalSetups - trades.length - missed : 0, missed)
  notes.push(`Strategy "${strat.meta.name}" replayed on its own. It does not open real paper trades; only the ICT session model does.`)
  if (!summary.enoughData) notes.push(`Only ${totalSetups} setup(s) in ${config.replay.lookbackDays} days — too few to trust the numbers; this is a demonstration.`)
  notes.push(opts.fillModel === 'ideal' ? 'IDEAL fill model, for comparison only.' : `Fills simulated honestly (next-open entry + spread/slippage, honest stops/targets, fees). Costs $${summary.costsUsd.toFixed(3)} across ${summary.taken} trade(s).`)

  return {
    strategy: id,
    fillModel: opts.fillModel ?? 'realistic',
    assumptions: a,
    trades,
    summary,
    breakdowns: [breakdown('By direction', trades, (t) => (t.action === 'BUY' ? 'Longs' : 'Shorts')), breakdown('By exit', trades, (t) => t.exitReason), breakdown('By weekday', trades, (t) => toET(t.time).weekdayName)],
    candlesUsed: candles.length,
    days: candles.length ? Math.round((candles[candles.length - 1].closeTime - Math.max(testFrom, candles[0].openTime)) / 86_400_000) : 0,
    from: candles.length ? Math.max(testFrom, candles[0].openTime) : 0,
    to: candles.length ? candles[candles.length - 1].closeTime : 0,
    notes: notes.concat(stepMs > 900_000 ? ['Candles bigger than 15m blur most of these strategies — 5m is the intended setting.'] : []),
  }
}

export type StrategyComparisonRow = { id: string; name: string; family: string; summary: ReplaySummary }

/** Run every enabled strategy over the same window and return their summaries side by side. */
export async function compareStrategies(opts: Options): Promise<StrategyComparisonRow[]> {
  const rows: StrategyComparisonRow[] = []
  for (const s of enabledStrategies()) {
    const r = await runStrategyReplay(s.meta.id, opts)
    rows.push({ id: s.meta.id, name: s.meta.name, family: s.meta.family, summary: r.summary })
  }
  return rows
}

/** What the refused trades WOULD have done — the honest scoreboard for memory. */
export function scoreSkippedTrades(result: ReplayResult): { count: number; avoidedLoss: number; missedProfit: number; netUsd: number } {
  const blocked = result.trades.filter((t) => t.blockedByMemory)
  const losses = blocked.filter((t) => t.pnlUsd < 0).reduce((s, t) => s + t.pnlUsd, 0)
  const profits = blocked.filter((t) => t.pnlUsd > 0).reduce((s, t) => s + t.pnlUsd, 0)
  return { count: blocked.length, avoidedLoss: Math.abs(losses), missedProfit: profits, netUsd: -(losses + profits) }
}
