/**
 * Paper-trading metrics (Phase 18). Pure over the closed paper positions: it
 * measures what actually happened on real data with fake money — per strategy,
 * with the honesty the plan asks for. It counts the trades that ran AND the
 * ones that were missed (and why), reports the spread the book actually showed
 * against the slippage the fill model assumed, and lines the realised paper
 * expectancy up against the out-of-sample number each strategy earned in the
 * vault. The exit criterion is a sample size, never a date.
 */

import { config } from '../../config.ts'
import { paperOutcome } from '../paperTrader.ts'
import type { PaperPosition } from '../paperTrader.ts'
import type { Passport } from '../vault/passport.ts'

const WEEK = 7 * 86_400_000

export type PaperStrategyMetrics = {
  strategyId: string
  taken: number
  wins: number
  losses: number
  flat: number
  missed: number
  missedByReason: Record<string, number>
  winRate: number | null
  totalR: number
  avgR: number | null
  totalPnlUsd: number
  avgObservedSpreadPct: number | null
  assumedSlippageBps: number
  avgLatencyMs: number | null
  firstAt: number | null
  lastAt: number | null
  spanDays: number | null
}

/**
 * The engine's verdict, via the one shared reader. This used to apply its own
 * R-based threshold, which disagreed with the paper account's — the same trade
 * could be a win here and a scratch there.
 */
function decidedOutcome(p: PaperPosition): 'WIN' | 'LOSS' | 'FLAT' | 'MISSED' {
  return paperOutcome(p)
}

/** The strategy an order belongs to: its recorded id, else parsed from the setup key, else 'unknown'. */
export function strategyOf(p: PaperPosition): string {
  if (p.strategyId) return p.strategyId
  const parts = p.setupKey.split('|')
  return parts.length >= 3 ? parts[2] : 'unknown'
}

/** Reason bucket for a missed trade, from its note. */
function missReason(note: string | undefined): string {
  const n = (note ?? '').toLowerCase()
  if (n.includes('kill')) return 'kill switch'
  if (n.includes('stale')) return 'stale data'
  if (n.includes('spread')) return 'spread too wide'
  if (n.includes('drift') || n.includes('ran')) return 'price ran away'
  return note ? note.slice(0, 40) : 'other'
}

/** Per-strategy realised paper metrics over the closed positions (taken and missed). */
export function paperByStrategy(closed: PaperPosition[]): PaperStrategyMetrics[] {
  const byId = new Map<string, PaperPosition[]>()
  for (const p of closed) { const id = strategyOf(p); byId.set(id, [...(byId.get(id) ?? []), p]) }
  const out: PaperStrategyMetrics[] = []
  for (const [strategyId, list] of byId) {
    const taken = list.filter((p) => p.exitReason !== 'missed')
    const missedList = list.filter((p) => p.exitReason === 'missed')
    const wins = taken.filter((p) => decidedOutcome(p) === 'WIN').length
    const losses = taken.filter((p) => decidedOutcome(p) === 'LOSS').length
    const flat = taken.filter((p) => decidedOutcome(p) === 'FLAT').length
    const decided = wins + losses
    const rs = taken.map((p) => p.rMultiple ?? 0)
    const totalR = rs.reduce((s, r) => s + r, 0)
    const spreads = taken.map((p) => p.observedSpreadPct).filter((x): x is number => typeof x === 'number')
    const lats = taken.map((p) => p.latencyMs).filter((x): x is number => typeof x === 'number')
    const times = taken.map((p) => p.closedAt ?? p.openedAt).filter((t) => t > 0)
    const missedByReason: Record<string, number> = {}
    for (const m of missedList) { const r = missReason(m.note); missedByReason[r] = (missedByReason[r] ?? 0) + 1 }
    out.push({
      strategyId,
      taken: taken.length, wins, losses, flat, missed: missedList.length, missedByReason,
      winRate: decided > 0 ? wins / decided : null,
      totalR, avgR: taken.length ? totalR / taken.length : null,
      totalPnlUsd: taken.reduce((s, p) => s + (p.pnlUsd ?? 0), 0),
      avgObservedSpreadPct: spreads.length ? spreads.reduce((s, x) => s + x, 0) / spreads.length : null,
      assumedSlippageBps: config.execution.slippageBps,
      avgLatencyMs: lats.length ? lats.reduce((s, x) => s + x, 0) / lats.length : null,
      firstAt: times.length ? Math.min(...times) : null,
      lastAt: times.length ? Math.max(...times) : null,
      spanDays: times.length >= 2 ? (Math.max(...times) - Math.min(...times)) / 86_400_000 : null,
    })
  }
  return out.sort((a, b) => (b.avgR ?? -Infinity) - (a.avgR ?? -Infinity))
}

/**
 * Is the paper sample big enough to mean anything? The plan's gate: at least
 * `minSetupsForConfidence` taken trades AND at least `minWeeks` of span. Both,
 * because a burst of trades in one week is not a track record.
 */
export function sampleSufficient(m: PaperStrategyMetrics, minTrades = config.replay.minSetupsForConfidence, minWeeks = 4): boolean {
  const weeks = m.firstAt && m.lastAt ? (m.lastAt - m.firstAt) / WEEK : 0
  return m.taken >= minTrades && weeks >= minWeeks
}

export type PaperVsOos = {
  strategyId: string
  paperTrades: number
  paperAvgR: number | null
  oosAvgR: number | null
  /** paperAvgR − oosAvgR when both exist. Negative means paper is doing worse than the backtest promised. */
  delta: number | null
  enoughSample: boolean
  note: string
}

/**
 * Line up realised paper expectancy against the out-of-sample expectancy each
 * strategy earned in the vault. This is the whole point of paper trading: does
 * the edge survive contact with the real spread, real slippage and real
 * missed fills, or was the backtest flattering it?
 */
export function comparePaperToOos(
  byStrategy: PaperStrategyMetrics[],
  passports: Passport[],
  minTrades = config.replay.minSetupsForConfidence,
  minWeeks = 4,
  /**
   * A second source of out-of-sample expectancy, consulted only when no
   * passport exists for the strategy: the stored out-of-sample backtest of the
   * strategy that is actually trading (`paper/oosReference.ts`). A built-in
   * strategy has no genome and so no passport, and without this the gate was
   * unreachable for the frozen profile.
   */
  reference: (strategyId: string) => number | null = () => null,
): PaperVsOos[] {
  const oosFor = (id: string): number | null => {
    const ps = passports.filter((p) => p.strategyId === id && p.oos.avgR !== null)
    if (!ps.length) return reference(id)
    // The best (furthest-along) passport's OOS is the reference.
    return ps.slice().sort((a, b) => (b.oos.avgR ?? -Infinity) - (a.oos.avgR ?? -Infinity))[0].oos.avgR
  }
  return byStrategy.map((m) => {
    const oosAvgR = oosFor(m.strategyId)
    const enough = sampleSufficient(m, minTrades, minWeeks)
    const delta = m.avgR !== null && oosAvgR !== null ? m.avgR - oosAvgR : null
    let note: string
    if (!enough) note = `Only ${m.taken} paper trade(s) over ${m.spanDays ? (m.spanDays / 7).toFixed(1) : '0'} week(s) — under the ${minTrades} trades / ${minWeeks} weeks needed to trust the comparison.`
    else if (oosAvgR === null) note = 'No out-of-sample number to compare against: no vault passport, and no stored out-of-sample backtest reference for this strategy. Compute one (POST /api/validation/oos-reference) or mint a passport from the factory.'
    else if (delta !== null && delta < -0.05) note = 'Paper is materially worse than the backtest promised — the edge is not surviving real spread and slippage.'
    else if (delta !== null && delta >= -0.05) note = 'Paper is holding up against the out-of-sample expectancy.'
    else note = 'Comparison pending.'
    return { strategyId: m.strategyId, paperTrades: m.taken, paperAvgR: m.avgR, oosAvgR, delta, enoughSample: enough, note }
  })
}
