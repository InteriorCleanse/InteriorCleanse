/**
 * Large prints over a recent window: how many, which way, and the biggest.
 * The stream merges the fills of one aggressive order into one print, so
 * a large print is one order, not necessarily one participant.
 */

import type { TradeAccumulator } from './trades.ts'
import type { LargeTradesReading } from './types.ts'

export function largeTrades(tape: TradeAccumulator, asOf: number, windowMin: number): LargeTradesReading {
  const prints = tape.bigPrints(asOf - windowMin * 60_000, asOf)
  let buys = 0, sells = 0, buyUsd = 0, sellUsd = 0
  for (const p of prints) { if (p.side === 'buy') { buys++; buyUsd += p.usd } else { sells++; sellUsd += p.usd } }
  const largest = prints.slice().sort((a, b) => b.usd - a.usd)[0] ?? null
  return { windowMin, thresholdUsd: tape.bigTradeUsd, count: prints.length, buys, sells, buyUsd, sellUsd, netUsd: buyUsd - sellUsd, largest, recent: prints.slice(0, 20) }
}
