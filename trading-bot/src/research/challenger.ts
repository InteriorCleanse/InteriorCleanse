/**
 * MR. CASH CHALLENGER — the adversarial research agent.
 *
 * Its job is to attack every promising finding. For an experiment it asks the
 * questions the specification lists — overfitting, selection bias, data
 * mining, sample chosen after the result, one of many hypotheses, survives
 * OOS, walk-forward, costs, slippage, other periods, other symbols,
 * counterexamples, regime-specific, disappears with more data — and answers
 * each from the experiment's own numbers with a verdict: SURVIVES, WEAKENED,
 * DISPROVED or UNTESTABLE. It never softens: an attack it cannot run is
 * UNTESTABLE, not passed. The overall verdict is the worst attack.
 *
 * Pure over the experiment and the context it is handed.
 */

import { config } from '../../config.ts'
import { SAMPLE_BARS } from '../analyst/cohorts.ts'
import { tradesNeededToDecide, sampleSd } from '../analyst/attribution.ts'
import type { EvidenceRecord } from '../analyst/records.ts'
import type { Experiment } from './experiments.ts'
import { welch } from './experiments.ts'
import { deflatedSharpeFull } from './overfitting.ts'

export type AttackVerdict = 'SURVIVES' | 'WEAKENED' | 'DISPROVED' | 'UNTESTABLE'

export type Attack = { question: string; verdict: AttackVerdict; detail: string }

export type Challenge = {
  at: number
  experimentId: string
  attacks: Attack[]
  overall: AttackVerdict
  survived: number
  weakened: number
  disproved: number
  untestable: number
  note: string
}

export type ChallengeContext = {
  /** The out-of-sample treatment records, for the period and regime attacks. */
  oosTreatment: EvidenceRecord[]
  /** How many hypotheses exist in the store — "one of many tested". */
  hypothesesOnRecord: number
  /** Whether the hypothesis was drafted from the same cohort's observation. */
  draftedFromObservation: boolean
  now?: number
}

const fx = (n: number | null, d = 2) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)

/** A stated stress on the per-trade result: costs and slippage a fill model may have understated. */
export const COST_STRESS_R = 0.05

export function challenge(e: Experiment, ctx: ChallengeContext): Challenge {
  const at = ctx.now ?? Date.now()
  const a: Attack[] = []
  const oosRs = ctx.oosTreatment.map((r) => r.rMultiple as number)
  const oosN = oosRs.length
  const positive = e.direction !== 'negative'
  const sign = (x: number) => (positive ? x : -x)

  // 1. Overfitting — the deflated Sharpe over the recorded trials.
  const dsr = oosN >= 20 ? deflatedSharpeFull(oosRs, e.multipleTestingContext.trials, config.factory.deflatedSharpeMin) : null
  a.push(dsr ? { question: 'Could this be overfitting?', verdict: dsr.verdict === 'SURVIVES DEFLATION' ? 'SURVIVES' : dsr.verdict === 'LIKELY LUCK' ? 'DISPROVED' : 'WEAKENED', detail: dsr.note } : { question: 'Could this be overfitting?', verdict: 'UNTESTABLE', detail: `${oosN} out-of-sample trades is under the 20-trade track the deflated Sharpe needs.` })
  // 2. Selection bias / sample chosen after seeing results.
  a.push({ question: 'Was the sample selected after seeing results?', verdict: ctx.draftedFromObservation ? 'WEAKENED' : 'SURVIVES', detail: ctx.draftedFromObservation ? 'The hypothesis was drafted from an observation of the same cohort; the in-sample result cannot count as confirmation. Only the out-of-sample stage can.' : 'The cohort was specified before the result was seen.' })
  // 3. Data mining / one of many.
  const mt = e.multipleTestingContext
  a.push({ question: 'Was this one of many hypotheses tested?', verdict: ctx.hypothesesOnRecord >= 20 || mt.trials >= 20 ? 'WEAKENED' : 'SURVIVES', detail: `${ctx.hypothesesOnRecord} hypothesis/es on record; ${mt.trials} trial(s) for ${e.strategyId}. Šidák α ≈ ${mt.sidak.toExponential(1)}.` })
  // 4. OOS.
  const oosC = e.comparison.oos
  a.push(!oosC || oosC.verdict === 'TOO FEW' ? { question: 'Does it survive out of sample?', verdict: 'UNTESTABLE', detail: oosC?.note ?? 'No out-of-sample comparison.' } : oosC.verdict === 'INDISTINGUISHABLE' ? { question: 'Does it survive out of sample?', verdict: 'WEAKENED', detail: oosC.note } : (oosC.verdict === 'TREATMENT AHEAD') === positive || e.direction === 'difference' ? { question: 'Does it survive out of sample?', verdict: 'SURVIVES', detail: oosC.note } : { question: 'Does it survive out of sample?', verdict: 'DISPROVED', detail: oosC.note })
  // 5. Walk-forward.
  const wf = e.walkForwardResult
  a.push(!wf || wf.positiveShare === null ? { question: 'Does it survive walk-forward?', verdict: 'UNTESTABLE', detail: e.robustnessResult?.notes.find((n) => /Walk-forward/.test(n)) ?? 'not run' } : wf.positiveShare >= config.factory.stabilityMinShare ? { question: 'Does it survive walk-forward?', verdict: 'SURVIVES', detail: `${wf.positiveFolds} of ${wf.folds} folds positive.` } : { question: 'Does it survive walk-forward?', verdict: 'WEAKENED', detail: `${wf.positiveFolds} of ${wf.folds} folds positive (bar ${Math.round(config.factory.stabilityMinShare * 100)}%).` })
  // 6–7. Costs and slippage: a stated stress of COST_STRESS_R per trade on the OOS interval.
  if (oosN >= SAMPLE_BARS.insufficient && e.oosResult?.ci95) {
    const stressed = oosRs.map((r) => r - sign(COST_STRESS_R))
    const mean = stressed.reduce((x, y) => x + y, 0) / stressed.length
    const sd = sampleSd(stressed)
    const lo = sd === null ? null : mean - 2 * sd / Math.sqrt(stressed.length)
    const ok = lo !== null && sign(lo) > 0
    a.push({ question: 'Does it survive costs and slippage?', verdict: ok ? 'SURVIVES' : 'WEAKENED', detail: `With ${COST_STRESS_R}R of extra cost per trade the out-of-sample mean is ${fx(mean)}R${lo !== null ? ` (lower bound ≈ ${fx(lo)}R)` : ''}. ${e.source === 'PAPER' ? 'Paper fills already charge spread, slippage and fees.' : 'Simulated fills with the realistic model.'}` })
  } else a.push({ question: 'Does it survive costs and slippage?', verdict: 'UNTESTABLE', detail: 'Too few out-of-sample trades to stress.' })
  // 8. Different market periods: first half vs second half of the OOS treatment, sign consistency.
  if (oosN >= 2 * SAMPLE_BARS.insufficient) {
    const sorted = [...ctx.oosTreatment].sort((x, y) => x.decidedAt - y.decidedAt)
    const half = Math.floor(sorted.length / 2)
    const m1 = sorted.slice(0, half).reduce((x, r) => x + (r.rMultiple as number), 0) / half
    const m2 = sorted.slice(half).reduce((x, r) => x + (r.rMultiple as number), 0) / (sorted.length - half)
    const same = sign(m1) > 0 && sign(m2) > 0
    a.push({ question: 'Does it survive different market periods?', verdict: same ? 'SURVIVES' : 'WEAKENED', detail: `First half mean ${fx(m1)}R, second half ${fx(m2)}R.` })
  } else a.push({ question: 'Does it survive different market periods?', verdict: 'UNTESTABLE', detail: `Needs ${2 * SAMPLE_BARS.insufficient}+ out-of-sample trades to split.` })
  // 9. Different symbols.
  a.push({ question: 'Does it survive different symbols?', verdict: 'UNTESTABLE', detail: `Only ${e.markets.join(', ')} is traded; there is no second symbol to test on.` })
  // 10. Counterexamples.
  const against = ctx.oosTreatment.filter((r) => sign(r.rMultiple as number) < 0).length
  a.push(oosN ? { question: 'Are there counterexamples?', verdict: against / oosN > 0.5 ? 'WEAKENED' : 'SURVIVES', detail: `${against} of ${oosN} out-of-sample treatment trades went against the direction.` } : { question: 'Are there counterexamples?', verdict: 'UNTESTABLE', detail: 'No out-of-sample treatment trades.' })
  // 11. Regime-specific.
  const byRegime = new Map<string, number[]>()
  for (const r of ctx.oosTreatment) byRegime.set(r.regime ?? 'unrecorded', [...(byRegime.get(r.regime ?? 'unrecorded') ?? []), r.rMultiple as number])
  const established = [...byRegime.entries()].filter(([, rs]) => rs.length >= SAMPLE_BARS.insufficient && sign(rs.reduce((x, y) => x + y, 0) / rs.length) > 0)
  a.push(byRegime.size <= 1 ? { question: 'Could the effect be regime-specific?', verdict: oosN ? 'WEAKENED' : 'UNTESTABLE', detail: oosN ? `All out-of-sample treatment trades sit in one regime (${[...byRegime.keys()][0]}); nothing is known about the others.` : 'No trades.' } : established.length >= 2 ? { question: 'Could the effect be regime-specific?', verdict: 'SURVIVES', detail: `The sign holds in ${established.length} regimes at the bar: ${established.map(([k]) => k).join(', ')}.` } : { question: 'Could the effect be regime-specific?', verdict: 'WEAKENED', detail: `${byRegime.size} regimes represented but the sign is established (10+ trades) in ${established.length}.` })
  // 12. Disappear with more data.
  const sd = sampleSd(oosRs)
  const mean = oosN ? oosRs.reduce((x, y) => x + y, 0) / oosN : 0
  const need = sd !== null && mean !== 0 ? tradesNeededToDecide(mean, sd) : null
  a.push(need === null ? { question: 'Could the effect disappear with more data?', verdict: 'UNTESTABLE', detail: 'Too few trades to estimate.' } : need > oosN ? { question: 'Could the effect disappear with more data?', verdict: 'WEAKENED', detail: `About ${need} trades would be needed for the interval to clear zero at this mean and spread; there are ${oosN}. The sign is not settled.` } : { question: 'Could the effect disappear with more data?', verdict: 'SURVIVES', detail: `${oosN} trades exceed the ~${need} the mean and spread need for the interval to clear zero.` })
  // Baseline comparison stands alone: a treatment that merely matches its baseline is no improvement.
  const b = e.comparison.oos
  if (b && b.verdict !== 'TOO FEW') a.push({ question: 'Is it better than the baseline, or just noise?', verdict: b.verdict === 'INDISTINGUISHABLE' ? 'WEAKENED' : 'SURVIVES', detail: `Baseline: ${e.baseline.label}. ${b.note}` })

  const count = (v: AttackVerdict) => a.filter((x) => x.verdict === v).length
  const overall: AttackVerdict = count('DISPROVED') ? 'DISPROVED' : count('WEAKENED') ? 'WEAKENED' : count('SURVIVES') ? 'SURVIVES' : 'UNTESTABLE'
  return { at, experimentId: e.experimentId, attacks: a, overall, survived: count('SURVIVES'), weakened: count('WEAKENED'), disproved: count('DISPROVED'), untestable: count('UNTESTABLE'), note: `The challenger tried to disprove the finding with ${a.length} attacks: ${count('SURVIVES')} survived, ${count('WEAKENED')} weakened, ${count('DISPROVED')} disproved, ${count('UNTESTABLE')} could not be run. An attack that cannot be run is not a pass.` }
}
