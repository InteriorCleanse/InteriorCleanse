/**
 * One scan: look at the market right now, decide, explain, stop.
 * Also the shared "what does the bot think" analysis used by the brief,
 * the chat, and the dashboard.
 */

import { config } from '../config.ts'
import { INTERVAL_MS } from './market.ts'
import { getCandles } from './data/candleStore.ts'
import { IctEngine } from './ictStrategy.ts'
import { getCrossoverSignal } from './strategy.ts'
import { checkRisk } from './risk.ts'
import { simulatePaperOrder, describeOrder } from './execution.ts'
import { consultMemory } from './adaptiveFilter.ts'
import { appendLedgerRow, memoryIsEmpty, readLedger } from './memory.ts'
import { getNews } from './news.ts'
import { getFlow } from './orderflow.ts'
import { assessMarket } from './regime.ts'
import { contextFor, voteAll } from './strategies/registry.ts'
import type { StrategyVote } from './strategies/types.ts'
import { planFor } from './plan.ts'
import { tradingDayKey } from './sessions.ts'
import { todaysPaperStats } from './paperTrader.ts'
import type { Candle, FlowReport, IctAnalysis, MarketState, NewsReport, PaperOrder, RiskDecision, Signal } from './types.ts'
import type { MemoryVerdict } from './adaptiveFilter.ts'
import type { DayPlan } from './plan.ts'

export type Snapshot = {
  candles: Candle[]
  analysis: IctAnalysis | null
  signal: Signal
  news: NewsReport | null
  plan: DayPlan | null
  /** The engine that produced the analysis, so the dashboard can draw every day it saw. */
  engine: IctEngine | null
  /** The order book and the tape, when they could be read. */
  flow: FlowReport | null
  /** Trend, strength, continuation, and what to watch out for. */
  state: MarketState | null
  /** Every enabled strategy's vote for the latest candle. The session model is the only one that trades. */
  strategyVotes: StrategyVote[]
}

/** How many candles the ICT model needs to have yesterday's range and a full Asia session. */
function warmupCandles(): number {
  const perDay = Math.round(86_400_000 / (INTERVAL_MS[config.interval] ?? 300_000))
  return Math.min(4000, perDay * 4)
}

/** Today's trade count and losses — paper positions plus manual scans — so daily limits survive restarts. */
function todaysStats(dayKey: string): { trades: number; lossesR: number } {
  const paper = todaysPaperStats(dayKey)
  const rows = readLedger().filter((r) => r.mode.startsWith('scan') && (r.action === 'BUY' || r.action === 'SELL'))
  const scans = rows.filter((r) => tradingDayKey(new Date(r.timestamp).getTime()) === dayKey).length
  return { trades: paper.trades + scans, lossesR: paper.lossesR }
}

/** Fetch data, run the engine, read news and plan. No side effects — safe to call as often as you like. */
export async function analyzeNow(opts: { withNews?: boolean; withFlow?: boolean } = {}): Promise<Snapshot> {
  const withNews = opts.withNews ?? true
  const withFlow = opts.withFlow ?? config.orderflow.enabled

  if (config.strategy === 'crossover') {
    const needed = Math.max(config.crossover.slowMA + 5, 60)
    const candles = await getCandles(config.symbol, config.interval, needed)
    return { candles, analysis: null, signal: getCrossoverSignal(candles, candles.length - 1), news: null, plan: null, engine: null, flow: null, state: null, strategyVotes: [] }
  }

  const [candles, news, flow] = await Promise.all([
    getCandles(config.symbol, config.interval, warmupCandles()),
    withNews ? getNews().catch(() => null) : Promise.resolve(null),
    withFlow ? getFlow().catch(() => null) : Promise.resolve(null),
  ])
  const engine = new IctEngine(candles)
  engine.news = news
  let analysis: IctAnalysis | null = null
  for (let i = 0; i < candles.length; i++) {
    if (i === candles.length - 1) {
      const dayKey = tradingDayKey(candles[i].openTime)
      engine.plan = planFor(dayKey)
      engine.setDayStats(dayKey, todaysStats(dayKey))
    }
    analysis = engine.step(i)
  }
  const state = assessMarket(candles, analysis, flow, news)
  const strategyVotes = analysis ? voteAll(contextFor(analysis, candles)) : []
  return { candles, analysis, signal: analysis!.signal, news, plan: engine.plan, engine, flow, state, strategyVotes }
}

export type ScanResult = Snapshot & {
  risk: RiskDecision
  memory: MemoryVerdict | null
  order: PaperOrder | null
  finalAction: string
  finalReason: string
}

/** A scan is an analysis that is allowed to act — and to write to the ledger. */
export async function runScan(useMemory: boolean): Promise<ScanResult> {
  const snap = await analyzeNow()
  const { signal } = snap
  const risk = checkRisk(signal)

  let memory: MemoryVerdict | null = null
  let finalAction: string = risk.finalAction
  let finalReason = risk.approved ? signal.reason : risk.reason
  let order: PaperOrder | null = null

  if (risk.approved && useMemory && !memoryIsEmpty()) {
    memory = consultMemory(signal)
    if (memory.block) {
      finalAction = 'SKIP'
      finalReason = memory.reason
    }
  }

  if (finalAction === 'BUY' || finalAction === 'SELL') {
    order = simulatePaperOrder(signal, risk)
    finalReason = describeOrder(order)
  }

  // A live scan can't know yet whether it was right — only time tells, and we won't guess.
  if (finalAction !== 'HOLD') {
    appendLedgerRow({
      timestamp: new Date().toISOString(),
      symbol: config.symbol,
      action: finalAction,
      price: signal.price,
      quantity: risk.quantity,
      reason: `${signal.setupKey} — ${finalReason}`,
      mode: useMemory ? 'scan-memory' : 'scan',
      outcome: finalAction === 'SKIP' ? 'SKIPPED' : 'PENDING',
      pnl: 0,
    })
  }

  return { ...snap, risk, memory, order, finalAction, finalReason }
}
