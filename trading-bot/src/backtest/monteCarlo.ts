/**
 * Monte Carlo: the order trades happened in was one roll of the dice. Shuffle
 * that order — or resample it with replacement — thousands of times, and you
 * see the range of outcomes the same edge could have produced. It answers
 * "how much of my result was luck?" and, more usefully, "how bad could the
 * drawdown have been?"
 *
 * Seeded and pure, so a run is reproducible. Resampling with replacement
 * leaves the average per-trade R unchanged in expectation, so the mean of the
 * simulated totals lands on the real total — the spread around it is the point.
 */

export type MonteCarloResult = {
  samples: number
  perTrade: number
  /** Distribution of the total R across resampled runs. */
  totalR: { mean: number; median: number; p5: number; p95: number; min: number; max: number }
  /** Distribution of the worst peak-to-trough drawdown, in R. */
  maxDrawdownR: { mean: number; median: number; p5: number; p95: number; worst: number }
  /** Share of resampled runs that ended in profit. */
  profitableShare: number
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))
  return sorted[i]
}

function drawdown(rs: number[]): number {
  let peak = 0, cum = 0, maxDd = 0
  for (const r of rs) { cum += r; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxDd) maxDd = dd }
  return maxDd
}

/**
 * Resample the R list with replacement `samples` times, each run the same
 * length as the input. Returns the distribution of total R and of the worst
 * drawdown. Deterministic for a given seed.
 */
export function monteCarlo(rMultiples: number[], samples = 2000, seed = 12345): MonteCarloResult {
  const n = rMultiples.length
  if (n === 0) {
    const zero = { mean: 0, median: 0, p5: 0, p95: 0, min: 0, max: 0 }
    return { samples: 0, perTrade: n, totalR: zero, maxDrawdownR: { mean: 0, median: 0, p5: 0, p95: 0, worst: 0 }, profitableShare: 0 }
  }
  const rng = makeRng(seed)
  const totals: number[] = []
  const dds: number[] = []
  let profitable = 0
  for (let s = 0; s < samples; s++) {
    const run: number[] = []
    for (let i = 0; i < n; i++) run.push(rMultiples[Math.floor(rng() * n)])
    const total = run.reduce((a, b) => a + b, 0)
    totals.push(total)
    dds.push(drawdown(run))
    if (total > 0) profitable++
  }
  totals.sort((a, b) => a - b)
  dds.sort((a, b) => a - b)
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return {
    samples, perTrade: n,
    totalR: { mean: mean(totals), median: quantile(totals, 0.5), p5: quantile(totals, 0.05), p95: quantile(totals, 0.95), min: totals[0], max: totals[totals.length - 1] },
    maxDrawdownR: { mean: mean(dds), median: quantile(dds, 0.5), p5: quantile(dds, 0.05), p95: quantile(dds, 0.95), worst: dds[dds.length - 1] },
    profitableShare: profitable / samples,
  }
}
