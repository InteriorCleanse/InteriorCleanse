/**
 * Market state: are we trending, which way, how convincingly, is it
 * likely to keep going — and what could spoil it.
 *
 * This is a vote. Several independent readings each get a say —
 * swing structure, the hourly averages, recent momentum, today's
 * liquidity sweeps, and the tape — and the state is whatever most of
 * them agree on. Every vote is written down so you can see who
 * disagreed. None of it is a prediction; it is a description of now,
 * plus a list of the things most likely to change it.
 */

import { config } from '../config.ts'
import { SwingTracker, atrAt } from './structure.ts'
import { upcomingEvents } from './news.ts'
import { isHighLevel } from './liquidity.ts'
import type { Candle, FlowReport, IctAnalysis, MarketState, NewsReport } from './types.ts'

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  for (let i = 0; i < values.length; i++) out.push(i === 0 ? values[0] : values[i] * k + out[i - 1] * (1 - k))
  return out
}

/** Last close of every `perBar` candles, aligned to the most recent candle. */
function resampleCloses(candles: Candle[], perBar: number): number[] {
  const out: number[] = []
  for (let end = candles.length - 1; end >= perBar - 1; end -= perBar) out.unshift(candles[end].close)
  return out
}

const usd = (n: number) => '$' + (Math.abs(n) >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : (n / 1000).toFixed(0) + 'k')

export function assessMarket(candles: Candle[], analysis: IctAnalysis | null, flow: FlowReport | null, news: NewsReport | null, now = Date.now()): MarketState {
  const n = candles.length
  const i = n - 1
  const c = candles[i]
  const atr = atrAt(candles, i)
  const evidence: string[] = []
  const watchOuts: string[] = []
  const reasons: string[] = []
  let up = 0
  let down = 0
  let structureDir: 'up' | 'down' | null = null
  let averagesDir: 'up' | 'down' | null = null
  let extension = 0

  // 1. Swing structure over the last ~400 candles
  const start = Math.max(0, n - 400)
  const sub = candles.slice(start)
  const st = new SwingTracker()
  for (let j = 0; j < sub.length; j++) st.add(sub, j)
  const highs = st.swings.filter((s) => s.kind === 'high').slice(-3)
  const lows = st.swings.filter((s) => s.kind === 'low').slice(-3)
  if (highs.length >= 2 && lows.length >= 2) {
    const hh = highs[highs.length - 1].price > highs[highs.length - 2].price
    const hl = lows[lows.length - 1].price > lows[lows.length - 2].price
    const lh = highs[highs.length - 1].price < highs[highs.length - 2].price
    const ll = lows[lows.length - 1].price < lows[lows.length - 2].price
    if (hh && hl) { up += 2; structureDir = 'up'; evidence.push('Structure: higher highs and higher lows — the textbook shape of an uptrend.') }
    else if (lh && ll) { down += 2; structureDir = 'down'; evidence.push('Structure: lower highs and lower lows — the textbook shape of a downtrend.') }
    else evidence.push('Structure: mixed — no clean run of higher or lower swings. That is what a range looks like.')
  }

  // 2. Hourly averages, built from the small candles
  const stepMs = n > 1 ? candles[1].openTime - candles[0].openTime : 300_000
  const perBar = Math.max(1, Math.round(3_600_000 / stepMs))
  const hourly = resampleCloses(candles, perBar)
  if (hourly.length >= 60) {
    const e20 = ema(hourly, 20)
    const e50 = ema(hourly, 50)
    const last20 = e20[e20.length - 1]
    const prev20 = e20[Math.max(0, e20.length - 7)]
    const last50 = e50[e50.length - 1]
    const rising = last20 > prev20
    if (c.close > last20 && c.close > last50 && rising && last20 > last50) { up += 2; averagesDir = 'up'; evidence.push('Hourly averages: price is above the 20- and 50-hour averages and the 20 is rising.') }
    else if (c.close < last20 && c.close < last50 && !rising && last20 < last50) { down += 2; averagesDir = 'down'; evidence.push('Hourly averages: price is below the 20- and 50-hour averages and the 20 is falling.') }
    else evidence.push('Hourly averages: tangled — price is criss-crossing them, which is chop, not trend.')
    extension = (c.close - last20) / atr
    if (Math.abs(extension) > 2.5) watchOuts.push(`Price is ${Math.abs(extension).toFixed(1)} ATR ${extension > 0 ? 'above' : 'below'} its 20-hour average — stretched. Stretched markets usually snap back before they continue.`)
  } else {
    evidence.push('Hourly averages: not enough history loaded to judge (need about 60 hours).')
  }

  // 3. Momentum over the last three hours
  const back = candles[Math.max(0, i - Math.round(3 * perBar))]
  const move = (c.close - back.close) / atr
  if (move > 1.5) { up += 1; evidence.push(`Momentum: up ${move.toFixed(1)} ATR in the last three hours.`) }
  else if (move < -1.5) { down += 1; evidence.push(`Momentum: down ${Math.abs(move).toFixed(1)} ATR in the last three hours.`) }
  else evidence.push('Momentum: flat over the last three hours.')

  // 4. Today's liquidity story
  if (analysis?.bias.direction === 'bullish') { up += 1; evidence.push('Liquidity: sell-side stops were taken today, which usually precedes a move up.') }
  else if (analysis?.bias.direction === 'bearish') { down += 1; evidence.push('Liquidity: buy-side stops were taken today, which usually precedes a move down.') }

  // 5. The tape and the book
  let flowDir: 'up' | 'down' | null = null
  if (flow?.tape) {
    const t = flow.tape
    if (t.buyShare > 0.55 && t.deltaUsd > 0) { up += 1; flowDir = 'up'; evidence.push(`Tape: ${Math.round(t.buyShare * 100)}% of recent trades were buyer-initiated, net ${usd(t.deltaUsd)} of buying.`) }
    else if (t.buyShare < 0.45 && t.deltaUsd < 0) { down += 1; flowDir = 'down'; evidence.push(`Tape: ${Math.round((1 - t.buyShare) * 100)}% of recent trades were seller-initiated, net ${usd(-t.deltaUsd)} of selling.`) }
    else evidence.push('Tape: buyers and sellers roughly matched in the last stretch of trades.')
  }
  if (flow?.book) {
    const b = flow.book
    if (b.imbalance > 0.6) evidence.push('Book: bids are deeper than asks near price — there is support under it, for now.')
    else if (b.imbalance < 0.4) evidence.push('Book: asks are deeper than bids near price — there is supply above it, for now.')
    for (const w of b.walls.slice(0, 3)) {
      if (Math.abs(w.distancePct) <= 1.5) watchOuts.push(`A ${usd(w.usd)} ${w.side} wall sits ${Math.abs(w.distancePct).toFixed(2)}% ${w.distancePct < 0 ? 'below' : 'above'} at $${w.price.toFixed(0)} — price may stall there. Walls also get pulled, so watch it, don't trust it.`)
    }
  }

  // The verdict
  const total = up + down
  const trend: MarketState['trend'] = total === 0 ? 'range' : up >= 3 && up >= down * 2 ? 'uptrend' : down >= 3 && down >= up * 2 ? 'downtrend' : 'range'
  const strength = Math.min(100, Math.round((Math.abs(up - down) / 7) * 100))

  // Volatility: this candle's ATR against the last day's typical ATR
  const samples: number[] = []
  for (let j = Math.max(14, n - 288); j <= i; j += 12) samples.push(atrAt(candles, j))
  samples.sort((x, y) => x - y)
  const typical = samples[Math.floor(samples.length / 2)] || atr
  const ratio = atr / typical
  const volatility: MarketState['volatility'] = ratio < 0.7 ? 'quiet' : ratio > 1.5 ? 'wild' : 'normal'
  if (volatility === 'wild') watchOuts.push('Volatility is running hot — stops get hunted further than usual. Size down, widen nothing.')
  if (volatility === 'quiet') watchOuts.push('Quiet tape — moves are small and false starts are common. A quiet market often precedes a violent one, usually around news or a session open.')

  // Continuation: start neutral and let the evidence push it around
  let score = 50
  if (trend !== 'range') {
    score += Math.round(strength * 0.3)
    reasons.push(`${strength}/100 of the readings agree on the direction.`)
    if (structureDir && averagesDir && structureDir === averagesDir) { score += 10; reasons.push('Structure and the hourly averages agree — the strongest combination.') }
    if (flowDir && ((trend === 'uptrend' && flowDir === 'up') || (trend === 'downtrend' && flowDir === 'down'))) { score += 10; reasons.push('The tape is pushing the same way.') }
    if (Math.abs(extension) > 2.5) { score -= 20; reasons.push('But price is stretched from its average — expect a pullback first.') }
    // The next pool of orders in the trend's direction
    if (analysis) {
      const ahead = analysis.levels
        .filter((l) => l.sweptAt === undefined && l.brokenAt === undefined)
        .filter((l) => (trend === 'uptrend' ? isHighLevel(l) && l.price > c.close : !isHighLevel(l) && l.price < c.close))
        .map((l) => ({ l, dist: Math.abs(l.price - c.close) / atr }))
        .sort((a, b) => a.dist - b.dist)[0]
      if (ahead && ahead.dist < 1.5) {
        score -= 15
        watchOuts.push(`The ${ahead.l.label} ($${ahead.l.price.toFixed(0)}) is only ${ahead.dist.toFixed(1)} ATR ahead — a pool of orders where the move may pause, sweep, or reverse.`)
        reasons.push(`Liquidity is close ahead (${ahead.l.label}).`)
      }
    }
  } else {
    reasons.push('No trend to continue. Ranges resolve when one side of them gets swept — that is the setup to wait for.')
  }
  if (news) {
    const soon = upcomingEvents(news, now, 2).filter((e) => e.impact === 'High' && e.time > now)
    if (soon.length) {
      score -= 15
      const e = soon[0]
      const mins = Math.round((e.time - now) / 60_000)
      watchOuts.push(`${e.country} ${e.title} in ${mins} minutes — high impact. Trends get reset by these; stand aside around it.`)
      reasons.push('High-impact news is close.')
    }
  }
  if (analysis && !analysis.inKillzone && !analysis.session) { score -= 5; reasons.push('Between sessions — moves started here have less money behind them.') }
  const day = new Date(now).toLocaleString('en-US', { timeZone: config.ict.timezone, weekday: 'short' })
  if (day === 'Sat' || day === 'Sun') { score -= 15; watchOuts.push('Weekend — thin liquidity. Weekend trends are often undone at the Monday open.') }
  score = Math.max(0, Math.min(100, score))
  const label = trend === 'range' ? 'no trend to continue — wait for a sweep' : score >= 65 ? 'likely to continue' : score >= 40 ? 'unclear — could go either way' : 'weakening'

  const summary =
    trend === 'range'
      ? `Range. ${evidence[0] ?? ''}`
      : `${trend === 'uptrend' ? 'Uptrend' : 'Downtrend'}, ${strength}/100 strength, ${label}. Volatility ${volatility}.`

  return { trend, strength, continuation: { score, label, reasons }, volatility, watchOuts, evidence, summary }
}
