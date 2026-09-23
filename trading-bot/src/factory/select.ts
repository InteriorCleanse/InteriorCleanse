/**
 * Survivor selection — the part that says no. A genome only survives if it
 * clears every gate, each of which exists to kill a specific way of fooling
 * yourself:
 *
 *  1. enough SELECTION trades — a handful of trades proves nothing.
 *  2. a real edge on the SELECTION segment — positive expectancy off the fit.
 *  3. parameter stability — it and its neighbours must work, so it is a plateau
 *     you could actually stand on, not a spike that vanishes if a knob slips.
 *  4. deflated Sharpe — it must beat the best result you'd expect from chance
 *     given how many genomes were tried. The more you tried, the higher the bar.
 *
 * WHICH SEGMENT THIS JUDGES, AND WHY IT CHANGED
 *
 * These gates run on the VALIDATION window, not the out-of-sample one. That is
 * the whole point: selection is *fitting*. Picking the best of N genomes by
 * their out-of-sample score makes that score a max-of-N statistic and burns the
 * holdout — every survivor was chosen precisely because it happened to do well
 * there, so it can no longer serve as evidence that the edge generalises.
 *
 * Train fits. Validation selects. Out-of-sample is LOCKED and touched exactly
 * once, by `gate.ts`, after selection is finished.
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
  /** Metrics from the SELECTION segment (validation), not the locked holdout. */
  selectionTrades: number
  selectionAvgR: number | null
  selectionSharpe: number | null
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

/** Rank best-first: selection-segment expectancy, then deflated-Sharpe confidence. */
function rank(a: Judged, b: Judged): number {
  const ar = a.selectionAvgR ?? -Infinity, br = b.selectionAvgR ?? -Infinity
  if (br !== ar) return br - ar
  return b.deflated.probability - a.deflated.probability
}

function judge(e: GenomeEvaluation, byId: Map<string, GenomeEvaluation>, schema: ParamSpec[], criteria: SelectionCriteria, trials: number): Judged {
  const reasons: string[] = []
  // The SELECTION segment. Never the holdout — see the note at the top of this file.
  const sel = e.report.validation
  const selectionTrades = sel.trades
  const selectionAvgR = sel.avgR
  const selectionSharpe = sel.sharpeR

  if (e.report.notBacktestable) {
    return { id: e.id, evaluation: e, selectionTrades: 0, selectionAvgR: null, selectionSharpe: null, enoughTrades: false, positiveOos: false, stable: false, stabilityShare: 0, neighboursTested: 0, deflated: { observed: 0, benchmark: Infinity, probability: 0 }, passedDeflated: false, survived: false, reasons: ['Not backtestable — cannot be judged on candles.'] }
  }

  const enoughTrades = selectionTrades >= criteria.minOosTrades
  if (!enoughTrades) reasons.push(`Only ${selectionTrades} selection-segment trade(s); needs ${criteria.minOosTrades}.`)

  const positiveOos = (selectionAvgR ?? -Infinity) >= criteria.minOosAvgR
  if (!positiveOos) reasons.push(`Selection-segment expectancy ${selectionAvgR === null ? '—' : selectionAvgR.toFixed(3)}R is under the ${criteria.minOosAvgR}R floor.`)

  // Stability: this genome plus its evaluated neighbours, share profitable OOS.
  const family = [e, ...neighbours(e.genome, schema).map((g) => byId.get(genomeId(g))).filter((x): x is GenomeEvaluation => !!x)]
  const neighboursTested = family.length - 1
  const profitable = family.filter((f) => (f.report.validation.avgR ?? -Infinity) > 0).length
  const stabilityShare = family.length ? profitable / family.length : 0
  const stable = neighboursTested > 0 && stabilityShare >= criteria.stabilityMinShare
  if (neighboursTested === 0) reasons.push('No neighbours were tested, so parameter stability is unproven.')
  else if (!stable) reasons.push(`Only ${(stabilityShare * 100).toFixed(0)}% of it and its neighbours are profitable on the selection segment (needs ${(criteria.stabilityMinShare * 100).toFixed(0)}%): a spike, not a plateau.`)

  const deflated = deflatedSharpe(selectionSharpe ?? 0, selectionTrades, trials)
  const passedDeflated = deflated.probability >= criteria.deflatedSharpeMin
  if (!passedDeflated) reasons.push(`Deflated Sharpe confidence ${(deflated.probability * 100).toFixed(0)}% is under ${(criteria.deflatedSharpeMin * 100).toFixed(0)}% for ${trials} trial(s) — inside what chance alone would produce.`)

  const survived = enoughTrades && positiveOos && stable && passedDeflated
  if (survived) reasons.push('Survived selection: enough trades, a real edge on the selection segment, a stable plateau, and a deflated Sharpe that beats chance. The locked holdout has NOT been consulted yet.')

  return { id: e.id, evaluation: e, selectionTrades, selectionAvgR, selectionSharpe, enoughTrades, positiveOos, stable, stabilityShare, neighboursTested, deflated, passedDeflated, survived, reasons }
}
