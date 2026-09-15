/**
 * ABSORPTION — a heuristic, and labelled as one everywhere it appears.
 *
 * The rule (fixed by its test, test/features/orderflow/absorption.test.ts):
 * a candle shows absorption when
 *   1. its traded volume is at least `volumeMultiple` × the median volume
 *      of the previous exact candles (at least `minHistory` of them), and
 *   2. its trades spanned no more than `maxRangeAtr` ATRs from low to high, and
 *   3. one side dominated: |delta| / volume ≥ `minDeltaShare`.
 * Then the aggressive side was absorbed by passive orders: heavy buying
 * that failed to lift price means sellers are absorbing (a bearish hint);
 * heavy selling that failed to push price down means buyers are (bullish).
 *
 * Why it is only a hint: the passive side can withdraw the moment the
 * aggression stops, and the exchange merges fills so sizes are coarse.
 */

import type { TapeBucket } from './trades.ts'
import type { AbsorptionReading } from './types.ts'

export type AbsorptionRule = { volumeMultiple: number; maxRangeAtr: number; minDeltaShare: number; minHistory: number }

export function absorption(b: TapeBucket, previous: TapeBucket[], atr: number, rule: AbsorptionRule): AbsorptionReading | null {
  if (previous.length < rule.minHistory) return null
  const vols = previous.map((p) => p.v).sort((x, y) => x - y)
  const typical = vols[Math.floor(vols.length / 2)]
  if (!(typical > 0) || !(atr > 0) || !(b.v > 0)) return null
  const volumeMultiple = b.v / typical
  const rangeAtr = (b.high - b.low) / atr
  const delta = b.buyV - b.sellV
  const deltaShare = Math.abs(delta) / b.v
  const detected = volumeMultiple >= rule.volumeMultiple && rangeAtr <= rule.maxRangeAtr && deltaShare >= rule.minDeltaShare
  const side: AbsorptionReading['side'] = !detected ? null : delta > 0 ? 'buyers absorbed' : 'sellers absorbed'
  return {
    detected,
    side,
    hint: side === 'buyers absorbed' ? 'bearish' : side === 'sellers absorbed' ? 'bullish' : null,
    volumeMultiple,
    rangeAtr,
    deltaShare,
    rule,
    note: 'Heuristic: heavy one-sided volume that failed to move price. The passive side can pull its orders at any moment.',
  }
}
