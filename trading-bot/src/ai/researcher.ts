/**
 * The research agent proposes work; it never does it. Given the strategies that
 * can be tuned and the passports already in the vault, it suggests factory
 * campaigns worth running — a fresh search where there is no vetted instance
 * yet, a replacement search where a champion is decaying — each as a spec with
 * a plain rationale. A spec is run only when a human clicks; the researcher
 * cannot start one, and it certainly cannot place a trade.
 */

import { config } from '../../config.ts'
import type { Passport } from '../vault/passport.ts'
import { championOf } from '../vault/promotion.ts'

export type CampaignMethod = 'grid' | 'random' | 'evolve'

export type CampaignSpec = {
  strategyId: string
  method: CampaignMethod
  seed: number
  maxGenomes: number
  /** Why this campaign is worth running, in plain words. */
  rationale: string
  /** How much it would help, roughly — used only to order the list. */
  priority: number
}

/**
 * Propose campaigns. Pure over its inputs: the tunable strategy ids and the
 * current passports. Deterministic — same inputs, same proposals, same order.
 */
export function proposeCampaigns(input: { tunableStrategyIds: string[]; passports: Passport[]; seed?: number; maxGenomes?: number }): CampaignSpec[] {
  const seed = input.seed ?? 12345
  const maxGenomes = input.maxGenomes ?? config.factory.maxGenomes
  const specs: CampaignSpec[] = []

  for (const id of input.tunableStrategyIds) {
    const family = input.passports.filter((p) => p.strategyId === id)
    const champ = championOf(family)
    const decayingChamp = family.find((p) => p.decay.decaying)

    if (family.length === 0) {
      specs.push({ strategyId: id, method: 'grid', seed, maxGenomes, priority: 3, rationale: `No passport for "${id}" yet — a full grid search would establish whether any setting holds up out-of-sample.` })
    } else if (!champ && decayingChamp) {
      specs.push({ strategyId: id, method: 'evolve', seed, maxGenomes, priority: 5, rationale: `The champion for "${id}" is decaying and nothing healthy is behind it — breed a challenger to replace it.` })
    } else if (decayingChamp) {
      specs.push({ strategyId: id, method: 'random', seed, maxGenomes, priority: 4, rationale: `An instance of "${id}" is decaying — a random search may surface a fresher setting to challenge the champion.` })
    }
    // A family with a healthy champion and no decay needs no new campaign.
  }

  return specs.sort((a, b) => b.priority - a.priority)
}
