/** The drawdown cap: if paper equity has fallen far enough from its peak, stop opening new risk. */
import { config } from '../../../config.ts'
import type { Rule } from './types.ts'

export const drawdown: Rule = (_c, s) => {
  const max = config.risk.maxDrawdownPercent
  const peak = Math.max(s.peakEquityUsd, s.equityUsd)
  const dd = peak > 0 ? ((peak - s.equityUsd) / peak) * 100 : 0
  const ok = dd < max
  return { rule: 'Drawdown', passed: ok, detail: ok ? `Down ${dd.toFixed(1)}% from the peak (cap ${max}%).` : `Down ${dd.toFixed(1)}% from the equity peak — at or past the ${max}% cap. No new risk until it recovers.` }
}
