/**
 * THE SCALP DESK — what a scalper has to know before the first click, as
 * arithmetic and as a reading of the live conditions.
 *
 * Scalping is small moves, many times. That makes it a costs game first and a
 * prediction game second: the spread, the fee on both sides and the slippage
 * are paid on every trade, win or lose, and they are a large share of a small
 * target. This file answers two questions, purely (no network, no clock):
 *
 *  1. `breakEven`: for a target and a stop, after costs, what win rate is
 *     needed just to break even, and how much of the target the costs eat?
 *  2. `scalpConditions`: right now, are the conditions a scalper looks for
 *     there? That means liquidity (session), movement large enough to cover
 *     costs, a tight spread, a news clock with room, and a tape that is going
 *     somewhere. It returns a verdict (good, thin, stand aside) with the
 *     reason for each reading.
 *
 * Neither is a signal, and nothing here reaches the engine or places an order.
 */
import type { BookSnapshot, Candle, CalendarEvent, TapeSnapshot } from '../types.ts'

export type Costs = {
  /** Full bid/ask spread in basis points (paid once per round trip: half in, half out). */
  spreadBps: number
  /** Fee per side, in basis points (0.1 % = 10 bps). */
  feeBpsPerSide: number
  /** Slippage per side, in basis points. */
  slippageBpsPerSide: number
}

export const roundTrip = (c: Costs) => c.spreadBps + 2 * c.feeBpsPerSide + 2 * c.slippageBpsPerSide

export type BreakEven = {
  targetBps: number
  stopBps: number
  roundTripBps: number
  /** What a win nets and a loss costs, after the round trip. */
  netWinBps: number
  netLossBps: number
  /** Win rate needed to break even with no costs: stop / (target + stop). */
  rawBreakEven: number
  /** Win rate needed to break even after costs. Null when a win nets nothing (costs ≥ target). */
  breakEven: number | null
  /** Share of the target the costs take. */
  costShare: number
  verdict: 'workable' | 'tight' | 'cost trap'
  note: string
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d

/** Break-even win rate for a scalp of `targetBps` with a `stopBps` stop, after costs. */
export function breakEven(targetBps: number, stopBps: number, costs: Costs): BreakEven {
  if (!(targetBps > 0) || !(stopBps > 0)) throw new Error('target and stop must be positive')
  const rt = roundTrip(costs)
  const netWin = targetBps - rt, netLoss = stopBps + rt
  const be = netWin > 0 ? netLoss / (netWin + netLoss) : null
  const share = rt / targetBps
  const verdict = be === null || share >= 0.5 ? 'cost trap' : share >= 0.25 ? 'tight' : 'workable'
  const note = be === null
    ? `The round trip (${rt.toFixed(1)} bps) is at least the target (${targetBps} bps): a win nets nothing. No win rate breaks even.`
    : `Round trip ${rt.toFixed(1)} bps takes ${Math.round(share * 100)}% of a ${targetBps} bps target. You need to win ${(be * 100).toFixed(1)}% of trades to break even, against ${(stopBps / (targetBps + stopBps) * 100).toFixed(1)}% with no costs.`
  return { targetBps, stopBps, roundTripBps: round(rt, 2), netWinBps: round(netWin, 2), netLossBps: round(netLoss, 2), rawBreakEven: round(stopBps / (targetBps + stopBps)), breakEven: be === null ? null : round(be), costShare: round(share), verdict, note }
}

/** Break-even win rate across targets, for a chart: the curve every scalper has to live above. */
export function breakEvenCurve(stopRatio: number, costs: Costs, targets: number[]): Array<{ targetBps: number; breakEven: number | null; rawBreakEven: number }> {
  return targets.map((t) => { const b = breakEven(t, t * stopRatio, costs); return { targetBps: t, breakEven: b.breakEven, rawBreakEven: b.rawBreakEven } })
}

export type ScalpReading = { key: string; label: string; status: 'good' | 'thin' | 'bad' | 'unknown'; value: string; text: string }

export type ScalpConditions = {
  verdict: 'good' | 'thin' | 'stand aside' | 'NOT ENOUGH DATA'
  score: number
  readings: ScalpReading[]
  typicalMoveBps: number | null
  roundTripBps: number
  costRatio: number | null
  /** Textbook starting shape for this tape: a stop outside the noise and a target that leaves costs under a third. */
  shape: { stopBps: number; targetBps: number; breakEven: BreakEven } | null
  playbook: string[]
  note: string
}

export const SCALP_NOTE = 'A reading of the conditions a scalper looks for, not a signal. Mr. Cash has not tested scalping as a trading rule; the paper engine trades its own 5-minute strategies and nothing here changes them.'

type SessionInfo = { name: string | null; killzone: boolean; weekend: boolean; nextKillzoneMin: number | null; nextKillzoneLabel: string | null }

/**
 * Read the scalping conditions from the latest closed candles (any interval,
 * most recent last), the order book and tape when available, the session, and
 * the economic calendar.
 */
export function scalpConditions(input: { candles: Candle[]; book: BookSnapshot | null; tape: TapeSnapshot | null; session: SessionInfo; calendar: CalendarEvent[]; blackoutNow: boolean; now: number; costs: Costs; intervalMinutes: number }): ScalpConditions {
  const { candles: c, costs } = input
  const rt = roundTrip(costs)
  const readings: ScalpReading[] = []
  const add = (key: string, label: string, status: ScalpReading['status'], value: string, text: string) => readings.push({ key, label, status, value, text })
  if (c.length < 30) return { verdict: 'NOT ENOUGH DATA', score: 0, readings: [], typicalMoveBps: null, roundTripBps: round(rt, 2), costRatio: null, shape: null, playbook: [], note: `NOT ENOUGH DATA: ${c.length} candles; the desk needs 30. ${SCALP_NOTE}` }
  const n = c.length - 1, price = c[n].close

  // Liquidity window.
  const s = input.session
  if (s.weekend) add('liquidity', 'Liquidity window', 'thin', 'weekend', 'Weekend: thinner books and wider spreads, even in crypto.')
  else if (s.killzone) add('liquidity', 'Liquidity window', 'good', s.name ?? 'killzone', `Inside a killzone (${s.name ?? 'active session'}): the most participants and the tightest books of the day.`)
  else if (s.name) add('liquidity', 'Liquidity window', 'thin', s.name, `${s.name} session, outside its killzone.${s.nextKillzoneMin !== null ? ` Next killzone (${s.nextKillzoneLabel}) in ${s.nextKillzoneMin} min.` : ''}`)
  else add('liquidity', 'Liquidity window', 'thin', 'between sessions', `Between sessions: the quiet hours.${s.nextKillzoneMin !== null ? ` Next killzone (${s.nextKillzoneLabel}) in ${s.nextKillzoneMin} min.` : ''}`)

  // Movement: the typical candle range against the round trip.
  let tr = 0
  for (let i = n - 13; i <= n; i++) tr += Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close))
  const atr = tr / 14, moveBps = (atr / price) * 10_000, ratio = rt / moveBps
  add('movement', `Typical ${input.intervalMinutes}-min move`, moveBps >= rt * 4 ? 'good' : moveBps >= rt * 2 ? 'thin' : 'bad', `${moveBps.toFixed(1)} bps`, `An average ${input.intervalMinutes}-minute candle spans ${moveBps.toFixed(1)} bps ($${atr.toFixed(2)}).`)
  add('costs', 'Costs vs move', ratio <= 0.25 ? 'good' : ratio <= 0.5 ? 'thin' : 'bad', `${Math.round(ratio * 100)}%`, `The round trip (${rt.toFixed(1)} bps: spread ${costs.spreadBps}, fee ${costs.feeBpsPerSide}×2, slippage ${costs.slippageBpsPerSide}×2) is ${Math.round(ratio * 100)}% of a typical candle. ${ratio > 0.5 ? 'Costs eat most of the move: this is where scalpers bleed.' : ratio > 0.25 ? 'Workable only with targets bigger than one candle.' : 'Room to work.'}`)

  // Spread from the live book.
  if (input.book && input.book.bestAsk > 0 && input.book.bestBid > 0) {
    const liveBps = input.book.spreadPct * 100
    add('spread', 'Live spread', liveBps <= Math.max(1, costs.spreadBps * 1.5) ? 'good' : liveBps <= costs.spreadBps * 3 ? 'thin' : 'bad', `${liveBps.toFixed(2)} bps`, `Best bid ${input.book.bestBid} / ask ${input.book.bestAsk}. ${input.book.imbalance > 0.6 ? 'More bids than asks nearby.' : input.book.imbalance < 0.4 ? 'More asks than bids nearby.' : 'Book balanced near price.'}`)
  } else add('spread', 'Live spread', 'unknown', '—', 'Order book not available: using the configured spread only.')

  // Tape speed.
  if (input.tape && input.tape.tradesPerMinute > 0) add('tape', 'Tape', input.tape.tradesPerMinute >= 60 ? 'good' : 'thin', `${Math.round(input.tape.tradesPerMinute)}/min`, `${Math.round(input.tape.tradesPerMinute)} trades a minute; buy minus sell $${Math.round(input.tape.deltaUsd).toLocaleString('en-US')}.`)
  else add('tape', 'Tape', 'unknown', '—', 'Tape not available.')

  // Direction vs chop.
  let path = 0
  for (let i = n - 11; i <= n; i++) path += Math.abs(c[i].close - c[i - 1].close)
  const er = path > 0 ? Math.abs(c[n].close - c[n - 12].close) / path : 0
  add('tape-shape', 'Trend or chop', er >= 0.4 ? 'good' : er >= 0.2 ? 'thin' : 'bad', `${Math.round(er * 100)}%`, er >= 0.4 ? `Moves are carrying: ${Math.round(er * 100)}% of the last 12 candles' path went one way.` : er >= 0.2 ? 'Mixed: some follow-through, some chop.' : 'Chopping: price is going nowhere, and every scalp pays the round trip.')

  // News clock (fundamentals).
  const high = input.calendar.filter((e) => e.impact === 'High' && e.time >= input.now - 5 * 60_000).sort((a, b) => a.time - b.time)
  const next = high[0]
  const mins = next ? Math.round((next.time - input.now) / 60_000) : null
  if (input.blackoutNow || (mins !== null && mins <= 15 && mins >= -5)) add('news', 'News clock', 'bad', next ? `${next.title} ${mins! >= 0 ? `in ${mins}m` : 'now'}` : 'blackout', `High-impact release ${next ? `(${next.country} ${next.title}) ` : ''}${mins !== null && mins >= 0 ? `in ${mins} minutes` : 'right now'}: spreads widen and price gaps. Scalpers stand aside until it settles.`)
  else if (mins !== null && mins <= 60) add('news', 'News clock', 'thin', `${next!.title} in ${mins}m`, `High-impact ${next!.country} ${next!.title} in ${mins} minutes. Plan to be flat before it.`)
  else add('news', 'News clock', input.calendar.length ? 'good' : 'unknown', next ? `${next.title} in ${Math.round(mins! / 60)}h` : 'clear', input.calendar.length ? (next ? `Next high-impact release (${next.country} ${next.title}) is more than an hour away.` : 'No high-impact release on the calendar.') : 'Calendar not available.')

  const known = readings.filter((r) => r.status !== 'unknown')
  const points = known.reduce((sum, r) => sum + (r.status === 'good' ? 2 : r.status === 'thin' ? 1 : 0), 0)
  const score = Math.round((points / Math.max(1, known.length * 2)) * 100)
  const hardStop = readings.some((r) => (r.key === 'news' || r.key === 'costs' || r.key === 'spread') && r.status === 'bad')
  const verdict = hardStop ? 'stand aside' : score >= 70 ? 'good' : 'thin'

  const stopBps = Math.max(moveBps, rt * 1.5)
  const targetBps = Math.max(stopBps * 1.5, rt * 3)
  const shape = { stopBps: round(stopBps, 1), targetBps: round(targetBps, 1), breakEven: breakEven(targetBps, stopBps, costs) }

  const playbook: string[] = []
  if (verdict === 'stand aside') playbook.push('Stand aside: a hard condition (costs, spread or news) is against you. Being flat is a position.')
  if (er >= 0.4) playbook.push('Trending tape: the textbook scalp is a pullback to VWAP or the 9/20 EMA in the trend direction, stop beyond the pullback low (or high).')
  else if (er < 0.2) playbook.push('Chop: fade only the edges of the range (prior highs and lows, the opening range), never the middle, or wait.')
  else playbook.push('Mixed tape: trade only at levels (prior day high and low, session range edges, VWAP) and demand the tape confirm.')
  playbook.push(`Starting shape for this volatility: stop about ${shape.stopBps} bps (outside one candle of noise), target at least ${shape.targetBps} bps, which needs a ${shape.breakEven.breakEven === null ? 'n impossible' : `${(shape.breakEven.breakEven * 100).toFixed(0)}%`} win rate after costs.`)
  playbook.push('Use limit orders where you can: resting orders pay the maker fee and no spread, which is often the difference between a scalping edge and none.')
  return { verdict, score, readings, typicalMoveBps: round(moveBps, 1), roundTripBps: round(rt, 2), costRatio: round(ratio), shape, playbook, note: SCALP_NOTE }
}
