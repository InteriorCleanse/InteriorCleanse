/**
 * Information Coefficient, ICIR, edge consistency and edge decay — the scoring
 * that tells a real edge from a lucky one, adapted honestly for THIS system.
 *
 * WHY THIS IS NOT TEXTBOOK IC, AND WHY THAT MATTERS
 *
 * The classic Information Coefficient is a CROSS-SECTIONAL factor metric: you
 * score every asset in a universe each period, then correlate those scores with
 * the forward returns across assets. Mr. Cash is none of that. It trades ONE
 * symbol, event-driven, emitting a handful of discrete setups rather than a
 * continuous score on every bar. Correlating "signal value" against "subsequent
 * return" over bars would be a correlation over a series that is null on ~99% of
 * them — an undefined or meaningless number, dressed up as rigour.
 *
 * So the adaptation is deliberate, and it answers a question this system can
 * actually be asked:
 *
 *   IC  — does the engine's own CONVICTION predict the outcome? The correlation
 *         between the quality/confidence it assigned a setup (0–100) and the R
 *         that setup actually returned. A positive IC means the engine knows a
 *         good setup when it sees one. An IC near zero means the quality score
 *         is decoration — which is worth knowing, and is invisible to a plain
 *         win-rate.
 *
 *   ICIR — mean(IC) / stdev(IC) across time buckets. Consistency, not magnitude.
 *          A steady small IC beats a huge one that flips sign.
 *
 *   Edge consistency — mean / stdev of per-bucket EXPECTANCY. This is the one
 *          that speaks even when conviction has no variance (a strategy that
 *          scores every setup identically has an undefined IC but can still have
 *          a perfectly stable edge).
 *
 * Everything returns null rather than a number when the sample cannot support
 * it. At this project's sample sizes a point estimate of half-life would be
 * noise wearing a lab coat, so it is refused unless the data earns it.
 */

import type { ReplayTrade } from '../types.ts'

/** A trade reduced to what scoring needs. */
export type ScoredTrade = { time: number; rMultiple: number; conviction: number | null }

/** Pull the scoring view out of backtest trades. Conviction is the engine's own quality score. */
export function toScored(trades: ReplayTrade[]): ScoredTrade[] {
  return trades
    .filter((t) => t.rMultiple !== null && !t.blockedByMemory)
    .map((t) => ({ time: t.time, rMultiple: t.rMultiple as number, conviction: typeof t.quality === 'number' ? t.quality : null }))
}

function mean(xs: number[]): number { return xs.reduce((s, x) => s + x, 0) / xs.length }

/** Sample standard deviation (n−1). Null under two points or with no spread. */
function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = mean(xs)
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)
  return v > 0 ? Math.sqrt(v) : null
}

/** Pearson correlation. Null when either side has no variance — undefined, not zero. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  const mx = mean(xs.slice(0, n)), my = mean(ys.slice(0, n))
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my
    num += a * b; dx += a * a; dy += b * b
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

// ---------------------------------------------------------------
// Bucketing
// ---------------------------------------------------------------

export type Bucket = { from: number; to: number; trades: ScoredTrade[] }

/**
 * Split trades into equal calendar buckets (months by default). Calendar, not
 * equal-count: a strategy that stopped trading for two months should show that
 * as a gap, not have it smoothed away by re-balancing the buckets.
 */
export function bucketByTime(trades: ScoredTrade[], bucketMs = 30 * 86_400_000): Bucket[] {
  if (!trades.length) return []
  const sorted = trades.slice().sort((a, b) => a.time - b.time)
  const start = sorted[0].time
  const byIndex = new Map<number, ScoredTrade[]>()
  for (const t of sorted) {
    const i = Math.floor((t.time - start) / bucketMs)
    byIndex.set(i, [...(byIndex.get(i) ?? []), t])
  }
  return [...byIndex.keys()].sort((a, b) => a - b).map((i) => ({
    from: start + i * bucketMs,
    to: start + (i + 1) * bucketMs,
    trades: byIndex.get(i)!,
  }))
}

// ---------------------------------------------------------------
// IC / ICIR
// ---------------------------------------------------------------

export type IcReading = {
  /** Per-bucket IC values that could be computed. */
  perBucket: Array<{ from: number; trades: number; ic: number | null }>
  /** Mean IC across buckets where it was computable. */
  meanIc: number | null
  /** mean(IC) / stdev(IC). The consistency score. */
  icir: number | null
  bucketsScored: number
  /** Why it is null, when it is. Never a silent zero. */
  note: string
}

/**
 * Does the engine's conviction predict the result?
 *
 * Requires conviction to VARY — a strategy that stamps every setup with the same
 * quality has an undefined IC, and that is reported rather than masked as 0.
 */
export function informationCoefficient(trades: ScoredTrade[], opts: { bucketMs?: number; minTradesPerBucket?: number } = {}): IcReading {
  const minPer = opts.minTradesPerBucket ?? 5
  const buckets = bucketByTime(trades, opts.bucketMs)
  const perBucket = buckets.map((b) => {
    const withConviction = b.trades.filter((t) => t.conviction !== null)
    const ic = withConviction.length >= minPer
      ? pearson(withConviction.map((t) => t.conviction as number), withConviction.map((t) => t.rMultiple))
      : null
    return { from: b.from, trades: b.trades.length, ic }
  })
  const scored = perBucket.map((b) => b.ic).filter((x): x is number => x !== null)

  if (!trades.length) return { perBucket, meanIc: null, icir: null, bucketsScored: 0, note: 'No trades to score.' }
  if (!trades.some((t) => t.conviction !== null)) {
    return { perBucket, meanIc: null, icir: null, bucketsScored: 0, note: 'No conviction score on these trades — IC is undefined. Edge consistency is the metric to read instead.' }
  }
  if (!scored.length) {
    return { perBucket, meanIc: null, icir: null, bucketsScored: 0, note: `No bucket had ${minPer} trades with a conviction score, or conviction never varied within one. IC is undefined here, not zero.` }
  }
  const m = mean(scored)
  const sd = stdev(scored)
  return {
    perBucket,
    meanIc: m,
    icir: sd === null ? null : m / sd,
    bucketsScored: scored.length,
    note: sd === null
      ? `Mean IC ${m.toFixed(3)} over ${scored.length} bucket(s), but ICIR needs at least two buckets with spread to measure consistency.`
      : `Mean IC ${m.toFixed(3)} with ICIR ${(m / sd).toFixed(2)} over ${scored.length} buckets.`,
  }
}

/** How to read an ICIR, so the number is not left to vibes. */
export function icirVerdict(icir: number | null): 'STRONG' | 'MODERATE' | 'WEAK' | 'UNAVAILABLE' {
  if (icir === null || !Number.isFinite(icir)) return 'UNAVAILABLE'
  if (icir >= 0.5) return 'STRONG'
  if (icir >= 0.3) return 'MODERATE'
  return 'WEAK'
}

// ---------------------------------------------------------------
// Edge consistency — the metric that survives zero conviction variance
// ---------------------------------------------------------------

export type EdgeConsistency = {
  perBucket: Array<{ from: number; trades: number; avgR: number | null }>
  meanAvgR: number | null
  /** mean(bucket expectancy) / stdev(bucket expectancy). The ICIR analogue for expectancy. */
  consistency: number | null
  /** Share of buckets with a positive expectancy. */
  positiveShare: number | null
  bucketsScored: number
  note: string
}

export function edgeConsistency(trades: ScoredTrade[], opts: { bucketMs?: number; minTradesPerBucket?: number } = {}): EdgeConsistency {
  const minPer = opts.minTradesPerBucket ?? 5
  const buckets = bucketByTime(trades, opts.bucketMs)
  const perBucket = buckets.map((b) => ({
    from: b.from,
    trades: b.trades.length,
    avgR: b.trades.length >= minPer ? mean(b.trades.map((t) => t.rMultiple)) : null,
  }))
  const scored = perBucket.map((b) => b.avgR).filter((x): x is number => x !== null)
  if (!scored.length) {
    return { perBucket, meanAvgR: null, consistency: null, positiveShare: null, bucketsScored: 0, note: `No bucket reached ${minPer} trades — expectancy consistency cannot be measured yet.` }
  }
  const m = mean(scored)
  const sd = stdev(scored)
  return {
    perBucket,
    meanAvgR: m,
    consistency: sd === null ? null : m / sd,
    positiveShare: scored.filter((x) => x > 0).length / scored.length,
    bucketsScored: scored.length,
    note: sd === null
      ? `Mean bucket expectancy ${m.toFixed(3)}R over ${scored.length} bucket(s); consistency needs at least two buckets with spread.`
      : `Mean bucket expectancy ${m.toFixed(3)}R, consistency ${(m / sd).toFixed(2)} over ${scored.length} buckets.`,
  }
}

// ---------------------------------------------------------------
// Edge decay
// ---------------------------------------------------------------

export type EdgeDecay = {
  firstHalfAvgR: number | null
  secondHalfAvgR: number | null
  /** secondHalf − firstHalf. Negative means the edge is fading. */
  change: number | null
  /**
   * Calendar half-life in days, when the decay is monotone enough and the sample
   * large enough to support an estimate. Null — with a reason — otherwise. A
   * half-life fitted to eight trades is noise wearing a lab coat.
   */
  halfLifeDays: number | null
  note: string
}

/**
 * Is the edge fading? Deliberately conservative: it reports the first-half vs
 * second-half expectancy change (robust at small N) and only attempts a
 * half-life when there are enough buckets, all positive, and a genuine decline.
 */
export function edgeDecay(trades: ScoredTrade[], opts: { bucketMs?: number; minTrades?: number; minBuckets?: number } = {}): EdgeDecay {
  const minTrades = opts.minTrades ?? 20
  const minBuckets = opts.minBuckets ?? 4
  if (trades.length < minTrades) {
    return { firstHalfAvgR: null, secondHalfAvgR: null, change: null, halfLifeDays: null, note: `Only ${trades.length} trade(s); need ${minTrades} before decay means anything.` }
  }
  const sorted = trades.slice().sort((a, b) => a.time - b.time)
  const mid = Math.floor(sorted.length / 2)
  const first = mean(sorted.slice(0, mid).map((t) => t.rMultiple))
  const second = mean(sorted.slice(mid).map((t) => t.rMultiple))
  const change = second - first

  const buckets = bucketByTime(sorted, opts.bucketMs).map((b) => ({ from: b.from, avgR: b.trades.length ? mean(b.trades.map((t) => t.rMultiple)) : null }))
  const usable = buckets.filter((b): b is { from: number; avgR: number } => b.avgR !== null)

  let halfLifeDays: number | null = null
  let why = ''
  if (usable.length < minBuckets) {
    why = `Half-life not estimated: ${usable.length} usable bucket(s), need ${minBuckets}.`
  } else if (usable[0].avgR <= 0) {
    why = 'Half-life not estimated: the edge did not start positive, so there is nothing to decay from.'
  } else if (change >= 0) {
    why = 'Half-life not estimated: the edge is not declining over this window.'
  } else {
    // Exponential fit on the positive part: avgR(t) = a·exp(−λt). Only the
    // positive buckets can be logged, and we require most of them to survive.
    const positive = usable.filter((b) => b.avgR > 0)
    if (positive.length < minBuckets || positive.length / usable.length < 0.6) {
      why = 'Half-life not estimated: too many buckets are non-positive to fit a decay curve honestly.'
    } else {
      const t0 = positive[0].from
      const xs = positive.map((b) => (b.from - t0) / 86_400_000)
      const ys = positive.map((b) => Math.log(b.avgR))
      const mx = mean(xs), my = mean(ys)
      let num = 0, den = 0
      for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2 }
      const slope = den > 0 ? num / den : 0
      if (slope < 0) { halfLifeDays = Math.log(2) / -slope; why = `Half-life ≈ ${halfLifeDays.toFixed(1)} days from an exponential fit over ${positive.length} buckets.` }
      else why = 'Half-life not estimated: the fitted slope is not negative.'
    }
  }

  return {
    firstHalfAvgR: first,
    secondHalfAvgR: second,
    change,
    halfLifeDays,
    note: `First half ${first.toFixed(3)}R vs second half ${second.toFixed(3)}R (${change >= 0 ? '+' : ''}${change.toFixed(3)}R). ${why}`,
  }
}

// ---------------------------------------------------------------
// Multiple testing — a cross-check alongside the deflated Sharpe
// ---------------------------------------------------------------

export type MultipleTesting = {
  trials: number
  alpha: number
  /** Bonferroni: α / n. Conservative and assumes independence. */
  bonferroni: number
  /** Šidák: 1 − (1 − α)^(1/n). Slightly less brutal, same assumption. */
  sidak: number
  note: string
}

/**
 * The familiar corrections, provided as a CROSS-CHECK — not as the primary gate.
 *
 * For picking the best of N backtests the deflated Sharpe ratio (already in
 * `stats.ts`) is the better-founded tool: it corrects for the number of trials
 * AND for the non-normality of trade returns, where Bonferroni assumes the
 * trials are independent (they are not — neighbouring genomes are highly
 * correlated) and is over-conservative as a result. Both are reported so a
 * survivor is never resting on one correction alone.
 */
export function multipleTesting(trials: number, alpha = 0.05): MultipleTesting {
  const n = Math.max(1, trials)
  return {
    trials: n,
    alpha,
    bonferroni: alpha / n,
    sidak: 1 - (1 - alpha) ** (1 / n),
    note: `With ${n} trial(s) at α=${alpha}: Bonferroni ${(alpha / n).toExponential(2)}, Šidák ${(1 - (1 - alpha) ** (1 / n)).toExponential(2)}. Both assume independent trials, which neighbouring genomes are not — treat the deflated Sharpe as the primary correction and these as a sanity check.`,
  }
}

/**
 * Complementary error function, Abramowitz & Stegun 7.1.26 — accurate to about
 * 1.5e−7, which is far finer than the sampling noise in any trade series we will
 * ever hand it. JavaScript has no `Math.erfc`, and guessing one would be exactly
 * the sort of invented number this project refuses elsewhere.
 */
function erfc(x: number): number {
  const z = Math.abs(x)
  const t = 1 / (1 + z / 2)
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? r : 2 - r
}

/**
 * A one-sided p-value for "mean R > 0", from the trade sample.
 *
 * Deliberately labelled a rough guide: it uses a normal approximation, and trade
 * returns are skewed and fat-tailed (a stop-loss distribution is not Gaussian).
 * It exists to be compared against a multiple-testing-corrected threshold, not
 * to be quoted as a significance verdict on its own.
 */
export function pValueMeanPositive(rs: number[]): number | null {
  if (rs.length < 3) return null
  const m = mean(rs)
  const sd = stdev(rs)
  if (sd === null || sd === 0) return null
  const t = m / (sd / Math.sqrt(rs.length))
  if (t <= 0) return 1
  return Math.min(1, Math.max(0, 0.5 * erfc(t / Math.SQRT2)))
}
