/**
 * THE FALSIFIABLE THESIS — what we currently observe, what would change our
 * minds, and the number that would prove us wrong.
 *
 * A performance table invites belief; this panel invites disproof. For each
 * cohort it states the observation with its interval and its count, then
 * commits — in advance, in numbers — to the result that would falsify it.
 *
 * THE THRESHOLD IS DERIVED, NOT CHOSEN. Under the thesis "the true mean is what
 * we observed", the next N trades will average below
 *
 *     X = μ − t₉₅(N−1) · s / √N
 *
 * only 2.5% of the time. Observing that is the falsification event. μ and s
 * are the observed mean and sample standard deviation; N is the configured
 * research threshold (`config.replay.minSetupsForConfidence`), the same one
 * the backtester and the paper gates use. Nothing here is a number somebody
 * liked the look of, and the method is printed beside every threshold.
 *
 * NOT ESTABLISHED is the default, and it is the answer for most cohorts most
 * of the time: under the sample bar, with no interval, or with an interval that
 * includes zero, there is no thesis to falsify because nothing has been
 * observed yet. No falsification claim is presented as established, and no
 * status in this file is spelt "proven".
 *
 * Read-only. Nothing here reaches the engine.
 */

import { config } from '../../config.ts'
import { tCritical95 } from './attribution.ts'
import { SAMPLE_BARS } from './cohorts.ts'
import type { Cohort } from './cohorts.ts'
import type { Interval } from './attribution.ts'

export type ThesisStatus = 'NOT ESTABLISHED' | 'OBSERVED POSITIVE' | 'OBSERVED NEGATIVE'

export type Falsification = {
  /** How many qualifying trades the test runs over. */
  nextTrades: number
  /** The mean R those trades would have to come in below (positive thesis) or above (negative thesis). */
  meanThresholdR: number
  /** Where the number came from, in words a reader can check. */
  method: string
  thresholdSource: 'observed distribution × configured research threshold'
}

export type Thesis = {
  cohort: string
  source: Cohort['provenance']['source']
  n: number
  status: ThesisStatus
  /** The observation, with its interval and count. */
  observation: string
  meanR: number | null
  ci95: Interval | null
  /** What would move this conclusion, in either direction. */
  wouldChange: string[]
  /** The commitment: the result that would falsify it. Null while NOT ESTABLISHED. */
  falsification: Falsification | null
  wouldFalsify: string
  /** What is NOT being claimed, so the panel cannot be read as more than it is. */
  limits: string[]
}

const fx = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}`

/**
 * Build the thesis for one cohort.
 *
 * `nextTrades` defaults to the configured research threshold; a caller may pass
 * an explicitly configured alternative but never an ad-hoc one — the field
 * name in the output says where it came from.
 */
export function thesisFor(c: Cohort, nextTrades = config.replay.minSetupsForConfidence): Thesis {
  const s = c.stats
  const base = { cohort: c.name, source: c.provenance.source, n: s.n, meanR: s.meanR, ci95: s.ci95 }
  const limits = [
    `Source: ${c.provenance.source} — ${c.provenance.dataType}. ${c.provenance.source === 'BACKTEST' ? 'A simulation; it never queued behind a real spread.' : 'Simulated execution against real market data.'}`,
    'An observed mean describes the past sample. It is not a forecast and not a claim about future profitability.',
    'A cohort selected because it looked good is subject to selection bias; the interval does not correct for that.',
  ]

  if (s.n < SAMPLE_BARS.insufficient) {
    return {
      ...base, status: 'NOT ESTABLISHED',
      observation: s.n === 0 ? 'No trades in this cohort. Nothing is observed.' : `${s.n} trade${s.n === 1 ? '' : 's'} — under the ${SAMPLE_BARS.insufficient} needed before an observation is stated.`,
      wouldChange: [`Reaching ${SAMPLE_BARS.insufficient} trades would allow an observation to be stated with its interval.`],
      falsification: null,
      wouldFalsify: 'Nothing to falsify: no thesis has been formed.',
      limits,
    }
  }
  if (!s.ci95 || s.meanR === null || s.sdR === null) {
    return {
      ...base, status: 'NOT ESTABLISHED',
      observation: `${s.n} trades with no measurable interval.`,
      wouldChange: ['Variation across trades is needed before an interval can be measured.'],
      falsification: null, wouldFalsify: 'Nothing to falsify: no interval could be measured.', limits,
    }
  }

  const { lo, hi } = s.ci95
  const observation = `Observed mean R of ${fx(s.meanR)} (95% interval ${fx(lo)} to ${fx(hi)}) over ${s.n} ${c.provenance.source} trades. Status: ${s.status}.`

  if (lo <= 0 && hi >= 0) {
    return {
      ...base, status: 'NOT ESTABLISHED',
      observation,
      wouldChange: [
        `The interval includes zero. At the observed mean and spread, roughly ${s.tradesNeeded === null ? 'an unknown number of' : s.tradesNeeded} trades would be needed before it could clear zero — if the edge stays what it currently looks like, which is the thing under test.`,
        'A shift in the regime mix of the cohort would change what this number describes.',
      ],
      falsification: null,
      wouldFalsify: 'No thesis to falsify yet: the sample is consistent with a positive edge, no edge, and a negative one.',
      limits,
    }
  }

  const positive = lo > 0
  const t = tCritical95(nextTrades - 1)
  const halfWidth = (t * s.sdR) / Math.sqrt(nextTrades)
  const threshold = positive ? s.meanR - halfWidth : s.meanR + halfWidth
  const falsification: Falsification = {
    nextTrades,
    meanThresholdR: threshold,
    method: `X = μ ${positive ? '−' : '+'} t₉₅(${nextTrades - 1}) · s / √${nextTrades} with μ = ${fx(s.meanR)}, s = ${s.sdR.toFixed(2)}, t = ${t.toFixed(2)}. Under the thesis, the next ${nextTrades} trades average ${positive ? 'below' : 'above'} X about 2.5% of the time.`,
    thresholdSource: 'observed distribution × configured research threshold',
  }
  return {
    ...base,
    status: positive ? 'OBSERVED POSITIVE' : 'OBSERVED NEGATIVE',
    observation,
    wouldChange: [
      `The next ${nextTrades} qualifying trades, added to the sample, widening or shifting the interval back across zero.`,
      'A change in the regime or session mix of the cohort, which would make the past sample describe different conditions than the new one.',
      'A data-quality degradation in the period — a stale feed or a gap — which would remove trades from the sample rather than add to it.',
    ],
    falsification,
    wouldFalsify: `If the next ${nextTrades} qualifying ${c.provenance.source} trades in this cohort produce a mean R ${positive ? 'below' : 'above'} ${fx(threshold)}, the thesis is falsified at the 95% level.`,
    limits: [...limits, 'OBSERVED means the interval excludes zero in this sample. It does not mean established, and the falsification threshold is the standing test of it.'],
  }
}

/** Theses for every cohort in a list, NOT ESTABLISHED ones included — their absence would be the flattering omission. */
export function thesesFor(cohorts: Cohort[], nextTrades?: number): Thesis[] {
  return cohorts.map((c) => thesisFor(c, nextTrades))
}

export function renderThesis(t: Thesis): string {
  const L: string[] = []
  L.push(`${t.cohort}  [${t.source}]  THESIS STATUS: ${t.status}`)
  L.push(`  CURRENT OBSERVATION: ${t.observation}`)
  L.push('  WHAT WOULD CHANGE THIS CONCLUSION?')
  for (const w of t.wouldChange) L.push(`    • ${w}`)
  L.push(`  WHAT WOULD FALSIFY IT? ${t.wouldFalsify}`)
  if (t.falsification) L.push(`    method: ${t.falsification.method}`)
  L.push('  NOT CLAIMED:')
  for (const l of t.limits) L.push(`    • ${l}`)
  return L.join('\n')
}
