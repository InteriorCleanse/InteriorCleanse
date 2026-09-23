/**
 * THE CASE-STUDY ENGINE — interesting moments, preserved with no hindsight.
 *
 * A case study is one historical event the engine itself detected — a
 * liquidity sweep, a break of structure, a fair value gap forming or being
 * retested, an order block interaction, a breaker forming, a strategy setup or
 * rejection, a large displacement, a regime or session transition, a
 * volatility expansion, a risk veto, an exceptional excursion — kept in four
 * parts:
 *
 *   BEFORE    what was knowable at the close of the candle BEFORE the event:
 *             the engine's annotations filtered by `knownAt`, and nothing else.
 *   DURING    the event candle and what the engine reported on it.
 *   DECISION  what the strategies voted and the fused decision, if the votes
 *             were computed for that step; what paper did, if a trade links.
 *   AFTER     price over the next N candles — timestamps strictly later than
 *             the event, measured in ATRs, and labelled as what it is.
 *
 * NO HINDSIGHT. BEFORE is built from the previous step's analysis and filtered
 * by `knowableAt(previous candle close)`; an adversarial test checks that no
 * annotation in BEFORE has a `knownAt` past that close and that AFTER begins
 * after the event. The engine's own `knownAt` discipline (a swing is known
 * some candles after it prints; a break is known on the closing candle) is
 * inherited, not re-invented.
 *
 * The detector is pure over engine steps. `scanHistory()` is the one function
 * that steps the engine — the real `IctEngine`, the same one the replay and
 * the live loop use — and it computes strategy votes only over a bounded tail
 * so a thirty-day scan stays cheap. Nothing here trades.
 */

import { config } from '../../config.ts'
import { IctEngine } from '../ictStrategy.ts'
import { contextFor, voteAll, metaById } from '../strategies/registry.ts'
import { fuse } from '../fusion.ts'
import type { FusedDecision } from '../fusion.ts'
import { annotate } from '../intel/annotate.ts'
import { knowableAt } from '../intel/types.ts'
import type { ChartAnnotation } from '../intel/types.ts'
import { VERSION } from '../version.ts'
import type { Candle, IctAnalysis } from '../types.ts'
import type { StrategyVote } from '../strategies/types.ts'
import type { EvidenceRecord } from '../analyst/records.ts'
import type { NewItem } from '../knowledge/vault.ts'

export type CaseKind =
  | 'liquidity-sweep' | 'bos' | 'choch' | 'fvg-created' | 'fvg-retest' | 'fvg-inverted'
  | 'order-block-interaction' | 'breaker-formation'
  | 'unicorn-setup' | 'turtle-soup-setup' | 'silver-bullet-setup' | 'strategy-setup' | 'strategy-rejection'
  | 'large-displacement' | 'regime-transition' | 'session-transition' | 'volatility-expansion'
  | 'risk-veto' | 'exceptional-mfe' | 'exceptional-mae' | 'unexpected-strategy-failure'

/** The concept a kind teaches, in the school's vocabulary. */
export const CONCEPT_OF: Record<CaseKind, string> = {
  'liquidity-sweep': 'liquidity', bos: 'structure', choch: 'structure',
  'fvg-created': 'imbalance', 'fvg-retest': 'imbalance', 'fvg-inverted': 'imbalance',
  'order-block-interaction': 'order-blocks', 'breaker-formation': 'order-blocks',
  'unicorn-setup': 'order-blocks', 'turtle-soup-setup': 'liquidity', 'silver-bullet-setup': 'imbalance',
  'strategy-setup': 'strategies', 'strategy-rejection': 'strategies',
  'large-displacement': 'volatility', 'regime-transition': 'regime', 'session-transition': 'sessions', 'volatility-expansion': 'volatility',
  'risk-veto': 'risk', 'exceptional-mfe': 'risk', 'exceptional-mae': 'risk', 'unexpected-strategy-failure': 'process',
}

/**
 * Which way the concept "expects" price to go afterwards, so a counterexample
 * can be found. Null means the concept carries no directional expectation and
 * cannot have a counterexample in that sense.
 */
function expectedDirection(kind: CaseKind, detail: CaseStudy['during']): 'up' | 'down' | null {
  const d = detail.direction
  switch (kind) {
    case 'liquidity-sweep': return d === 'below' ? 'up' : d === 'above' ? 'down' : null   // a raid of lows expects a reversal up
    case 'turtle-soup-setup': return d === 'long' ? 'up' : d === 'short' ? 'down' : null
    case 'bos': case 'choch': return d === 'bullish' ? 'up' : d === 'bearish' ? 'down' : null
    case 'fvg-retest': case 'order-block-interaction': case 'unicorn-setup': case 'silver-bullet-setup': case 'strategy-setup':
      return d === 'bullish' || d === 'long' ? 'up' : d === 'bearish' || d === 'short' ? 'down' : null
    case 'fvg-inverted': return d === 'bullish' ? 'down' : d === 'bearish' ? 'up' : null // an inverted bullish gap now acts as resistance
    default: return null
  }
}

export type Step = { index: number; candle: Candle; analysis: IctAnalysis; votes?: StrategyVote[]; decision?: FusedDecision | null }

export type CaseStudy = {
  id: string
  kind: CaseKind
  concept: string
  title: string
  symbol: string
  timeframe: string
  /** When the event happened (the event candle's close). */
  at: number
  /** When the engine could first know it. Never earlier than `at` in practice; recorded, not assumed. */
  knownAt: number
  before: {
    /** The close of the candle before the event — the last moment BEFORE. */
    asOf: number
    annotations: ChartAnnotation[]
    session: string | null
    regime: string | null
    volatility: string | null
    structureTrend: string | null
    price: number
  }
  during: {
    candle: Candle
    direction: string | null
    detail: string
    atr: number
    /** The candle's range in ATRs. */
    rangeAtr: number
  }
  decision: {
    votes: Array<{ id: string; action: string; confidence: number; reason: string; passed: number; failed: number }> | null
    fused: { action: string; score: number; direction: string | null } | null
    paperTradeId: string | null
    note: string
  }
  after: {
    from: number
    to: number
    candles: number
    /** Close-to-close move over the horizon, in ATRs at the event. */
    moveAtr: number | null
    maxUpAtr: number | null
    maxDownAtr: number | null
    /** Whether price went the way the concept "expects". Null when the concept has no expectation or the horizon is not covered. */
    wentExpectedWay: boolean | null
    note: string
  }
  evidenceLevel: 'OBSERVED' | 'INSUFFICIENT DATA'
  provenance: { source: 'HISTORICAL' | 'PAPER'; engineVersion: string; recordIds: string[]; period: { from: number; to: number } }
}

const fx = (n: number | null, d = 2) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`)

function idFor(kind: CaseKind, at: number, extra = ''): string {
  let h = 2166136261
  for (const ch of `${kind}|${at}|${extra}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return `case-${kind}-${h.toString(36)}`
}

// ---------------------------------------------------------------
// Raw event detection — a diff of consecutive engine steps
// ---------------------------------------------------------------

export type RawEvent = { kind: CaseKind; index: number; knownAt: number; direction: string | null; detail: string; refId?: string }

/** The diff of two consecutive engine steps. Exported for the market observer, which runs it on the live cycle. */
export function detectAt(prev: Step | null, cur: Step): RawEvent[] {
  const out: RawEvent[] = []
  const a = cur.analysis
  const p = prev?.analysis ?? null
  const i = cur.index
  const key = (s: { level: { kind: string }; time: number }) => `${s.level.kind}:${s.time}`

  // Sweeps: anything on today's list that was not on the previous step's list.
  const prevSweeps = new Set([...(p?.sweepsToday ?? []), ...(p?.swingSweepsToday ?? [])].map(key))
  for (const s of [...a.sweepsToday, ...a.swingSweepsToday]) {
    if (!prevSweeps.has(key(s)) && s.index === i) out.push({ kind: 'liquidity-sweep', index: i, knownAt: s.time, direction: s.side, detail: `${s.level.label} swept ${s.side === 'above' ? 'from above (a high raided)' : 'from below (a low raided)'}, wick ${s.wick.toFixed(2)}, ${s.depthAtr.toFixed(2)} ATR deep.`, refId: key(s) })
  }
  // Structure breaks that happened on this candle.
  for (const sh of a.structureShifts) {
    if (sh.index === i) out.push({ kind: sh.kind === 'BOS' ? 'bos' : 'choch', index: i, knownAt: sh.time, direction: sh.direction, detail: `${sh.kind} ${sh.direction}: closed through the ${sh.brokeSwing.time ? 'swing' : 'level'} at ${sh.brokeSwing.price.toFixed(2)} on a close of ${sh.price.toFixed(2)}.` })
  }
  // Gaps created, retested (mitigated) or inverted on this candle.
  const prevFvg = new Map((p?.fvgs ?? []).map((f) => [f.id, f.state]))
  for (const f of a.fvgs) {
    if (f.createdIndex === i) out.push({ kind: 'fvg-created', index: i, knownAt: f.createdTime, direction: f.direction, detail: `A ${f.direction} fair value gap ${f.bottom.toFixed(2)}–${f.top.toFixed(2)} (${f.sizeAtr.toFixed(2)} ATR)${f.fromDisplacement ? ' left by displacement' : ''}.`, refId: f.id })
    const was = prevFvg.get(f.id)
    if (was && was !== f.state) {
      if (f.state === 'mitigated') out.push({ kind: 'fvg-retest', index: i, knownAt: a.time, direction: f.direction, detail: `Price returned into the ${f.direction} gap ${f.bottom.toFixed(2)}–${f.top.toFixed(2)}.`, refId: f.id })
      if (f.state === 'inverted') out.push({ kind: 'fvg-inverted', index: i, knownAt: a.time, direction: f.direction, detail: `The ${f.direction} gap ${f.bottom.toFixed(2)}–${f.top.toFixed(2)} was closed through and inverted.`, refId: f.id })
    }
  }
  // Order blocks touched or turned into breakers on this candle.
  const prevOb = new Map((p?.orderBlocks ?? []).map((b) => [b.id, b.state]))
  for (const b of a.orderBlocks) {
    const was = prevOb.get(b.id)
    if (was && was !== b.state) {
      if (b.state === 'mitigated') out.push({ kind: 'order-block-interaction', index: i, knownAt: a.time, direction: b.direction, detail: `Price returned to the ${b.direction} order block ${b.bottom.toFixed(2)}–${b.top.toFixed(2)}${b.withFvg ? ' (with a gap)' : ''}${b.withStructureBreak ? ' (with a structure break)' : ''}.`, refId: b.id })
      if (b.state === 'broken') out.push({ kind: 'breaker-formation', index: i, knownAt: a.time, direction: b.direction, detail: `The ${b.direction} order block ${b.bottom.toFixed(2)}–${b.top.toFixed(2)} was broken and now acts as a breaker.`, refId: b.id })
    }
  }
  // A large candle relative to its own ATR — uses only this candle.
  const c = cur.candle
  const rangeAtr = a.atr > 0 ? (c.high - c.low) / a.atr : 0
  if (rangeAtr >= 2.5) out.push({ kind: 'large-displacement', index: i, knownAt: c.closeTime, direction: c.close >= c.open ? 'up' : 'down', detail: `A ${rangeAtr.toFixed(1)}-ATR candle ${c.close >= c.open ? 'up' : 'down'}.` })
  // Regime, session and volatility transitions.
  const regime = a.features?.regime?.value?.state ?? null
  const prevRegime = p?.features?.regime?.value?.state ?? null
  if (p && regime !== prevRegime && regime) out.push({ kind: 'regime-transition', index: i, knownAt: a.time, direction: regime, detail: `Regime read changed from ${prevRegime ?? 'unclassified'} to ${regime}.` })
  if (p && a.session !== p.session && a.session) out.push({ kind: 'session-transition', index: i, knownAt: a.time, direction: a.session, detail: `The ${a.session} session opened.` })
  const vol = a.features?.volatility?.value?.label ?? null
  const prevVol = p?.features?.volatility?.value?.label ?? null
  if (p && vol === 'wild' && prevVol !== 'wild' && prevVol) out.push({ kind: 'volatility-expansion', index: i, knownAt: a.time, direction: null, detail: `Volatility label moved from ${prevVol} to wild (ATR ratio ${(a.features?.volatility?.value?.ratio ?? 0).toFixed(2)}).` })
  // Strategy setups and rejections, only where the votes were computed.
  for (const v of cur.votes ?? []) {
    const passed = v.evidence.filter((e) => e.passed).length
    const failed = v.evidence.length - passed
    if (v.action === 'BUY' || v.action === 'SELL') {
      const kind: CaseKind = v.id === 'unicorn' ? 'unicorn-setup' : v.id === 'turtle-soup' ? 'turtle-soup-setup' : v.id === 'silver-bullet' ? 'silver-bullet-setup' : 'strategy-setup'
      out.push({ kind, index: i, knownAt: a.time, direction: v.direction, detail: `${v.id} voted ${v.action} at ${v.confidence}/100: ${v.reason}`, refId: v.id })
    } else if (passed >= 2 && failed === 1) {
      const miss = v.evidence.find((e) => !e.passed)!
      out.push({ kind: 'strategy-rejection', index: i, knownAt: a.time, direction: null, detail: `${v.id} came close and held back: ${passed} of ${v.evidence.length} conditions met; missing "${miss.step}" — ${miss.detail}`, refId: v.id })
    }
  }
  return out
}

// ---------------------------------------------------------------
// Building a case study from an event — BEFORE from the previous step
// ---------------------------------------------------------------

export function annotationsAt(step: Step, candles: Candle[]): ChartAnnotation[] {
  const full = annotate({ symbol: config.symbol, timeframe: config.interval, engineVersion: VERSION, analysis: step.analysis, candles: candles.slice(0, step.index + 1), votes: step.votes, decision: step.decision ?? null, now: step.candle.closeTime })
  return knowableAt(full, step.candle.closeTime)
}

function afterOf(candles: Candle[], i: number, atr: number, horizon: number, expected: 'up' | 'down' | null): CaseStudy['after'] {
  const run = candles.slice(i + 1, i + 1 + horizon)
  const from = candles[i + 1]?.openTime ?? candles[i].closeTime + 1
  const to = run.length ? run[run.length - 1].closeTime : from
  if (run.length < horizon || !(atr > 0)) {
    return { from, to, candles: run.length, moveAtr: null, maxUpAtr: null, maxDownAtr: null, wentExpectedWay: null, note: run.length < horizon ? `Only ${run.length} of ${horizon} candles after the event are stored; the outcome is not measured on a partial window.` : 'ATR was zero; the outcome cannot be expressed in ATRs.' }
  }
  const c0 = candles[i].close
  const moveAtr = (run[run.length - 1].close - c0) / atr
  const maxUpAtr = (Math.max(...run.map((c) => c.high)) - c0) / atr
  const maxDownAtr = (c0 - Math.min(...run.map((c) => c.low))) / atr
  const wentExpectedWay = expected === null ? null : expected === 'up' ? moveAtr > 0 : moveAtr < 0
  return { from, to, candles: run.length, moveAtr, maxUpAtr, maxDownAtr, wentExpectedWay, note: `Over the next ${horizon} candles price moved ${fx(moveAtr)} ATR close to close (best ${fx(maxUpAtr)} up, ${fx(maxDownAtr)} down).${expected ? ` The concept's usual expectation here is ${expected}; it ${wentExpectedWay ? 'went that way' : 'did not'}.` : ''}` }
}

export function caseStudyFrom(ev: RawEvent, steps: Step[], candles: Candle[], opts: { horizon?: number; paperTradeId?: string | null } = {}): CaseStudy {
  const horizon = opts.horizon ?? 24
  const cur = steps[ev.index]
  const prev = ev.index > 0 ? steps[ev.index - 1] : null
  const a = cur.analysis
  const during: CaseStudy['during'] = { candle: cur.candle, direction: ev.direction, detail: ev.detail, atr: a.atr, rangeAtr: a.atr > 0 ? (cur.candle.high - cur.candle.low) / a.atr : 0 }
  const kind = ev.kind
  const expected = expectedDirection(kind, during)
  const after = afterOf(candles, ev.index, a.atr, horizon, expected)
  const votes = cur.votes ? cur.votes.map((v) => ({ id: v.id, action: v.action, confidence: v.confidence, reason: v.reason, passed: v.evidence.filter((e) => e.passed).length, failed: v.evidence.filter((e) => !e.passed).length })) : null
  const fused = cur.decision ? { action: cur.decision.action, score: cur.decision.score, direction: cur.decision.direction } : null
  const title = `${kind.replace(/-/g, ' ')} · ${new Date(cur.candle.closeTime).toISOString().slice(0, 16).replace('T', ' ')}Z`
  return {
    id: idFor(kind, cur.candle.closeTime, ev.refId ?? ''),
    kind, concept: CONCEPT_OF[kind], title,
    symbol: config.symbol, timeframe: config.interval,
    // The engine steps once per closed candle: nothing on this candle is knowable before its close.
    at: cur.candle.closeTime, knownAt: Math.max(ev.knownAt, cur.candle.closeTime),
    before: prev
      ? { asOf: prev.candle.closeTime, annotations: annotationsAt(prev, candles), session: prev.analysis.session, regime: prev.analysis.features?.regime?.value?.state ?? null, volatility: prev.analysis.features?.volatility?.value?.label ?? null, structureTrend: prev.analysis.structureTrend, price: prev.candle.close }
      : { asOf: cur.candle.openTime - 1, annotations: [], session: null, regime: null, volatility: null, structureTrend: null, price: cur.candle.open },
    during,
    decision: {
      votes, fused, paperTradeId: opts.paperTradeId ?? null,
      note: votes ? (fused && (fused.action === 'LONG' || fused.action === 'SHORT') ? `The fused decision was ${fused.action} at ${fused.score}/100.` : 'No strategy produced an actionable vote at this candle.') : 'Strategy votes were not computed for this step; only the engine\'s own detections are shown.',
    },
    after,
    evidenceLevel: after.moveAtr === null ? 'INSUFFICIENT DATA' : 'OBSERVED',
    provenance: { source: 'HISTORICAL', engineVersion: VERSION, recordIds: [`candle:${cur.candle.openTime}`, ...(opts.paperTradeId ? [opts.paperTradeId] : [])], period: { from: prev?.candle.openTime ?? cur.candle.openTime, to: after.to } },
  }
}

// ---------------------------------------------------------------
// Scanning history — the one place the engine is stepped
// ---------------------------------------------------------------

export type ScanOptions = {
  /** How many trailing steps get strategy votes (the expensive part). */
  votesTail?: number
  horizon?: number
  /** Cap on studies returned, most recent first. */
  limit?: number
  kinds?: CaseKind[]
}

/**
 * Step the real engine over candles, once, and keep every step. Strategy votes
 * and the fused decision are computed for the trailing `votesTail` steps only
 * (they are the expensive part). This is the ONE place the school steps the
 * engine; the replay school and the lesson generator read these steps.
 */
export function stepEngine(candles: Candle[], votesTail = 600): Step[] {
  const engine = new IctEngine(candles)
  const meta = metaById()
  const steps: Step[] = []
  const firstVotes = Math.max(0, candles.length - votesTail)
  for (let i = 0; i < candles.length; i++) {
    const analysis = engine.step(i)
    const step: Step = { index: i, candle: candles[i], analysis }
    if (i >= firstVotes) {
      const votes = voteAll(contextFor(analysis, candles))
      step.votes = votes
      step.decision = fuse({ votes, metaById: meta, regime: analysis.features?.regime?.value?.state ?? null })
    }
    steps.push(step)
  }
  return steps
}

/** Every case study a set of engine steps can support. Pure. */
export function casesFromSteps(steps: Step[], candles: Candle[], opts: ScanOptions = {}): CaseStudy[] {
  const wanted = opts.kinds ? new Set(opts.kinds) : null
  const out: CaseStudy[] = []
  for (let i = 1; i < steps.length; i++) {
    for (const ev of detectAt(steps[i - 1], steps[i])) {
      if (wanted && !wanted.has(ev.kind)) continue
      out.push(caseStudyFrom(ev, steps, candles, { horizon: opts.horizon }))
    }
  }
  out.sort((a, b) => b.at - a.at)
  return opts.limit ? out.slice(0, opts.limit) : out
}

/** Step the real engine over candles and return every case study it can support. Pure over the candles given. */
export function scanCandles(candles: Candle[], opts: ScanOptions = {}): CaseStudy[] {
  return casesFromSteps(stepEngine(candles, opts.votesTail ?? 600), candles, opts)
}

// ---------------------------------------------------------------
// Paper-derived cases: vetoes, exceptional excursions, unexpected failures
// ---------------------------------------------------------------

/**
 * Case studies that only the paper record can supply. Thresholds are stated:
 * an MFE beyond the 90th percentile of the cohort, an MAE beyond the 10th, and
 * a loss whose snapshot shows every condition passed and the fused score at or
 * above the enter threshold. All from stored records; nothing recomputed.
 */
export function paperCases(records: EvidenceRecord[], opts: { missed?: Array<{ id: string; at: number; note: string; direction: string; strategyId: string }> } = {}): CaseStudy[] {
  const out: CaseStudy[] = []
  const trades = records.filter((r) => !r.corrupt && !r.missed && r.rMultiple !== null)
  const pct = (xs: number[], q: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] }
  const mfes = trades.filter((r) => r.mfe.status === 'OBSERVED').map((r) => r.mfe.r as number)
  const maes = trades.filter((r) => r.mae.status === 'OBSERVED').map((r) => r.mae.r as number)
  const p90 = pct(mfes, 0.9), p10 = pct(maes, 0.1)
  const shell = (kind: CaseKind, r: EvidenceRecord, detail: string): CaseStudy => ({
    id: idFor(kind, r.decidedAt, r.id), kind, concept: CONCEPT_OF[kind], title: `${kind.replace(/-/g, ' ')} · ${r.strategyId} · ${new Date(r.decidedAt).toISOString().slice(0, 16).replace('T', ' ')}Z`,
    symbol: r.symbol, timeframe: r.interval, at: r.decidedAt, knownAt: r.closedAt ?? r.decidedAt,
    before: { asOf: r.decidedAt - 1, annotations: [], session: r.session, regime: r.regime, volatility: r.volatility, structureTrend: null, price: r.intendedEntry ?? 0 },
    during: { candle: { openTime: r.decidedAt, closeTime: r.decidedAt, open: r.entry ?? 0, high: r.entry ?? 0, low: r.entry ?? 0, close: r.entry ?? 0, volume: 0 }, direction: r.direction, detail, atr: 0, rangeAtr: 0 },
    decision: { votes: null, fused: r.fusedScore === null ? null : { action: r.direction === 'long' ? 'LONG' : 'SHORT', score: r.fusedScore, direction: r.direction }, paperTradeId: r.id, note: 'From the stored paper record and its decision-time snapshot.' },
    after: { from: r.filledAt ?? r.decidedAt, to: r.closedAt ?? r.decidedAt, candles: 0, moveAtr: null, maxUpAtr: r.mfe.r, maxDownAtr: r.mae.r === null ? null : -r.mae.r, wentExpectedWay: r.rMultiple === null ? null : r.rMultiple > 0, note: `Closed ${r.exitReason ?? '—'} at ${fx(r.rMultiple)}R; MFE ${r.mfe.status === 'OBSERVED' ? fx(r.mfe.r) : r.mfe.status.toLowerCase()}, MAE ${r.mae.status === 'OBSERVED' ? fx(r.mae.r) : r.mae.status.toLowerCase()}.` },
    evidenceLevel: 'OBSERVED',
    provenance: { source: 'PAPER', engineVersion: r.engineVersion ?? VERSION, recordIds: [r.id], period: { from: r.decidedAt, to: r.closedAt ?? r.decidedAt } },
  })
  for (const r of trades) {
    if (p90 !== null && r.mfe.status === 'OBSERVED' && (r.mfe.r as number) >= p90 && mfes.length >= 10) out.push(shell('exceptional-mfe', r, `MFE ${fx(r.mfe.r)}R is at or above the cohort's 90th percentile (${fx(p90)}R over ${mfes.length}).`))
    if (p10 !== null && r.mae.status === 'OBSERVED' && (r.mae.r as number) <= p10 && maes.length >= 10) out.push(shell('exceptional-mae', r, `MAE ${fx(r.mae.r)}R is at or below the cohort's 10th percentile (${fx(p10)}R over ${maes.length}).`))
    if ((r.rMultiple as number) < 0 && r.fusedScore !== null && r.fusedScore >= config.fusion.enterScore && r.quality !== null && r.quality >= 80) {
      out.push(shell('unexpected-strategy-failure', r, `A loss on a setup the engine scored ${r.fusedScore}/100 with a checklist of ${r.quality}/100 — every recorded condition was met and it still lost. A loss is evidence, not proof the strategy is broken.`))
    }
  }
  for (const m of opts.missed ?? []) {
    out.push({
      id: idFor('risk-veto', m.at, m.id), kind: 'risk-veto', concept: 'risk', title: `risk veto · ${m.strategyId} · ${new Date(m.at).toISOString().slice(0, 16).replace('T', ' ')}Z`,
      symbol: config.symbol, timeframe: config.interval, at: m.at, knownAt: m.at,
      before: { asOf: m.at - 1, annotations: [], session: null, regime: null, volatility: null, structureTrend: null, price: 0 },
      during: { candle: { openTime: m.at, closeTime: m.at, open: 0, high: 0, low: 0, close: 0, volume: 0 }, direction: m.direction, detail: m.note, atr: 0, rangeAtr: 0 },
      decision: { votes: null, fused: null, paperTradeId: m.id, note: 'The engine had a setup and the risk chain refused it. The reason is the one it recorded.' },
      after: { from: m.at, to: m.at, candles: 0, moveAtr: null, maxUpAtr: null, maxDownAtr: null, wentExpectedWay: null, note: 'No position was opened, so there is no outcome to measure.' },
      evidenceLevel: 'OBSERVED',
      provenance: { source: 'PAPER', engineVersion: VERSION, recordIds: [m.id], period: { from: m.at, to: m.at } },
    })
  }
  return out.sort((a, b) => b.at - a.at)
}

// ---------------------------------------------------------------
// Counterexamples — the most important safeguard in the school
// ---------------------------------------------------------------

export type CounterexamplePair = {
  concept: string
  kind: CaseKind
  example: CaseStudy
  counterexample: CaseStudy
  lesson: string
}

export const COUNTEREXAMPLE_LESSON = 'Similar-looking structure does not guarantee the same outcome. The same event, read the same way by the same engine, went the other way here.'

/** For a kind, pair a case that went the concept's way with one that did not. */
export function counterexamplesFor(cases: CaseStudy[], kind: CaseKind, max = 5): CounterexamplePair[] {
  const of = cases.filter((c) => c.kind === kind && c.after.wentExpectedWay !== null)
  const went = of.filter((c) => c.after.wentExpectedWay)
  const didNot = of.filter((c) => !c.after.wentExpectedWay)
  const out: CounterexamplePair[] = []
  for (let i = 0; i < Math.min(max, went.length, didNot.length); i++) {
    out.push({ concept: CONCEPT_OF[kind], kind, example: went[i], counterexample: didNot[i], lesson: COUNTEREXAMPLE_LESSON })
  }
  return out
}

/** How often each kind went its expected way — with n, and nothing claimed under the bar. */
export function outcomeTally(cases: CaseStudy[]): Array<{ kind: CaseKind; n: number; wentExpected: number; share: number | null; note: string }> {
  const byKind = new Map<CaseKind, CaseStudy[]>()
  for (const c of cases) if (c.after.wentExpectedWay !== null) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c])
  return [...byKind.entries()].map(([kind, list]) => {
    const went = list.filter((c) => c.after.wentExpectedWay).length
    const n = list.length
    return { kind, n, wentExpected: went, share: n >= 10 ? went / n : null, note: n >= 10 ? `${went} of ${n} went the expected way. A description of this window, not a probability.` : `${n} instance${n === 1 ? '' : 's'} — under 10, so no share is stated.` }
  }).sort((a, b) => b.n - a.n)
}

// ---------------------------------------------------------------
// Into the vault
// ---------------------------------------------------------------

export function caseStudyItem(c: CaseStudy): NewItem {
  return {
    kind: 'case-study', title: c.title, id: c.id,
    body: `${c.during.detail}\nBEFORE (as of ${new Date(c.before.asOf).toISOString()}): ${c.before.annotations.length} annotation(s) knowable; session ${c.before.session ?? '—'}, regime ${c.before.regime ?? 'unclassified'}, volatility ${c.before.volatility ?? '—'}.\nDECISION: ${c.decision.note}\nAFTER: ${c.after.note}`,
    evidenceLabel: c.evidenceLevel, tags: [c.concept, c.kind, c.symbol, c.timeframe],
    provenance: { source: c.provenance.source, symbol: c.symbol, timeframe: c.timeframe, period: c.provenance.period, recordIds: c.provenance.recordIds, method: 'engine event detection over stored candles; outcome over the following candles' },
    payload: c, now: c.at,
  }
}

/** The no-hindsight check, callable by tests and by the acceptance workflow. */
export function hindsightFindings(c: CaseStudy): string[] {
  const out: string[] = []
  for (const a of c.before.annotations) if (a.knownAt > c.before.asOf) out.push(`BEFORE contains "${a.annotationType}" known at ${a.knownAt} > asOf ${c.before.asOf}`)
  if (c.before.asOf >= c.at) out.push(`BEFORE.asOf ${c.before.asOf} is not before the event ${c.at}`)
  if (c.after.candles > 0 && c.after.from <= c.at) out.push(`AFTER begins at ${c.after.from}, not after the event ${c.at}`)
  if (c.knownAt < c.before.asOf) out.push(`knownAt ${c.knownAt} precedes BEFORE.asOf ${c.before.asOf}`)
  return out
}
