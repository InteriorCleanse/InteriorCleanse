/**
 * Backtest metrics — the honest scoreboard for a list of trades. Pure: it
 * takes trades and returns numbers, nothing more. Every figure is defined
 * here in one place so in-sample, out-of-sample and walk-forward all speak
 * the same language.
 *
 * R is the unit throughout: +1R is a win the size of the risk taken. A
 * strategy is judged in R, not dollars, so account size never flatters it.
 */

import { config } from '../../config.ts'

/** The little a metric needs from a trade. Any ReplayTrade satisfies it. */
export type TradeLike = {
  time: number
  rMultiple: number | null
  pnlUsd: number
  outcome: 'WIN' | 'LOSS' | 'FLAT'
  blockedByMemory?: boolean
}

export type Metrics = {
  trades: number
  wins: number
  losses: number
  flat: number
  /** Wins over decided trades (wins + losses); null when nothing was decided. */
  winRate: number | null
  totalR: number
  avgR: number | null
  /** Per-trade expectancy, in R. Same as avgR; named for the reader. */
  expectancyR: number | null
  /** Gross win R over gross loss R; null when there were no losses. */
  profitFactor: number | null
  /** Worst peak-to-trough drop on the cumulative-R curve, in R. */
  maxDrawdownR: number
  /** Mean R over the standard deviation of R — a Sharpe-like ratio on trades. Null under 2 trades or zero variance. */
  sharpeR: number | null
  longestLosingStreak: number
  totalPnlUsd: number
  tradesPerDay: number | null
  spanDays: number | null
  /** False when there are too few trades to trust the numbers. */
  enoughData: boolean
}

/** Compute the metrics for a set of trades. Memory-blocked trades are excluded — they were not taken. */
export function computeMetrics(all: TradeLike[]): Metrics {
  const trades = all.filter((t) => !t.blockedByMemory)
  const n = trades.length
  const rs = trades.map((t) => t.rMultiple ?? 0)
  const wins = trades.filter((t) => t.outcome === 'WIN').length
  const losses = trades.filter((t) => t.outcome === 'LOSS').length
  const flat = trades.filter((t) => t.outcome === 'FLAT').length
  const decided = wins + losses
  const totalR = rs.reduce((s, r) => s + r, 0)
  const grossWin = rs.filter((r) => r > 0).reduce((s, r) => s + r, 0)
  const grossLoss = -rs.filter((r) => r < 0).reduce((s, r) => s + r, 0)

  // Cumulative-R drawdown.
  let peak = 0, cum = 0, maxDd = 0
  for (const r of rs) { cum += r; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxDd) maxDd = dd }

  // Longest run of losing trades.
  let streak = 0, longest = 0
  for (const t of trades) { if (t.outcome === 'LOSS') { streak++; if (streak > longest) longest = streak } else streak = 0 }

  // Sharpe-like: mean / population standard deviation of R.
  let sharpeR: number | null = null
  if (n >= 2) {
    const mean = totalR / n
    const variance = rs.reduce((s, r) => s + (r - mean) ** 2, 0) / n
    const sd = Math.sqrt(variance)
    sharpeR = sd > 0 ? mean / sd : null
  }

  const times = trades.map((t) => t.time).filter((t) => t > 0)
  const spanDays = times.length >= 2 ? Math.max(1 / 24, (Math.max(...times) - Math.min(...times)) / 86_400_000) : null

  return {
    trades: n, wins, losses, flat,
    winRate: decided > 0 ? wins / decided : null,
    totalR,
    avgR: n > 0 ? totalR / n : null,
    expectancyR: n > 0 ? totalR / n : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    maxDrawdownR: maxDd,
    sharpeR,
    longestLosingStreak: longest,
    totalPnlUsd: trades.reduce((s, t) => s + t.pnlUsd, 0),
    tradesPerDay: spanDays ? n / spanDays : null,
    spanDays,
    enoughData: n >= config.replay.minSetupsForConfidence,
  }
}
