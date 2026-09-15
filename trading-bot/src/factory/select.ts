/**
 * Survivor selection — the part that says no. A genome only survives if it
 * clears every gate, each of which exists to kill a specific way of fooling
 * yourself:
 *
 *  1. enough out-of-sample trades — a handful of trades proves nothing.
 *  2. a real out-of-sample edge — the number it never fit on must be positive.
 *  3. parameter stability — it and its neighbours must work, so it is a plateau
 *     you could actually stand on, not a spike that vanishes if a knob slips.
 *  4. deflated Sharpe — it must beat the best result you'd expect from chance
 *     given how many genomes were tried. The more you tried, the higher the bar.
 *
 * Pure over the evaluations: it reads the reports the backtester produced and
 * the grid schema, and returns a ranked, fully-reasoned verdict. It enables
 * nothing.
 */

import { config } from '../../config.ts'
import type { ParamSpec } from '../strategies/types.ts'
import { genomeId, neighbours } from './genome.ts'
import type { GenomeEvaluation } from './evaluate.ts'
import { deflatedSharpe } from './stats.ts'
import type { DeflatedSharpe } from './stats.ts'

export type SelectionCriteria = {
  minOosTrades: number
  minOosAvgR: number
  stabilityMinShare: number
  deflatedSharpeMin: number
}

export function defaultCriteria(): SelectionCriteria {
  return {
    minOosTrades: config.factory.minOosTrades,
    minOosAvgR: config.factory.minOosAvgR,
    stabilityMinShare: config.factory.stabilityMinShare,
    deflatedSharpeMin: config.factory.deflatedSharpeMin,
  }
}

export type Judged = {
  id: string
  evaluation: GenomeEvaluation
  oosTrades: number
  oosAvgR: number | null
  oosSharpe: number | null
  /** Gate results, each with the reason it passed or failed. */
  enoughTrades: boolean
  positiveOos: boolean
  stable: boolean
  /** Share of (this genome + evaluated neighbours) that were profitable out-of-sample. */
  stabilityShare: number
  neighboursTested: number
  deflated: DeflatedSharpe
  passedDeflated: boolean
  survived: boolean
  reasons: string[]
}

export type SelectionResult = {
  /** How many distinct genomes were evaluated — the multiple-testing count applied to every deflated Sharpe. */
  trials: number
  survivors: Judged[]
  all: Judged[]
}

/**
 * Judge every evaluation. `trials` is the number of genomes tried in the
 * campaign — the multiple-testing count the deflated Sharpe is corrected for.
 * A genome that is not backtestable is judged and rejected, never silently
 * dropped.
 */
export function select(evaluations: GenomeEvaluation[], schema: ParamSpec[], criteria: SelectionCriteria = defaultCriteria(), trials = evaluations.length): SelectionResult {
  const byId = new Map<string, GenomeEvaluation>(evaluations.map((e) => [e.id, e]))
  const judged: Judged[] = evaluations.map((e) => judge(e, byId, schema, criteria, trials))
  const survivors = judged.filter((j) => j.survived).sort(rank)
  return { trials, survivors, all: judged.sort(rank) }
}

/** Rank best-first: out-of-sample expectancy, then deflated-Sharpe confidence. */
function rank(a: Judged, b: Judged): number {
  const ar = a.oosAvgR ?? -Infinity, br = b.oosAvgR ?? -Infinity
  if (br !== ar) return br - ar
  return b.deflated.probability - a.deflated.probability
}

function judge(e: GenomeEvaluation, byId: Map<string, GenomeEvaluation>, schema: ParamSpec[], criteria: SelectionCriteria, trials: number): Judged {
  const reasons: string[] = []
  const oos = e.report.outOfSample
  const oosTrades = oos.trades
  const oosAvgR = oos.avgR
  const oosSharpe = oos.sharpeR

  if (e.report.notBacktestable) {
    return { id: e.id, evaluation: e, oosTrades: 0, oosAvgR: null, oosSharpe: null, enoughTrades: false, positiveOos: false, stable: false, stabilityShare: 0, neighboursTested: 0, deflated: { observed: 0, benchmark: Infinity, probability: 0 }, passedDeflated: false, survived: false, reasons: ['Not backtestable — cannot be judged on candles.'] }
  }

  const enoughTrades = oosTrades >= criteria.minOosTrades
  if (!enoughTrades) reasons.push(`Only ${oosTrades} out-of-sample trade(s); needs ${criteria.minOosTrades}.`)

  const positiveOos = (oosAvgR ?? -Infinity) >= criteria.minOosAvgR
  if (!positiveOos) reasons.push(`Out-of-sample expectancy ${oosAvgR === null ? '—' : oosAvgR.toFixed(3)}R is under the ${criteria.minOosAvgR}R floor.`)

  // Stability: this genome plus its evaluated neighbours, share profitable OOS.
  const family = [e, ...neighbours(e.genome, schema).map((g) => byId.get(genomeId(g))).filter((x): x is GenomeEvaluation => !!x)]
  const neighboursTested = family.length - 1
  const profitable = family.filter((f) => (f.report.outOfSample.avgR ?? -Infinity) > 0).length
  const stabilityShare = family.length ? profitable / family.length : 0
  const stable = neighboursTested > 0 && stabilityShare >= criteria.stabilityMinShare
  if (neighboursTested === 0) reasons.push('No neighbours were tested, so parameter stability is unproven.')
  else if (!stable) reasons.push(`Only ${(stabilityShare * 100).toFixed(0)}% of it and its neighbours are profitable out-of-sample (needs ${(criteria.stabilityMinShare * 100).toFixed(0)}%): a spike, not a plateau.`)

  const deflated = deflatedSharpe(oosSharpe ?? 0, oosTrades, trials)
  const passedDeflated = deflated.probability >= criteria.deflatedSharpeMin
  if (!passedDeflated) reasons.push(`Deflated Sharpe confidence ${(deflated.probability * 100).toFixed(0)}% is under ${(criteria.deflatedSharpeMin * 100).toFixed(0)}% for ${trials} trial(s) — inside what chance alone would produce.`)

  const survived = enoughTrades && positiveOos && stable && passedDeflated
  if (survived) reasons.push('Survived every gate: enough out-of-sample trades, a real edge, a stable plateau, and a deflated Sharpe that beats chance.')

  return { id: e.id, evaluation: e, oosTrades, oosAvgR, oosSharpe, enoughTrades, positiveOos, stable, stabilityShare, neighboursTested, deflated, passedDeflated, survived, reasons }
}
