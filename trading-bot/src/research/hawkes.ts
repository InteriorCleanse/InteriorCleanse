/**
 * NEWS-TO-PRICE DIFFUSION — a self-exciting (Hawkes) model of price activity
 * around scheduled releases.
 *
 * Markets react to information, then to themselves. The intensity of PRICE
 * EVENTS (candles whose move is large relative to recent volatility) is
 * modelled as a baseline plus two exponentially-decaying excitations: one
 * kicked by each NEWS release (exogenous), one by each earlier price event
 * (endogenous):
 *
 *   λ_P(t) = μ + Σ_{news j < t} α_NP · e^{−β (t − t_j)} + Σ_{price i < t} α_PP · e^{−β (t − t_i)}
 *
 * α_NP is how hard a headline hits; α_PP is how much the market feeds on its
 * own reaction; the half-life ln 2 / β is how fast a burst is absorbed. The
 * endogenous branching ratio α_PP / β is the share of price events that are
 * echoes of earlier price events rather than fresh information.
 *
 * Fitted by maximum likelihood over a bounded grid with the standard O(n)
 * recursion for the exponential kernel. Everything is per MINUTE. This is an
 * ESTIMATE with a stated sample size; it needs a minimum number of releases
 * AND price events before it says anything, and it never says which way price
 * will go — excitation is about activity, not direction.
 *
 * Pure. The caller supplies the event streams; `priceEvents` builds one from
 * candles with a stated threshold.
 */

import type { Candle } from '../types.ts'

export const MIN_NEWS_EVENTS = 12
export const MIN_PRICE_EVENTS = 40

export type HawkesFit = {
  status: 'INSUFFICIENT DATA' | 'ESTIMATED'
  /** Per-minute baseline intensity of price events. */
  mu: number | null
  /** News → price excitation (jump in intensity per release). */
  alphaNP: number | null
  /** Price → price excitation. */
  alphaPP: number | null
  /** Decay rate per minute. */
  beta: number | null
  halfLifeMin: number | null
  /** α_PP / β — the share of price events that are echoes. Below 1 means the process is stable. */
  branchingRatio: number | null
  /** Expected extra price events one release produces over its whole burst: α_NP / β. */
  eventsPerRelease: number | null
  /** Share of total intensity attributable to baseline / news / self-excitation over the window. */
  shares: { baseline: number; news: number; self: number } | null
  logLikelihood: number | null
  sample: { newsEvents: number; priceEvents: number; windowMin: number }
  threshold: string
  note: string
  provenance: 'HISTORICAL'
}

const HALF = Math.log(2)

/**
 * Price events from candles: a close-to-close move at or above `k` standard
 * deviations of the trailing `lookback` returns. Returns the event times (close
 * times) and the threshold statement. Deterministic.
 */
export function priceEvents(candles: Candle[], k = 3, lookback = 288): { times: number[]; threshold: string } {
  const times: number[] = []
  const rets: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const r = Math.log(candles[i].close / candles[i - 1].close)
    if (rets.length >= lookback) {
      const win = rets.slice(-lookback)
      const mean = win.reduce((a, b) => a + b, 0) / win.length
      const sd = Math.sqrt(win.reduce((a, b) => a + (b - mean) ** 2, 0) / (win.length - 1))
      if (sd > 0 && Math.abs(r - mean) >= k * sd) times.push(candles[i].closeTime)
    }
    rets.push(r)
  }
  return { times, threshold: `|close-to-close return| ≥ ${k}σ of the trailing ${lookback} returns` }
}

type Params = { mu: number; aNP: number; aPP: number; beta: number }

/** Log-likelihood of the price events given the news events, per-minute units. Exponential-kernel recursion. */
export function logLikelihood(p: Params, price: number[], news: number[], from: number, to: number): number {
  const T = (to - from) / 60_000
  if (!(T > 0)) return -Infinity
  let ll = 0
  let sNews = 0, sPrice = 0
  let lastT = from
  let j = 0
  // Walk price events in time; fold in news events as they pass.
  for (const t of price) {
    const dt = (t - lastT) / 60_000
    const decay = Math.exp(-p.beta * dt)
    sNews *= decay; sPrice *= decay
    // News not yet folded in (all later than the previous price event) up to t, each decayed from its own time to t.
    while (j < news.length && news[j] <= t) { sNews += Math.exp(-p.beta * ((t - news[j]) / 60_000)); j++ }
    const lambda = p.mu + p.aNP * sNews + p.aPP * sPrice
    if (!(lambda > 0)) return -Infinity
    ll += Math.log(lambda)
    sPrice += 1
    lastT = t
  }
  // Compensator: ∫λ = μT + (α_NP/β) Σ_news (1 − e^{−β(T − t_j)}) + (α_PP/β) Σ_price (1 − e^{−β(T − t_i)})
  let comp = p.mu * T
  for (const tn of news) if (tn >= from && tn <= to) comp += (p.aNP / p.beta) * (1 - Math.exp(-p.beta * ((to - tn) / 60_000)))
  for (const tp of price) comp += (p.aPP / p.beta) * (1 - Math.exp(-p.beta * ((to - tp) / 60_000)))
  return ll - comp
}

/**
 * Fit by coordinate search over a bounded grid, then refine. Bounded so a
 * degenerate stream cannot drive a parameter to infinity; the bounds are
 * stated in the note. β in [1/720, 1] per minute ⇒ half-lives between ~40s
 * and ~8h.
 */
export function fitHawkes(input: { priceTimes: number[]; newsTimes: number[]; from: number; to: number; threshold?: string }): HawkesFit {
  const price = [...input.priceTimes].filter((t) => t >= input.from && t <= input.to).sort((a, b) => a - b)
  const news = [...input.newsTimes].filter((t) => t >= input.from && t <= input.to).sort((a, b) => a - b)
  const windowMin = Math.max(0, Math.round((input.to - input.from) / 60_000))
  const sample = { newsEvents: news.length, priceEvents: price.length, windowMin }
  const threshold = input.threshold ?? 'caller-defined price events'
  const empty = (note: string): HawkesFit => ({ status: 'INSUFFICIENT DATA', mu: null, alphaNP: null, alphaPP: null, beta: null, halfLifeMin: null, branchingRatio: null, eventsPerRelease: null, shares: null, logLikelihood: null, sample, threshold, note, provenance: 'HISTORICAL' })
  if (news.length < MIN_NEWS_EVENTS) return empty(`${news.length} release(s) in the window — the fit needs at least ${MIN_NEWS_EVENTS}. No kernel is stated.`)
  if (price.length < MIN_PRICE_EVENTS) return empty(`${price.length} price event(s) in the window — the fit needs at least ${MIN_PRICE_EVENTS}. No kernel is stated.`)
  if (!(windowMin > 0)) return empty('Empty window.')

  const baseRate = price.length / windowMin
  const betas = [1 / 720, 1 / 360, 1 / 180, 1 / 90, 1 / 45, 1 / 20, 1 / 10, 1 / 5, 1 / 2, 1]
  const mus = [0.1, 0.25, 0.5, 0.75, 1].map((f) => f * baseRate)
  let best: { p: Params; ll: number } | null = null
  const evalP = (p: Params) => {
    const ll = logLikelihood(p, price, news, input.from, input.to)
    if (Number.isFinite(ll) && (!best || ll > best.ll)) best = { p, ll }
  }
  for (const beta of betas) {
    // α grids scaled to β so the branching ratio α/β spans [0, 0.95].
    const aPPs = [0, 0.1, 0.25, 0.5, 0.75, 0.95].map((b) => b * beta)
    const aNPs = [0, 0.5, 1, 2, 4, 8].map((e) => e * beta)
    for (const mu of mus) for (const aPP of aPPs) for (const aNP of aNPs) evalP({ mu, aNP, aPP, beta })
  }
  if (!best) return empty('The likelihood was not finite anywhere on the grid.')
  // Two rounds of local refinement around the best cell.
  for (let round = 0; round < 2; round++) {
    const b = (best as { p: Params; ll: number }).p
    const scales = round === 0 ? [0.6, 0.8, 1, 1.25, 1.6] : [0.85, 0.95, 1, 1.05, 1.15]
    for (const sm of scales) for (const sn of scales) for (const sp of scales) for (const sb of scales) {
      const p: Params = { mu: b.mu * sm, aNP: b.aNP * sn, aPP: Math.min(b.aPP * sp, 0.98 * b.beta * sb), beta: Math.min(1, Math.max(1 / 720, b.beta * sb)) }
      evalP(p)
    }
  }
  const { p, ll } = best as { p: Params; ll: number }
  const halfLifeMin = HALF / p.beta
  const branchingRatio = p.aPP / p.beta
  const eventsPerRelease = p.aNP / p.beta
  // Integrated intensity shares over the window.
  const T = windowMin
  const newsInt = news.reduce((a, tn) => a + (p.aNP / p.beta) * (1 - Math.exp(-p.beta * ((input.to - tn) / 60_000))), 0)
  const selfInt = price.reduce((a, tp) => a + (p.aPP / p.beta) * (1 - Math.exp(-p.beta * ((input.to - tp) / 60_000))), 0)
  const baseInt = p.mu * T
  const total = baseInt + newsInt + selfInt
  const shares = total > 0 ? { baseline: baseInt / total, news: newsInt / total, self: selfInt / total } : null
  return {
    status: 'ESTIMATED', mu: p.mu, alphaNP: p.aNP, alphaPP: p.aPP, beta: p.beta, halfLifeMin, branchingRatio, eventsPerRelease, shares, logLikelihood: ll, sample, threshold, provenance: 'HISTORICAL',
    note: `ESTIMATED from ${news.length} releases and ${price.length} price events over ${Math.round(windowMin / 1440)} day(s): a release adds about ${eventsPerRelease.toFixed(2)} extra price event(s) over its burst; bursts halve every ${halfLifeMin < 60 ? `${halfLifeMin.toFixed(0)} min` : `${(halfLifeMin / 60).toFixed(1)} h`}; ${(branchingRatio * 100).toFixed(0)}% of price events are echoes of earlier price events (endogenous). Bounded grid MLE (β between 1/720 and 1 per minute, branching ratio capped below 1). Activity only — nothing here says direction.`,
  }
}
