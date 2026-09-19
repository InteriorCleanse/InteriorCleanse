/**
 * PAPER DATA CHECKPOINTS — the moments a human is meant to look.
 *
 *   first fill · 10 · 25 · 50 · 100 · 200 closed paper trades
 *
 * Each checkpoint is recorded once, when the count is first reached, with a
 * frozen summary of the record at that moment and the review the phase asks
 * for at that size. A checkpoint never changes a strategy; it changes what
 * the operator reads next. The labels follow the analyst's sample bars
 * (INSUFFICIENT < 10, EARLY < 50, DEVELOPING < 200, LARGER DATASET).
 */

import { SAMPLE_BARS, sampleStatus } from '../analyst/cohorts.ts'
import { readPositions } from '../paperTrader.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { store } from '../store.ts'

export const CHECKPOINT_COUNTS = [10, 25, 50, 100, 200] as const

export type Checkpoint = {
  id: string
  label: string
  /** 0 for the first fill; otherwise the closed-trade count. */
  count: number
  reachedAt: number
  sampleStatus: string
  summary: { closed: number; missed: number; wins: number; losses: number; flats: number; avgR: number | null; sumR: number; firstFillAt: number | null; lastCloseAt: number | null; strategies: number; sessions: number; regimes: number }
  /** What a human should look at now — the phase's review gate for this size. */
  review: string[]
  reviewed: boolean
}

const PREFIX = 'checkpoint:'

function summarise(closed: PaperPosition[], missed: PaperPosition[], filled: PaperPosition[]): Checkpoint['summary'] {
  const rs = closed.map((p) => p.rMultiple).filter((r): r is number => typeof r === 'number' && Number.isFinite(r))
  return {
    closed: closed.length, missed: missed.length,
    wins: closed.filter((p) => p.outcome === 'WIN').length, losses: closed.filter((p) => p.outcome === 'LOSS').length, flats: closed.filter((p) => p.outcome === 'FLAT').length,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, sumR: rs.reduce((a, b) => a + b, 0),
    firstFillAt: filled.reduce<number | null>((m, p) => (p.filledAt !== undefined && (m === null || p.filledAt < m) ? p.filledAt : m), null),
    lastCloseAt: closed.reduce<number | null>((m, p) => (p.closedAt !== undefined && (m === null || p.closedAt > m) ? p.closedAt : m), null),
    strategies: new Set(closed.map((p) => p.strategyId ?? 'unknown')).size, sessions: new Set(closed.map((p) => p.session)).size, regimes: new Set(closed.map((p) => p.regime ?? 'unclassified')).size,
  }
}

function reviewFor(count: number): string[] {
  if (count === 0) return [
    'Verify the first fill chain end to end: the signal candle, the decision snapshot, the queued order, the next-candle open the fill used, the spread and slippage charged, the stored record, the ledger row, the journal entry, the observer event and the post-mortem.',
    'Confirm the fill price equals the next candle open plus half-spread plus slippage against the trade, from the stored candles.',
    'Confirm the UI labels the fill SIMULATED EXECUTION on live data.',
  ]
  if (count === 10) return ['EARLY SAMPLE: check data quality, reconciliation and integrity, not performance.', 'Read the ten post-mortems for anything the fill model or the record got wrong.', 'Do not touch a parameter: ten trades say nothing about an edge.']
  if (count === 25) return ['Still EARLY SAMPLE: confirm no duplicate trades, no missing closes, no ledger drift.', 'Compare paper against backtest with the drift monitor and expect INSUFFICIENT DATA for most cohorts.']
  if (count === 50) return ['DEVELOPING DATASET: cohort research is allowed for cohorts with 50 or more trades.', 'Read the research queue: what questions did the observer raise, and which are testable now?', 'Paper-versus-backtest drift: ALIGNED, DIFFERENT or INSUFFICIENT DATA per cohort, with the reason.']
  if (count === 100) return ['Review the failure memory and the knowledge decay monitor: what contradicted a prior belief?', 'Check the fill model against observed spreads on the record (observedSpreadPct vs assumedSlippageBps).', 'Any strategy change is still a proposal for the sandbox, not a production edit.']
  return ['LARGER DATASET: full cohort analysis, walk-forward and Monte Carlo on the paper record are meaningful.', 'Human review gate: decide whether the paper evidence justifies extending the soak, changing nothing, or opening a research question — never a live switch.', 'Re-run the reconciliation and integrity reports and archive them with this checkpoint.']
}

function labelFor(count: number): string { return count === 0 ? 'first paper fill' : `${count} closed paper trades` }

export function listCheckpoints(): Checkpoint[] {
  return store().keysWithPrefix(PREFIX).map((k) => store().getJson<Checkpoint>(k)).filter((c): c is Checkpoint => Boolean(c)).sort((a, b) => a.count - b.count)
}

/** Record any checkpoint the record has reached and not yet stored. Returns the newly reached ones. Idempotent. */
export function checkCheckpoints(now = Date.now()): { reached: Checkpoint[]; all: Checkpoint[]; next: { count: number; label: string; remaining: number } | null } {
  const positions = readPositions()
  const closed = positions.closed.filter((p) => p.exitReason !== 'missed')
  const missed = positions.closed.filter((p) => p.exitReason === 'missed')
  const filled = [...positions.open, ...positions.closed].filter((p) => p.filledAt !== undefined && p.exitReason !== 'missed')
  const reached: Checkpoint[] = []
  const write = (count: number) => {
    const id = count === 0 ? 'first-fill' : String(count)
    if (store().getJson<Checkpoint>(PREFIX + id)) return
    const cp: Checkpoint = { id, label: labelFor(count), count, reachedAt: now, sampleStatus: sampleStatus(closed.length), summary: summarise(closed, missed, filled), review: reviewFor(count), reviewed: false }
    store().setJson(PREFIX + id, cp)
    reached.push(cp)
  }
  if (filled.length > 0) write(0)
  for (const n of CHECKPOINT_COUNTS) if (closed.length >= n) write(n)
  const all = listCheckpoints()
  const nextCount = filled.length === 0 ? 0 : CHECKPOINT_COUNTS.find((n) => closed.length < n) ?? null
  const next = nextCount === null ? null : { count: nextCount, label: labelFor(nextCount), remaining: nextCount === 0 ? 1 : nextCount - closed.length }
  return { reached, all, next }
}

/** A human marks a checkpoint reviewed. The frozen summary is never changed. */
export function markCheckpointReviewed(id: string, reviewed = true): Checkpoint | null {
  const cp = store().getJson<Checkpoint>(PREFIX + id)
  if (!cp) return null
  const next = { ...cp, reviewed }
  store().setJson(PREFIX + id, next)
  return next
}

export const CHECKPOINT_BARS = SAMPLE_BARS
