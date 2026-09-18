/**
 * THE BACKTEST OVERFITTING DETECTOR.
 *
 * Try a thousand rule sets on real prices, keep the one with the highest
 * Sharpe, and it will look brilliant even if it is mostly luck. Search long
 * enough and the best result measures how many things you tried, not how
 * robust the strategy is.
 *
 * Two pieces:
 *
 *   1. The DEFLATED SHARPE RATIO (Bailey & López de Prado, 2014), in the full
 *      form: the expected maximum Sharpe of N trials under the null is the
 *      benchmark; the observed Sharpe is tested against it with a standard
 *      error that accounts for track length T, skewness γ3 and kurtosis γ4:
 *
 *         DSR = Φ( (SR − SR*) · √(T − 1) / √(1 − γ3·SR + ((γ4 − 1)/4)·SR²) )
 *
 *      `factory/stats.ts` already has the normal-approximation version the
 *      factory gates on; this adds the moment correction and reports both.
 *
 *   2. The TRIAL REGISTRY. Every backtest evaluation the research lab or the
 *      factory runs is counted, including the ones that were discarded —
 *      forgetting them IS the overfit. The registry is per strategy and global,
 *      append-only, in the kv table.
 *
 * Pure over the R series; the registry is the only thing that touches the store.
 */

import { deflatedSharpe as deflatedNormal, expectedMaxZ, normCdf } from '../factory/stats.ts'
import type { DeflatedSharpe as DeflatedNormal } from '../factory/stats.ts'
import { store } from '../store.ts'

export type Moments = { n: number; mean: number; sd: number; skew: number | null; kurtosis: number | null; sharpe: number | null }

/** Sample moments of a per-trade R series. Kurtosis is the raw fourth standardised moment (3 for a normal). */
export function moments(rs: number[]): Moments {
  const n = rs.length
  if (n === 0) return { n, mean: 0, sd: 0, skew: null, kurtosis: null, sharpe: null }
  const mean = rs.reduce((a, b) => a + b, 0) / n
  if (n < 2) return { n, mean, sd: 0, skew: null, kurtosis: null, sharpe: null }
  const dev = rs.map((r) => r - mean)
  const m2 = dev.reduce((a, d) => a + d * d, 0) / n
  const sd = Math.sqrt(dev.reduce((a, d) => a + d * d, 0) / (n - 1))
  if (!(sd > 0) || !(m2 > 0)) return { n, mean, sd: 0, skew: null, kurtosis: null, sharpe: null }
  const m3 = dev.reduce((a, d) => a + d ** 3, 0) / n
  const m4 = dev.reduce((a, d) => a + d ** 4, 0) / n
  return { n, mean, sd, skew: n >= 3 ? m3 / m2 ** 1.5 : null, kurtosis: n >= 4 ? m4 / (m2 * m2) : null, sharpe: mean / sd }
}

export type DeflatedSharpeFull = {
  observed: number | null
  trials: number
  trackLength: number
  skew: number | null
  kurtosis: number | null
  /** Expected maximum Sharpe under the null for this many trials, per trade. */
  benchmark: number | null
  /** P(SR beats the benchmark) with the moment-corrected standard error. */
  probability: number | null
  /** The factory's normal-approximation figure, for comparison. */
  normalApprox: DeflatedNormal | null
  verdict: 'INSUFFICIENT DATA' | 'LIKELY LUCK' | 'UNCLEAR' | 'SURVIVES DEFLATION'
  note: string
}

/** Minimum trades before the moment correction means anything. */
export const MIN_TRACK = 20

/**
 * The deflated Sharpe ratio with the skew/kurtosis correction. `rs` is the
 * per-trade R series of the candidate; `trials` is how many candidates were
 * evaluated to find it (from the registry — never 1 unless it truly was).
 */
export function deflatedSharpeFull(rs: number[], trials: number, threshold = 0.9): DeflatedSharpeFull {
  const m = moments(rs)
  const base = { trials: Math.max(1, trials), trackLength: m.n, skew: m.skew, kurtosis: m.kurtosis }
  if (m.n < MIN_TRACK || m.sharpe === null || m.skew === null || m.kurtosis === null) {
    return { observed: m.sharpe, ...base, benchmark: null, probability: null, normalApprox: m.n >= 2 && m.sharpe !== null ? deflatedNormal(m.sharpe, m.n, trials) : null, verdict: 'INSUFFICIENT DATA', note: `${m.n} trades is under the ${MIN_TRACK}-trade track length the moment correction needs. No deflated figure is stated.` }
  }
  const sr = m.sharpe
  // Variance of the Sharpe estimator under the null, per trade, times the expected max of N standard draws.
  const seNull = 1 / Math.sqrt(m.n - 1)
  const benchmark = expectedMaxZ(base.trials) * seNull
  const denom = 1 - m.skew * sr + ((m.kurtosis - 1) / 4) * sr * sr
  const probability = denom > 0 ? normCdf(((sr - benchmark) * Math.sqrt(m.n - 1)) / Math.sqrt(denom)) : 0
  const verdict: DeflatedSharpeFull['verdict'] = probability >= threshold ? 'SURVIVES DEFLATION' : probability < 0.5 ? 'LIKELY LUCK' : 'UNCLEAR'
  return {
    observed: sr, ...base, benchmark, probability, normalApprox: deflatedNormal(sr, m.n, trials), verdict,
    note: `Observed per-trade Sharpe ${sr.toFixed(3)} against a chance benchmark of ${benchmark.toFixed(3)} for ${base.trials} trial(s) over ${m.n} trades (skew ${m.skew.toFixed(2)}, kurtosis ${m.kurtosis.toFixed(2)}): P(edge beats luck) = ${(probability * 100).toFixed(1)}%. ${verdict === 'SURVIVES DEFLATION' ? `Clears the ${Math.round(threshold * 100)}% bar — a necessary condition, not a sufficient one.` : verdict === 'LIKELY LUCK' ? 'Below even odds of beating the best-of-N chance result. Most candidates land here, which is why the test exists.' : 'Between even odds and the bar: not dismissed, not supported.'}`,
  }
}

/** How the deflation bar moves with the number of trials — for the lesson and the lab display. */
export function deflationCurve(n: number, trialsList = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000]): Array<{ trials: number; benchmarkSharpe: number }> {
  const seNull = n >= 2 ? 1 / Math.sqrt(n - 1) : NaN
  return trialsList.map((t) => ({ trials: t, benchmarkSharpe: expectedMaxZ(t) * seNull }))
}

// ---------------------------------------------------------------
// The trial registry
// ---------------------------------------------------------------

export type TrialSource = 'factory-campaign' | 'research-lab' | 'evidence-backtest' | 'oos-reference' | 'manual'

export type TrialEntry = { at: number; strategyId: string; source: TrialSource; count: number; note: string }

export type TrialRegistry = { total: number; byStrategy: Record<string, number>; bySource: Record<string, number>; entries: TrialEntry[]; note: string }

const KEY = 'research:trials'
const CAP = 2000

function read(): TrialEntry[] {
  return store().getJson<TrialEntry[]>(KEY) ?? []
}

/** Count `count` evaluations. Returns the running total for the strategy. */
export function recordTrials(e: Omit<TrialEntry, 'at'> & { at?: number }): number {
  if (!(e.count >= 1)) throw new Error('a trial entry counts at least one evaluation')
  const list = read()
  list.push({ at: e.at ?? Date.now(), strategyId: e.strategyId, source: e.source, count: Math.floor(e.count), note: e.note })
  store().setJson(KEY, list.length > CAP ? compact(list) : list)
  return trialsFor(e.strategyId)
}

/** Fold old entries into one per strategy/source so the count is never lost when the list is capped. */
function compact(list: TrialEntry[]): TrialEntry[] {
  const keep = list.slice(-Math.floor(CAP / 2))
  const old = list.slice(0, list.length - keep.length)
  const folded = new Map<string, TrialEntry>()
  for (const e of old) {
    const k = `${e.strategyId}|${e.source}`
    const prev = folded.get(k)
    folded.set(k, prev ? { ...prev, count: prev.count + e.count, at: Math.max(prev.at, e.at) } : { ...e, note: 'folded older entries' })
  }
  return [...folded.values(), ...keep]
}

export function trialsFor(strategyId: string): number {
  return read().filter((e) => e.strategyId === strategyId).reduce((a, e) => a + e.count, 0)
}

export function trialRegistry(): TrialRegistry {
  const entries = read()
  const byStrategy: Record<string, number> = {}
  const bySource: Record<string, number> = {}
  for (const e of entries) { byStrategy[e.strategyId] = (byStrategy[e.strategyId] ?? 0) + e.count; bySource[e.source] = (bySource[e.source] ?? 0) + e.count }
  const total = entries.reduce((a, e) => a + e.count, 0)
  return { total, byStrategy, bySource, entries: entries.slice(-50), note: total === 0 ? 'No evaluations recorded yet. The first backtest counts as trial one.' : `${total} evaluation(s) on record. Every one raises the deflation bar for the strategy it was run on; discarded variants count the same as kept ones.` }
}
