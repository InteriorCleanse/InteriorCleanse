/**
 * THE SIGNIFICANCE ENGINE — which events are worth studying.
 *
 * Not every candle is a lesson. This scores an observation from measurable
 * properties the engine already produced — displacement in ATRs, the
 * volatility ratio, sweep depth, strategy disagreement, near-miss rejections,
 * the kind of regime transition, and for paper events the excursions and the
 * result against the strategy's own cohort — and states WHY. It does not
 * predict returns and it does not know the outcome of anything it scores:
 * every input is available at the event's own candle close, except the paper
 * exit inputs, which are about a trade that has already closed.
 *
 * Pure. Same input, same score, same reasons.
 */

import type { ObservationType, Significance } from './events.ts'

export const SELECT_AT = 50

export type SignificanceInput = {
  type: ObservationType
  /** The event candle's range in ATRs. */
  rangeAtr?: number | null
  /** Current ATR over its longer average. */
  volRatio?: number | null
  sweepDepthAtr?: number | null
  gapSizeAtr?: number | null
  fromDisplacement?: boolean | null
  votes?: { buys: number; sells: number; nearMisses: number } | null
  regimeFrom?: string | null
  regimeTo?: string | null
  newsImpact?: string | null
  flow?: { bigTrades: number; deltaUsd: number; bigTradeUsd: number } | null
  paper?: {
    rMultiple: number | null
    cohortMean: number | null
    cohortSd: number | null
    cohortN: number
    maeR: number | null
    mfeR: number | null
    maeP10: number | null
    mfeP90: number | null
    excursionN: number
    fusedScore: number | null
    quality: number | null
    enterScore: number
    missedCategory?: string | null
  } | null
}

const fx = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}`

export function scoreSignificance(i: SignificanceInput): Significance {
  let score = 0
  const reasons: string[] = []
  const basis: Significance['basis'] = { type: i.type }
  const add = (pts: number, why: string) => { score += pts; reasons.push(why) }

  // Displacement and volatility — the candle itself.
  if (i.rangeAtr !== null && i.rangeAtr !== undefined) {
    basis.rangeAtr = Number(i.rangeAtr.toFixed(2))
    if (i.rangeAtr >= 4) add(35, `unusual displacement: ${i.rangeAtr.toFixed(1)} ATR in one candle`)
    else if (i.rangeAtr >= 2.5) add(20, `large displacement: ${i.rangeAtr.toFixed(1)} ATR`)
  }
  if (i.volRatio !== null && i.volRatio !== undefined) {
    basis.volRatio = Number(i.volRatio.toFixed(2))
    if (i.volRatio >= 2.5) add(25, `unusual volatility: ATR at ${i.volRatio.toFixed(1)}× its longer average`)
    else if (i.volRatio >= 1.6) add(10, `elevated volatility: ${i.volRatio.toFixed(1)}× average`)
  }
  // Liquidity behaviour.
  if (i.sweepDepthAtr !== null && i.sweepDepthAtr !== undefined) {
    basis.sweepDepthAtr = Number(i.sweepDepthAtr.toFixed(2))
    if (i.sweepDepthAtr >= 1) add(30, `unusual liquidity behaviour: sweep ${i.sweepDepthAtr.toFixed(2)} ATR deep`)
    else if (i.sweepDepthAtr >= 0.4) add(15, `a clear sweep (${i.sweepDepthAtr.toFixed(2)} ATR)`)
    else add(8, `a shallow sweep (${i.sweepDepthAtr.toFixed(2)} ATR)`)
  }
  if (i.gapSizeAtr !== null && i.gapSizeAtr !== undefined) {
    basis.gapSizeAtr = Number(i.gapSizeAtr.toFixed(2))
    if (i.gapSizeAtr >= 1.5) add(20, `a large gap (${i.gapSizeAtr.toFixed(2)} ATR)`)
    else if (i.fromDisplacement) add(12, 'a gap left by displacement')
    else add(5, 'a gap')
  }
  // Strategy behaviour.
  if (i.votes) {
    basis.buys = i.votes.buys; basis.sells = i.votes.sells; basis.nearMisses = i.votes.nearMisses
    if (i.votes.buys > 0 && i.votes.sells > 0) add(50, `unusual strategy disagreement: ${i.votes.buys} BUY and ${i.votes.sells} SELL vote(s) on the same candle`)
    else if (i.votes.buys + i.votes.sells >= 2) add(20, `${i.votes.buys + i.votes.sells} strategies voted to act together`)
    else if (i.votes.buys + i.votes.sells === 1) add(15, 'a strategy voted to act')
    if (i.votes.nearMisses >= 2) add(20, `unusual rejection cluster: ${i.votes.nearMisses} strategies held with one condition missing`)
    else if (i.votes.nearMisses === 1) add(8, 'a strategy held with one condition missing')
  }
  // Regime transitions.
  if (i.regimeTo) {
    basis.regimeFrom = i.regimeFrom ?? null; basis.regimeTo = i.regimeTo
    const into = i.regimeTo === 'breakout' || i.regimeFrom === 'breakout'
    const flip = (i.regimeFrom === 'trending-up' && i.regimeTo === 'trending-down') || (i.regimeFrom === 'trending-down' && i.regimeTo === 'trending-up')
    if (flip) add(30, `unusual regime transition: ${i.regimeFrom} → ${i.regimeTo} without passing through a range`)
    else if (into) add(20, `regime transition into or out of breakout (${i.regimeFrom ?? 'unclassified'} → ${i.regimeTo})`)
    else add(10, `regime transition ${i.regimeFrom ?? 'unclassified'} → ${i.regimeTo}`)
  }
  if (i.newsImpact) { basis.newsImpact = i.newsImpact; add(i.newsImpact === 'High' ? 20 : 8, `${i.newsImpact}-impact release blackout began`) }
  if (i.flow) {
    basis.bigTrades = i.flow.bigTrades; basis.deltaUsd = Math.round(i.flow.deltaUsd)
    if (i.flow.bigTrades >= 3) add(15, `${i.flow.bigTrades} large prints in the window`)
    if (Math.abs(i.flow.deltaUsd) >= i.flow.bigTradeUsd * 5) add(15, `tape delta ${Math.round(i.flow.deltaUsd / 1000)}k — five large prints' worth one way`)
  }
  // Paper events: excursions and divergence from the cohort.
  if (i.paper) {
    const p = i.paper
    basis.rMultiple = p.rMultiple; basis.cohortN = p.cohortN; basis.maeR = p.maeR; basis.mfeR = p.mfeR
    if (i.type === 'RISK VETO') add(20, `the risk chain refused a real setup${p.missedCategory ? ` (${p.missedCategory})` : ''}`)
    if (p.rMultiple !== null && p.cohortMean !== null && p.cohortSd !== null && p.cohortSd > 0 && p.cohortN >= 10) {
      const z = (p.rMultiple - p.cohortMean) / p.cohortSd
      basis.cohortZ = Number(z.toFixed(2))
      if (Math.abs(z) >= 2) add(30, `major divergence from the strategy's cohort: ${fx(p.rMultiple)}R is ${fx(z, 1)} standard deviations from the cohort mean over ${p.cohortN} trades`)
      else if (Math.abs(z) >= 1.5) add(15, `result ${fx(z, 1)} sd from the cohort mean (${p.cohortN} trades)`)
    } else if (p.rMultiple !== null && p.cohortN < 10) add(5, `result ${fx(p.rMultiple)}R; the cohort has ${p.cohortN} trade(s), under the bar for a divergence read`)
    if (p.excursionN >= 10) {
      if (p.maeR !== null && p.maeP10 !== null && p.maeR <= p.maeP10) add(30, `unusual MAE: ${fx(p.maeR)}R at or below the cohort's 10th percentile (${fx(p.maeP10)}R over ${p.excursionN})`)
      if (p.mfeR !== null && p.mfeP90 !== null && p.mfeR >= p.mfeP90) add(30, `unusual MFE: ${fx(p.mfeR)}R at or above the cohort's 90th percentile (${fx(p.mfeP90)}R over ${p.excursionN})`)
    } else if (p.maeR !== null || p.mfeR !== null) add(0, `excursions recorded; ${p.excursionN} sample(s) is under the bar for an "unusual" read`)
    if (p.rMultiple !== null && p.rMultiple < 0 && p.fusedScore !== null && p.fusedScore >= p.enterScore && p.quality !== null && p.quality >= 80) add(25, `a loss on a full checklist (fused ${p.fusedScore}/100, quality ${p.quality}/100)`)
  }
  if (i.type === 'ANOMALY') add(40, 'a data anomaly the engine cannot read through')

  score = Math.min(100, Math.round(score))
  const selected = score >= SELECT_AT
  return {
    score, selected, reasons: reasons.length ? reasons : ['an ordinary event; recorded, not selected'], basis,
    note: selected ? `Selected for study at ${score}/100: ${reasons.join('; ')}. Selection says the event is worth studying, not what will happen next.` : `Recorded at ${score}/100, under the ${SELECT_AT} bar for a case study.`,
  }
}
