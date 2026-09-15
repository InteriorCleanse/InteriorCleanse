/**
 * The ICT session model, as a strategy. This is the bot's original brain
 * and the only one that opens paper trades. It does not re-decide anything:
 * it hands back the signal the IctEngine already produced for this candle,
 * so its vote is byte-identical to the session model's output. The other
 * strategies are read-only opinions until fusion and the risk engine.
 */

import type { Strategy, StrategyContext, StrategyVote } from './types.ts'

export const sessionIfvg: Strategy = {
  meta: {
    id: 'session-ifvg',
    name: 'ICT session model',
    family: 'session',
    summary: 'The full session checklist: an Asia range, a liquidity sweep in a killzone, a displacement, an inverted gap, and its retest.',
    needsTape: false,
  },
  evaluate(ctx: StrategyContext): StrategyVote {
    const sig = ctx.analysis?.signal
    if (!sig) {
      return { id: 'session-ifvg', action: 'HOLD', direction: null, confidence: 0, reason: 'The session analysis is not available for this candle.', evidence: [], setupKey: 'session-ifvg|no-analysis' }
    }
    const action = sig.action === 'BUY' || sig.action === 'SELL' ? sig.action : 'HOLD'
    return {
      id: 'session-ifvg',
      action,
      direction: action === 'BUY' ? 'long' : action === 'SELL' ? 'short' : null,
      confidence: sig.quality ?? 0,
      reason: sig.reason,
      evidence: sig.evidence,
      setupKey: sig.setupKey,
      plan: sig.plan,
    }
  },
}
