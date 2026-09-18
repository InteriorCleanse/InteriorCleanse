/**
 * THE MARKET DEBATE — the engine's own reasons, laid out as a bull case, a
 * bear case and a neutral case, with the engine as the judge.
 *
 * Nothing here is a new opinion. Every point is a strategy vote's evidence
 * step, a fusion confirm/invalidate, or a structural or regime fact the
 * engine already computed, attributed to its source. The judge's verdict IS
 * the fused decision — restated, never re-decided. The value of the debate is
 * that the reader sees the losing side's points at the same size as the
 * winning side's, which the decision panel does not show.
 *
 * Pure over the engine outputs it is given.
 */

import type { FusedAction, FusedDecision } from '../fusion.ts'
import type { StrategyVote } from '../strategies/types.ts'
import type { IctAnalysis, NewsReport } from '../types.ts'

export type DebatePoint = {
  text: string
  /** Where the point came from: a strategy id, 'fusion', 'structure', 'regime', 'news', 'liquidity'. */
  source: string
  /** The evidence step or field the point restates. */
  basis: string
  /** REAL when read from candles/engine; ESTIMATED for feature-derived labels the engine marks approximate. */
  quality: 'REAL' | 'ESTIMATED'
}

export type DebateSide = { label: 'BULL' | 'BEAR' | 'NEUTRAL'; points: DebatePoint[]; /** Sum of confidences of strategies voting this way, 0–100 scale per vote. */ backing: number }

export type MarketDebate = {
  at: number
  bull: DebateSide
  bear: DebateSide
  neutral: DebateSide
  judge: {
    engineDecision: FusedAction | 'NO ENGINE'
    direction: 'long' | 'short' | null
    score: number | null
    reason: string
    /** What the engine listed as arguing against its own decision — what would flip it. */
    wouldFlip: string[]
    note: string
  }
  unknowns: string[]
  provenance: 'ENGINE'
  note: string
}

const side = (label: DebateSide['label']): DebateSide => ({ label, points: [], backing: 0 })

export function marketDebate(input: { analysis: IctAnalysis | null; votes: StrategyVote[]; decision: FusedDecision | null; news?: NewsReport | null; now?: number }): MarketDebate {
  const at = input.now ?? input.analysis?.time ?? Date.now()
  const bull = side('BULL'), bear = side('BEAR'), neutral = side('NEUTRAL')
  const unknowns: string[] = []
  const a = input.analysis

  if (!a) unknowns.push('No engine analysis for this candle; the debate has no structural points.')
  else {
    if (a.structureTrend === 'bullish') bull.points.push({ text: 'Structure is bullish: the last confirmed break was a higher high.', source: 'structure', basis: 'structureTrend', quality: 'REAL' })
    else if (a.structureTrend === 'bearish') bear.points.push({ text: 'Structure is bearish: the last confirmed break was a lower low.', source: 'structure', basis: 'structureTrend', quality: 'REAL' })
    else neutral.points.push({ text: 'No confirmed structural trend on this timeframe.', source: 'structure', basis: 'structureTrend', quality: 'REAL' })
    const regime = a.features?.regime?.value?.state ?? null
    const approx = a.features?.regime?.approximate === true
    if (regime === 'trending-up') bull.points.push({ text: 'Regime read: trending up.', source: 'regime', basis: 'features.regime', quality: approx ? 'ESTIMATED' : 'REAL' })
    else if (regime === 'trending-down') bear.points.push({ text: 'Regime read: trending down.', source: 'regime', basis: 'features.regime', quality: approx ? 'ESTIMATED' : 'REAL' })
    else if (regime) neutral.points.push({ text: `Regime read: ${regime}. Trend-following votes are weighted down here; mean-reversion votes up.`, source: 'regime', basis: 'features.regime', quality: approx ? 'ESTIMATED' : 'REAL' })
    else unknowns.push('Regime not classified on this candle.')
    for (const s of a.sweepsToday.slice(-3)) {
      const p: DebatePoint = { text: `${s.level.label} was swept from ${s.side === 'above' ? 'above' : 'below'} today (${s.depthAtr.toFixed(2)} ATR deep).`, source: 'liquidity', basis: 'sweepsToday', quality: 'REAL' }
      ;(s.side === 'below' ? bull : bear).points.push(p)
    }
    if (!a.session) neutral.points.push({ text: `Outside every session at ${a.etClock} ET; the session strategies do not vote here.`, source: 'structure', basis: 'session', quality: 'REAL' })
  }

  for (const v of input.votes) {
    const passed = v.evidence.filter((e) => e.passed)
    const failed = v.evidence.filter((e) => !e.passed)
    if (v.action === 'BUY' || v.action === 'SELL') {
      const s = v.action === 'BUY' ? bull : bear
      s.backing += v.confidence
      s.points.push({ text: `${v.id} votes ${v.action} (${v.confidence}/100): ${v.reason}`, source: v.id, basis: 'vote', quality: 'REAL' })
      for (const e of passed.slice(0, 3)) s.points.push({ text: `${e.step}: ${e.detail}`, source: v.id, basis: `evidence:${e.step}`, quality: 'REAL' })
    } else if (passed.length >= 2 && failed.length === 1) {
      neutral.points.push({ text: `${v.id} held back with ${passed.length} of ${v.evidence.length} conditions met; missing "${failed[0].step}" — ${failed[0].detail}`, source: v.id, basis: `evidence:${failed[0].step}`, quality: 'REAL' })
    }
  }

  const d = input.decision
  if (d) {
    const forSide = d.direction === 'long' ? bull : d.direction === 'short' ? bear : neutral
    const against = d.direction === 'long' ? bear : d.direction === 'short' ? bull : neutral
    for (const c of d.confirms) forSide.points.push({ text: c, source: 'fusion', basis: 'confirms', quality: 'REAL' })
    for (const c of d.invalidates) against.points.push({ text: c, source: 'fusion', basis: 'invalidates', quality: 'REAL' })
  }

  const blackouts = input.news?.blackouts ?? []
  const soon = blackouts.find((b) => b.start <= at + 60 * 60_000 && b.end >= at)
  if (soon) neutral.points.push({ text: `A high-impact release blackout (${soon.title}) covers ${new Date(soon.start).toISOString().slice(11, 16)}–${new Date(soon.end).toISOString().slice(11, 16)} UTC.`, source: 'news', basis: 'blackouts', quality: 'REAL' })

  const judge: MarketDebate['judge'] = d
    ? { engineDecision: d.action, direction: d.direction, score: d.score, reason: d.reason, wouldFlip: d.invalidates, note: 'The verdict is the fused decision as the engine made it. The debate does not re-decide; it shows the losing side at full size.' }
    : { engineDecision: 'NO ENGINE', direction: null, score: null, reason: 'No fused decision on this candle.', wouldFlip: [], note: 'Without a decision there is no verdict; the sides are shown for reading only.' }

  return {
    at, bull, bear, neutral, judge, unknowns, provenance: 'ENGINE',
    note: `${bull.points.length} bull point(s), ${bear.points.length} bear, ${neutral.points.length} neutral — all restated from the engine's own outputs at this candle. Nothing here is a forecast.`,
  }
}

/** Plain text for ?format=text and for the AI teacher's context. */
export function renderDebate(m: MarketDebate): string {
  const sideText = (s: DebateSide) => [`${s.label} (backing ${s.backing})`, ...s.points.map((p) => `  · [${p.source}] ${p.text}`)].join('\n')
  return [sideText(m.bull), sideText(m.bear), sideText(m.neutral), `JUDGE: ${m.judge.engineDecision}${m.judge.score !== null ? ` at ${m.judge.score}/100` : ''} — ${m.judge.reason}`, m.judge.wouldFlip.length ? `Would flip: ${m.judge.wouldFlip.join('; ')}` : '', m.unknowns.length ? `Unknown: ${m.unknowns.join(' ')}` : '', m.note].filter(Boolean).join('\n')
}
