/**
 * Champion-challenger promotion. There is one champion per strategy family —
 * the instance currently trusted to trade it — and any number of challengers
 * earning their evidence behind it. A challenger only takes the crown when it
 * beats the champion where it actually matters: out-of-sample AND on paper,
 * with enough paper trades to mean something, and while not itself decaying.
 *
 * Promotion moves a strategy one stage up its lifecycle, and never past shadow:
 * the step to live is a human decision, on purpose. This module recommends; it
 * does not flip the switch to real money.
 */

import { config } from '../../config.ts'
import type { Passport, PassportStatus } from './passport.ts'
import { STAGE_ORDER, stageAvgR } from './passport.ts'

export type PromotionDecision = {
  promote: boolean
  from: PassportStatus
  to: PassportStatus | null
  reason: string
}

/** The next stage up, capped at 'shadow' — automatic promotion never reaches 'live'. */
export function nextStage(status: PassportStatus): PassportStatus | null {
  const i = STAGE_ORDER.indexOf(status)
  if (i < 0) return null // watch / retired do not auto-promote
  const next = STAGE_ORDER[i + 1]
  if (!next) return null
  if (next === 'live') return null // the step to live is a human decision
  return next
}

/**
 * Should `challenger` replace `champion`? Yes only if it beats the champion on
 * out-of-sample expectancy AND on paper expectancy (with enough paper trades),
 * by at least the configured edge, and is not decaying. When there is no
 * champion yet, the challenger is compared against the bar alone.
 */
export function compareChallenger(champion: Passport | null, challenger: Passport, opts: { edgeR?: number; minPaperTrades?: number } = {}): PromotionDecision {
  const edge = opts.edgeR ?? config.vault.promotionEdgeR
  const minPaper = opts.minPaperTrades ?? config.vault.promotionMinPaperTrades
  const from = challenger.status

  if (challenger.decay.decaying) return { promote: false, from, to: null, reason: 'The challenger is decaying — it cannot be promoted.' }

  const chPaper = stageAvgR(challenger, 'paper')
  if (chPaper.trades < minPaper || chPaper.avgR === null) {
    return { promote: false, from, to: null, reason: `The challenger has only ${chPaper.trades} paper trade(s); needs ${minPaper} before it can be judged.` }
  }

  const to = nextStage(from)
  if (!to) return { promote: false, from, to: null, reason: from === 'shadow' ? 'Already at shadow; the step to live is a human decision.' : `A ${from} passport is not eligible for automatic promotion.` }

  if (!champion) {
    return { promote: true, from, to, reason: `No champion for this family yet, and the challenger clears the bar on paper (${chPaper.avgR.toFixed(3)}R over ${chPaper.trades} trades). Promoting to ${to}.` }
  }

  const chOos = challenger.oos.avgR ?? -Infinity
  const cmpOos = champion.oos.avgR ?? -Infinity
  const cmpPaper = stageAvgR(champion, 'paper')
  const beatsOos = chOos >= cmpOos + edge
  const beatsPaper = chPaper.avgR >= (cmpPaper.avgR ?? -Infinity) + edge

  if (beatsOos && beatsPaper) {
    return { promote: true, from, to, reason: `Beats the champion out-of-sample (${chOos.toFixed(3)} vs ${cmpOos.toFixed(3)}R) and on paper (${chPaper.avgR.toFixed(3)} vs ${(cmpPaper.avgR ?? 0).toFixed(3)}R). Promoting to ${to}.` }
  }
  const why = !beatsOos && !beatsPaper ? 'neither out-of-sample nor paper' : !beatsOos ? 'not out-of-sample' : 'not on paper'
  return { promote: false, from, to: null, reason: `Does not beat the champion by ${edge}R where it counts (${why}). No promotion.` }
}

/** The current champion among a family's passports: the live one, else the furthest-along non-decaying one. */
export function championOf(passports: Passport[]): Passport | null {
  const healthy = passports.filter((p) => !p.decay.decaying && p.status !== 'retired' && p.status !== 'watch')
  if (!healthy.length) return null
  return healthy.slice().sort((a, b) => {
    const sa = STAGE_ORDER.indexOf(a.status), sb = STAGE_ORDER.indexOf(b.status)
    if (sb !== sa) return sb - sa
    return (b.oos.avgR ?? -Infinity) - (a.oos.avgR ?? -Infinity)
  })[0]
}
