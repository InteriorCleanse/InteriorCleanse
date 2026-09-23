/** Never trade on stale prices. If the latest candle is too old, veto — a fill on old data is a guess. */
import { config } from '../../../config.ts'
import type { Rule } from './types.ts'

export const staleData: Rule = (_c, s) => {
  const max = config.risk.maxCandleAgeSec
  if (s.candleAgeSec === null) return { rule: 'Fresh data', passed: true, detail: 'Candle age unknown (one-shot check); not blocking.' }
  const ok = s.candleAgeSec <= max
  return { rule: 'Fresh data', passed: ok, detail: ok ? `Latest candle is ${Math.round(s.candleAgeSec)}s old (limit ${max}s).` : `Latest candle is ${Math.round(s.candleAgeSec)}s old — older than the ${max}s limit. The feed may be stalled; not trading on stale prices.` }
}
