/**
 * THE LOCKED HOLDOUT GATE — the last thing that runs, and the only thing that
 * gets to touch the out-of-sample window.
 *
 * WHY THIS EXISTS
 *
 * Selection is fitting. When a campaign picks the best of N genomes by their
 * score on a segment, that score becomes a max-of-N statistic: the survivor was
 * chosen *because* it did well there, so the number can no longer be evidence
 * that the edge generalises. Before this module existed, `select.ts` gated on
 * the out-of-sample window — which meant the holdout was spent during selection
 * and there was nothing clean left to test against.
 *
 * Now: train fits, validation selects, and this module opens the out-of-sample
 * envelope ONCE, at the end, on the handful of genomes that already survived.
 *
 * FOUR CHECKS, EACH KILLING A DIFFERENT SELF-DECEPTION
 *
 *  1. Enough holdout trades — a great number on six trades is a coin flip.
 *  2. The edge HELD — expectancy must not collapse from the selection segment
 *     to the holdout. A strategy that scored 0.6R selecting and 0.1R on fresh
 *     data was fitted, not discovered.
 *  3. Deflated Sharpe — the observed Sharpe must beat what the BEST of N random
 *     trials would be expected to produce. This is the primary multiple-testing
 *     correction, and a better-founded one than Bonferroni for picking a maximum
 *     out of correlated trials.
 *  4. Corrected significance — a one-sided p-value for "expectancy > 0" against
 *     a Bonferroni/Šidák-corrected alpha, as a familiar cross-check.
 *
 * A genome must pass ALL FOUR. Anything else is discarded no matter how good it
 * looked during selection.
 *
 * WHAT PASSING DOES NOT MEAN. It does not mean the strategy is profitable. It
 * means one specific way of fooling yourself has been ruled out on one dataset.
 * Forward paper trading, then shadow, then testnet remain — those are the only
 * genuinely out-of-sample data there is, because they had not happened yet.
 */

import { config } from '../../config.ts'
import { deflatedSharpe } from './stats.ts'
import type { DeflatedSharpe } from './stats.ts'
import { multipleTesting } from './ic.ts'
import type { MultipleTesting } from './ic.ts'
import type { Judged } from './select.ts'

export type GateCriteria = {
  /** Minimum trades in the holdout before its numbers are trusted at all. */
  minHoldoutTrades: number
  /** The most the expectancy may fall from selection to holdout, as a share (0.5 = may halve). */
  maxDegradation: number
  /** Deflated-Sharpe confidence the holdout must clear. */
  deflatedSharpeMin: number
  /** Family-wise alpha before correction. */
  alpha: number
}

export function defaultGateCriteria(): GateCriteria {
  return {
    minHoldoutTrades: config.factory.minOosTrades,
    maxDegradation: 0.5,
    deflatedSharpeMin: config.factory.deflatedSharpeMin,
    alpha: 0.05,
  }
}

export type GateVerdict = {
  id: string
  params: Record<string, number>
  /** What selection saw (validation segment). */
  selectionAvgR: number | null
  /** What the locked holdout says. */
  holdoutTrades: number
  holdoutAvgR: number | null
  holdoutSharpe: number | null
  /** (selection − holdout) / |selection|. Positive means the edge shrank. */
  degradation: number | null
  deflated: DeflatedSharpe
  pValue: number | null
  correctedAlpha: number
  enoughTrades: boolean
  heldUp: boolean
  passedDeflated: boolean
  passedSignificance: boolean
  /** All four, or it is not viable. */
  viable: boolean
  reasons: string[]
}

export type GateResult = {
  trials: number
  criteria: GateCriteria
  multipleTesting: MultipleTesting
  verdicts: GateVerdict[]
  viable: GateVerdict[]
  note: string
}

/**
 * One-sided p-value for "mean R > 0" implied by a per-trade Sharpe over n
 * trades. `sharpeR` is mean/stdev per trade, so the t-statistic is
 * sharpe × √n. Normal approximation — trade returns are skewed and fat-tailed,
 * so this is a cross-check, never the verdict on its own.
 */
export function pValueFromSharpe(sharpeR: number | null, trades: number): number | null {
  if (sharpeR === null || !Number.isFinite(sharpeR) || trades < 3) return null
  const t = sharpeR * Math.sqrt(trades)
  if (t <= 0) return 1
  // Abramowitz & Stegun 7.1.26 complementary error function.
  const z = t / Math.SQRT2
  const a = Math.abs(z)
  const u = 1 / (1 + a / 2)
  const r = u * Math.exp(-a * a - 1.26551223 + u * (1.00002368 + u * (0.37409196 + u * (0.09678418 +
    u * (-0.18628806 + u * (0.27886807 + u * (-1.13520398 + u * (1.48851587 +
    u * (-0.82215223 + u * 0.17087277)))))))))
  return Math.min(1, Math.max(0, 0.5 * (z >= 0 ? r : 2 - r)))
}

/**
 * Open the envelope. `trials` must be the TOTAL number of genomes evaluated
 * across the whole campaign — every round — because that is what the correction
 * has to account for. Passing only the final round's count would understate it
 * and quietly weaken the gate.
 */
export function finalGate(survivors: Judged[], trials: number, criteria: GateCriteria = defaultGateCriteria()): GateResult {
  const mt = multipleTesting(trials, criteria.alpha)
  const verdicts: GateVerdict[] = survivors.map((s) => {
    const reasons: string[] = []
    const oos = s.evaluation.report.outOfSample
    const holdoutTrades = oos.trades
    const holdoutAvgR = oos.avgR
    const holdoutSharpe = oos.sharpeR

    const enoughTrades = holdoutTrades >= criteria.minHoldoutTrades
    if (!enoughTrades) reasons.push(`Only ${holdoutTrades} holdout trade(s); needs ${criteria.minHoldoutTrades}. Not judged on the rest.`)

    // Degradation: how much of the selection-segment edge survived.
    const sel = s.selectionAvgR
    const degradation = sel !== null && holdoutAvgR !== null && Math.abs(sel) > 1e-9
      ? (sel - holdoutAvgR) / Math.abs(sel)
      : null
    const heldUp = degradation !== null && degradation <= criteria.maxDegradation && (holdoutAvgR ?? -Infinity) > 0
    if (degradation === null) reasons.push('Cannot compare selection with holdout — one of the two has no expectancy.')
    else if ((holdoutAvgR ?? -Infinity) <= 0) reasons.push(`Holdout expectancy ${holdoutAvgR === null ? '—' : holdoutAvgR.toFixed(3)}R is not positive: the edge did not survive fresh data.`)
    else if (!heldUp) reasons.push(`Expectancy fell ${(degradation * 100).toFixed(0)}% from selection (${sel!.toFixed(3)}R) to holdout (${holdoutAvgR!.toFixed(3)}R), past the ${(criteria.maxDegradation * 100).toFixed(0)}% allowed — that is the signature of a fit, not an edge.`)

    const deflated = deflatedSharpe(holdoutSharpe ?? 0, holdoutTrades, trials)
    const passedDeflated = deflated.probability >= criteria.deflatedSharpeMin
    if (!passedDeflated) reasons.push(`Deflated Sharpe confidence ${(deflated.probability * 100).toFixed(0)}% on the holdout is under ${(criteria.deflatedSharpeMin * 100).toFixed(0)}% for ${trials} trial(s).`)

    const pValue = pValueFromSharpe(holdoutSharpe, holdoutTrades)
    const passedSignificance = pValue !== null && pValue <= mt.bonferroni
    if (pValue === null) reasons.push('No p-value could be computed for the holdout sample.')
    else if (!passedSignificance) reasons.push(`Holdout p-value ${pValue.toExponential(2)} does not clear the Bonferroni-corrected ${mt.bonferroni.toExponential(2)} for ${trials} trial(s).`)

    const viable = enoughTrades && heldUp && passedDeflated && passedSignificance
    if (viable) reasons.push('VIABLE: survived the locked holdout on all four checks. This rules out one way of fooling yourself — it is not proof of profitability.')

    return {
      id: s.id, params: s.evaluation.genome.params,
      selectionAvgR: sel, holdoutTrades, holdoutAvgR, holdoutSharpe,
      degradation, deflated, pValue, correctedAlpha: mt.bonferroni,
      enoughTrades, heldUp, passedDeflated, passedSignificance, viable, reasons,
    }
  })

  const viable = verdicts.filter((v) => v.viable)
  return {
    trials, criteria, multipleTesting: mt, verdicts, viable,
    note: viable.length
      ? `${viable.length} of ${verdicts.length} survivor(s) cleared the locked holdout after correcting for ${trials} trial(s). Forward paper, shadow and testnet validation still stand between this and real capital.`
      : `NO survivor cleared the locked holdout after correcting for ${trials} trial(s). That is the expected outcome for most campaigns and it is the gate doing its job.`,
  }
}

/** A short human report of the gate, for the CLI and the campaign log. */
export function renderGate(r: GateResult): string[] {
  const out: string[] = []
  out.push(`LOCKED HOLDOUT GATE — ${r.verdicts.length} survivor(s), corrected for ${r.trials} trial(s)`)
  out.push(`  ${r.multipleTesting.note}`)
  for (const v of r.verdicts) {
    const p = Object.entries(v.params).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${k}=${x}`).join(' ')
    out.push(`  [${v.viable ? 'VIABLE' : ' fail '}] ${p || '(defaults)'}`)
    out.push(`      selection ${v.selectionAvgR === null ? '—' : v.selectionAvgR.toFixed(3) + 'R'} → holdout ${v.holdoutAvgR === null ? '—' : v.holdoutAvgR.toFixed(3) + 'R'} over ${v.holdoutTrades} trade(s)`)
    for (const reason of v.reasons) out.push(`      · ${reason}`)
  }
  out.push(`  ${r.note}`)
  return out
}
