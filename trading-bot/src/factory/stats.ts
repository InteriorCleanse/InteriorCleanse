/**
 * The small statistics the factory needs to be honest about luck: the normal
 * CDF and its inverse, and the deflated Sharpe ratio.
 *
 * The one idea worth stating plainly: if you try a thousand settings, the best
 * one will look good even if none of them has any edge. The deflated Sharpe
 * ratio asks the only fair question — is this result better than the best you
 * would expect from pure chance, given how many things you tried? The more you
 * tried, the higher the bar. That bar is what stops the factory from breeding
 * over-fit.
 */

const GAMMA = 0.5772156649015329 // Euler–Mascheroni

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf). */
export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2))
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax)
  return sign * y
}

/** Inverse standard normal CDF (Acklam's rational approximation). */
export function invNorm(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const plow = 0.02425, phigh = 1 - plow
  let q: number, r: number
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p <= phigh) {
    q = p - 0.5; r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  }
  q = Math.sqrt(-2 * Math.log(1 - p))
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
}

/**
 * The expected maximum of `trials` independent standard-normal draws, in
 * standard deviations (Bailey & López de Prado's benchmark). This is how far
 * out the best-of-N result sits by chance alone; it grows with the number of
 * trials, which is the whole point.
 */
export function expectedMaxZ(trials: number): number {
  const n = Math.max(1, trials)
  if (n === 1) return 0
  return (1 - GAMMA) * invNorm(1 - 1 / n) + GAMMA * invNorm(1 - 1 / (n * Math.E))
}

export type DeflatedSharpe = {
  /** The observed per-trade Sharpe. */
  observed: number
  /** The chance-alone benchmark for this many trials, in the same units. */
  benchmark: number
  /** P(the edge is real) — the probability the observed Sharpe beats the benchmark. 0..1. */
  probability: number
}

/**
 * Deflate a per-trade Sharpe for the number of things tried. Returns the
 * probability that the result is better than the best you'd expect from
 * `trials` coin-flips, given `n` trades behind the estimate.
 */
export function deflatedSharpe(sharpe: number, n: number, trials: number): DeflatedSharpe {
  if (n < 2) return { observed: sharpe, benchmark: Infinity, probability: 0 }
  // SE of a Sharpe estimate under the null (SR=0): ~1/sqrt(n-1) per-trade.
  const seNull = 1 / Math.sqrt(n - 1)
  const benchmark = expectedMaxZ(trials) * seNull
  // SE of the estimator itself (Lo, 2002), used to score the gap.
  const seHat = Math.sqrt((1 + 0.5 * sharpe * sharpe) / (n - 1))
  const probability = seHat > 0 ? normCdf((sharpe - benchmark) / seHat) : 0
  return { observed: sharpe, benchmark, probability }
}
