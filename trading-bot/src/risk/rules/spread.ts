/** A wide spread means a bad fill. If it is wider than the limit, veto. */
import { config } from '../../../config.ts'
import type { Rule } from './types.ts'

export const spread: Rule = (_c, s) => {
  const max = config.risk.maxSpreadPct
  if (s.spreadPct === null) return { rule: 'Spread', passed: true, detail: 'Spread unknown (no live book); not blocking.' }
  const ok = s.spreadPct <= max
  return { rule: 'Spread', passed: ok, detail: ok ? `Spread is ${s.spreadPct.toFixed(3)}% (limit ${max}%).` : `Spread is ${s.spreadPct.toFixed(3)}% — wider than the ${max}% limit. The fill would be poor; standing aside.` }
}
