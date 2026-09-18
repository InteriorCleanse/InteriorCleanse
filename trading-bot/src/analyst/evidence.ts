/**
 * EVIDENCE — the assembler behind /api/evidence.
 *
 * Everything the Evidence tab shows is built here from three inputs the
 * server hands in: the closed paper positions, a cached backtest (replay
 * trades stored with their provenance), and a way to read candles. The
 * functions are pure over those inputs so the whole tab can be tested without
 * a server, and so the server route is a few lines of plumbing.
 *
 * Two rules the assembler enforces on the way through:
 *
 *   - The PAPER and BACKTEST datasets are built separately and never merged.
 *     The only place they meet is the comparison view, which prints both
 *     provenance labels on its header.
 *   - Zero paper trades is NOT ENOUGH DATA, stated in the payload, not a table
 *     of zeros. The backtest is allowed to populate immediately and is
 *     labelled SIMULATED wherever it appears.
 *
 * Refreshing the backtest cache runs a replay, which is slow. Like the
 * out-of-sample reference, it happens only on an explicit POST and the read
 * side only ever reads the store.
 */

import { config } from '../../config.ts'
import { store } from '../store.ts'
import { runStrategyReplay } from '../replay.ts'
import { defaultAssumptions } from '../sim/fills.ts'
import { whyTrade } from '../intel/tradeIntel.ts'
import type { WhyTrade, TradeStage } from '../intel/tradeIntel.ts'
import { tradeStages } from '../intel/tradeIntel.ts'
import { VERSION } from '../version.ts'
import { paperDataset, backtestDataset, withExcursions, fieldAvailability, tradesOf } from './records.ts'
import type { Dataset, EvidenceRecord, FieldAvailability } from './records.ts'
import { byDimension, crossTable, heatmap, cohort, sampleStatus, SAMPLE_BARS } from './cohorts.ts'
import type { Cohort, CohortDefinition, CohortDimension, DimensionTable, CrossTable, SampleStatus } from './cohorts.ts'
import { thesisFor, thesesFor } from './thesis.ts'
import type { Thesis } from './thesis.ts'
import { comparePaperToBacktest } from './compare.ts'
import type { PaperVsBacktest } from './compare.ts'
import { dataQualityReport } from './quality.ts'
import type { DataQualityReport } from './quality.ts'
import { narrateEvidence } from './narrate.ts'
import type { Narration } from './narrate.ts'
import type { PaperPosition, DecisionSnapshot } from '../paperTrader.ts'
import type { Candle, ReplayTrade } from '../types.ts'
import type { StrategyVote } from '../strategies/types.ts'
import type { FusedDecision } from '../fusion.ts'
import type { RiskVerdict } from '../riskEngine.ts'

// ---------------------------------------------------------------
// The cached backtest
// ---------------------------------------------------------------

export type BacktestCache = {
  strategyId: string
  symbol: string
  interval: string
  source: 'BACKTEST'
  dataType: 'SIMULATED'
  computedAt: number
  engineVersion: string
  window: { from: number; to: number } | null
  fillModel: string
  assumptions: { spreadBps: number; slippageBps: number; takerFeePercent: number }
  trades: ReplayTrade[]
  notes: string[]
}

function cacheKey(strategyId: string): string {
  return `evidence:backtest:${strategyId}:${config.symbol}:${config.interval}`
}

export function cachedBacktest(strategyId: string): BacktestCache | null {
  return store().getJson<BacktestCache>(cacheKey(strategyId))
}

/** Run the strategy replay and store its trades. Explicit and slow; the read side never calls this. */
export async function refreshBacktestCache(strategyId: string, now = Date.now()): Promise<BacktestCache> {
  const r = await runStrategyReplay(strategyId, { useMemory: false, writeMemory: false })
  const a = defaultAssumptions()
  const cache: BacktestCache = {
    strategyId, symbol: config.symbol, interval: config.interval, source: 'BACKTEST', dataType: 'SIMULATED',
    computedAt: now, engineVersion: VERSION,
    window: r.from && r.to ? { from: r.from, to: r.to } : null,
    fillModel: r.fillModel,
    assumptions: { spreadBps: a.spreadBps, slippageBps: a.slippageBps, takerFeePercent: a.takerFeePercent },
    trades: r.trades.filter((t) => !t.blockedByMemory),
    notes: r.notes,
  }
  store().setJson(cacheKey(strategyId), cache)
  return cache
}

/** The strategy the paper trader is actually running — the default subject of every view. */
export function tradingStrategyId(): string {
  return config.fusion.driveTrading ? 'fused' : config.strategy === 'crossover' ? 'crossover' : 'session-ifvg'
}

// ---------------------------------------------------------------
// Inputs and datasets
// ---------------------------------------------------------------

export type CandleReader = (symbol: string, interval: string, from: number, to: number) => Candle[]

export type EvidenceInputs = {
  closed: PaperPosition[]
  backtest: BacktestCache | null
  candlesBetween: CandleReader
  stepMs: number
  feed?: { ageSec: number | null; maxAgeSec: number } | null
  now?: number
}

export type Source = 'paper' | 'backtest'

export function datasetFor(input: EvidenceInputs, source: Source): Dataset {
  if (source === 'paper') return withExcursions(paperDataset(input.closed), input.candlesBetween)
  if (!input.backtest) return backtestDataset([], { symbol: config.symbol, interval: config.interval })
  return withExcursions(backtestDataset(input.backtest.trades, { symbol: input.backtest.symbol, interval: input.backtest.interval }), input.candlesBetween)
}

// ---------------------------------------------------------------
// Views
// ---------------------------------------------------------------

export type SourceSummary = {
  provenance: Dataset['provenance']
  trades: number
  /** NOT ENOUGH DATA at zero; otherwise the dataset description. */
  status: SampleStatus | 'NOT ENOUGH DATA'
  statusNote: string
  quality: DataQualityReport
  narration: Narration
  fields: FieldAvailability[]
}

export type Overview = {
  generatedAt: number
  engineVersion: string
  strategyId: string
  bars: typeof SAMPLE_BARS
  paper: SourceSummary
  backtest: SourceSummary & { cachedAt: number | null; stale: boolean | null; assumptions: BacktestCache['assumptions'] | null }
  comparison: PaperVsBacktest
  notes: string[]
}

const BACKTEST_STALE_MS = 7 * 86_400_000

function summarise(d: Dataset, input: EvidenceInputs): SourceSummary {
  const n = d.provenance.trades
  const cohorts = byDimension(d, 'session').rows
  const quality = dataQualityReport({
    dataset: d,
    candles: d.provenance.period ? input.candlesBetween(config.symbol, config.interval, d.provenance.period.from, d.provenance.period.to) : [],
    stepMs: input.stepMs,
    feed: d.provenance.source === 'PAPER' ? input.feed ?? null : null,
  })
  return {
    provenance: d.provenance,
    trades: n,
    status: n === 0 ? 'NOT ENOUGH DATA' : sampleStatus(n),
    statusNote: n === 0
      ? (d.provenance.source === 'PAPER' ? 'No paper trades have closed yet. Nothing is estimated; this fills in as the paper run trades.' : 'No backtest is cached. Refresh it to populate the SIMULATED side.')
      : `${n} ${d.provenance.source} trade${n === 1 ? '' : 's'} — ${sampleStatus(n)}.`,
    quality,
    narration: narrateEvidence({ dataset: d, cohorts, theses: thesesFor(cohorts) }),
    fields: fieldAvailability(d),
  }
}

export function overview(input: EvidenceInputs): Overview {
  const now = input.now ?? Date.now()
  const paper = datasetFor(input, 'paper')
  const backtest = datasetFor(input, 'backtest')
  const a = defaultAssumptions()
  return {
    generatedAt: now,
    engineVersion: VERSION,
    strategyId: input.backtest?.strategyId ?? tradingStrategyId(),
    bars: SAMPLE_BARS,
    paper: summarise(paper, input),
    backtest: {
      ...summarise(backtest, input),
      cachedAt: input.backtest?.computedAt ?? null,
      stale: input.backtest ? now - input.backtest.computedAt > BACKTEST_STALE_MS : null,
      assumptions: input.backtest?.assumptions ?? null,
    },
    comparison: comparePaperToBacktest(paper, backtest, {
      assumptions: {
        backtest: input.backtest ? `${input.backtest.fillModel} fills · spread ${input.backtest.assumptions.spreadBps}bp · slippage ${input.backtest.assumptions.slippageBps}bp · fee ${input.backtest.assumptions.takerFeePercent}%` : 'no backtest cached',
        paper: `next-open fills against the live book · slippage ${a.slippageBps}bp assumed · fee ${a.takerFeePercent}%`,
      },
    }),
    notes: [
      'PAPER is live market data with simulated execution. BACKTEST is a simulation over stored candles. Neither is real-money performance, and the two are never merged.',
      `Sample bars: INSUFFICIENT SAMPLE under ${SAMPLE_BARS.insufficient}, EARLY SAMPLE under ${SAMPLE_BARS.early}, DEVELOPING DATASET under ${SAMPLE_BARS.developing}, LARGER DATASET from ${SAMPLE_BARS.developing}. These describe the dataset, not the strategy.`,
      'Every number on this tab is traceable to the trade ids of the cohort it describes.',
    ],
  }
}

export type DimensionView = { table: DimensionTable; theses: Thesis[] }

export function dimensionView(input: EvidenceInputs, source: Source, dim: CohortDimension, includeEmpty = false): DimensionView {
  const table = byDimension(datasetFor(input, source), dim, { includeEmpty })
  return { table, theses: thesesFor(table.rows) }
}

export function crossView(input: EvidenceInputs, source: Source, rows: CohortDimension, cols: CohortDimension): { cross: CrossTable; heat: ReturnType<typeof heatmap> } {
  const d = datasetFor(input, source)
  return { cross: crossTable(d, rows, cols), heat: heatmap(d, rows, cols) }
}

export function cohortView(input: EvidenceInputs, source: Source, def: CohortDefinition): { cohort: Cohort; thesis: Thesis } {
  const c = cohort(datasetFor(input, source), def)
  return { cohort: c, thesis: thesisFor(c) }
}

// ---------------------------------------------------------------
// Trades — the journal view, and one trade's WHY from its own record
// ---------------------------------------------------------------

export type TradeRow = EvidenceRecord & { hasSnapshot: boolean }

export function tradesView(input: EvidenceInputs, source: Source): { provenance: Dataset['provenance']; trades: TradeRow[]; missed: EvidenceRecord[]; corrupt: EvidenceRecord[] } {
  const d = datasetFor(input, source)
  const byId = new Map(input.closed.map((p) => [p.id, p]))
  const rows: TradeRow[] = tradesOf(d).map((r) => ({ ...r, hasSnapshot: !!byId.get(r.id)?.snapshot }))
  return {
    provenance: d.provenance,
    trades: rows.sort((a, b) => b.decidedAt - a.decidedAt),
    missed: d.records.filter((r) => !r.corrupt && r.missed).sort((a, b) => b.decidedAt - a.decidedAt),
    corrupt: d.records.filter((r) => r.corrupt),
  }
}

export type TradeDetail = {
  record: EvidenceRecord
  stages: TradeStage[]
  /** Built ONLY from the decision-time snapshot the engine wrote. Null when the record predates it. */
  why: WhyTrade | null
  whyNote: string
  snapshot: DecisionSnapshot | null
  exit: { reason: string | null; price: number | null; at: number | null; rMultiple: number | null }
}

/**
 * Reconstruct the engine's own objects from the snapshot it wrote at decision
 * time, so `whyTrade` reads exactly what the engine saw and nothing newer.
 */
function engineObjectsFrom(p: PaperPosition, s: DecisionSnapshot): { vote: StrategyVote; decision: FusedDecision | null; risk: RiskVerdict } {
  const vote: StrategyVote = {
    id: p.strategyId ?? 'unknown', action: p.direction === 'long' ? 'BUY' : 'SELL', direction: p.direction,
    confidence: p.quality, reason: p.reason, evidence: s.evidence, setupKey: p.setupKey,
    plan: { direction: p.direction, entry: p.intendedEntry, stop: p.stop, takeProfit: p.target, rr: Math.abs(p.target - p.intendedEntry) / Math.max(1e-9, Math.abs(p.intendedEntry - p.stop)), entryLabel: '', stopLabel: '', targetLabel: '' },
  }
  const decision: FusedDecision | null = s.fusedAction
    ? {
      action: s.fusedAction as FusedDecision['action'], direction: p.direction, score: s.fusedScore ?? 0,
      confirms: s.confirms, invalidates: s.invalidates,
      contributors: s.contributors.map((c) => ({ id: c.id, name: c.id, action: c.action as StrategyVote['action'], direction: c.action === 'BUY' ? 'long' : c.action === 'SELL' ? 'short' : null, confidence: c.confidence, weight: 0, effective: 0 })),
      reason: p.reason, regime: (p.regime && p.regime !== 'unavailable' ? p.regime : null) as FusedDecision['regime'], enterScore: config.fusion.enterScore,
    }
    : null
  const risk: RiskVerdict = {
    approved: s.riskVetoedBy === null, action: s.riskVetoedBy ? 'SKIP' : vote.action, reason: s.riskVetoedBy ?? 'approved',
    quantity: p.quantity, positionValueUsd: p.quantity * p.intendedEntry, riskUsd: p.riskUsd, checks: s.riskChecks, vetoedBy: s.riskVetoedBy,
  }
  return { vote, decision, risk }
}

export function tradeDetail(input: EvidenceInputs, id: string): TradeDetail | null {
  const p = input.closed.find((x) => x.id === id)
  if (!p) return null
  const d = datasetFor(input, 'paper')
  const record = d.records.find((r) => r.id === id)
  if (!record) return null
  const s = p.snapshot ?? null
  const why = s ? whyTrade(engineObjectsFrom(p, s)) : null
  return {
    record,
    stages: tradeStages(p),
    why,
    whyNote: s
      ? 'Every line is what the engine recorded at the moment it decided. Nothing has been recomputed from later candles.'
      : 'This position predates the decision-time snapshot. The engine\'s reasons at the time were not stored, and they are not reconstructed here — reconstructing them from a later feature engine would be hindsight.',
    snapshot: s,
    exit: { reason: p.exitReason ?? null, price: p.exit ?? null, at: p.closedAt ?? null, rMultiple: p.rMultiple ?? null },
  }
}
