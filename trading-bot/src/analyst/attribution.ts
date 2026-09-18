/**
 * ATTRIBUTION — where the result actually came from, and how much of it is noise.
 *
 * The validation engine already breaks trades down by session, regime and
 * session-of-day, and it already refuses to rank buckets by return. What it does
 * not do is say how *certain* any of those numbers are, and that omission is the
 * single most common way a trading dashboard misleads its owner:
 *
 *     London   avgR +0.41   (3 trades)
 *     New York avgR +0.08   (37 trades)
 *
 * Printed like that, London looks like the edge. It is not. With three trades
 * the interval around +0.41 is wide enough to contain −1R, and the honest
 * statement is "no idea yet". Every number here therefore arrives with the
 * interval around it, and a bucket that cannot support a claim says so instead
 * of showing a figure that invites one.
 *
 * WHAT AN ANALYST ACTUALLY DOES, AND WHAT IS HERE
 *
 *   1. Attribution   — which session, regime and hour the result came from.
 *   2. Uncertainty   — a 95% interval for the TRUE mean, using Student's t,
 *                      because these samples are small and the normal
 *                      approximation is too flattering below ~30 trades.
 *   3. Comparison    — is London genuinely different from New York, or is the
 *                      gap inside the noise? (Welch, which does not assume the
 *                      two buckets have the same variance. They rarely do.)
 *   4. Falsification — how many more trades before a bucket could say anything
 *                      at all, so "not yet" has a number attached to it.
 *   5. Multiple testing — comparing four sessions is six comparisons, and at
 *                      the usual threshold roughly one in four such sets throws
 *                      up a false positive. That is stated, not buried.
 *
 * Pure over its input. It reads closed paper positions and returns numbers; it
 * has no access to the engine, cannot size or place anything, and nothing here
 * feeds back into a trading decision. Paper results are validation data — a
 * breakdown that tuned the strategy would be overfitting with extra steps.
 */

import { paperOutcome } from '../paperTrader.ts'
import { toET } from '../sessions.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { invNorm } from '../factory/stats.ts'
import { multipleTesting } from '../factory/ic.ts'

/** Below this, a bucket is not allowed to state a result at all. */
export const MIN_BUCKET_TRADES = 10

export type Interval = { lo: number; hi: number }

export type BucketVerdict =
  | 'TOO FEW'        // not enough trades to say anything
  | 'INCONCLUSIVE'   // the interval straddles zero
  | 'POSITIVE'       // the whole interval is above zero
  | 'NEGATIVE'       // the whole interval is below zero

export type AttributedBucket = {
  key: string
  trades: number
  avgR: number | null
  totalR: number
  winRate: number | null
  /** Standard error of the mean. Null under two trades — variance needs two points. */
  stdErr: number | null
  /** A 95% interval for the TRUE mean R, not a range of observed outcomes. */
  ci95: Interval | null
  verdict: BucketVerdict
  /**
   * Roughly how many trades this bucket would need before its interval could
   * clear zero, at the currently observed mean and spread. Null when the mean is
   * zero or the spread is unknown — no sample size rescues an edge of nothing.
   */
  tradesNeeded: number | null
  /** What share of all trades, and of all R, this bucket accounts for. */
  shareOfTrades: number
  shareOfTotalR: number | null
  note: string
}

// ---------------------------------------------------------------
// Small-sample statistics
// ---------------------------------------------------------------

/**
 * Two-sided 95% critical value of Student's t.
 *
 * Tabulated for the sizes that actually occur here and interpolated above 30
 * toward the normal 1.96. Using 1.96 throughout would quietly narrow every
 * interval on a small sample, which is the flattering direction.
 */
const T95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
  21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
}

export function tCritical95(df: number): number {
  if (df < 1) return Number.POSITIVE_INFINITY
  if (df <= 30) return T95[Math.floor(df)]
  // Above 30 the t curve approaches the normal; this converges to 1.96 smoothly
  // rather than stepping there.
  return 1.96 + (T95[30] - 1.96) * (30 / df)
}

/** Sample standard deviation (n−1). Null under two points. */
export function sampleSd(xs: number[]): number | null {
  if (xs.length < 2) return null
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(v)
}

/** Mean, standard error and a 95% t-interval for a set of R-multiples. */
export function meanWithInterval(rs: number[]): { mean: number | null; stdErr: number | null; ci95: Interval | null } {
  if (!rs.length) return { mean: null, stdErr: null, ci95: null }
  const mean = rs.reduce((s, x) => s + x, 0) / rs.length
  const sd = sampleSd(rs)
  if (sd === null) return { mean, stdErr: null, ci95: null }
  const stdErr = sd / Math.sqrt(rs.length)
  const t = tCritical95(rs.length - 1)
  return { mean, stdErr, ci95: { lo: mean - t * stdErr, hi: mean + t * stdErr } }
}

/**
 * How many trades before the interval could clear zero, at this mean and spread.
 *
 * From n ≈ (z·sd / |mean|)², the standard sample-size sketch. It is an estimate
 * and it assumes the edge stays what it currently looks like — which is exactly
 * the assumption under test — so it is a rough order of magnitude, not a promise.
 */
export function tradesNeededToDecide(mean: number, sd: number, confidence = 0.95): number | null {
  if (!(Math.abs(mean) > 1e-9) || !(sd > 0)) return null
  const z = invNorm(1 - (1 - confidence) / 2)
  return Math.ceil((z * sd / Math.abs(mean)) ** 2)
}

// ---------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------

/** "14:00" in New York time — the clock the session windows are defined on. */
function hourKey(ms: number): string {
  if (!(ms > 0)) return 'unrecorded'
  return `${String(toET(ms).hour).padStart(2, '0')}:00`
}

function rsOf(list: PaperPosition[]): number[] {
  return list.map((p) => p.rMultiple ?? 0)
}

/**
 * Group taken trades and attribute honestly.
 *
 * Sorted by sample size, never by return — the same rule the validation
 * breakdowns already follow, so a lucky three-trade bucket cannot float to the
 * top of the page and look like a finding.
 */
export function attributeBy(
  closed: PaperPosition[],
  keyFn: (p: PaperPosition) => string,
  minTrades = MIN_BUCKET_TRADES,
): AttributedBucket[] {
  const taken = closed.filter((p) => p.exitReason !== 'missed')
  const totalTrades = taken.length
  const grandTotalR = taken.reduce((s, p) => s + (p.rMultiple ?? 0), 0)

  const byKey = new Map<string, PaperPosition[]>()
  for (const p of taken) {
    const k = keyFn(p) || '—'
    byKey.set(k, [...(byKey.get(k) ?? []), p])
  }

  const out: AttributedBucket[] = []
  for (const [key, list] of byKey) {
    const rs = rsOf(list)
    const { mean, stdErr, ci95 } = meanWithInterval(rs)
    const totalR = rs.reduce((s, x) => s + x, 0)
    const wins = list.filter((p) => paperOutcome(p) === 'WIN').length
    const losses = list.filter((p) => paperOutcome(p) === 'LOSS').length
    const decided = wins + losses
    const sd = sampleSd(rs)

    let verdict: BucketVerdict
    let note: string
    if (list.length < minTrades) {
      verdict = 'TOO FEW'
      note = `${list.length} trade${list.length === 1 ? '' : 's'} — under ${minTrades}, so no result is claimed here. The average is shown for completeness only.`
    } else if (!ci95) {
      verdict = 'TOO FEW'
      note = 'Not enough variation to measure an interval.'
    } else if (ci95.lo > 0) {
      verdict = 'POSITIVE'
      note = `The whole 95% interval sits above zero (${fx(ci95.lo)}R to ${fx(ci95.hi)}R).`
    } else if (ci95.hi < 0) {
      verdict = 'NEGATIVE'
      note = `The whole 95% interval sits below zero (${fx(ci95.lo)}R to ${fx(ci95.hi)}R) — this bucket is losing, not unlucky.`
    } else {
      verdict = 'INCONCLUSIVE'
      note = `The interval straddles zero (${fx(ci95.lo)}R to ${fx(ci95.hi)}R), so this could be an edge or could be nothing.`
    }

    out.push({
      key,
      trades: list.length,
      avgR: mean,
      totalR,
      winRate: decided > 0 ? wins / decided : null,
      stdErr,
      ci95,
      verdict,
      tradesNeeded: mean !== null && sd !== null ? tradesNeededToDecide(mean, sd) : null,
      shareOfTrades: totalTrades > 0 ? list.length / totalTrades : 0,
      shareOfTotalR: Math.abs(grandTotalR) > 1e-9 ? totalR / grandTotalR : null,
      note,
    })
  }
  return out.sort((a, b) => b.trades - a.trades || a.key.localeCompare(b.key))
}

// ---------------------------------------------------------------
// Is that difference real?
// ---------------------------------------------------------------

export type Comparison = {
  a: string
  b: string
  deltaR: number | null
  ci95: Interval | null
  verdict: 'TOO FEW' | 'INDISTINGUISHABLE' | 'A IS BETTER' | 'B IS BETTER'
  note: string
}

/**
 * Welch's interval for the difference of two means.
 *
 * Welch rather than Student because the two buckets almost never have the same
 * variance — a quiet session and a volatile one produce very different spreads,
 * and pooling them would understate the uncertainty on the difference.
 */
export function compareBuckets(a: AttributedBucket, b: AttributedBucket, aRs: number[], bRs: number[], minTrades = MIN_BUCKET_TRADES): Comparison {
  if (a.trades < minTrades || b.trades < minTrades) {
    return {
      a: a.key, b: b.key, deltaR: null, ci95: null, verdict: 'TOO FEW',
      note: `${a.key} has ${a.trades} and ${b.key} has ${b.trades}; ${minTrades} each is the minimum before a comparison means anything.`,
    }
  }
  const sa = sampleSd(aRs), sb = sampleSd(bRs)
  if (sa === null || sb === null || a.avgR === null || b.avgR === null) {
    return { a: a.key, b: b.key, deltaR: null, ci95: null, verdict: 'TOO FEW', note: 'Not enough variation to compare.' }
  }
  const va = sa ** 2 / a.trades, vb = sb ** 2 / b.trades
  const se = Math.sqrt(va + vb)
  // Welch–Satterthwaite degrees of freedom.
  const df = se > 0
    ? (va + vb) ** 2 / ((va ** 2) / (a.trades - 1) + (vb ** 2) / (b.trades - 1))
    : 1
  const delta = a.avgR - b.avgR
  const t = tCritical95(df)
  const ci95 = { lo: delta - t * se, hi: delta + t * se }

  if (ci95.lo > 0) {
    return { a: a.key, b: b.key, deltaR: delta, ci95, verdict: 'A IS BETTER', note: `${a.key} really is ahead of ${b.key} — by ${fx(delta)}R per trade, and the gap survives the uncertainty in both.` }
  }
  if (ci95.hi < 0) {
    return { a: a.key, b: b.key, deltaR: delta, ci95, verdict: 'B IS BETTER', note: `${b.key} really is ahead of ${a.key} — by ${fx(Math.abs(delta))}R per trade, and the gap survives the uncertainty in both.` }
  }
  return {
    a: a.key, b: b.key, deltaR: delta, ci95, verdict: 'INDISTINGUISHABLE',
    note: `${a.key} is ${delta >= 0 ? 'ahead of' : 'behind'} ${b.key} by ${fx(Math.abs(delta))}R, but the plausible range for that gap runs from ${fx(ci95.lo)}R to ${fx(ci95.hi)}R — it includes zero, so the difference is inside the noise.`,
  }
}

/** Every pairwise comparison among buckets that have enough trades to bother. */
export function compareAll(buckets: AttributedBucket[], rsByKey: Map<string, number[]>, minTrades = MIN_BUCKET_TRADES): Comparison[] {
  const eligible = buckets.filter((b) => b.trades >= minTrades)
  const out: Comparison[] = []
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      out.push(compareBuckets(eligible[i], eligible[j], rsByKey.get(eligible[i].key) ?? [], rsByKey.get(eligible[j].key) ?? [], minTrades))
    }
  }
  return out
}

// ---------------------------------------------------------------
// The report
// ---------------------------------------------------------------

/** Round for display without producing "-0.00", which reads as a real value. */
function fx(x: number, digits = 2): string {
  const v = Number(x.toFixed(digits))
  return (Object.is(v, -0) ? 0 : v).toFixed(digits)
}

export type Dimension = { name: string; buckets: AttributedBucket[]; comparisons: Comparison[] }

export type AttributionReport = {
  generatedAt: number
  trades: number
  minBucketTrades: number
  dimensions: Dimension[]
  /** How many pairwise comparisons were run, and what that does to a p-value. */
  multipleComparisons: { tests: number; correctedAlpha: number; note: string }
  /** The honest limits of everything above. */
  caveats: string[]
}

function dimension(name: string, closed: PaperPosition[], keyFn: (p: PaperPosition) => string, minTrades: number): Dimension {
  const buckets = attributeBy(closed, keyFn, minTrades)
  const taken = closed.filter((p) => p.exitReason !== 'missed')
  const rsByKey = new Map<string, number[]>()
  for (const p of taken) {
    const k = keyFn(p) || '—'
    rsByKey.set(k, [...(rsByKey.get(k) ?? []), p.rMultiple ?? 0])
  }
  return { name, buckets, comparisons: compareAll(buckets, rsByKey, minTrades) }
}

/** Attribution across every dimension that is recorded on a paper trade. */
export function attributionReport(closed: PaperPosition[], opts: { now?: number; minTrades?: number } = {}): AttributionReport {
  const minTrades = opts.minTrades ?? MIN_BUCKET_TRADES
  const taken = closed.filter((p) => p.exitReason !== 'missed')

  const dimensions: Dimension[] = [
    dimension('Session', closed, (p) => p.session || 'outside a session', minTrades),
    dimension('Market regime', closed, (p) => p.regime ?? 'unrecorded', minTrades),
    dimension('Direction', closed, (p) => p.direction, minTrades),
    // Hour of day, New York time — the same clock the sessions are cut on, so
    // this slices *inside* a session rather than restating it.
    //
    // Deliberately NOT "how it ended": grouping by exit reason is circular. Of
    // course targets average about +2R and stops about −1R; that is the
    // definition of a target and a stop, not a finding, and printing it invites
    // the useless conclusion "take more targets".
    dimension('Hour (New York)', closed, (p) => hourKey(p.openedAt), minTrades),
  ]

  const tests = dimensions.reduce((s, d) => s + d.comparisons.filter((c) => c.verdict !== 'TOO FEW').length, 0)
  const mt = multipleTesting(Math.max(1, tests))

  return {
    generatedAt: opts.now ?? Date.now(),
    trades: taken.length,
    minBucketTrades: minTrades,
    dimensions,
    multipleComparisons: {
      tests,
      correctedAlpha: mt.bonferroni,
      note: tests <= 1
        ? 'Not enough comparisons yet for multiple testing to matter.'
        : `${tests} comparisons were run. Testing that many at once, roughly one set in ${Math.max(2, Math.round(1 / (1 - Math.pow(0.95, tests))))} throws up a false positive by chance, so a single "better" result here is weaker than it looks. The Bonferroni-corrected threshold is ${mt.bonferroni.toFixed(4)}.`,
    },
    caveats: [
      'These are PAPER results. They are validation data, not a target to tune against — a breakdown used to pick settings is overfitting with extra steps.',
      'Every interval assumes trades are independent. Trades clustered in one week of one regime are not, so the true uncertainty is wider than shown.',
      'A bucket is a slice of an already small sample. Slicing further makes each piece less certain, not more informative.',
      'Nothing here predicts the next trade. It describes what already happened, with the error bars that description deserves.',
    ],
  }
}

/** The report as plain text — for a terminal, a cron, or a glance. */
export function renderAttribution(r: AttributionReport): string {
  const L: string[] = []
  const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(0)}%`)
  const R = (x: number | null) => (x === null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2) + 'R')

  L.push(`ATTRIBUTION — ${r.trades} paper trade${r.trades === 1 ? '' : 's'}`)
  L.push(`A bucket needs ${r.minBucketTrades} trades before it is allowed to claim anything.`)
  L.push('')
  if (r.trades === 0) {
    L.push('No paper trades yet, so there is nothing to attribute. This page will stay empty')
    L.push('until the paper run has actually traded — which is the correct thing for it to do.')
    L.push('')
  }
  for (const d of r.dimensions) {
    L.push(`${d.name.toUpperCase()}`)
    if (!d.buckets.length) L.push('  (nothing recorded yet)')
    for (const b of d.buckets) {
      const ci = b.ci95 ? `[${b.ci95.lo.toFixed(2)} … ${b.ci95.hi.toFixed(2)}]` : '[—]'
      L.push(`  ${b.key.padEnd(20)} ${String(b.trades).padStart(4)} trades  avg ${R(b.avgR).padStart(7)}  95% ${ci.padEnd(20)} win ${pct(b.winRate).padStart(4)}  ${b.verdict}`)
      L.push(`    ${b.note}`)
      if (b.verdict === 'INCONCLUSIVE' && b.tradesNeeded !== null) {
        L.push(`    At this rate it would take roughly ${b.tradesNeeded} trades in this bucket to tell.`)
      }
    }
    const said = d.comparisons.filter((c) => c.verdict !== 'TOO FEW')
    if (said.length) {
      L.push('  Comparisons:')
      for (const c of said) L.push(`    ${c.verdict.padEnd(17)} ${c.note}`)
    }
    L.push('')
  }
  L.push(`MULTIPLE COMPARISONS: ${r.multipleComparisons.note}`)
  L.push('')
  L.push('WHAT THIS DOES NOT TELL YOU')
  for (const c of r.caveats) L.push(`  • ${c}`)
  return L.join('\n')
}
