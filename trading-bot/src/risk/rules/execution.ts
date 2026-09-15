/**
 * Execution protection: when the fill price is known, reject an order whose
 * fill has already breached the plan — the price is on the wrong side of the
 * stop, so the trade would open already losing. (The reward-to-risk after the
 * fill is re-checked by the per-trade rule, which sizes from the fill price.)
 */
import type { Rule } from './types.ts'

export const execution: Rule = (c) => {
  if (c.entry === undefined || !c.signal.plan) return { rule: 'Execution', passed: true, detail: 'No fill price yet; checked again at fill time.' }
  const { direction, stop } = c.signal.plan
  const breached = direction === 'long' ? c.entry <= stop : c.entry >= stop
  return { rule: 'Execution', passed: !breached, detail: breached ? `The fill at $${c.entry.toFixed(2)} is already past the stop at $${stop.toFixed(2)} — the trade would open in a loss. Rejected.` : `Fill $${c.entry.toFixed(2)} is on the right side of the stop.` }
}
