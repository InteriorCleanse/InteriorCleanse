/**
 * THE STRATEGY BUILDER — describe a strategy in plain English, read the rules
 * it became, read the code, and backtest it on Mr. Cash's own candles.
 *
 * The idea comes from the AI strategy builders (Astral and the like): you say
 * "buy when RSI drops below 30 and price is above the 200 EMA, stop 2%, take
 * profit 4%", the tool turns it into a rule set you can inspect and edit, and
 * shows you how it did on history. This one does it without a language model:
 * a small, visible grammar that either understands a phrase or says it did
 * not. Nothing is guessed silently. Every default it fills in is listed.
 *
 * The backtest is honest in the same ways as the rest of the lab:
 *   - a signal is read on a CLOSED candle and filled on a later one, through
 *     the same fill model the paper engine uses (spread, slippage, latency,
 *     fees, gaps through the stop);
 *   - the first 70% of the candles are IN-SAMPLE and the last 30% are
 *     OUT-OF-SAMPLE, reported separately; the out-of-sample part is the one
 *     that counts;
 *   - every run is recorded in the trial registry, so the deflated Sharpe
 *     gets stricter the more variations you try;
 *   - under 30 out-of-sample trades the verdict is NOT ENOUGH DATA.
 *
 * RESEARCH ONLY. The engine never imports this file, and nothing here places,
 * sizes or shapes a paper or live order. A strategy you build here reaches the
 * engine only through research, an out-of-sample test, review and a paper test.
 */

import { config } from '../../config.ts'
import type { Candle } from '../types.ts'
import { ema } from '../features/ema.ts'
import { atrAt } from '../structure.ts'
import { defaultAssumptions, exitOnCandle, simulateEntry } from '../sim/fills.ts'
import type { ExecutionAssumptions, Intent } from '../sim/fills.ts'
import { tradeMetrics } from '../sim/trades.ts'
import { computeMetrics } from '../backtest/metrics.ts'
import type { Metrics } from '../backtest/metrics.ts'
import { deflatedSharpeFull, recordTrials, trialsFor } from './overfitting.ts'
import type { DeflatedSharpeFull } from './overfitting.ts'
import { store } from '../store.ts'

// ---------------------------------------------------------------- the rules

export type Cond =
  | { kind: 'rsi'; period: number; op: '<' | '>'; value: number }
  | { kind: 'price-ma'; ma: 'sma' | 'ema'; period: number; op: 'above' | 'below' | 'crossAbove' | 'crossBelow' }
  | { kind: 'ma-cross'; ma: 'sma' | 'ema'; fast: number; slow: number; op: 'crossAbove' | 'crossBelow' }
  | { kind: 'breakout'; side: 'high' | 'low'; bars: number }
  | { kind: 'volume'; mult: number; bars: number }
  | { kind: 'streak'; color: 'green' | 'red'; count: number }
  | { kind: 'move'; dir: 'down' | 'up'; pct: number; bars: number }

export type Spec = {
  direction: 'long' | 'short'
  entry: Cond[]
  exit: Cond[]
  stop: { kind: 'pct' | 'atr'; value: number }
  target: { kind: 'pct' | 'r'; value: number } | null
  maxBars: number
}

export type Parsed = {
  spec: Spec | null
  understood: string[]
  assumed: string[]
  ignored: string[]
  error: string | null
}

export const DEFAULTS = { stopAtr: 1.5, targetR: 2, maxBars: 48, rsiPeriod: 14, volumeBars: 20 } as const
const MAX_PERIOD = 400

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20, fifty: 50, hundred: 100 }
const words = (s: string) => s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|fifty|hundred)\b/g, (w) => String(WORDS[w]))
const n = (s: string | undefined) => (s === undefined ? NaN : Number(s))
const okPeriod = (p: number) => Number.isInteger(p) && p >= 2 && p <= MAX_PERIOD

/** Plain words for a condition, as the page shows it. */
export function describe(c: Cond): string {
  switch (c.kind) {
    case 'rsi': return `RSI(${c.period}) ${c.op === '<' ? 'below' : 'above'} ${c.value}`
    case 'price-ma': return `price ${c.op === 'crossAbove' ? 'crosses above' : c.op === 'crossBelow' ? 'crosses below' : `closes ${c.op}`} the ${c.period} ${c.ma.toUpperCase()}`
    case 'ma-cross': return `the ${c.fast} ${c.ma.toUpperCase()} crosses ${c.op === 'crossAbove' ? 'above' : 'below'} the ${c.slow} ${c.ma.toUpperCase()}`
    case 'breakout': return `price closes ${c.side === 'high' ? 'above the highest high' : 'below the lowest low'} of the last ${c.bars} candles`
    case 'volume': return `volume at least ${c.mult}× its ${c.bars}-candle average`
    case 'streak': return `${c.count} ${c.color} candles in a row`
    case 'move': return `price ${c.dir === 'down' ? 'falls' : 'rises'} ${c.pct}% or more over ${c.bars} candles`
  }
}

/** One clause → the conditions it contains. */
function conditions(t: string): Cond[] {
  const out: Cond[] = []
  // RSI(14) below 30 / rsi drops under 25 / rsi > 70
  for (const m of t.matchAll(/\brsi\s*\(?\s*(\d+)?\s*\)?\s*(?:is\s+|goes\s+|drops\s+|falls\s+|rises\s+|climbs\s+|crosses\s+|gets\s+)?(below|under|less than|<|above|over|greater than|more than|>)\s*(\d+(?:\.\d+)?)/g)) {
    const period = m[1] ? n(m[1]) : DEFAULTS.rsiPeriod, value = n(m[3])
    if (okPeriod(period) && value > 0 && value < 100) out.push({ kind: 'rsi', period, op: /below|under|less|</.test(m[2]) ? '<' : '>', value })
  }
  // the 20 EMA crosses above the 50 EMA / golden cross (50 over 200)
  const cross = t.match(/\b(\d+)\s*[- ]?(?:period\s+|day\s+|bar\s+)?(sma|ema|ma|moving average)\s+crosses\s+(above|over|below|under)\s+(?:the\s+)?(\d+)\s*[- ]?(?:period\s+|day\s+|bar\s+)?(sma|ema|ma|moving average)/)
  if (cross) {
    const fast = n(cross[1]), slow = n(cross[4])
    if (okPeriod(fast) && okPeriod(slow) && fast !== slow) out.push({ kind: 'ma-cross', ma: /ema/.test(cross[2] + cross[5]) ? 'ema' : 'sma', fast, slow, op: /above|over/.test(cross[3]) ? 'crossAbove' : 'crossBelow' })
  } else if (/\bgolden cross\b/.test(t)) out.push({ kind: 'ma-cross', ma: 'sma', fast: 50, slow: 200, op: 'crossAbove' })
  else if (/\bdeath cross\b/.test(t)) out.push({ kind: 'ma-cross', ma: 'sma', fast: 50, slow: 200, op: 'crossBelow' })
  else {
    // price closes above the 200 EMA / crosses below the 20-day moving average
    for (const m of t.matchAll(/\b(?:(crosses|breaks)\s+)?(above|over|below|under)\s+(?:the\s+)?(\d+)\s*[- ]?(?:period\s+|day\s+|bar\s+|candle\s+)?(sma|ema|ma\b|moving average)/g)) {
      const period = n(m[3])
      if (!okPeriod(period)) continue
      const up = /above|over/.test(m[2])
      out.push({ kind: 'price-ma', ma: m[4] === 'ema' ? 'ema' : 'sma', period, op: m[1] ? (up ? 'crossAbove' : 'crossBelow') : up ? 'above' : 'below' })
    }
  }
  // breaks above the 20-candle high / new 50 bar low
  for (const m of t.matchAll(/\b(?:breaks?\s+(?:out\s+)?(?:above|over|below|under)|new|closes\s+(?:above|below))\s+(?:the\s+)?(?:last\s+)?(\d+)\s*[- ]?(?:candle|bar|period|day)s?\s+(high|low)/g)) {
    const bars = n(m[1])
    if (okPeriod(bars)) out.push({ kind: 'breakout', side: m[2] as 'high' | 'low', bars })
  }
  // volume above 2x average / volume is 1.5 times the 20 bar average
  const vol = t.match(/\bvolume\s+(?:is\s+)?(?:above|over|more than|at least|>)?\s*(\d+(?:\.\d+)?)\s*(?:x|×|times)\s*(?:the\s+)?(?:(\d+)\s*[- ]?(?:candle|bar|period|day)s?\s+)?(?:average|avg)/)
  if (vol) { const mult = n(vol[1]), bars = vol[2] ? n(vol[2]) : DEFAULTS.volumeBars; if (mult > 0 && mult <= 20 && okPeriod(bars)) out.push({ kind: 'volume', mult, bars }) }
  // 3 red candles in a row
  const streak = t.match(/\b(\d+)\s+(red|green|down|up|bearish|bullish)\s+(?:candles?|bars?)\s+in\s+a\s+row/)
  if (streak) { const count = n(streak[1]); if (count >= 1 && count <= 20) out.push({ kind: 'streak', color: /red|down|bear/.test(streak[2]) ? 'red' : 'green', count }) }
  // price drops 3% in 12 candles
  const move = t.match(/\b(?:price\s+)?(drops?|falls?|dumps?|declines?|rises?|jumps?|pumps?|rallies|gains?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%\s+(?:in|within|over)\s+(?:the\s+last\s+)?(\d+)\s*(?:candles?|bars?)/)
  if (move) { const pct = n(move[2]), bars = n(move[3]); if (pct > 0 && pct < 90 && bars >= 1 && bars <= MAX_PERIOD) out.push({ kind: 'move', dir: /drop|fall|dump|decline/.test(move[1]) ? 'down' : 'up', pct, bars }) }
  return out
}

const NEWS = /\b(news|headline|announce|announced|announcement|tariff|crash(?:es)?|earnings|tweet|fed says|lawsuit|hack)\b/

/** Plain English → a rule set, with what it understood, what it assumed and what it ignored. */
export function parseStrategy(raw: string): Parsed {
  const understood: string[] = [], assumed: string[] = [], ignored: string[] = []
  const text = words(String(raw ?? '').toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 2000)
  if (!text) return { spec: null, understood, assumed, ignored, error: 'Describe a strategy first.' }
  const short = /\b(go short|short(?:s|ing)? (?:when|if|on)|sell short|^short\b)/.test(text)
  const direction: Spec['direction'] = short ? 'short' : 'long'
  understood.push(direction === 'long' ? 'Direction: long (buys, then sells to close).' : 'Direction: short (sells first, then buys back).')

  let stop: Spec['stop'] | null = null, target: Spec['target'] = null, maxBars: number | null = null, noTarget = false
  const entry: Cond[] = [], exit: Cond[] = []
  // Split into clauses; a clause that starts an exit ("sell when", "exit if", "cover when") feeds the exit side.
  const clauses = text.split(/(?:\.(?!\d)|[;!?\n]|,?\s+then\s+|,\s*(?=(?:and\s+)?(?:sell|exit|close|cover|buy|go|enter|short|stop|take|target|tp|hold)\b))/).map((s) => s.trim()).filter(Boolean)
  let side: 'entry' | 'exit' = 'entry'
  for (const c of clauses) {
    let hit = false
    const exitStart = direction === 'long' ? /^(?:and\s+)?(?:sell|exit|close|take profits? when|get out)\b/ : /^(?:and\s+)?(?:cover|buy back|exit|close|get out)\b/
    const entryStart = direction === 'long' ? /^(?:and\s+)?(?:buy|go long|enter|get in|long)\b/ : /^(?:and\s+)?(?:short|go short|sell short|enter)\b/
    if (exitStart.test(c)) side = 'exit'
    else if (entryStart.test(c)) side = 'entry'
    const st = c.match(/\bstop(?:[- ]?loss)?\s*(?:at|of|is|=)?\s*(\d+(?:\.\d+)?)\s*(%|percent|x?\s*atr|times\s+atr)/)
    if (st) { const v = n(st[1]); if (v > 0 && v < 50) { stop = { kind: /atr/.test(st[2]) ? 'atr' : 'pct', value: v }; hit = true } }
    const tp = c.match(/\b(?:take[- ]?profit|target|profit target|tp)\s*(?:at|of|is|=)?\s*(\d+(?:\.\d+)?)\s*(%|percent|r\b|x\s*risk|times\s+risk)/)
    if (tp) { const v = n(tp[1]); if (v > 0 && v < 100) { target = { kind: /%|percent/.test(tp[2]) ? 'pct' : 'r', value: v }; hit = true } }
    const rr = c.match(/\b(\d+(?:\.\d+)?)\s*(?::|to)\s*1\b|\brisk[- ]reward\s*(?:of\s*)?(\d+(?:\.\d+)?)/)
    if (!tp && rr) { const v = n(rr[1] ?? rr[2]); if (v > 0 && v < 20) { target = { kind: 'r', value: v }; hit = true } }
    if (/\bno (?:take[- ]?profit|target)\b/.test(c)) { noTarget = true; hit = true }
    const mb = c.match(/\b(?:exit|close|sell|hold|max(?:imum)?|time stop|get out)\b[^.]*?\b(?:after|for|of|at most|up to)\s+(\d+)\s*(?:candles?|bars?)/)
    if (mb) { const v = n(mb[1]); if (v >= 1 && v <= 2000) { maxBars = v; hit = true } }
    // Conditions, but not the numbers that belong to the stop, target or time rule just read.
    const body = c.replace(/\bstop(?:[- ]?loss)?[^,]*?(?:%|percent|atr)/g, ' ').replace(/\b(?:take[- ]?profit|target|tp)[^,]*?(?:%|percent|r\b|risk)/g, ' ').replace(/\b(?:after|for)\s+\d+\s*(?:candles?|bars?)/g, ' ')
    const found = conditions(body)
    if (found.length) { (side === 'exit' ? exit : entry).push(...found); hit = true }
    if (!hit) ignored.push(NEWS.test(c) ? `"${c}" — a news-event rule. The builder has no history of headlines to test it on, so it is left out rather than guessed.` : `"${c}"`)
  }

  if (!entry.length) return { spec: null, understood, assumed, ignored, error: 'No entry rule was understood. Try one of the examples, or phrases like "buy when RSI(14) is below 30" or "buy when price breaks above the 20 candle high".' }
  for (const e of entry) understood.push(`Entry when ${describe(e)}.`)
  for (const e of exit) understood.push(`Exit early when ${describe(e)}.`)
  if (stop) understood.push(`Stop ${stop.value}${stop.kind === 'pct' ? '%' : '× ATR'} from entry.`)
  else { stop = { kind: 'atr', value: DEFAULTS.stopAtr }; assumed.push(`No stop was given: ${DEFAULTS.stopAtr}× ATR(${config.ict.atrPeriod}) from entry. Every backtest here has a stop.`) }
  if (noTarget) understood.push('No take-profit: exits come from the stop, the exit rules or the time limit.')
  else if (target) understood.push(`Take profit at ${target.value}${target.kind === 'pct' ? '%' : 'R (times the risk)'}.`)
  else { target = { kind: 'r', value: DEFAULTS.targetR }; assumed.push(`No take-profit was given: ${DEFAULTS.targetR}R, twice the distance to the stop.`) }
  if (maxBars) understood.push(`Time limit: exit after ${maxBars} candles.`)
  else { maxBars = DEFAULTS.maxBars; assumed.push(`No time limit was given: exit after ${DEFAULTS.maxBars} candles (${(DEFAULTS.maxBars * 5) / 60} hours on ${config.interval} candles).`) }
  return { spec: { direction, entry, exit, stop, target: noTarget ? null : target, maxBars }, understood, assumed, ignored, error: null }
}

// ---------------------------------------------------------------- the code

const expr = (c: Cond): string => {
  switch (c.kind) {
    case 'rsi': return `rsi(${c.period})[i] ${c.op} ${c.value}`
    case 'price-ma': {
      const f = `${c.ma}(${c.period})`
      if (c.op === 'above') return `close[i] > ${f}[i]`
      if (c.op === 'below') return `close[i] < ${f}[i]`
      return c.op === 'crossAbove' ? `close[i-1] <= ${f}[i-1] && close[i] > ${f}[i]` : `close[i-1] >= ${f}[i-1] && close[i] < ${f}[i]`
    }
    case 'ma-cross': { const a = `${c.ma}(${c.fast})`, b = `${c.ma}(${c.slow})`; return c.op === 'crossAbove' ? `${a}[i-1] <= ${b}[i-1] && ${a}[i] > ${b}[i]` : `${a}[i-1] >= ${b}[i-1] && ${a}[i] < ${b}[i]` }
    case 'breakout': return c.side === 'high' ? `close[i] > highest(high, ${c.bars})[i-1]` : `close[i] < lowest(low, ${c.bars})[i-1]`
    case 'volume': return `volume[i] >= ${c.mult} * average(volume, ${c.bars})[i-1]`
    case 'streak': return `last(${c.count}).every(k => k.close ${c.color === 'green' ? '>' : '<'} k.open)`
    case 'move': return `(close[i] / close[i-${c.bars}] - 1) * 100 ${c.dir === 'down' ? `<= -${c.pct}` : `>= ${c.pct}`}`
  }
}

/** The rule set as readable code, the way the builders show it. Read-only: this text is not executed. */
export function renderCode(spec: Spec, name = 'my strategy'): string {
  const side = spec.direction === 'long' ? 'below' : 'above'
  const stop = spec.stop.kind === 'pct' ? `entry * (1 ${spec.direction === 'long' ? '-' : '+'} ${spec.stop.value / 100})` : `entry ${spec.direction === 'long' ? '-' : '+'} ${spec.stop.value} * atr(${config.ict.atrPeriod})[i]`
  const target = !spec.target ? 'none' : spec.target.kind === 'pct' ? `entry * (1 ${spec.direction === 'long' ? '+' : '-'} ${spec.target.value / 100})` : `entry ${spec.direction === 'long' ? '+' : '-'} ${spec.target.value} * risk`
  return [
    `// ${name} — generated by the Mr. Cash strategy builder. BACKTEST ONLY: this never trades.`,
    `// Every signal reads the CLOSED candle i and fills on the next candle, with spread, slippage and fees.`,
    `strategy({`,
    `  market: '${config.symbol}', candles: '${config.interval}', side: '${spec.direction}',`,
    ``,
    `  entry: (i) =>`,
    ...spec.entry.map((c, k) => `    ${k ? '&& ' : ''}(${expr(c)})`),
    ...(spec.exit.length ? [``, `  exitEarly: (i) =>`, ...spec.exit.map((c, k) => `    ${k ? '|| ' : ''}(${expr(c)})`), `    // exits at the next candle's open`] : []),
    ``,
    `  stop:   (entry, i) => ${stop},   // ${side} entry; a gap through it fills at the open`,
    `  target: (entry, risk) => ${target},`,
    `  maxCandles: ${spec.maxBars},`,
    `  onePositionAtATime: true,`,
    `})`,
  ].join('\n')
}

// ---------------------------------------------------------------- the backtest

function rsiSeries(close: number[], period: number): number[] {
  const out = new Array(close.length).fill(NaN)
  let gain = 0, loss = 0
  for (let i = 1; i < close.length; i++) {
    const d = close[i] - close[i - 1]
    if (i <= period) { gain += Math.max(0, d); loss += Math.max(0, -d); if (i === period) { gain /= period; loss /= period; out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) } continue }
    gain = (gain * (period - 1) + Math.max(0, d)) / period
    loss = (loss * (period - 1) + Math.max(0, -d)) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}
function smaSeries(v: number[], period: number): number[] {
  const out = new Array(v.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < v.length; i++) { sum += v[i]; if (i >= period) sum -= v[i - period]; if (i >= period - 1) out[i] = sum / period }
  return out
}
function emaSeries(v: number[], period: number): number[] {
  const e = ema(v, period)
  return e.map((x, i) => (i < period - 1 ? NaN : x))
}

type Series = { close: number[]; high: number[]; low: number[]; open: number[]; volume: number[]; cache: Map<string, number[]> }
const series = (c: Candle[]): Series => ({ close: c.map((k) => k.close), high: c.map((k) => k.high), low: c.map((k) => k.low), open: c.map((k) => k.open), volume: c.map((k) => k.volume), cache: new Map() })
function ind(s: Series, key: string, make: () => number[]): number[] { let v = s.cache.get(key); if (!v) { v = make(); s.cache.set(key, v) } return v }
const ma = (s: Series, kind: 'sma' | 'ema', p: number) => ind(s, `${kind}${p}`, () => (kind === 'sma' ? smaSeries(s.close, p) : emaSeries(s.close, p)))

/** Is the condition true on the CLOSED candle i? Reads nothing after i. */
export function holds(c: Cond, s: Series, i: number): boolean {
  if (i < 1) return false
  switch (c.kind) {
    case 'rsi': { const r = ind(s, `rsi${c.period}`, () => rsiSeries(s.close, c.period))[i]; return Number.isFinite(r) && (c.op === '<' ? r < c.value : r > c.value) }
    case 'price-ma': {
      const m = ma(s, c.ma, c.period)
      if (!Number.isFinite(m[i]) || !Number.isFinite(m[i - 1])) return false
      if (c.op === 'above') return s.close[i] > m[i]
      if (c.op === 'below') return s.close[i] < m[i]
      return c.op === 'crossAbove' ? s.close[i - 1] <= m[i - 1] && s.close[i] > m[i] : s.close[i - 1] >= m[i - 1] && s.close[i] < m[i]
    }
    case 'ma-cross': {
      const a = ma(s, c.ma, c.fast), b = ma(s, c.ma, c.slow)
      if (![a[i], a[i - 1], b[i], b[i - 1]].every(Number.isFinite)) return false
      return c.op === 'crossAbove' ? a[i - 1] <= b[i - 1] && a[i] > b[i] : a[i - 1] >= b[i - 1] && a[i] < b[i]
    }
    case 'breakout': {
      if (i < c.bars) return false
      let hi = -Infinity, lo = Infinity
      for (let k = i - c.bars; k < i; k++) { hi = Math.max(hi, s.high[k]); lo = Math.min(lo, s.low[k]) }
      return c.side === 'high' ? s.close[i] > hi : s.close[i] < lo
    }
    case 'volume': {
      if (i < c.bars) return false
      let sum = 0
      for (let k = i - c.bars; k < i; k++) sum += s.volume[k]
      const avg = sum / c.bars
      return avg > 0 && s.volume[i] >= c.mult * avg
    }
    case 'streak': {
      if (i < c.count - 1) return false
      for (let k = i - c.count + 1; k <= i; k++) if (c.color === 'green' ? !(s.close[k] > s.open[k]) : !(s.close[k] < s.open[k])) return false
      return true
    }
    case 'move': {
      if (i < c.bars) return false
      const ch = (s.close[i] / s.close[i - c.bars] - 1) * 100
      return c.dir === 'down' ? ch <= -c.pct : ch >= c.pct
    }
  }
}

export type BuiltTrade = {
  signalAt: number
  time: number
  exitTime: number
  direction: 'long' | 'short'
  entry: number
  exit: number
  stop: number
  target: number | null
  reason: 'stop' | 'target' | 'time' | 'rule'
  candlesHeld: number
  rMultiple: number
  pnlUsd: number
  outcome: 'WIN' | 'LOSS' | 'FLAT'
  sample: 'IN-SAMPLE' | 'OUT-OF-SAMPLE'
}

export type BuilderReport = {
  label: 'BACKTEST'
  market: string
  interval: string
  candles: number
  from: number | null
  to: number | null
  splitAt: number | null
  trades: BuiltTrade[]
  all: Metrics
  inSample: Metrics
  outOfSample: Metrics
  /** Price change over the same out-of-sample window, for comparison. */
  holdOosPct: number | null
  deflated: DeflatedSharpeFull | null
  trials: number
  verdict: 'NOT ENOUGH DATA' | 'NO EDGE SHOWN' | 'SURVIVED OUT-OF-SAMPLE' | 'FAILED OUT-OF-SAMPLE'
  line: string
  missedEntries: number
  curve: Array<{ time: number; r: number }>
  note: string
}

export const OOS_SHARE = 0.3
export const MIN_OOS_TRADES = 30

/** Run the rule set over candles, one position at a time, through the paper engine's fill model. Pure. */
export function backtestSpec(spec: Spec, candles: Candle[], opts: { a?: ExecutionAssumptions; trials?: number } = {}): BuilderReport {
  const a = opts.a ?? defaultAssumptions()
  const s = series(candles)
  const splitIdx = Math.floor(candles.length * (1 - OOS_SHARE))
  const splitAt = candles[splitIdx]?.openTime ?? null
  const trades: BuiltTrade[] = []
  let missed = 0
  const dir = spec.direction === 'long' ? 1 : -1
  const warm = 30
  for (let i = warm; i < candles.length - 1; i++) {
    if (!spec.entry.every((c) => holds(c, s, i))) continue
    const px = candles[i].close
    const atr = atrAt(candles, i)
    const stopDist = spec.stop.kind === 'pct' ? (px * spec.stop.value) / 100 : spec.stop.value * atr
    if (!(stopDist > 0)) continue
    const stop = px - dir * stopDist
    const target = spec.target ? (spec.target.kind === 'pct' ? px + (dir * px * spec.target.value) / 100 : px + dir * spec.target.value * stopDist) : px + dir * px * 100 // no target: out of reach
    const intent: Intent = { direction: spec.direction, intendedEntry: px, stop, target, atr }
    const e = simulateEntry(intent, candles, i, a)
    if (!e.filled) { if (e.reason === 'missed') missed++; continue }
    const fill = e.fill
    let exitPx = NaN, exitTime = 0, reason: BuiltTrade['reason'] = 'time', held = 0, exitIdx = -1
    for (let j = fill.index; j < candles.length; j++) {
      held++
      const x = exitOnCandle(intent, candles[j], held, a, spec.maxBars)
      if (x) { exitPx = x.price; exitTime = x.time; reason = x.reason; exitIdx = j; break }
      if (spec.exit.length && spec.exit.some((c) => holds(c, s, j)) && candles[j + 1]) {
        const nx = candles[j + 1]
        const cost = nx.open * (a.spreadBps / 2 + a.slippageBps) / 10_000
        exitPx = nx.open - dir * cost; exitTime = nx.openTime; reason = 'rule'; exitIdx = j + 1; held++
        break
      }
    }
    if (exitIdx < 0) break // the trade is still open at the end of the data: not a result
    const m = tradeMetrics({ direction: spec.direction, fill: fill.price, stop, exit: exitPx, exitReason: reason === 'rule' ? 'time' : reason, quantity: 1 }, a)
    trades.push({ signalAt: candles[i].closeTime, time: fill.time, exitTime, direction: spec.direction, entry: fill.price, exit: exitPx, stop, target: spec.target ? target : null, reason, candlesHeld: held, rMultiple: m.rMultiple, pnlUsd: m.pnlUsd, outcome: m.outcome, sample: splitAt !== null && fill.time >= splitAt ? 'OUT-OF-SAMPLE' : 'IN-SAMPLE' })
    i = exitIdx
  }
  const like = (t: BuiltTrade) => ({ time: t.time, rMultiple: t.rMultiple, pnlUsd: t.pnlUsd, outcome: t.outcome })
  const oos = trades.filter((t) => t.sample === 'OUT-OF-SAMPLE')
  const all = computeMetrics(trades.map(like)), inSample = computeMetrics(trades.filter((t) => t.sample === 'IN-SAMPLE').map(like)), outOfSample = computeMetrics(oos.map(like))
  const trials = Math.max(1, opts.trials ?? 1)
  const deflated = oos.length >= 2 ? deflatedSharpeFull(oos.map((t) => t.rMultiple), trials) : null
  const holdOosPct = splitIdx < candles.length - 1 ? Math.round(((candles[candles.length - 1].close / candles[splitIdx].open - 1) * 100) * 100) / 100 : null
  let cum = 0
  const curve = trades.map((t) => ({ time: t.exitTime, r: Math.round((cum += t.rMultiple) * 1000) / 1000 }))
  const exp = outOfSample.expectancyR
  const verdict: BuilderReport['verdict'] = oos.length < MIN_OOS_TRADES ? 'NOT ENOUGH DATA' : exp === null || exp <= 0 ? 'FAILED OUT-OF-SAMPLE' : deflated && deflated.verdict === 'SURVIVES DEFLATION' ? 'SURVIVED OUT-OF-SAMPLE' : 'NO EDGE SHOWN'
  const r = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`)
  const line = verdict === 'NOT ENOUGH DATA'
    ? `NOT ENOUGH DATA: ${oos.length} out-of-sample trade${oos.length === 1 ? '' : 's'} (${MIN_OOS_TRADES} needed). ${trades.length} in total over ${candles.length.toLocaleString()} candles.`
    : verdict === 'FAILED OUT-OF-SAMPLE' ? `Failed on the part it never saw: out-of-sample expectancy ${r(exp)} per trade over ${oos.length} trades, after costs.`
    : verdict === 'NO EDGE SHOWN' ? `Out-of-sample expectancy ${r(exp)} over ${oos.length} trades, but after ${trials} tr${trials === 1 ? 'y' : 'ies'} of this builder the deflated Sharpe cannot tell it from luck.`
    : `Out-of-sample expectancy ${r(exp)} over ${oos.length} trades, and it clears the deflated-Sharpe bar after ${trials} tries. A backtest pass, not a promise: the next step is a paper test.`
  return {
    label: 'BACKTEST', market: config.symbol, interval: config.interval, candles: candles.length, from: candles[0]?.openTime ?? null, to: candles[candles.length - 1]?.closeTime ?? null, splitAt,
    trades, all, inSample, outOfSample, holdOosPct, deflated, trials, verdict, line, missedEntries: missed, curve,
    note: `BACKTEST on stored ${config.interval} candles. Signals read closed candles and fill on a later one with the paper engine's spread, slippage, latency and fees; a candle that touches both the stop and the target counts as the stop. The first ${Math.round((1 - OOS_SHARE) * 100)}% is in-sample, the last ${Math.round(OOS_SHARE * 100)}% out-of-sample. Research only: nothing here reaches the engine.`,
  }
}

// ---------------------------------------------------------------- the desk

export type SavedStrategy = { id: string; name: string; text: string; savedAt: number; verdict: BuilderReport['verdict'] | null; oosTrades: number; oosExpectancyR: number | null }

const SAVED_KEY = 'builder:saved'
export const TRIAL_ID = 'builder'

export const EXAMPLES: Array<{ name: string; text: string }> = [
  { name: 'Oversold bounce in an uptrend', text: 'Buy when RSI(14) is below 30 and price is above the 200 EMA. Sell when RSI is above 60. Stop 1.5 ATR, take profit 2R.' },
  { name: 'Breakout with volume', text: 'Buy when price breaks above the 20 candle high and volume is 2x the average. Stop 1%, take profit 2%. Exit after 36 candles.' },
  { name: 'Trend cross', text: 'Buy when the 20 EMA crosses above the 50 EMA. Sell when price closes below the 50 EMA. Stop 2 ATR, no take profit.' },
  { name: 'Fade a fast drop', text: 'Buy when price drops 2% in 12 candles and 3 red candles in a row. Stop 1%, take profit 1.5%. Exit after 24 candles.' },
  { name: 'Short the rejection', text: 'Short when RSI(14) is above 75 and price is below the 200 SMA. Cover when RSI is below 45. Stop 1.5 ATR, target 2R.' },
]

export const GRAMMAR: string[] = [
  'RSI: "RSI(14) below 30", "RSI above 70"',
  'Averages: "price above the 200 EMA", "price crosses below the 50 SMA", "the 20 EMA crosses above the 50 EMA", "golden cross"',
  'Breakouts: "breaks above the 20 candle high", "new 50 bar low"',
  'Volume: "volume 2x the average", "volume 1.5 times the 30 bar average"',
  'Candles: "3 red candles in a row", "price drops 2% in 12 candles"',
  'Exits: "sell when …" (or "cover when …" for a short), "stop 1.5%", "stop 2 ATR", "take profit 3%", "target 2R", "2:1", "no take profit", "exit after 48 candles"',
  'Direction: long by default; start with "Short when …" for a short',
]

export function savedStrategies(): SavedStrategy[] { return store().getJson<SavedStrategy[]>(SAVED_KEY) ?? [] }

export function saveStrategy(name: string, text: string, report: BuilderReport | null): SavedStrategy[] {
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled strategy'
  const list = savedStrategies().filter((s) => s.name.toLowerCase() !== clean.toLowerCase())
  list.unshift({ id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: clean, text: String(text).slice(0, 2000), savedAt: Date.now(), verdict: report?.verdict ?? null, oosTrades: report?.outOfSample.trades ?? 0, oosExpectancyR: report?.outOfSample.expectancyR ?? null })
  const kept = list.slice(0, 50)
  store().setJson(SAVED_KEY, kept)
  return kept
}

export function deleteStrategy(id: string): SavedStrategy[] {
  const kept = savedStrategies().filter((s) => s.id !== id)
  store().setJson(SAVED_KEY, kept)
  return kept
}

/** Stored candles for the bot's own market, oldest first. Reads the store only; never fetches. */
export function storedCandles(limit = 20_000): Candle[] {
  return store().lastCandles(config.symbol, config.interval, limit).map(({ source: _s, ...c }) => c)
}

/** Parse, render and backtest one description. Each run counts as one trial for the deflated Sharpe. */
export function runBuilder(text: string, candles: Candle[] = storedCandles(), name?: string): { parsed: Parsed; code: string | null; report: BuilderReport | null } {
  const parsed = parseStrategy(text)
  if (!parsed.spec) return { parsed, code: null, report: null }
  const code = renderCode(parsed.spec, name)
  if (candles.length < 200) return { parsed, code, report: null }
  recordTrials({ strategyId: TRIAL_ID, source: 'research-lab', count: 1, note: 'strategy builder run' })
  const report = backtestSpec(parsed.spec, candles, { trials: trialsFor(TRIAL_ID) })
  return { parsed, code, report }
}

/** Save by name, with the verdict from a fresh backtest that does NOT count as another trial (saving is not trying). */
export function saveFromText(name: string, text: string, candles: Candle[] = storedCandles()): SavedStrategy[] {
  const parsed = parseStrategy(text)
  if (!parsed.spec) throw new Error(parsed.error ?? 'Nothing to save.')
  const report = candles.length >= 200 ? backtestSpec(parsed.spec, candles, { trials: Math.max(1, trialsFor(TRIAL_ID)) }) : null
  return saveStrategy(name, text, report)
}

/** How many builder runs the trial registry has counted. */
export function trialCount(): number { return trialsFor(TRIAL_ID) }
