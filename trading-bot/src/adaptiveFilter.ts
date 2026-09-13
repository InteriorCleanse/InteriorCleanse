/**
 * The part that actually learns.
 *
 * Before any BUY or SELL, this asks three questions of the memory files:
 *   1. Has this symbol lost on a similar setup before?
 *   2. Does learnings.md warn about this setup?
 *   3. Is this signal repeating a known bad trade?
 *
 * "Similar setup" is precise: same session, same direction, same level
 * that was swept, same entry type. So memory can learn things like
 * "shorts after a New York sweep of yesterday's high keep failing"
 * without throwing away every other short.
 *
 * If memory is empty it stays out of the way. An opinion with no
 * evidence behind it is just noise.
 */

import { config } from '../config.ts'
import { lessonLines, readLedger } from './memory.ts'
import type { Signal } from './types.ts'

export type MemoryVerdict = {
  block: boolean
  reason: string
  noEvidence: boolean
  stats: { seen: number; losses: number; wins: number; winRate: number | null; avgPnl: number | null }
}

export function consultMemory(signal: Signal): MemoryVerdict {
  const rows = readLedger()
  const matching = rows.filter(
    (r) =>
      r.symbol === config.symbol &&
      r.action === signal.action &&
      r.reason.includes(signal.setupKey) &&
      (r.outcome === 'WIN' || r.outcome === 'LOSS' || r.outcome === 'FLAT'),
  )
  const wins = matching.filter((r) => r.outcome === 'WIN').length
  const losses = matching.filter((r) => r.outcome === 'LOSS').length
  const seen = matching.length
  const winRate = seen > 0 ? wins / seen : null
  const avgPnl = seen > 0 ? matching.reduce((s, r) => s + r.pnl, 0) / seen : null
  const stats = { seen, losses, wins, winRate, avgPnl }
  const human = describeKey(signal.setupKey)

  if (seen === 0) {
    return {
      block: false,
      noEvidence: true,
      reason: `Memory has no completed results for "${human}" yet, so it has nothing to warn me about. Run the look-back test to build up real history.`,
      stats,
    }
  }

  const warning = lessonLines().find((l) => l.includes(signal.setupKey))
  const lostEnough = losses >= config.memory.skipAfterLosses
  const winsTooRarely = winRate !== null && winRate < config.memory.skipIfWinRateBelow

  if (lostEnough && winsTooRarely) {
    return {
      block: true,
      noEvidence: false,
      reason:
        `SKIPPED by memory. "${human}" has been recorded ${seen} times and lost ${losses} of them (win rate ${(winRate! * 100).toFixed(0)}%, average ${avgPnl!.toFixed(2)}%). ` +
        (warning ? `The lessons file also warns: "${warning}". ` : '') +
        `I have been burned by this exact setup before, so I am not taking it again.`,
      stats,
    }
  }

  return {
    block: false,
    noEvidence: false,
    reason:
      `Memory checked: ${seen} past result(s) for "${human}" — ${wins} win(s), ${losses} loss(es)` +
      (winRate !== null ? `, ${(winRate * 100).toFixed(0)}% win rate` : '') +
      `. Not bad enough to refuse (my rule is ${config.memory.skipAfterLosses}+ losses AND a win rate under ${(config.memory.skipIfWinRateBelow * 100).toFixed(0)}%).`,
    stats,
  }
}

/** Turns "BTCUSDT|5m|ICT|london|long|asia-low|IFVG" into words. */
export function describeKey(key: string): string {
  const parts = key.split('|')
  if (parts[2] === 'ICT' && parts.length >= 7) {
    const session = (config.ict.sessions as Record<string, { label: string }>)[parts[3]]?.label ?? parts[3]
    const level = parts[5].replace('-', ' ').replace('pdh', "yesterday's high").replace('pdl', "yesterday's low").replace('eqh', 'equal highs').replace('eql', 'equal lows')
    return `${parts[4]} in ${session} after a sweep of the ${level}, entered on an ${parts[6] === 'IFVG' ? 'inverted gap' : 'open gap'}`
  }
  if (parts[2]?.startsWith('MA')) return `${parts[3]} on a ${parts[2].slice(2).replace('x', '/')} crossover`
  return key
}
