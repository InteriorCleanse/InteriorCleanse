/**
 * Book imbalance from the live, stitched order book: dollars resting
 * within a band below price against dollars resting within the band
 * above. The book is intent, not fact — resting orders can be pulled —
 * so this is a hint, and the reading says how fresh the book was.
 */

import type { Book } from '../data/types.ts'
import type { BookImbalanceReading } from './types.ts'

export function bookImbalance(book: Book, bandPct = 1): BookImbalanceReading | null {
  const bestBid = book.bids[0]?.price
  const bestAsk = book.asks[0]?.price
  if (!bestBid || !bestAsk) return null
  const mid = (bestBid + bestAsk) / 2
  const lo = mid * (1 - bandPct / 100)
  const hi = mid * (1 + bandPct / 100)
  let bidUsd = 0, askUsd = 0
  for (const l of book.bids) { if (l.price < lo) break; bidUsd += l.price * l.qty }
  for (const l of book.asks) { if (l.price > hi) break; askUsd += l.price * l.qty }
  const total = bidUsd + askUsd
  return {
    mid, bestBid, bestAsk,
    spreadPct: ((bestAsk - bestBid) / mid) * 100,
    bidUsd, askUsd,
    imbalance: total > 0 ? bidUsd / total : 0.5,
    bandPct,
    bookTime: book.time,
    lean: total > 0 && bidUsd / total > 0.6 ? 'bids deeper' : total > 0 && bidUsd / total < 0.4 ? 'asks deeper' : 'balanced',
  }
}
