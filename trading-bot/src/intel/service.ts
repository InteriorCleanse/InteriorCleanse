/**
 * The intelligence service (Phase 22) — assembles the read-only payloads the
 * API and the UI consume, from engine output the caller supplies.
 *
 * It takes engine state as PARAMETERS rather than importing the engine, which
 * keeps the dependency arrow one-way: `src/intel/*` depends on engine *types*,
 * never on engine behaviour, and no engine module imports anything here. That is
 * what makes "this layer cannot change a decision" a structural fact rather than
 * a promise.
 *
 * The only state it holds is the previous annotation frame, kept in memory so
 * "what changed?" and the alert centre can diff against it. That cache affects
 * nothing but the deltas it produces.
 */

import type { Candle, IctAnalysis, NewsReport } from '../types.ts'
import type { StrategyVote, StrategyMeta } from '../strategies/types.ts'
import type { FusedDecision } from '../fusion.ts'
import type { RiskVerdict } from '../riskEngine.ts'
import { annotate } from './annotate.ts'
import type { EngineView } from './annotate.ts'
import { sortAnnotations, dedupeAnnotations } from './types.ts'
import type { ChartAnnotation } from './types.ts'
import { annotateHigherTimeframes, timeframeReport, splitByBand } from './mtf.ts'
import { strategyLayers, agreement, confluenceChain } from './confluence.ts'
import { whyTrade, whyNot, tradeStages } from './tradeIntel.ts'
import { diffFrames, describeDelta } from './delta.ts'
import type { FrameDelta } from './delta.ts'
import { timelineFromAnnotations, withEngineEvents } from './timeline.ts'
import { alertsFromDelta, riskVetoAlert, regimeChangeAlert, dataQualityAlert, recentAlerts } from './alerts.ts'
import type { AlertEvent } from './alerts.ts'
import { generatePine } from './pine.ts'
import type { PineExport } from './pine.ts'
import { deterministicExplanation } from './explain.ts'
import type { ExplainContext, ExplainTopic } from './explain.ts'
import { intelEnabled, intelLimits } from './flags.ts'

/** Everything the service needs, all of it already computed by the engine. */
export type IntelSnapshot = {
  symbol: string
  timeframe: string
  engineVersion: string
  candles: Candle[]
  analysis: IctAnalysis | null
  votes: StrategyVote[]
  decision: FusedDecision | null
  news: NewsReport | null
  risk: RiskVerdict | null
  metaById: Map<string, StrategyMeta>
  trades: Array<{
    id: string; openedAt: number; filledAt?: number; closedAt?: number; setupKey: string
    direction: 'long' | 'short'; intendedEntry: number; entry: number; stop: number; target: number
    quantity: number; riskUsd: number; status: string; exitReason?: string; exit?: number
    rMultiple?: number; candlesHeld?: number; note?: string
  }>
  now?: number
}

function viewOf(s: IntelSnapshot): EngineView {
  return {
    symbol: s.symbol, timeframe: s.timeframe, engineVersion: s.engineVersion,
    analysis: s.analysis, candles: s.candles, votes: s.votes, decision: s.decision, news: s.news,
    trades: s.trades, now: s.now,
  }
}

/** Order-flow availability, read straight off the feature snapshot. */
function orderFlow(s: IntelSnapshot): { available: boolean; note: string } {
  const flow = s.analysis?.features?.flow
  const trusted = flow?.stream?.trusted === true
  const cvd = flow?.cvd
  return {
    available: trusted && !!cvd?.available,
    note: trusted ? (cvd?.note ?? 'the tape is trusted') : 'the trade stream is not trusted right now, so order flow is unavailable (it is never estimated from candles)',
  }
}

// ---------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------

export type IntelAnnotationsPayload = {
  symbol: string
  timeframe: string
  generatedAt: number
  count: number
  truncated: boolean
  annotations: ChartAnnotation[]
  bands: { htfContext: ChartAnnotation[]; execution: ChartAnnotation[] }
  timeframes: ReturnType<typeof timeframeReport>
  layers: string[]
  note: string
}

/**
 * The full annotation set: execution-timeframe marks from the engine's current
 * analysis, plus higher-timeframe context when that flag is on and the candles
 * actually support it.
 */
export function intelAnnotations(s: IntelSnapshot): IntelAnnotationsPayload {
  const now = s.now ?? Date.now()
  const limits = intelLimits()
  const execution = intelEnabled('chartMarkup') ? annotate(viewOf(s)) : []
  const htf = intelEnabled('mtfMarkup') && s.analysis
    ? annotateHigherTimeframes({
        symbol: s.symbol, executionTimeframe: s.timeframe, engineVersion: s.engineVersion,
        candles: s.candles, asOf: s.analysis.time,
        regime: s.analysis.features?.regime?.value?.state ?? null, now,
      })
    : []
  const all = sortAnnotations(dedupeAnnotations([...execution, ...htf]))
  const truncated = all.length > limits.maxAnnotations
  const annotations = truncated ? all.slice(-limits.maxAnnotations) : all
  return {
    symbol: s.symbol,
    timeframe: s.timeframe,
    generatedAt: now,
    count: annotations.length,
    truncated,
    annotations,
    bands: splitByBand(annotations, s.timeframe),
    timeframes: timeframeReport(s.candles, s.timeframe),
    layers: [...new Set(annotations.map((a) => a.layer))].sort(),
    note: 'Every mark is derived from engine state that already exists. Nothing here trades, and nothing is invented: an unavailable value is reported as UNAVAILABLE.',
  }
}

// ---------------------------------------------------------------
// Trade intelligence
// ---------------------------------------------------------------

export function intelTrade(s: IntelSnapshot) {
  const of = orderFlow(s)
  // The vote that owns the current decision, when there is one.
  const dir = s.decision?.direction ?? null
  const actionable = s.votes.filter((v) => v.action !== 'HOLD')
  const primaryVote = (dir ? actionable.find((v) => v.direction === dir) : null)
    ?? actionable.slice().sort((a, b) => b.confidence - a.confidence)[0]
    ?? null

  // A required feature that was not available, stated only when a strategy needed it.
  const unavailable: string[] = []
  for (const v of s.votes) {
    if (s.metaById.get(v.id)?.needsTape && !of.available) {
      unavailable.push(`${v.id} needs the live trade tape, which is unavailable: ${of.note}.`)
    }
  }

  const why = whyTrade({ vote: primaryVote, decision: s.decision, risk: s.risk })
  const not = whyNot({ vote: primaryVote, votes: s.votes, decision: s.decision, risk: s.risk, unavailableFeatures: unavailable })

  return {
    symbol: s.symbol,
    timeframe: s.timeframe,
    generatedAt: s.now ?? Date.now(),
    whyTrade: why,
    whyNot: not,
    strategies: strategyLayers(s.votes, s.metaById),
    agreement: agreement(s.votes, s.decision),
    confluence: confluenceChain({
      votes: s.votes, decision: s.decision, metaById: s.metaById,
      orderFlowAvailable: of.available, orderFlowNote: of.note,
    }),
    risk: s.risk ? { approved: s.risk.approved, vetoedBy: s.risk.vetoedBy, reason: s.risk.reason, checks: s.risk.checks } : null,
    note: 'Every reason above was recorded by the engine. The intelligence layer explains the decision; it never makes one.',
  }
}

/** The staged visual replay of one paper trade, for the journal. */
export function intelTradeStages(s: IntelSnapshot, tradeId: string) {
  const t = s.trades.find((x) => x.id === tradeId)
  if (!t) return null
  return { tradeId, paper: true, stages: tradeStages(t), note: 'This is a PAPER trade. No money moved at any stage.' }
}

// ---------------------------------------------------------------
// Timeline, deltas and alerts
// ---------------------------------------------------------------

/** The previous frame per symbol+timeframe, so deltas and alerts have something to diff. */
const lastFrame = new Map<string, { annotations: ChartAnnotation[]; time: number }>()
/** A bounded alert log, newest appended. In memory only; it drives no behaviour. */
const alertLog = new Map<string, AlertEvent[]>()

function frameKey(s: IntelSnapshot): string { return `${s.symbol}|${s.timeframe}` }

/** Reset the caches. Tests call this so one case cannot leak into the next. */
export function resetIntelCaches(): void { lastFrame.clear(); alertLog.clear() }

export function intelTimeline(s: IntelSnapshot) {
  const p = intelAnnotations(s)
  const base = timelineFromAnnotations(p.annotations)
  const events = withEngineEvents(base, {
    risk: s.risk && s.analysis ? { at: s.analysis.time, approved: s.risk.approved, vetoedBy: s.risk.vetoedBy, reason: s.risk.reason } : null,
    trades: s.trades.map((t) => ({ id: t.id, openedAt: t.openedAt, closedAt: t.closedAt, exitReason: t.exitReason, rMultiple: t.rMultiple, direction: t.direction, entry: t.entry })),
  })
  return { symbol: s.symbol, timeframe: s.timeframe, generatedAt: s.now ?? Date.now(), events, count: events.length }
}

/**
 * What changed since the previous frame, and the alerts that change implies.
 * Updates the frame cache as a side effect — deliberately, because "since last
 * time" needs a last time. Nothing else in the system reads this cache.
 */
export function intelChanges(s: IntelSnapshot): { delta: FrameDelta; lines: string[]; alerts: AlertEvent[] } {
  const key = frameKey(s)
  const p = intelAnnotations(s)
  const prev = lastFrame.get(key) ?? null
  const at = s.analysis?.time ?? (s.now ?? Date.now())
  const delta = diffFrames(prev?.annotations ?? null, p.annotations, at, prev?.time ?? null)
  lastFrame.set(key, { annotations: p.annotations, time: at })

  let alerts: AlertEvent[] = []
  if (intelEnabled('alertCenter')) {
    alerts = alertsFromDelta(delta, { symbol: s.symbol, timeframe: s.timeframe })
    if (s.risk && !s.risk.approved && s.risk.vetoedBy) {
      alerts.push(riskVetoAlert({ at, symbol: s.symbol, timeframe: s.timeframe, vetoedBy: s.risk.vetoedBy, reason: s.risk.reason }))
    }
    const of = orderFlow(s)
    if (!of.available) alerts.push(dataQualityAlert({ at, symbol: s.symbol, timeframe: s.timeframe, detail: `Order flow unavailable: ${of.note}.` }))
    const regimeNow = s.analysis?.features?.regime?.value?.state ?? null
    const regimeBefore = prev?.annotations.find((a) => a.annotationType === 'trend-regime' || a.annotationType === 'range-regime')?.strategyState ?? null
    const rc = regimeChangeAlert({ at, symbol: s.symbol, timeframe: s.timeframe, from: regimeBefore, to: regimeNow, reason: s.analysis?.features?.regime?.value?.reasons?.join(' ') ?? 'The regime reading changed.' })
    if (rc && prev) alerts.push(rc)

    const log = alertLog.get(key) ?? []
    alertLog.set(key, [...log, ...alerts].slice(-500))
  }
  return { delta, lines: describeDelta(delta), alerts }
}

/** The alert centre's list. Reading it also refreshes it from the current frame. */
export function intelAlerts(s: IntelSnapshot): { alerts: AlertEvent[]; count: number; note: string } {
  intelChanges(s)
  const log = alertLog.get(frameKey(s)) ?? []
  return {
    alerts: recentAlerts(log),
    count: log.length,
    note: 'Alerts are derived from real changes in engine state. Nothing here can place, size or approve an order.',
  }
}

// ---------------------------------------------------------------
// TradingView export
// ---------------------------------------------------------------

export function intelPine(s: IntelSnapshot): PineExport {
  const p = intelAnnotations(s)
  return generatePine(p.annotations, {
    symbol: s.symbol,
    timeframe: s.timeframe,
    engineVersion: s.engineVersion,
    generatedAt: s.now ?? Date.now(),
    maxDrawings: intelLimits().maxPineDrawings,
  })
}

// ---------------------------------------------------------------
// Explanation context
// ---------------------------------------------------------------

/**
 * Build the context an explanation is allowed to use. Only annotations in this
 * context may be cited, and `engineDecision` is the line the answer may not
 * contradict.
 */
export function intelExplainContext(s: IntelSnapshot, topic: ExplainTopic, annotationId?: string): ExplainContext {
  const p = intelAnnotations(s)
  const t = intelTrade(s)
  const a = s.analysis

  let pool = p.annotations
  if (topic === 'explain-annotation' && annotationId) pool = pool.filter((x) => x.id === annotationId)
  else if (topic === 'active-liquidity') pool = pool.filter((x) => x.layer === 'liquidity' && x.lifecycleStatus === 'ACTIVE')
  else if (topic === 'current-structure') pool = pool.filter((x) => x.layer === 'structure')
  else if (topic === 'current-risk') pool = pool.filter((x) => x.layer === 'trade')
  pool = pool.slice(-40)

  const facts: string[] = []
  if (a) {
    facts.push(`Price $${a.price.toFixed(2)} at ${new Date(a.time).toISOString()}, session ${a.session ?? 'none'}, killzone ${a.inKillzone ? 'open' : 'closed'}.`)
    facts.push(`Bias: ${a.bias.direction} — ${a.bias.reason}`)
    if (a.features?.regime?.value) facts.push(`Regime: ${a.features.regime.value.state} (${a.features.regime.value.confidence}/100 of direction inputs agree).`)
  }
  if (s.risk) facts.push(`Risk engine: ${s.risk.approved ? 'approved' : `vetoed by ${s.risk.vetoedBy}`} — ${s.risk.reason}`)
  if (topic === 'who-agrees' || topic === 'who-disagrees') facts.push(t.agreement.note)
  if (topic === 'what-changed') for (const l of intelChanges(s).lines.slice(0, 15)) facts.push(l)

  const engineDecision = s.decision ? `${s.decision.action}${s.decision.direction ? ` (${s.decision.direction})` : ''}` : (a?.signal.action ?? 'NO TRADE')

  return {
    topic,
    symbol: s.symbol,
    timeframe: s.timeframe,
    engineDecision,
    annotations: pool.map((x) => ({
      id: x.id, annotationType: x.annotationType, timeframe: x.timeframe, price: x.price,
      priceHigh: x.priceHigh, priceLow: x.priceLow, lifecycleStatus: x.lifecycleStatus,
      dataQuality: x.dataQuality, rationale: x.rationale, strategyIds: x.strategyIds, eventTime: x.eventTime,
    })),
    facts,
    whyTrade: topic === 'why-this-trade' ? t.whyTrade : null,
    whyNot: topic === 'why-not-this-setup' ? t.whyNot : null,
  }
}

/** The offline answer — always available, always correct, because it only restates facts. */
export function intelExplainOffline(s: IntelSnapshot, topic: ExplainTopic, annotationId?: string): { text: string; source: 'deterministic' } {
  return { text: deterministicExplanation(intelExplainContext(s, topic, annotationId)), source: 'deterministic' }
}
