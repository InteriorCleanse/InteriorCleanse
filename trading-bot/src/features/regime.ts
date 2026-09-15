/**
 * The regime: one word for what kind of market this is, so a strategy
 * can ask "should I even be looking for my setup right now?" without
 * re-deriving it. A reading, not a rule — nothing here places or blocks
 * a trade (that is Phase 11/12).
 *
 * Five inputs, all named in the reasons and pinned by the tests:
 *   1. structure  — the swing trend (HH/HL vs LH/LL) and the last break
 *                   (BOS continues the trend, CHoCH is the first turn).
 *   2. averages   — price against the 20- and 50-hour EMAs.
 *   3. momentum   — the three-hour move, in ATRs.
 *   4. volatility — quiet / normal / wild, and whether it is expanding.
 *   5. order flow — the sign of cumulative delta, WHEN the tape is trusted;
 *                   it only ever adds a vote, it is never required.
 *
 * The states:
 *   trending-up / trending-down — structure and the averages agree on a
 *       direction. The clean case.
 *   transition — the last break was a CHoCH (structure just flipped) but
 *       the averages have not confirmed the new direction yet. The turn is
 *       hinted, not settled.
 *   breakout — volatility was compressed and has just expanded on a fresh
 *       BOS. A range is being left behind.
 *   ranging — none of the above: no agreed direction and nothing breaking.
 */

export type RegimeState = 'trending-up' | 'trending-down' | 'ranging' | 'breakout' | 'transition'
export type RegimeVol = 'low' | 'normal' | 'high'
export type Dir = 'up' | 'down' | null

export type RegimeInputs = {
  /** From the structure feature. */
  swingTrend: 'bullish' | 'bearish' | null
  lastShiftKind: 'BOS' | 'CHoCH' | null
  lastShiftDir: 'bullish' | 'bearish' | null
  /** Candles since the last break, or null when there has been none. */
  shiftAgeCandles: number | null
  /** Price against the 20/50-hour EMAs: 'up', 'down', or null when tangled. */
  averages: Dir
  /** Three-hour move in ATRs. */
  momentumAtr: number
  volLabel: 'quiet' | 'normal' | 'wild'
  /** True when volatility has clearly risen from a compressed reading. */
  volExpanding: boolean
  /** Cumulative-delta sign from the trusted tape, or null when unavailable. */
  flow: Dir
}

export type RegimeReading = {
  state: RegimeState
  /** The direction the regime leans, when it has one. */
  direction: Dir
  volatility: RegimeVol
  /** 0–100: how many of the direction inputs agree. */
  confidence: number
  reasons: string[]
  votes: { structure: Dir; averages: Dir; momentum: Dir; flow: Dir }
}

const dirOf = (b: 'bullish' | 'bearish' | null): Dir => (b === 'bullish' ? 'up' : b === 'bearish' ? 'down' : null)

export function classifyRegime(x: RegimeInputs, recentShiftCandles: number): RegimeReading {
  const volatility: RegimeVol = x.volLabel === 'quiet' ? 'low' : x.volLabel === 'wild' ? 'high' : 'normal'
  const momentumDir: Dir = x.momentumAtr > 1.5 ? 'up' : x.momentumAtr < -1.5 ? 'down' : null
  const votes = { structure: dirOf(x.swingTrend), averages: x.averages, momentum: momentumDir, flow: x.flow }
  const ups = Object.values(votes).filter((v) => v === 'up').length
  const downs = Object.values(votes).filter((v) => v === 'down').length
  const cast = Object.values(votes).filter((v) => v !== null).length
  const direction: Dir = ups > downs ? 'up' : downs > ups ? 'down' : null
  const agree = Math.max(ups, downs)
  const confidence = cast === 0 ? 0 : Math.round((agree / 4) * 100)
  const reasons: string[] = []

  const recentShift = x.shiftAgeCandles !== null && x.shiftAgeCandles <= recentShiftCandles
  const shiftDir = dirOf(x.lastShiftDir)

  // 1. A change of character not yet confirmed by the averages: a transition.
  if (recentShift && x.lastShiftKind === 'CHoCH' && shiftDir !== null && x.averages !== shiftDir) {
    reasons.push(`Structure just flipped ${shiftDir} (a CHoCH ${x.shiftAgeCandles} candles ago) but the hourly averages have not confirmed it — a transition, not a trend.`)
    if (x.averages) reasons.push(`The averages still lean ${x.averages}.`)
    return { state: 'transition', direction: shiftDir, volatility, confidence, reasons, votes }
  }

  // 2. Compression then expansion on a fresh break: a breakout.
  if (recentShift && x.lastShiftKind === 'BOS' && x.volExpanding) {
    reasons.push(`Volatility was compressed and has just expanded on a fresh break of structure ${shiftDir ?? ''} ${x.shiftAgeCandles} candles ago — a breakout.`)
    return { state: 'breakout', direction: shiftDir, volatility, confidence, reasons, votes }
  }

  // 3. Structure and the averages agree on a direction: a trend.
  const structureDir = dirOf(x.swingTrend)
  if (structureDir !== null && x.averages === structureDir) {
    reasons.push(`The swing structure (${x.swingTrend === 'bullish' ? 'higher highs and higher lows' : 'lower highs and lower lows'}) and the hourly averages both point ${structureDir}.`)
    if (momentumDir === structureDir) reasons.push('Momentum agrees.')
    if (x.flow === structureDir) reasons.push('Cumulative delta agrees.')
    else if (x.flow && x.flow !== structureDir) reasons.push('But cumulative delta is leaning the other way — watch for a stall.')
    return { state: structureDir === 'up' ? 'trending-up' : 'trending-down', direction: structureDir, volatility, confidence, reasons, votes }
  }

  // 4. Otherwise: a range.
  reasons.push(structureDir === null ? 'The swings are mixed — no clean run of higher or lower ones.' : `Structure leans ${structureDir} but the averages disagree — no trend to lean on.`)
  reasons.push('Ranges resolve when one side gets swept; that is the setup to wait for.')
  return { state: 'ranging', direction: null, volatility, confidence, reasons, votes }
}

export function describeRegime(r: RegimeReading): string {
  const label: Record<RegimeState, string> = {
    'trending-up': 'Trending up', 'trending-down': 'Trending down', ranging: 'Ranging', breakout: 'Breakout', transition: 'Transition',
  }
  return `${label[r.state]} · volatility ${r.volatility}${r.direction ? ` · leaning ${r.direction}` : ''} (${r.confidence}/100 of the direction inputs agree).`
}
