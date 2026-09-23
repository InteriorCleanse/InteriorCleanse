/**
 * The structure reading: what the swings, the breaks, the order blocks
 * and the dealing range say right now, folded into one object a
 * strategy can read without touching the trackers.
 */

import { describeShift } from '../structure.ts'
import type { StructureTracker, SwingTracker } from '../structure.ts'
import { breakerRole } from '../orderblocks.ts'
import type { OrderBlockTracker } from '../orderblocks.ts'
import type { DealingRange, LabelledSwing, OrderBlock } from '../types.ts'

export type StructureInputs = {
  swings: SwingTracker
  structure: StructureTracker
  orderBlocks: OrderBlockTracker
  dealingRange: DealingRange | null
}

export type ZoneSummary = { id: string; top: number; bottom: number; kind: 'order block' | 'breaker'; direction: 'bullish' | 'bearish'; distanceAtr: number }

export type StructureReading = {
  /** The trend the breaks describe (direction of the last BOS/CHoCH). */
  trend: 'bullish' | 'bearish' | null
  /** The trend the swing labels describe (HH+HL or LH+LL), which can disagree with the breaks. */
  swingTrend: 'bullish' | 'bearish' | null
  lastShift: { kind: 'BOS' | 'CHoCH'; direction: 'bullish' | 'bearish'; price: number; time: number; index: number; description: string } | null
  /** The last four confirmed swings, oldest first. */
  swings: Array<Pick<LabelledSwing, 'label' | 'price' | 'time' | 'kind'>>
  dealingRange: DealingRange | null
  orderBlocks: {
    active: number
    /** The nearest live zone below price that leans bullish (an unbroken bullish OB or a support breaker). */
    support: ZoneSummary | null
    /** The nearest live zone above price that leans bearish. */
    resistance: ZoneSummary | null
  }
}

function summary(ob: OrderBlock, price: number, atr: number): ZoneSummary {
  const mid = (ob.top + ob.bottom) / 2
  return { id: ob.id, top: ob.top, bottom: ob.bottom, kind: ob.state === 'broken' ? 'breaker' : 'order block', direction: ob.direction, distanceAtr: atr > 0 ? Math.abs(price - mid) / atr : 0 }
}

export function structureReading(inputs: StructureInputs, price: number, atr: number): StructureReading {
  const last = inputs.structure.shifts[inputs.structure.shifts.length - 1] ?? null
  const live = inputs.orderBlocks.active()
  const leansBullish = (ob: OrderBlock) => (ob.state === 'broken' ? breakerRole(ob) === 'support' : ob.direction === 'bullish')
  const below = live.filter((ob) => leansBullish(ob) && ob.top <= price).sort((a, b) => b.top - a.top)[0] ?? null
  const above = live.filter((ob) => !leansBullish(ob) && ob.bottom >= price).sort((a, b) => a.bottom - b.bottom)[0] ?? null
  return {
    trend: inputs.structure.trend,
    swingTrend: inputs.swings.trend(),
    lastShift: last ? { kind: last.kind, direction: last.direction, price: last.price, time: last.time, index: last.index, description: describeShift(last) } : null,
    swings: inputs.swings.recent(4).map((s) => ({ label: s.label, price: s.price, time: s.time, kind: s.kind })),
    dealingRange: inputs.dealingRange,
    orderBlocks: { active: live.length, support: below ? summary(below, price, atr) : null, resistance: above ? summary(above, price, atr) : null },
  }
}
