/**
 * Forecasting.
 *
 * Ordinary least squares with a prediction interval derived from the residual
 * spread — not a point estimate presented as fact. The specification requires
 * forecasts to carry an uncertainty range and stated assumptions, and the
 * honest reason is that a single number invites someone to plan against it.
 *
 * Deliberately simple. A richer model (seasonality, changepoints) would be
 * better on real data, but an unexplainable projection is worse than a modest
 * one whose assumptions fit in a sentence the operator can check.
 */

export type Forecast = {
  /** Central projection for the requested horizon, in minor units. */
  point: number
  low: number
  high: number
  /** Nominal coverage of the interval. */
  confidence: number
  /** Fitted trend per bucket, in minor units. */
  slope: number
  assumptions: string[]
}

const MIN_POINTS = 4

/**
 * Projects `horizon` buckets ahead. Returns null rather than guessing when
 * there is too little history — a forecast from two data points is a straight
 * line through noise.
 */
export function forecast(
  series: readonly number[],
  horizon: number,
  confidence = 0.8,
): Forecast | null {
  const points = series.filter((v) => Number.isFinite(v))
  const n = points.length
  if (n < MIN_POINTS || horizon < 1) return null

  // Least squares over x = 0..n-1.
  const meanX = (n - 1) / 2
  const meanY = points.reduce((a, b) => a + b, 0) / n

  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i += 1) {
    sxy += (i - meanX) * (points[i]! - meanY)
    sxx += (i - meanX) ** 2
  }

  const slope = sxx === 0 ? 0 : sxy / sxx
  const intercept = meanY - slope * meanX

  // Residual standard error, the basis for the interval width.
  let sse = 0
  for (let i = 0; i < n; i += 1) {
    const fitted = intercept + slope * i
    sse += (points[i]! - fitted) ** 2
  }
  const residualSe = n > 2 ? Math.sqrt(sse / (n - 2)) : 0

  // Sum of per-bucket projections across the horizon, so the answer is "the
  // next 30 days" rather than "the value on day 30".
  let total = 0
  for (let h = 1; h <= horizon; h += 1) {
    total += Math.max(0, intercept + slope * (n - 1 + h))
  }

  // Interval widens with the square root of the horizon — uncertainty
  // accumulates, it does not stay flat.
  const z = confidence >= 0.95 ? 1.96 : confidence >= 0.9 ? 1.645 : 1.282
  const spread = z * residualSe * Math.sqrt(horizon)

  const assumptions = [
    `Fitted a straight line to ${n} recent buckets; no seasonality or promotions are modelled.`,
    'Assumes conditions continue unchanged — no new campaigns, price changes, or stock-outs.',
    `The range is a ${Math.round(confidence * 100)}% interval from the spread of past values around the trend.`,
  ]

  if (slope < 0) {
    assumptions.push('The recent trend is downward, so the projection declines.')
  }
  if (residualSe > Math.abs(meanY) * 0.5 && meanY !== 0) {
    assumptions.push('Past values vary widely around the trend, so this range is wide and weak.')
  }

  return {
    point: Math.round(total),
    low: Math.round(Math.max(0, total - spread)),
    high: Math.round(total + spread),
    confidence,
    slope: Math.round(slope),
    assumptions,
  }
}
