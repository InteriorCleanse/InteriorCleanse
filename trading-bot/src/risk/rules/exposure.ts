/**
 * How much can be on the line at once: a cap on the number of open positions
 * and on their total notional value (this one plus what is already open).
 */
import { config } from '../../../config.ts'
import type { Rule } from './types.ts'

export const exposure: Rule = (_c, s, sizing) => {
  const maxOpen = config.risk.maxOpenPositions
  if (s.openPositions >= maxOpen) return { rule: 'Exposure', passed: false, detail: `Already ${s.openPositions} open position(s); the limit is ${maxOpen}. Not stacking another on top.` }
  const cap = config.risk.maxExposureUsd > 0 ? config.risk.maxExposureUsd : config.accountSizeUsd
  const total = s.openNotionalUsd + sizing.positionValueUsd
  const ok = total <= cap + 1e-9
  return { rule: 'Exposure', passed: ok, detail: ok ? `Total open notional would be $${total.toFixed(2)} (cap $${cap.toFixed(2)}).` : `This would put $${total.toFixed(2)} at work, over the $${cap.toFixed(2)} exposure cap.` }
}
