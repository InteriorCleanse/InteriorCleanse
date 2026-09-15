/**
 * Tape speed: how many prints per minute over the last window, and
 * whether that is speeding up or slowing down against the window before.
 * A quiet tape that suddenly accelerates is often the first sign of a
 * move; a fast tape going nowhere is a fight.
 */

import type { TradeAccumulator } from './trades.ts'
import type { TapeSpeedReading } from './types.ts'

export function tapeSpeed(tape: TradeAccumulator, asOf: number, windowSec: number): TapeSpeedReading {
  const w = windowSec * 1000
  const now = tape.tradesBetween(asOf - w, asOf)
  const before = tape.tradesBetween(asOf - 2 * w, asOf - w)
  const perMin = now / (windowSec / 60)
  const prevPerMin = before / (windowSec / 60)
  return {
    tradesPerMinute: perMin,
    previousPerMinute: prevPerMin,
    acceleration: prevPerMin > 0 ? perMin / prevPerMin : null,
    windowSec,
    label: prevPerMin > 0 && perMin / prevPerMin >= 1.5 ? 'accelerating' : prevPerMin > 0 && perMin / prevPerMin <= 0.67 ? 'slowing' : 'steady',
  }
}
