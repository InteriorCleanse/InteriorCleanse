/**
 * The narration context: the single, structured set of facts the AI is
 * allowed to talk about. It is assembled from the quantitative engine — the
 * feature snapshot, the fused decision and the risk verdict — NOT from the
 * brief's prose. Everything the narrator or CIO says must trace back to a fact
 * in here; every number they may quote is collected in `numbers`, so a
 * validator can catch anything invented.
 *
 * Pure and deterministic: same engine state in, same context out.
 */

import type { FeatureSnapshot } from '../features/types.ts'
import type { FusedDecision } from '../fusion.ts'
import type { RiskVerdict } from '../riskEngine.ts'

export type ContextFact = { label: string; value: string; numbers: number[] }

export type NarrationContext = {
  price: number
  asOf: number
  /** The market-read facts, each a labelled line with the numbers it introduced. */
  facts: ContextFact[]
  decision: {
    action: FusedDecision['action']
    direction: 'long' | 'short' | null
    score: number
    enterScore: number
    confirms: string[]
    invalidates: string[]
    reason: string
  } | null
  risk: { approved: boolean; reasons: string[] } | null
  /** Every number that appears anywhere in the context — the only numbers a narration may use. */
  numbers: number[]
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/** Pull the numbers out of a string (for the allow-list and validation). */
export function numbersIn(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/-?\d+(?:\.\d+)?/g)) out.push(Number(m[0]))
  return out
}

/**
 * Build the context from the engine's own readings. `features` may be null
 * (a candles-only run with no structure); the decision and risk may be null
 * before the panel has voted or a candidate exists.
 */
export function buildNarrationContext(input: { price: number; asOf?: number; features: FeatureSnapshot | null; decision: FusedDecision | null; risk: RiskVerdict | null }): NarrationContext {
  const facts: ContextFact[] = []
  const f = input.features
  const price = round(input.price)

  const addFact = (label: string, value: string, numbers: number[] = []) => facts.push({ label, value, numbers })
  addFact('Price', `$${price}`, [price])

  if (f) {
    const regime = f.regime.value
    if (regime && f.regime.available) {
      addFact('Regime', `${regime.state} (${regime.volatility} volatility), confidence ${regime.confidence}${regime.reasons[0] ? ` — ${regime.reasons[0]}` : ''}`, [regime.confidence])
    } else {
      addFact('Regime', 'not available for this candle', [])
    }
    const mom = f.momentum.value
    if (mom && f.momentum.available) {
      const moveAtr = round(mom.moveAtr, 2)
      addFact('Momentum', `${moveAtr} ATR ${moveAtr >= 0 ? 'up' : 'down'} over ${mom.hours}h`, [moveAtr, mom.hours])
    }
    const vol = f.volatility.value
    if (vol && f.volatility.available) {
      const ratio = round(vol.ratio, 2)
      addFact('Volatility', `${vol.label} — ${ratio}× the typical ATR`, [ratio])
    }
    const vwap = f.vwapDay.value
    if (vwap && f.vwapDay.available) {
      const v = round(vwap.vwap)
      addFact('Day VWAP', `$${v} — price is ${input.price >= v ? 'above' : 'below'} it`, [v])
    }
    if (!f.tape.exact) addFact('Tape', `not exact — ${f.tape.note}`, [])
  } else {
    addFact('Features', 'no structure trackers ran (candles-only)', [])
  }

  const d = input.decision
  const decision = d
    ? { action: d.action, direction: d.direction, score: d.score, enterScore: d.enterScore, confirms: d.confirms, invalidates: d.invalidates, reason: d.reason }
    : null
  if (decision) {
    addFact('Fused decision', `${decision.action} (score ${decision.score} vs enter threshold ${decision.enterScore})`, [decision.score, decision.enterScore])
  }

  // Adapt the risk verdict to a small {approved, reasons} shape the narrator reads.
  const risk = input.risk
    ? { approved: input.risk.approved, reasons: input.risk.approved ? [] : [input.risk.reason, ...(input.risk.vetoedBy ? [`vetoed by ${input.risk.vetoedBy}`] : [])].filter(Boolean) }
    : null

  // Collect every number that appears anywhere the model can read.
  const numbers = new Set<number>()
  for (const fact of facts) for (const n of fact.numbers) numbers.add(n)
  if (decision) {
    numbers.add(decision.score); numbers.add(decision.enterScore)
    for (const s of [...decision.confirms, ...decision.invalidates, decision.reason]) for (const n of numbersIn(s)) numbers.add(n)
  }
  if (risk) for (const s of risk.reasons) for (const n of numbersIn(s)) numbers.add(n)

  return { price: input.price, asOf: input.asOf ?? f?.asOf ?? Date.now(), facts, decision, risk, numbers: [...numbers] }
}
