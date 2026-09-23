/**
 * The per-trade sizing rule: the stop is not on the entry, the stop is not
 * absurdly wide, the reward-to-risk clears the minimum, and the size fits the
 * caps. This reflects the existing checkRisk exactly (the engine passes its
 * verdict in), so a candidate that passes here is sized identically to the
 * frozen baseline.
 */
import type { Rule } from './types.ts'

export const perTrade: Rule = (_c, _s, sizing) => ({
  rule: 'Per-trade risk',
  passed: sizing.approved,
  detail: sizing.reason,
})
