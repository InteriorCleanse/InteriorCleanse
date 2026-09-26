/**
 * THE CALL — "up or down over the next window", the kind of question the
 * short Bitcoin markets on Polymarket ask, answered on paper with the working
 * shown.
 *
 * For a window starting at `t`, the model reads only candles that closed by
 * `t` and returns a probability that the price at the end of the window is
 * above the price at its start, with the readings behind it. Below the
 * confidence line it says "flat" (no call). Pure: no network, no clock.
 *
 * The weights are set by hand, openly, and have not been tested as a trading
 * rule. The point of the desk is to keep score honestly: every forecast is
 * settled against the real close and scored with the Brier score against a
 * coin flip. Nothing here places an order or reaches the engine.
 */
import type { Candle } from '../types.ts'
import { ema, rsiSeries } from '../scanner/patterns.ts'
import { biasScore } from '../scanner/priceAction.ts'

export type Call = 'up' | 'down' | 'flat'

export type Reading = { key: string; label: string; value: number; push: number; text: string }

export type Forecast = {
  /** Window start (ms). The forecast uses only candles closed by this time. */
  windowStart: number
  windowEnd: number
  /** Price at the window start: the close of the last candle before it. */
  open: number
  pUp: number
  call: Call
  confidence: number
  /** 0 (easy tape) to 4 (hard: choppy and volatile). */
  difficulty: number
  tags: string[]
  readings: Reading[]
  line: number
}

export const MODEL_NOTE = 'Hand-set weights on six readings of the last closed candles. Not tested as a trading rule; the desk keeps score so you can see whether it knows anything.'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d

function atrOf(c: Candle[], period = 14): number | null {
  if (c.length < period + 1) return null
  let sum = 0
  for (let i = c.length - period; i < c.length; i++) sum += Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close))
  return sum / period
}

/**
 * The forecast for the window [windowStart, windowStart + windowMs), from the
 * candles that closed by windowStart. Returns null with too little history.
 */
export function forecastWindow(all: Candle[], windowStart: number, windowMs: number, line = 0.58): Forecast | null {
  const c = all.filter((k) => k.closeTime < windowStart).slice(-200)
  if (c.length < 60) return null
  const n = c.length - 1
  const a = atrOf(c)
  if (!a || a <= 0) return null
  const closes = c.map((k) => k.close)
  const close = closes[n]
  const e20 = ema(closes, 20)[n]
  const rsi = rsiSeries(c)[n]
  const m3 = (close - closes[n - 3]) / a
  const m12 = (close - closes[n - 12]) / a
  let path = 0
  for (let i = n - 11; i <= n; i++) path += Math.abs(closes[i] - closes[i - 1])
  const er = path > 0 ? Math.abs(close - closes[n - 12]) / path : 0 // efficiency: 1 = straight line, 0 = pure chop
  const stretch = (close - e20) / a
  const bias = biasScore(c).score
  const atrs: number[] = []
  for (let i = Math.max(15, c.length - 100); i <= n; i++) { const v = atrOf(c.slice(0, i + 1)); if (v) atrs.push(v) }
  const sorted = [...atrs].sort((x, y) => x - y)
  const volRank = sorted.length ? sorted.filter((v) => v <= a).length / sorted.length : 0.5

  const readings: Reading[] = []
  const add = (key: string, label: string, value: number, push: number, text: string) => readings.push({ key, label, value: round(value), push: round(push), text })
  add('trend', 'Hour trend', m12, 0.30 * Math.tanh(m12 / 3) * er, `${m12 >= 0 ? 'Up' : 'Down'} ${Math.abs(m12).toFixed(1)} ATR over 12 candles, ${Math.round(er * 100)}% of it in a straight line.`)
  add('push', 'Last 15 min', m3, 0.20 * Math.tanh(m3 / 2), `${m3 >= 0 ? 'Up' : 'Down'} ${Math.abs(m3).toFixed(1)} ATR over the last 3 candles.`)
  add('stretch', 'Stretch', stretch, -0.25 * Math.sign(stretch) * Math.max(0, Math.abs(stretch) - 2) / 2, Math.abs(stretch) > 2 ? `${Math.abs(stretch).toFixed(1)} ATR ${stretch > 0 ? 'above' : 'below'} the 20 EMA: stretched, leaning back.` : `${Math.abs(stretch).toFixed(1)} ATR from the 20 EMA: not stretched.`)
  add('rsi', 'RSI', rsi, Number.isFinite(rsi) ? 0.004 * clamp(rsi - 50, -20, 20) : 0, Number.isFinite(rsi) ? `RSI ${rsi.toFixed(0)}.` : 'RSI not available.')
  add('bias', 'Bias score', bias, 0.05 * bias, `Scanner bias ${bias > 0 ? '+' : ''}${bias} of ±6.`)
  add('chop', 'Tape', er, 0, er < 0.25 ? 'Chopping: price is going nowhere in a hurry.' : er > 0.5 ? 'Clean: moves are carrying through.' : 'Mixed tape.')

  const z = readings.reduce((s, r) => s + r.push, 0)
  const pUp = round(clamp(1 / (1 + Math.exp(-z * 2.2)), 0.2, 0.8))
  const call: Call = pUp >= line ? 'up' : pUp <= 1 - line ? 'down' : 'flat'
  const difficulty = Math.round(clamp((1 - er) * 2 + volRank * 2, 0, 4) * 10) / 10
  const tags: string[] = []
  if (er < 0.25) tags.push('chopping tape')
  else if (m12 > 1 && er > 0.4) tags.push('trending up')
  else if (m12 < -1 && er > 0.4) tags.push('trending down')
  if (Math.abs(stretch) > 2) tags.push(stretch > 0 ? 'stretched up' : 'stretched down')
  if (Math.sign(m3) !== Math.sign(m12) && Math.abs(m3) > 0.5) tags.push('momentum turning')
  if (volRank > 0.8) tags.push('volatile')
  return { windowStart, windowEnd: windowStart + windowMs, open: close, pUp, call, confidence: round(Math.abs(pUp - 0.5) * 2), difficulty, tags, readings, line }
}

export type Settled = Forecast & { close: number; outcome: 'up' | 'down' | 'unchanged'; result: 'right' | 'wrong' | 'passed' | 'void'; brier: number }

/** Score a forecast against the close at the window's end. */
export function settle(f: Forecast, close: number): Settled {
  const outcome = close > f.open ? 'up' : close < f.open ? 'down' : 'unchanged'
  const result = outcome === 'unchanged' ? 'void' : f.call === 'flat' ? 'passed' : f.call === outcome ? 'right' : 'wrong'
  const y = outcome === 'up' ? 1 : 0
  return { ...f, close, outcome, result, brier: outcome === 'unchanged' ? 0.25 : round((f.pUp - y) ** 2, 4) }
}

export type Tally = {
  forecasts: number
  calls: number
  right: number
  wrong: number
  passed: number
  hitRate: number | null
  /** How often the price went up across every settled window: the rate a call has to beat. */
  upRate: number | null
  brier: number | null
  /** 1 − Brier / 0.25: above 0 beats a coin flip, below 0 is worse than one. */
  skill: number | null
  calibration: Array<{ from: number; to: number; count: number; saidUp: number | null; wentUp: number | null }>
  status: 'OK' | 'NOT ENOUGH DATA'
}

export const MIN_CALLS = 30

export function tally(rows: Settled[]): Tally {
  const scored = rows.filter((r) => r.result !== 'void')
  const calls = scored.filter((r) => r.result === 'right' || r.result === 'wrong')
  const right = calls.filter((r) => r.result === 'right').length
  const brier = scored.length ? scored.reduce((s, r) => s + r.brier, 0) / scored.length : null
  const buckets = [[0.2, 0.35], [0.35, 0.45], [0.45, 0.55], [0.55, 0.65], [0.65, 0.81]]
  const calibration = buckets.map(([from, to]) => {
    const inB = scored.filter((r) => r.pUp >= from && r.pUp < to)
    return { from, to: Math.min(to, 0.8), count: inB.length, saidUp: inB.length ? round(inB.reduce((s, r) => s + r.pUp, 0) / inB.length) : null, wentUp: inB.length ? round(inB.filter((r) => r.outcome === 'up').length / inB.length) : null }
  })
  return {
    forecasts: scored.length, calls: calls.length, right, wrong: calls.length - right, passed: scored.filter((r) => r.result === 'passed').length,
    hitRate: calls.length ? round(right / calls.length) : null,
    upRate: scored.length ? round(scored.filter((r) => r.outcome === 'up').length / scored.length) : null,
    brier: brier === null ? null : round(brier, 4), skill: brier === null ? null : round(1 - brier / 0.25),
    calibration, status: calls.length >= MIN_CALLS ? 'OK' : 'NOT ENOUGH DATA',
  }
}

/**
 * BACKTEST: the same model walked over past windows, each forecast made from
 * candles closed by its start and settled at its end. Separate from the live
 * record and labelled as such.
 */
export function backtestWindows(c: Candle[], windowMs: number, line = 0.58): Settled[] {
  if (!c.length) return []
  const out: Settled[] = []
  const endOf = new Map(c.map((k) => [k.closeTime + 1, k.close]))
  const first = Math.ceil((c[0].openTime + 60 * (c[1] ? c[1].openTime - c[0].openTime : 300_000)) / windowMs) * windowMs
  for (let t = first; t + windowMs <= c[c.length - 1].closeTime + 1; t += windowMs) {
    const close = endOf.get(t + windowMs)
    if (close === undefined || !endOf.has(t)) continue
    const f = forecastWindow(c, t, windowMs, line)
    if (f) out.push(settle(f, close))
  }
  return out
}
