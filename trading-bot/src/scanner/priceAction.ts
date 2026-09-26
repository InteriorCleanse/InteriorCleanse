/**
 * PRICE ACTION — the candlestick-trading method (trend, level, signal) as
 * fixed, checkable rules, and a way to measure it on the market's own candles.
 *
 * Three pieces, all pure (no network, no clock, no AI):
 *
 *  1. `candleSignalsAt(c, n)` reads the candle at index `n` using only candles
 *     0..n: pin bars, engulfing bars, inside bars and the fakey, hammers and
 *     shooting stars, morning and evening stars, harami, tweezers, piercing
 *     line and dark cloud cover, three soldiers and three crows, doji.
 *  2. `confluence(c)` asks the method's three questions about the last candle
 *     (is the market trending, is price at a level, is there a clean signal
 *     pointing the same way) and grades the answer A, B or C.
 *     `biasScore(c)` folds six different readings into one number from −6 to
 *     +6 with a plain lean (long, short, or sit out).
 *  3. `patternEvidence(c)` walks the history candle by candle, finds every
 *     signal as it would have appeared at the time (no later candle is used to
 *     find it, and swing points count only once they were confirmed), and
 *     records what price did over the next few candles against the baseline of
 *     every candle. Labelled BACKTEST, with INSUFFICIENT SAMPLE below 30 cases.
 *
 * Nothing here is a trading rule for Mr. Cash, and nothing reaches the engine.
 * Published studies of these patterns (for example Bulkowski's counts) find
 * direction calls only modestly better than a coin flip on their own, which is
 * why the method insists on context and why this file measures instead of
 * asserting.
 */
import type { Candle } from '../types.ts'
import { atr, ema, pivots, rsiSeries } from './patterns.ts'
import type { Pivot } from './patterns.ts'

export type Lean = 'bull' | 'bear' | 'neutral'

export type CandleSignal = {
  id: string
  name: string
  bias: Lean
  /** First candle of the pattern (the last is always `n`). */
  from: number
  /** Price the marker sits at: the low for bullish shapes, the high for bearish. */
  anchor: number
  meaning: string
  confirm: string
  invalidate: string
}

const fmt = (n: number) => (Math.abs(n) >= 1 ? n.toFixed(2) : n.toPrecision(4))
const body = (k: Candle) => Math.abs(k.close - k.open)
const range = (k: Candle) => k.high - k.low
const up = (k: Candle) => k.close > k.open
const down = (k: Candle) => k.close < k.open
const upper = (k: Candle) => k.high - Math.max(k.open, k.close)
const lower = (k: Candle) => Math.min(k.open, k.close) - k.low

/**
 * Every candlestick signal on candle `n`, from candles 0..n only.
 * `a` is the average true range at `n` (used to tell a strong candle from a small one).
 */
export function candleSignalsAt(c: Candle[], n: number, a: number): CandleSignal[] {
  if (n < 5 || n >= c.length || !(a > 0)) return []
  const x = c[n], p = c[n - 1], q = c[n - 2]
  const fell = x.close < c[n - 5].close, rose = x.close > c[n - 5].close
  const out: CandleSignal[] = []
  const add = (id: string, name: string, bias: Lean, from: number, meaning: string, confirm: string, invalidate: string) =>
    out.push({ id, name, bias, from, anchor: bias === 'bear' ? Math.max(...c.slice(from, n + 1).map((k) => k.high)) : Math.min(...c.slice(from, n + 1).map((k) => k.low)), meaning, confirm, invalidate })

  // Engulfing: the second body swallows the first, in the other colour.
  if (down(p) && up(x) && x.open <= p.close && x.close >= p.open && body(x) > body(p)) add('bull-engulf', 'Bullish engulfing', 'bull', n - 1, 'A green candle whose body swallows the previous red one.', `The next candle holding above ${fmt(x.low)}.`, `A close below ${fmt(x.low)}.`)
  if (up(p) && down(x) && x.open >= p.close && x.close <= p.open && body(x) > body(p)) add('bear-engulf', 'Bearish engulfing', 'bear', n - 1, 'A red candle whose body swallows the previous green one.', `The next candle staying below ${fmt(x.high)}.`, `A close above ${fmt(x.high)}.`)

  // Hammer and shooting star: a pin bar that comes after a move.
  const hammer = range(x) > 0 && lower(x) >= 2 * body(x) && upper(x) <= Math.max(body(x) * 0.5, range(x) * 0.1) && fell
  const star = range(x) > 0 && upper(x) >= 2 * body(x) && lower(x) <= Math.max(body(x) * 0.5, range(x) * 0.1) && rose
  if (hammer) add('hammer', 'Hammer', 'bull', n, 'After a drop, sellers pushed price down and buyers pulled it back up, leaving a long lower wick.', `A close above ${fmt(x.high)}.`, `A close below ${fmt(x.low)}.`)
  if (star) add('shooting-star', 'Shooting star', 'bear', n, 'After a rise, buyers pushed price up and sellers knocked it back, leaving a long upper wick.', `A close below ${fmt(x.low)}.`, `A close above ${fmt(x.high)}.`)

  // Pin bar (the Candlestick Bible's rejection candle): tail at least two thirds of the range,
  // body and nose in the other third, and a real candle (not a sliver). Hammers and stars already cover the after-a-move case.
  if (!hammer && !star && range(x) >= a * 0.6) {
    if (lower(x) >= range(x) * 2 / 3 && Math.min(x.open, x.close) >= x.low + range(x) * 2 / 3) add('bull-pin', 'Bullish pin bar', 'bull', n, 'A long lower tail: price was pushed down and rejected within the candle.', `A break above ${fmt(x.high)}.`, `A close below the tail at ${fmt(x.low)}.`)
    if (upper(x) >= range(x) * 2 / 3 && Math.max(x.open, x.close) <= x.high - range(x) * 2 / 3) add('bear-pin', 'Bearish pin bar', 'bear', n, 'A long upper tail: price was pushed up and rejected within the candle.', `A break below ${fmt(x.low)}.`, `A close above the tail at ${fmt(x.high)}.`)
  }

  // Morning and evening star: strong candle, small pause, strong reply closing well into the first.
  if (down(q) && body(q) > a * 0.6 && body(p) < body(q) * 0.35 && up(x) && x.close > (q.open + q.close) / 2) add('morning-star', 'Morning star', 'bull', n - 2, 'A strong red candle, a small pause, then a green candle closing well into the red one.', `Holding above ${fmt(Math.min(p.low, x.low))}.`, `A close below ${fmt(Math.min(p.low, x.low))}.`)
  if (up(q) && body(q) > a * 0.6 && body(p) < body(q) * 0.35 && down(x) && x.close < (q.open + q.close) / 2) add('evening-star', 'Evening star', 'bear', n - 2, 'A strong green candle, a small pause, then a red candle closing well into the green one.', `Staying below ${fmt(Math.max(p.high, x.high))}.`, `A close above ${fmt(Math.max(p.high, x.high))}.`)

  // Fakey: an inside bar whose break fails. Candle n pokes outside the mother bar (n-2) and closes back inside it.
  const insidePrev = p.high < q.high && p.low > q.low
  if (insidePrev && x.low < q.low && x.close > q.low && x.close < q.high) add('bull-fakey', 'Bullish fakey', 'bull', n - 2, 'An inside bar broke lower, then price closed back inside the mother bar: the break down was a trap.', `A break above ${fmt(q.high)}.`, `A close below ${fmt(x.low)}.`)
  if (insidePrev && x.high > q.high && x.close < q.high && x.close > q.low) add('bear-fakey', 'Bearish fakey', 'bear', n - 2, 'An inside bar broke higher, then price closed back inside the mother bar: the break up was a trap.', `A break below ${fmt(q.low)}.`, `A close above ${fmt(x.high)}.`)

  // Harami: a small body inside the previous large body, other colour. A pause after a push.
  if (down(p) && up(x) && body(p) > a * 0.6 && body(x) < body(p) * 0.5 && x.open > p.close && x.close < p.open && fell) add('bull-harami', 'Bullish harami', 'bull', n - 1, 'A small green body sitting inside a large red one after a drop: selling paused.', `A close above ${fmt(p.open)}.`, `A close below ${fmt(Math.min(x.low, p.low))}.`)
  if (up(p) && down(x) && body(p) > a * 0.6 && body(x) < body(p) * 0.5 && x.open < p.close && x.close > p.open && rose) add('bear-harami', 'Bearish harami', 'bear', n - 1, 'A small red body sitting inside a large green one after a rise: buying paused.', `A close below ${fmt(p.open)}.`, `A close above ${fmt(Math.max(x.high, p.high))}.`)

  // Tweezers: two candles in a row stopping at the same low (or high), within a tenth of the average range.
  if (fell && Math.abs(x.low - p.low) <= a * 0.1 && down(p) && up(x)) add('tweezer-bottom', 'Tweezer bottom', 'bull', n - 1, 'Two candles stopped at the same low: sellers could not push through twice.', `A close above ${fmt(Math.max(x.high, p.high))}.`, `A close below ${fmt(Math.min(x.low, p.low))}.`)
  if (rose && Math.abs(x.high - p.high) <= a * 0.1 && up(p) && down(x)) add('tweezer-top', 'Tweezer top', 'bear', n - 1, 'Two candles stopped at the same high: buyers could not push through twice.', `A close below ${fmt(Math.min(x.low, p.low))}.`, `A close above ${fmt(Math.max(x.high, p.high))}.`)

  // Piercing line and dark cloud cover: opens beyond the last close, closes past the middle of its body.
  if (down(p) && up(x) && body(p) > a * 0.5 && x.open < p.close && x.close > (p.open + p.close) / 2 && x.close < p.open) add('piercing', 'Piercing line', 'bull', n - 1, 'A green candle that opened below the red one and closed past its middle.', `A close above ${fmt(p.open)}.`, `A close below ${fmt(x.low)}.`)
  if (up(p) && down(x) && body(p) > a * 0.5 && x.open > p.close && x.close < (p.open + p.close) / 2 && x.close > p.open) add('dark-cloud', 'Dark cloud cover', 'bear', n - 1, 'A red candle that opened above the green one and closed past its middle.', `A close below ${fmt(p.open)}.`, `A close above ${fmt(x.high)}.`)

  // Three white soldiers and three black crows: three solid candles in a row, each closing further.
  const solid = (k: Candle) => range(k) > 0 && body(k) >= range(k) * 0.6 && body(k) >= a * 0.4
  if ([q, p, x].every((k) => up(k) && solid(k)) && p.close > q.close && x.close > p.close) add('three-soldiers', 'Three white soldiers', 'bull', n - 2, 'Three solid green candles, each closing higher: steady buying.', `Holding above ${fmt(q.low)}.`, `A close below ${fmt(p.low)}.`)
  if ([q, p, x].every((k) => down(k) && solid(k)) && p.close < q.close && x.close < p.close) add('three-crows', 'Three black crows', 'bear', n - 2, 'Three solid red candles, each closing lower: steady selling.', `Staying below ${fmt(q.high)}.`, `A close above ${fmt(p.high)}.`)

  // Inside bar: a pause inside the previous candle (no direction on its own).
  if (x.high < p.high && x.low > p.low) add('inside-bar', 'Inside bar', 'neutral', n - 1, 'This candle sits entirely inside the previous one: the market paused.', `A break above ${fmt(p.high)} or below ${fmt(p.low)}.`, 'The break that fails and closes back inside (a fakey).')

  // Doji only when nothing else fired: open and close almost equal.
  if (range(x) > 0 && body(x) <= range(x) * 0.1 && out.length === 0) add('doji', 'Doji', 'neutral', n, 'Open and close almost equal: neither side won the candle.', 'The next candle choosing a direction.', 'Not applicable: a doji only marks indecision.')
  return out
}

// ------------------------------------------------------------------ context

export type Trend = 'uptrend' | 'downtrend' | 'range' | 'unclear'

type Context = { e20: number[]; e50: number[]; atrAt: (n: number) => number | null }

function contextFor(c: Candle[]): Context {
  const closes = c.map((k) => k.close)
  const e20 = ema(closes, 20), e50 = ema(closes, 50)
  // True range, Wilder-smoothed, so the ATR at n only uses candles up to n.
  const tr = c.map((k, i) => (i === 0 ? k.high - k.low : Math.max(k.high - k.low, Math.abs(k.high - c[i - 1].close), Math.abs(k.low - c[i - 1].close))))
  const atrs: Array<number | null> = []
  let prev = 0
  for (let i = 0; i < c.length; i++) {
    if (i < 14) { atrs.push(null); if (i === 13) { prev = tr.slice(0, 14).reduce((s, v) => s + v, 0) / 14; atrs[13] = prev } continue }
    prev = (prev * 13 + tr[i]) / 14
    atrs.push(prev)
  }
  return { e20, e50, atrAt: (n) => atrs[n] ?? null }
}

/** Trend at candle n from swing points confirmed by n (k candles after each) and the 20/50 EMAs. */
function trendAt(c: Candle[], n: number, piv: Pivot[], ctx: Context): Trend {
  if (n < 50) return 'unclear'
  const seen = piv.filter((p) => p.i + 3 <= n)
  const hs = seen.filter((p) => p.kind === 'H').slice(-2), ls = seen.filter((p) => p.kind === 'L').slice(-2)
  const hh = hs.length === 2 && hs[1].p > hs[0].p, hl = ls.length === 2 && ls[1].p > ls[0].p
  const lh = hs.length === 2 && hs[1].p < hs[0].p, ll = ls.length === 2 && ls[1].p < ls[0].p
  const close = c[n].close
  if (ctx.e20[n] > ctx.e50[n] && close > ctx.e50[n] && (hh || hl)) return 'uptrend'
  if (ctx.e20[n] < ctx.e50[n] && close < ctx.e50[n] && (lh || ll)) return 'downtrend'
  return 'range'
}

type Level = { lo: number; hi: number; touches: number }

/** Support and resistance at candle n: clusters of confirmed swing points within half an ATR, from the last 150 candles. */
function levelsAt(n: number, piv: Pivot[], a: number): Level[] {
  const recent = piv.filter((p) => p.i + 3 <= n && n - p.i <= 150).sort((x, y) => x.p - y.p)
  const out: Level[] = []
  let g: Pivot[] = []
  const flush = () => { if (g.length >= 2) out.push({ lo: Math.min(...g.map((p) => p.p)), hi: Math.max(...g.map((p) => p.p)), touches: g.length }); g = [] }
  for (const p of recent) { if (g.length && p.p - g[0].p > a * 0.5) flush(); g.push(p) }
  flush()
  return out
}

export type Check = { ok: boolean; label: string; detail: string }
export type Confluence = {
  grade: 'A' | 'B' | 'C' | '—'
  signal: CandleSignal | null
  trend: Trend
  checks: { trend: Check; level: Check; signal: Check }
  text: string
}

function gradeAt(c: Candle[], n: number, piv: Pivot[], ctx: Context): Confluence {
  const a = ctx.atrAt(n)
  const trend = trendAt(c, n, piv, ctx)
  const empty = (why: string): Confluence => ({ grade: '—', signal: null, trend, checks: { trend: { ok: false, label: 'Trend', detail: trend }, level: { ok: false, label: 'Level', detail: '—' }, signal: { ok: false, label: 'Signal', detail: why } }, text: why })
  if (!a) return empty('NOT ENOUGH DATA to measure the candle range yet.')
  const sigs = candleSignalsAt(c, n, a).filter((s) => s.bias !== 'neutral')
  if (!sigs.length) return empty('No directional candle signal on the last candle.')
  const levels = levelsAt(n, piv, a)
  // Prefer the signal that agrees with the trend; otherwise the first found.
  const withTrend = (s: CandleSignal) => (trend === 'uptrend' && s.bias === 'bull') || (trend === 'downtrend' && s.bias === 'bear')
  const sig = sigs.find(withTrend) ?? sigs[0]
  const near = levels.find((l) => sig.anchor >= l.lo - a * 0.5 && sig.anchor <= l.hi + a * 0.5)
  const trendOk = withTrend(sig) || (trend === 'range' && !!near)
  const trendDetail = trend === 'range' ? (near ? 'A range, and the signal is at its edge: the method allows that.' : 'A range, and the signal is not at an edge.') : withTrend(sig) ? `An ${trend === 'uptrend' ? 'uptrend' : 'downtrend'}, and the signal points the same way.` : trend === 'unclear' ? 'Trend unclear: not enough candles.' : `A ${trend}, but the signal points against it.`
  const levelOk = !!near
  const levelDetail = near ? `At a level price has turned at ${near.touches} times (${fmt(near.lo)}–${fmt(near.hi)}).` : 'Not at a level price has turned at before.'
  const score = (trendOk ? 1 : 0) + (levelOk ? 1 : 0)
  const grade = score === 2 ? 'A' : score === 1 ? 'B' : 'C'
  const text = grade === 'A' ? `${sig.name} with the trend at a known level: all three of the method's questions answer yes.` : grade === 'B' ? `${sig.name}: two of the three questions answer yes.` : `${sig.name} on its own, without trend or level behind it: the method says wait.`
  return { grade, signal: sig, trend, checks: { trend: { ok: trendOk, label: 'Trend', detail: trendDetail }, level: { ok: levelOk, label: 'Level', detail: levelDetail }, signal: { ok: true, label: 'Signal', detail: `${sig.name}. ${sig.meaning}` } }, text }
}

/** Trend, level and signal on the last closed candle. */
export function confluence(c: Candle[]): Confluence {
  if (c.length < 30) return { grade: '—', signal: null, trend: 'unclear', checks: { trend: { ok: false, label: 'Trend', detail: 'unclear' }, level: { ok: false, label: 'Level', detail: '—' }, signal: { ok: false, label: 'Signal', detail: '—' } }, text: `NOT ENOUGH DATA: ${c.length} candles; needs at least 30.` }
  return gradeAt(c, c.length - 1, pivots(c), contextFor(c))
}

// ------------------------------------------------------------------ bias score

export type BiasPart = { key: string; label: string; value: -1 | 0 | 1; detail: string }
export type BiasScore = { score: number; lean: 'long' | 'short' | 'sit out'; parts: BiasPart[]; text: string; note: string }

export const BIAS_NOTE = 'Six different readings added up: structure, averages, momentum, MACD, the last candle and volume. A summary of the chart, not a signal; Mr. Cash has not tested it as a trading rule.'

/**
 * One number from −6 to +6. The inputs are deliberately different kinds of
 * reading, so the score is not four moving averages counted four times.
 */
export function biasScore(c: Candle[]): BiasScore {
  if (c.length < 60) return { score: 0, lean: 'sit out', parts: [], text: `NOT ENOUGH DATA: ${c.length} candles; the score needs 60.`, note: BIAS_NOTE }
  const n = c.length - 1
  const ctx = contextFor(c), piv = pivots(c), close = c[n].close
  const parts: BiasPart[] = []
  const put = (key: string, label: string, value: -1 | 0 | 1, detail: string) => parts.push({ key, label, value, detail })

  const hs = piv.filter((p) => p.kind === 'H').slice(-2), ls = piv.filter((p) => p.kind === 'L').slice(-2)
  const hh = hs.length === 2 && hs[1].p > hs[0].p, hl = ls.length === 2 && ls[1].p > ls[0].p
  const lh = hs.length === 2 && hs[1].p < hs[0].p, ll = ls.length === 2 && ls[1].p < ls[0].p
  put('structure', 'Structure', hh && hl ? 1 : lh && ll ? -1 : 0, hh && hl ? 'Higher highs and higher lows.' : lh && ll ? 'Lower highs and lower lows.' : 'Mixed swings: no clean staircase.')

  const e20 = ctx.e20[n], e50 = ctx.e50[n]
  put('averages', 'Averages', close > e20 && e20 > e50 ? 1 : close < e20 && e20 < e50 ? -1 : 0, close > e20 && e20 > e50 ? 'Price above the 20 EMA, above the 50 EMA.' : close < e20 && e20 < e50 ? 'Price below the 20 EMA, below the 50 EMA.' : 'Price and the averages are tangled.')

  const rsi = rsiSeries(c)[n]
  put('momentum', 'RSI', !Number.isFinite(rsi) ? 0 : rsi > 55 ? 1 : rsi < 45 ? -1 : 0, Number.isFinite(rsi) ? `RSI ${rsi.toFixed(0)} (above 55 leans up, below 45 leans down).` : 'RSI not available.')

  const closes = c.map((k) => k.close)
  const e12 = ema(closes, 12), e26 = ema(closes, 26)
  const macd = closes.map((_, i) => e12[i] - e26[i])
  const signal = ema(macd, 9)
  const hist = macd[n] - signal[n], histPrev = macd[n - 1] - signal[n - 1]
  put('macd', 'MACD', hist > 0 && hist >= histPrev ? 1 : hist < 0 && hist <= histPrev ? -1 : 0, hist > 0 ? (hist >= histPrev ? 'MACD above its signal line and widening.' : 'MACD above its signal line but narrowing.') : hist < 0 ? (hist <= histPrev ? 'MACD below its signal line and widening.' : 'MACD below its signal line but narrowing.') : 'MACD on its signal line.')

  const a = ctx.atrAt(n) ?? atr(c) ?? 0
  const sigs = candleSignalsAt(c, n, a).filter((s) => s.bias !== 'neutral')
  const bulls = sigs.filter((s) => s.bias === 'bull').length, bears = sigs.filter((s) => s.bias === 'bear').length
  put('candle', 'Last candle', bulls > bears ? 1 : bears > bulls ? -1 : 0, sigs.length ? sigs.map((s) => s.name).join(', ') + '.' : 'No directional candle pattern.')

  const vols = c.slice(n - 20, n).map((k) => k.volume)
  const avg = vols.reduce((s, v) => s + v, 0) / 20
  const hasVol = avg > 0 && c[n].volume > 0
  const heavy = hasVol && c[n].volume >= avg * 1.2
  put('volume', 'Volume', !heavy ? 0 : up(c[n]) ? 1 : down(c[n]) ? -1 : 0, !hasVol ? 'No volume from this feed.' : heavy ? `${(c[n].volume / avg).toFixed(1)}× average volume on a ${up(c[n]) ? 'green' : 'red'} candle.` : 'Ordinary volume: nothing confirmed.')

  const score = parts.reduce((s, p) => s + p.value, 0)
  const lean = score >= 3 ? 'long' : score <= -3 ? 'short' : 'sit out'
  const text = lean === 'sit out' ? `Score ${score > 0 ? '+' : ''}${score} of ±6: the readings disagree, so the plain reading is to sit out.` : `Score ${score > 0 ? '+' : ''}${score} of ±6: most readings lean ${lean === 'long' ? 'up' : 'down'}.`
  return { score, lean, parts, text, note: BIAS_NOTE }
}

// ------------------------------------------------------------------ evidence

export type EvidenceRow = {
  id: string
  name: string
  bias: Lean
  count: number
  /** Share of cases where price moved the way the pattern leans over the horizon. */
  hitRate: number | null
  /** Average move in the pattern's direction, in ATRs at the signal. */
  avgMoveAtr: number | null
  /** The same numbers for the A and B grades only (trend and/or level behind it). */
  inContext: { count: number; hitRate: number | null; avgMoveAtr: number | null }
  status: 'OK' | 'INSUFFICIENT SAMPLE'
}

export type Evidence = {
  label: 'BACKTEST'
  bars: number
  horizon: number
  /** Every candle's move over the same horizon, for comparison: the drift a pattern has to beat. */
  baseline: { count: number; upRate: number | null; avgMoveAtr: number | null }
  rows: EvidenceRow[]
  note: string
}

export const MIN_SAMPLE = 30

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null)
const round = (v: number | null, d = 3) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d)

export type HistoryStep = { n: number; atr: number; signals: CandleSignal[]; grade: Confluence['grade']; gradedId: string | null }

/**
 * Every candle from index 60 on, read as it would have been at the time: the
 * signals on candle n and the trend-level-signal grade, from candles 0..n and
 * swing points already confirmed by n. Exported so the no-look-ahead property
 * can be tested: a prefix of the candles gives the same steps.
 */
export function scanHistory(c: Candle[]): HistoryStep[] {
  const ctx = contextFor(c)
  const piv = pivots(c) // a swing point at i is used only once i + 3 <= n, when it was confirmed
  const out: HistoryStep[] = []
  for (let n = 60; n < c.length; n++) {
    const a = ctx.atrAt(n)
    if (!a) continue
    const signals = candleSignalsAt(c, n, a)
    const g = signals.some((s) => s.bias !== 'neutral') ? gradeAt(c, n, piv, ctx) : null
    out.push({ n, atr: a, signals, grade: g ? g.grade : '—', gradedId: g?.signal?.id ?? null })
  }
  return out
}

/**
 * Walk the history and measure what followed each candle signal. For each
 * candle n (from 60 to the last with a full horizon after it) the signal is
 * found from candles 0..n and swing points confirmed by n; the outcome is the
 * close `horizon` candles later. Nothing after n is used to find the signal.
 */
export function patternEvidence(c: Candle[], horizon = 10): Evidence {
  const note = 'BACKTEST on this market\'s own stored candles. Each signal was found as it would have looked at the time; the move is measured from its close to the close ' + horizon + ' candles later, in average true ranges. No fees, no stops, no targets: a measurement of the shape, not a strategy. Past candles, not a forecast.'
  const empty: Evidence = { label: 'BACKTEST', bars: c.length, horizon, baseline: { count: 0, upRate: null, avgMoveAtr: null }, rows: [], note }
  if (c.length < 60 + horizon + 1) return { ...empty, note: `NOT ENOUGH DATA: ${c.length} candles; the measurement needs at least ${60 + horizon + 1}. ` + note }
  const acc = new Map<string, { name: string; bias: Lean; moves: number[]; ctxMoves: number[] }>()
  const base: number[] = []
  let ups = 0
  for (const h of scanHistory(c)) {
    const n = h.n
    if (n + horizon >= c.length) break
    const move = (c[n + horizon].close - c[n].close) / h.atr
    base.push(move)
    if (move > 0) ups++
    for (const s of h.signals) {
      if (s.bias === 'neutral') continue
      const signed = s.bias === 'bull' ? move : -move
      const e = acc.get(s.id) ?? { name: s.name, bias: s.bias, moves: [], ctxMoves: [] }
      e.moves.push(signed)
      if (h.gradedId === s.id && (h.grade === 'A' || h.grade === 'B')) e.ctxMoves.push(signed)
      acc.set(s.id, e)
    }
  }
  const rows: EvidenceRow[] = [...acc.entries()].map(([id, e]) => ({
    id, name: e.name, bias: e.bias, count: e.moves.length,
    hitRate: round(e.moves.length ? e.moves.filter((m) => m > 0).length / e.moves.length : null),
    avgMoveAtr: round(mean(e.moves)),
    inContext: { count: e.ctxMoves.length, hitRate: round(e.ctxMoves.length ? e.ctxMoves.filter((m) => m > 0).length / e.ctxMoves.length : null), avgMoveAtr: round(mean(e.ctxMoves)) },
    status: e.moves.length >= MIN_SAMPLE ? 'OK' as const : 'INSUFFICIENT SAMPLE' as const,
  })).sort((x, y) => y.count - x.count)
  return { label: 'BACKTEST', bars: c.length, horizon, baseline: { count: base.length, upRate: round(base.length ? ups / base.length : null), avgMoveAtr: round(mean(base)) }, rows, note }
}
