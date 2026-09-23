/**
 * THE DESK — six agents on one surface, and none of them allowed to bluff.
 *
 * This is a READ-ONLY view. It computes nothing the engine has not already
 * decided, it never places or shapes an order, and it must never become a
 * second trading engine. Everything here is a projection of state that already
 * exists: the feature snapshot, the strategy votes, the fused decision, the risk
 * verdict, the validation gates.
 *
 * WHY SIX, AND WHY THIS SIXTH ONE
 *
 * A trading desk that shows six panels of live-looking numbers is easy. The
 * hard part — and the only part worth building — is a desk that is honest when
 * it cannot see. Every panel here carries the provenance of what it is showing
 * (REAL from the tape, APPROXIMATE from candles, or UNAVAILABLE), how old it is,
 * and, when it cannot speak, exactly what it is waiting on.
 *
 * Five agents watch the market. The sixth, PROOF, watches the other five and
 * reports how much they have earned the right to claim. A desk whose sixth
 * agent says INSUFFICIENT SAMPLE is more useful than one that never mentions it,
 * because the failure mode of a beautiful dashboard is looking certain while
 * three of its feeds are dead.
 *
 * The desk-level `trust` score exists for exactly that: it is the share of the
 * floor that is actually seeing something right now, not a confidence in the
 * trade. They are different numbers and conflating them is how people lose
 * money on a screen that looked alive.
 */

import { LIVE_TRADING_ENABLED } from '../../config.ts'
import { toET, tradingDayKey } from '../sessions.ts'
import { floorLine, trustLine, evidenceLine, agentLine, AGENT_NAMES } from '../voice/persona.ts'
import type { FeatureSnapshot, Feature } from '../features/types.ts'
import type { FusedDecision } from '../fusion.ts'
import type { StrategyVote } from '../strategies/types.ts'
import type { RiskVerdict } from '../riskEngine.ts'

/** What the panel is showing, propagated verbatim from the feature it came from. */
export type Provenance = 'REAL' | 'APPROXIMATE' | 'UNAVAILABLE'

/**
 * LIVE     — seeing everything it needs, from the source it prefers.
 * PARTIAL  — seeing something, but estimated or stale.
 * BLIND    — cannot see; `waitingOn` says what it needs.
 * WAITING  — can see, but the condition it exists to catch is not present.
 */
export type AgentStatus = 'LIVE' | 'PARTIAL' | 'BLIND' | 'WAITING'

export type DeskRow = { label: string; value: string; provenance?: Provenance }

export type DeskAgent = {
  id: 'book' | 'tape' | 'signal' | 'risk' | 'regime' | 'proof'
  name: string
  /** The plain-English name a person reads first ("Order flow", not "BOOK"). */
  title: string
  /** One line a beginner can understand, explaining what this panel is for. */
  plain: string
  /** How he'd describe this panel's state out loud. Never adds confidence. */
  line: string
  /** One line: what this agent owns. Fixed, not generated. */
  role: string
  status: AgentStatus
  /** The single number or verdict this agent exists to produce — or '—'. */
  headline: string
  detail: string
  provenance: Provenance
  asOf: number | null
  ageSec: number | null
  /** What it needs before it can speak. Null when it is speaking. */
  waitingOn: string | null
  rows: DeskRow[]
}

/** What an agent builder produces. `buildDesk` adds the friendly name and his line. */
export type AgentCore = Omit<DeskAgent, 'title' | 'plain' | 'line'>

export type DeskReport = {
  generatedAt: number
  tradingDay: string
  symbol: string
  interval: string
  /** Always PAPER in this build. The desk states it rather than implying it. */
  mode: 'PAPER'
  liveTradingEnabled: boolean
  agents: DeskAgent[]
  floor: {
    /** The fused action AFTER the risk verdict — what the floor would actually do. */
    verdict: string
    verdictDetail: string
    /** 0–100: the share of the desk that can currently see. NOT a confidence in any trade. */
    trust: number
    /** Agents that cannot see right now, by name. */
    blind: string[]
    /** The validation verdict, carried onto the desk so it cannot be forgotten. */
    evidence: string
    evidenceDetail: string
    /**
     * The gate tally as NUMBERS.
     *
     * The dashboard used to recover these by running a regex over
     * `evidenceDetail` and pairing the result with its own hardcoded total of 9
     * — data derived from presentation, plus a third copy of a number that
     * lives in config. Reword the sentence and the progress bar silently reads
     * zero; add a gate and it silently reads the wrong denominator.
     */
    gates: { met: number; total: number }
  }
  /** The same state, said the way he'd say it. Phrasing only — never new facts. */
  voice: { floor: string; trust: string; evidence: string }
  /** The signal core: the same state again, shaped for a picture. Every number carries its provenance. */
  core: DeskCore
}

/**
 * THE SIGNAL CORE — the desk's state shaped for a moving picture.
 *
 * The web desk draws a rotating wireframe from the strategy panel, a stat strip
 * and four small charts. Everything they show is in this block, computed here
 * from the same inputs as the six agents, so the picture can never carry a
 * number the agents do not. Rules the picture obeys:
 *   - a reading that is unavailable is `null` and draws as an empty frame with
 *     the word UNAVAILABLE, never as a flat line or a zero;
 *   - the panel's geometry (how many vertices, how far out) comes from the real
 *     votes; motion speed comes from the tape when the tape is trusted and is
 *     otherwise constant, so the animation cannot imply activity that is not
 *     being read;
 *   - the stat strip is FILL / HIT / EXPECTANCY / BOOK — never "edge" — and it
 *     says INSUFFICIENT SAMPLE under any figure built from fewer than ten
 *     trades.
 */
export type CoreVote = { id: string; name: string; action: 'BUY' | 'SELL' | 'HOLD'; direction: 'long' | 'short' | null; confidence: number; weight: number; effective: number }
export type CoreStat = { label: string; value: string; sub: string; provenance: Provenance }
export type CoreCandle = { openTime: number; open: number; high: number; low: number; close: number; volume: number }
export type DeskCore = {
  note: string
  panel: { votes: CoreVote[]; score: number | null; enterScore: number | null; action: string; direction: 'long' | 'short' | null; regime: string | null }
  flow: { trusted: boolean; imbalance: number | null; tapePerMin: number | null; tapeLabel: string | null; deltaShare: number | null; largeNetUsd: number | null; provenance: Provenance; asOf: number | null }
  volatility: { ratio: number | null; label: string | null }
  stats: { fill: CoreStat; hit: CoreStat; expectancy: CoreStat; book: CoreStat }
  /** The last 48 closed candles' volume, oldest first. */
  volume: { bars: Array<{ t: number; v: number; up: boolean }>; provenance: Provenance }
  /** The last 96 closed candles (8 h at 5m): high, low and close, with the window's extremes. */
  range: { bars: Array<{ t: number; h: number; l: number; c: number }>; high: number | null; low: number | null; provenance: Provenance }
  /** Volume by New York hour × trading day over the candles supplied (up to seven days). */
  heat: { days: string[]; grid: number[][]; max: number; provenance: Provenance }
  pulse: { perMin: number | null; label: string | null; provenance: Provenance }
}

export type DeskInput = {
  now: number
  symbol: string
  interval: string
  features: FeatureSnapshot | null
  votes: StrategyVote[]
  decision: FusedDecision | null
  risk: RiskVerdict | null
  structure: { swings: number; orderBlocks: number; fvgs: number; sweeps: number; bias: string | null } | null
  validation: { verdict: string; metCount: number; total: number; trades: number; decaying: number; retired: number } | null
  /** Closed candles, oldest first, for the core's small charts. Optional: the core draws UNAVAILABLE without them. */
  candles?: CoreCandle[]
  /** The paper record's counts for the core's stat strip. Optional: the strip shows em dashes without them. */
  paper?: { signals: number; fills: number; closed: number; wins: number; losses: number; sumR: number }
}

// ---------------------------------------------------------------
// Reading a Feature honestly
// ---------------------------------------------------------------

function provenanceOf(f: Feature<unknown> | null | undefined): Provenance {
  if (!f || !f.available) return 'UNAVAILABLE'
  return f.approximate || f.source === 'candles' ? 'APPROXIMATE' : 'REAL'
}

function ageSec(asOf: number | null, now: number): number | null {
  return asOf === null || asOf <= 0 ? null : Math.max(0, Math.round((now - asOf) / 1000))
}

/** A number, or an em dash. Never a zero standing in for "we don't know". */
function num(v: number | null | undefined, digits = 2, suffix = ''): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) + suffix : '—'
}

function signed(v: number | null | undefined, digits = 2, suffix = ''): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(digits) + suffix
}

// ---------------------------------------------------------------
// The five that watch the market
// ---------------------------------------------------------------

/** BOOK — the order book and the tape. The agent most often blind, and it says so. */
export function bookAgent(input: DeskInput): AgentCore {
  const f = input.features
  const flow = f?.flow
  const stream = flow?.stream
  const imbalance = flow?.bookImbalance
  const delta = flow?.delta
  const cvd = flow?.cvd
  const prov = provenanceOf(imbalance as Feature<unknown> | undefined)
  const asOf = (imbalance?.asOf ?? delta?.asOf ?? null) || null

  const rows: DeskRow[] = [
    { label: 'Book imbalance', value: num((imbalance?.value as { imbalance?: number } | undefined)?.imbalance, 3), provenance: provenanceOf(imbalance as Feature<unknown> | undefined) },
    { label: 'Candle delta', value: signed((delta?.value as { delta?: number } | undefined)?.delta, 0), provenance: provenanceOf(delta as Feature<unknown> | undefined) },
    { label: 'CVD (day)', value: signed((cvd?.value as { cvd?: number } | undefined)?.cvd, 0), provenance: provenanceOf(cvd as Feature<unknown> | undefined) },
    { label: 'Tape', value: f?.tape?.exact ? 'exact' : f?.tape?.note ? 'gapped' : '—' },
  ]

  if (!stream?.trusted) {
    return {
      id: 'book', name: 'BOOK', role: 'Reads the order book and the tape',
      status: 'BLIND', headline: '—',
      detail: 'The trade stream is not trusted, so nothing here is being read from the book. Paper never estimates the book from candles — an unread book stays unread.',
      provenance: 'UNAVAILABLE', asOf, ageSec: ageSec(asOf, input.now),
      waitingOn: 'a trusted trade/book stream', rows,
    }
  }
  const imb = (imbalance?.value as { imbalance?: number } | undefined)?.imbalance
  return {
    id: 'book', name: 'BOOK', role: 'Reads the order book and the tape',
    status: prov === 'REAL' ? 'LIVE' : prov === 'APPROXIMATE' ? 'PARTIAL' : 'BLIND',
    headline: typeof imb === 'number' ? signed(imb, 3) : '—',
    detail: typeof imb === 'number'
      ? `Resting size is leaning ${imb > 0 ? 'bid' : imb < 0 ? 'ask' : 'neither way'}. Read from the live book, not inferred from candles.`
      : 'The stream is trusted but the book has not produced a reading for this candle yet.',
    provenance: prov, asOf, ageSec: ageSec(asOf, input.now),
    waitingOn: prov === 'UNAVAILABLE' ? 'a book reading for this candle' : null, rows,
  }
}

/** TAPE — market structure. What the chart is actually made of. */
export function tapeAgent(input: DeskInput): AgentCore {
  const s = input.structure
  const f = input.features
  const asOf = f?.asOf ?? null
  if (!s) {
    return {
      id: 'tape', name: 'TAPE', role: 'Organises structure: swings, gaps, blocks, sweeps',
      status: 'BLIND', headline: '—', detail: 'No analysis for this candle yet.',
      provenance: 'UNAVAILABLE', asOf, ageSec: ageSec(asOf, input.now),
      waitingOn: 'a closed candle the engine has stepped through', rows: [],
    }
  }
  const rows: DeskRow[] = [
    { label: 'Swings labelled', value: String(s.swings) },
    { label: 'Order blocks', value: String(s.orderBlocks) },
    { label: 'Fair value gaps', value: String(s.fvgs) },
    { label: 'Sweeps today', value: String(s.sweeps) },
  ]
  return {
    id: 'tape', name: 'TAPE', role: 'Organises structure: swings, gaps, blocks, sweeps',
    status: 'LIVE',
    headline: s.bias ? s.bias.toUpperCase() : 'NEUTRAL',
    detail: `${s.swings} swings, ${s.orderBlocks} blocks and ${s.fvgs} gaps in play; ${s.sweeps} liquidity sweep${s.sweeps === 1 ? '' : 's'} today. Built only from candles already closed.`,
    provenance: 'REAL', asOf, ageSec: ageSec(asOf, input.now), waitingOn: null, rows,
  }
}

/** SIGNAL — the strategy panel and what the fusion made of it. */
export function signalAgent(input: DeskInput): AgentCore {
  const d = input.decision
  const votes = input.votes
  const backing = votes.filter((v) => v.action !== 'HOLD')
  const asOf = input.features?.asOf ?? null
  const rows: DeskRow[] = [
    { label: 'Strategies voting', value: `${backing.length} of ${votes.length}` },
    { label: 'Agreement score', value: d ? String(Math.round(d.score)) : '—' },
    { label: 'Leading', value: d?.contributors?.[0]?.name ?? '—' },
    { label: 'Against it', value: d ? String(d.invalidates.length) : '—' },
  ]
  if (!d) {
    return {
      id: 'signal', name: 'SIGNAL', role: 'Runs the strategy panel and fuses the votes',
      status: 'BLIND', headline: '—', detail: 'No fused decision for this candle.',
      provenance: 'UNAVAILABLE', asOf, ageSec: ageSec(asOf, input.now),
      waitingOn: 'strategy votes for a closed candle', rows,
    }
  }
  const acting = d.action === 'LONG' || d.action === 'SHORT'
  return {
    id: 'signal', name: 'SIGNAL', role: 'Runs the strategy panel and fuses the votes',
    status: acting ? 'LIVE' : 'WAITING',
    headline: d.action,
    detail: acting
      ? `${Math.round(d.score)}/100 of the allowed panel backs ${d.direction}. ${d.confirms.slice(0, 2).join(' ')}`.trim()
      : `Nothing has cleared the bar. ${d.invalidates[0] ?? d.reason}`,
    provenance: 'REAL', asOf, ageSec: ageSec(asOf, input.now),
    waitingOn: acting ? null : 'enough of the panel to agree', rows,
  }
}

/** RISK — the veto chain. Shows what WOULD stop the next order, before it exists. */
export function riskAgent(input: DeskInput): AgentCore {
  const v = input.risk
  const asOf = input.features?.asOf ?? null
  if (!v) {
    return {
      id: 'risk', name: 'RISK', role: 'Holds the veto over every order',
      status: 'WAITING', headline: 'NO CANDIDATE',
      detail: 'Nothing has been proposed, so there is nothing to veto. The chain runs only against a real candidate.',
      provenance: 'REAL', asOf, ageSec: ageSec(asOf, input.now), waitingOn: 'a proposed order', rows: [],
    }
  }
  const failed = v.checks.filter((c) => !c.passed)
  const rows: DeskRow[] = v.checks.map((c) => ({ label: c.rule, value: c.passed ? 'pass' : 'VETO' }))
  return {
    id: 'risk', name: 'RISK', role: 'Holds the veto over every order',
    status: v.approved ? 'LIVE' : 'WAITING',
    headline: v.approved ? 'CLEAR' : (v.vetoedBy ?? 'VETO').toUpperCase(),
    detail: v.approved
      ? `All ${v.checks.length} checks pass. Size ${v.quantity} for $${v.riskUsd.toFixed(2)} of risk.`
      : `${failed.length} check${failed.length === 1 ? '' : 's'} failed; the first is the veto. ${v.reason}`,
    provenance: 'REAL', asOf, ageSec: ageSec(asOf, input.now),
    waitingOn: v.approved ? null : `the ${v.vetoedBy} check to clear`, rows,
  }
}

/** REGIME — what kind of market this is, and therefore whose vote counts more. */
export function regimeAgent(input: DeskInput): AgentCore {
  const r = input.features?.regime
  const prov = provenanceOf(r as Feature<unknown> | undefined)
  const asOf = r?.asOf ?? input.features?.asOf ?? null
  const reading = r?.value as { state?: string; confidence?: number; reasons?: string[] } | undefined
  const vol = input.features?.volatility?.value as { label?: string; ratio?: number } | undefined
  const rows: DeskRow[] = [
    { label: 'State', value: reading?.state ?? '—', provenance: prov },
    { label: 'Confidence', value: num(reading?.confidence, 0) },
    { label: 'Volatility', value: vol?.label ?? '—' },
    { label: 'Session', value: input.features?.session ?? '—' },
  ]
  if (prov === 'UNAVAILABLE' || !reading?.state) {
    return {
      id: 'regime', name: 'REGIME', role: 'Classifies the market and re-weights the panel',
      status: 'BLIND', headline: '—',
      detail: 'The regime could not be classified for this candle, so the panel is running on its default weights.',
      provenance: 'UNAVAILABLE', asOf, ageSec: ageSec(asOf, input.now),
      waitingOn: 'enough feature history to classify', rows,
    }
  }
  return {
    id: 'regime', name: 'REGIME', role: 'Classifies the market and re-weights the panel',
    status: prov === 'REAL' ? 'LIVE' : 'PARTIAL',
    headline: reading.state.toUpperCase(),
    detail: `${reading.reasons?.[0] ?? 'Classified from the shared feature snapshot.'} Strategy weights follow this.`,
    provenance: prov, asOf, ageSec: ageSec(asOf, input.now), waitingOn: null, rows,
  }
}

/**
 * PROOF — the sixth agent, and the reason this desk is not just a pretty one.
 *
 * It does not watch the market. It watches the other five and reports how much
 * they have earned the right to claim: how big the paper sample is, how many
 * gates are met, what is decaying. It is the panel that says "not yet" while
 * everything else on the screen looks alive.
 */
export function proofAgent(input: DeskInput): AgentCore {
  const v = input.validation
  const asOf = input.now
  if (!v) {
    return {
      id: 'proof', name: 'PROOF', role: 'Reports how much the other five have earned',
      status: 'BLIND', headline: 'NO EVIDENCE',
      detail: 'The validation report could not be read, so nothing on this desk has a measured track record behind it.',
      provenance: 'UNAVAILABLE', asOf: null, ageSec: null,
      waitingOn: 'a readable validation report', rows: [],
    }
  }
  const rows: DeskRow[] = [
    { label: 'Gates met', value: `${v.metCount} of ${v.total}` },
    { label: 'Paper trades', value: String(v.trades) },
    { label: 'Decaying', value: String(v.decaying) },
    { label: 'Retired', value: String(v.retired) },
  ]
  const proven = v.metCount >= v.total && v.total > 0
  return {
    id: 'proof', name: 'PROOF', role: 'Reports how much the other five have earned',
    status: proven ? 'LIVE' : 'WAITING',
    headline: v.verdict,
    detail: proven
      ? `All ${v.total} gates met across ${v.trades} paper trades. That is a passed validation stage, not a guarantee of an edge.`
      : `${v.metCount} of ${v.total} gates met on ${v.trades} paper trade${v.trades === 1 ? '' : 's'}. Nothing on this desk is evidence of an edge until that reads ${v.total} of ${v.total}.`,
    provenance: 'REAL', asOf, ageSec: 0,
    waitingOn: proven ? null : `${v.total - v.metCount} more gate${v.total - v.metCount === 1 ? '' : 's'}`, rows,
  }
}

// ---------------------------------------------------------------
// The floor
// ---------------------------------------------------------------

/**
 * How much of the desk can currently see, 0–100.
 *
 * Deliberately NOT a confidence in any trade — it is the share of the five
 * market-watching agents that are actually reading something, with a partial
 * view counting half. A desk showing a decisive signal on a trust of 40 is
 * telling you something a prettier dashboard would hide.
 *
 * PROOF is excluded from the average on purpose: it is not watching the market,
 * and letting "no track record yet" drag down a number that means "can the feeds
 * see" would blur two different kinds of ignorance.
 */
export function trustScore(agents: Pick<DeskAgent, 'id' | 'status'>[]): number {
  const watchers = agents.filter((a) => a.id !== 'proof')
  if (!watchers.length) return 0
  const points = watchers.reduce((s, a) => s + (a.status === 'LIVE' || a.status === 'WAITING' ? 1 : a.status === 'PARTIAL' ? 0.5 : 0), 0)
  return Math.round((points / watchers.length) * 100)
}

// ---------------------------------------------------------------
// The signal core
// ---------------------------------------------------------------

const SAMPLE_BAR = 10

/** The core block. Pure over its input; every null is a reading that is not there. */
export function buildCore(input: DeskInput): DeskCore {
  const f = input.features
  const d = input.decision
  const flow = f?.flow
  const trusted = Boolean(flow?.stream?.trusted)
  const imbF = flow?.bookImbalance as Feature<{ imbalance?: number }> | undefined
  const tapeF = flow?.tapeSpeed as Feature<{ tradesPerMinute?: number; label?: string }> | undefined
  const deltaF = flow?.delta as Feature<{ buyShare?: number }> | undefined
  const largeF = flow?.largeTrades as Feature<{ netUsd?: number }> | undefined
  const imbalance = trusted && imbF?.available ? (imbF.value?.imbalance ?? null) : null
  const tapePerMin = trusted && tapeF?.available ? (tapeF.value?.tradesPerMinute ?? null) : null
  const tapeLabel = trusted && tapeF?.available ? (tapeF.value?.label ?? null) : null
  const deltaShare = trusted && deltaF?.available ? (deltaF.value?.buyShare ?? null) : null
  const largeNetUsd = trusted && largeF?.available ? (largeF.value?.netUsd ?? null) : null
  const flowProv: Provenance = !trusted ? 'UNAVAILABLE' : provenanceOf(imbF as Feature<unknown> | undefined)
  const vol = f?.volatility?.value as { ratio?: number; label?: string } | undefined

  // The panel: the fused contributors when there is a decision, the raw votes otherwise.
  const votes: CoreVote[] = d
    ? d.contributors.map((c) => ({ id: c.id, name: c.name, action: c.action, direction: c.direction, confidence: c.confidence, weight: c.weight, effective: c.effective }))
    : input.votes.map((v) => ({ id: v.id, name: v.id, action: v.action, direction: v.direction, confidence: v.confidence, weight: 1, effective: v.action === 'HOLD' ? 0 : v.confidence }))

  // The stat strip. A figure built from fewer than ten trades says so under itself.
  const p = input.paper
  const pct = (n: number, dnm: number) => (dnm > 0 ? `${Math.round((n / dnm) * 100)}%` : '—')
  const sample = (n: number) => (n < SAMPLE_BAR ? `INSUFFICIENT SAMPLE · ${n} of ${SAMPLE_BAR}` : `${n} trades`)
  const stats = {
    fill: { label: 'FILL', value: p ? pct(p.fills, p.signals) : '—', sub: p ? (p.signals ? `${p.fills} of ${p.signals} signals filled` : 'no signal yet') : 'record not read', provenance: p ? 'REAL' : 'UNAVAILABLE' } as CoreStat,
    hit: { label: 'HIT', value: p ? pct(p.wins, p.wins + p.losses) : '—', sub: p ? (p.closed ? sample(p.closed) : 'no closed trade') : 'record not read', provenance: p ? 'REAL' : 'UNAVAILABLE' } as CoreStat,
    expectancy: { label: 'EXPECTANCY', value: p && p.closed ? `${p.sumR / p.closed >= 0 ? '+' : ''}${(p.sumR / p.closed).toFixed(2)}R` : '—', sub: p ? (p.closed ? `per closed trade · ${sample(p.closed)}` : 'no closed trade') : 'record not read', provenance: p ? 'REAL' : 'UNAVAILABLE' } as CoreStat,
    book: { label: 'BOOK', value: imbalance === null ? '—' : `${Math.round(imbalance * 100)}% bid`, sub: imbalance === null ? (trusted ? 'no book reading this candle' : 'stream not trusted') : 'resting size within the band', provenance: imbalance === null ? 'UNAVAILABLE' : flowProv } as CoreStat,
  }

  // The small charts, from closed candles only.
  const candles = input.candles ?? []
  const volume = { bars: candles.slice(-48).map((c) => ({ t: c.openTime, v: c.volume, up: c.close >= c.open })), provenance: (candles.length ? 'REAL' : 'UNAVAILABLE') as Provenance }
  const rb = candles.slice(-96)
  const range = {
    bars: rb.map((c) => ({ t: c.openTime, h: c.high, l: c.low, c: c.close })),
    high: rb.length ? Math.max(...rb.map((c) => c.high)) : null,
    low: rb.length ? Math.min(...rb.map((c) => c.low)) : null,
    provenance: (rb.length ? 'REAL' : 'UNAVAILABLE') as Provenance,
  }
  const byDay = new Map<string, number[]>()
  for (const c of candles) {
    const et = toET(c.openTime)
    const row = byDay.get(et.dateKey) ?? Array<number>(24).fill(0)
    row[et.hour] += c.volume
    byDay.set(et.dateKey, row)
  }
  const days = [...byDay.keys()].sort().slice(-7)
  const grid = days.map((k) => byDay.get(k)!)
  const heat = { days, grid, max: grid.length ? Math.max(0, ...grid.flat()) : 0, provenance: (days.length ? 'REAL' : 'UNAVAILABLE') as Provenance }

  return {
    note: 'A picture of the live state, drawn from the same readings as the six agents. Shape and motion follow real votes and the real tape; an unread feed draws as UNAVAILABLE. Nothing here is a forecast, and none of it is a track record.',
    panel: { votes, score: d ? Math.round(d.score) : null, enterScore: d ? d.enterScore : null, action: d ? d.action : 'NO DECISION', direction: d?.direction ?? null, regime: d?.regime ?? null },
    flow: { trusted, imbalance, tapePerMin, tapeLabel, deltaShare, largeNetUsd, provenance: flowProv, asOf: (imbF?.asOf ?? tapeF?.asOf ?? null) || null },
    volatility: { ratio: vol?.ratio ?? null, label: vol?.label ?? null },
    stats,
    volume, range, heat,
    pulse: { perMin: tapePerMin, label: tapeLabel, provenance: tapePerMin === null ? 'UNAVAILABLE' : flowProv },
  }
}

/** The whole desk. Pure over its input; the server assembles the input. */
/** Give an agent its plain-English name and the line he'd say about it. */
function dress(a: AgentCore): DeskAgent {
  const n = AGENT_NAMES[a.id] ?? { title: a.name, plain: a.role }
  return { ...a, title: n.title, plain: n.plain, line: agentLine(a) }
}

export function buildDesk(input: DeskInput): DeskReport {
  const agents = [bookAgent(input), tapeAgent(input), signalAgent(input), riskAgent(input), regimeAgent(input), proofAgent(input)].map(dress)
  const decision = input.decision
  const risk = input.risk

  // What the floor would actually do: the fused action AFTER the veto chain.
  let verdict = 'NO TRADE'
  let verdictDetail = 'Nothing is proposed.'
  if (decision && (decision.action === 'LONG' || decision.action === 'SHORT')) {
    if (risk && !risk.approved) {
      verdict = 'VETOED'
      verdictDetail = `${decision.action} was proposed and the ${risk.vetoedBy} check refused it. ${risk.reason}`
    } else if (risk && risk.approved) {
      verdict = decision.action
      verdictDetail = `${decision.action} cleared the whole veto chain at size ${risk.quantity}.`
    } else {
      verdict = `${decision.action} (UNCHECKED)`
      verdictDetail = `${decision.action} is proposed but has not been through the risk chain in this view.`
    }
  } else if (decision) {
    verdict = decision.action
    // The fused reason already opens with the action ("LONG WATCH — a long lean
    // at 9/100…"), and the verdict is shown right next to it, so strip the
    // repeat rather than render "LONG WATCH — LONG WATCH — …".
    verdictDetail = decision.reason.replace(new RegExp(`^${decision.action}\\s*[—-]\\s*`), '')
  }

  const v = input.validation
  const trust = trustScore(agents)
  const blind = agents.filter((a) => a.status === 'BLIND').map((a) => a.title)
  const facts = {
    verdict, verdictDetail, trust, blind,
    evidence: v?.verdict ?? 'NO EVIDENCE',
    gatesMet: v?.metCount ?? 0, gatesTotal: v?.total ?? 0, paperTrades: v?.trades ?? 0,
    symbol: input.symbol,
  }
  return {
    generatedAt: input.now,
    tradingDay: tradingDayKey(input.now),
    symbol: input.symbol,
    interval: input.interval,
    mode: 'PAPER',
    liveTradingEnabled: LIVE_TRADING_ENABLED as boolean,
    agents,
    floor: {
      verdict, verdictDetail, trust, blind,
      evidence: v?.verdict ?? 'NO EVIDENCE',
      evidenceDetail: v
        ? `${v.metCount}/${v.total} validation gates on ${v.trades} paper trades.`
        : 'No validation report could be read.',
      gates: { met: v?.metCount ?? 0, total: v?.total ?? 0 },
    },
    voice: {
      floor: floorLine(facts),
      trust: trustLine(facts.trust, facts.blind),
      evidence: evidenceLine(facts),
    },
    core: buildCore(input),
  }
}

/** The desk as plain text — for a terminal, a cron, or a glance. */
export function renderDesk(d: DeskReport): string {
  const L: string[] = []
  L.push(`THE DESK — ${d.symbol} ${d.interval} — trading day ${d.tradingDay} (rolls 18:00 ET)`)
  L.push(`${d.mode} · live trading ${d.liveTradingEnabled ? 'ENABLED(!)' : 'disabled'}`)
  L.push('')
  L.push(d.voice.floor)
  L.push(d.voice.trust)
  L.push(d.voice.evidence)
  L.push('')
  L.push(`FLOOR: ${d.floor.verdict} — ${d.floor.verdictDetail}`)
  L.push(`TRUST: ${d.floor.trust}/100 of the desk can see${d.floor.blind.length ? ` · blind: ${d.floor.blind.join(', ')}` : ''}`)
  L.push(`EVIDENCE: ${d.floor.evidence} — ${d.floor.evidenceDetail}`)
  L.push('')
  for (const a of d.agents) {
    const age = a.ageSec === null ? '' : ` · ${a.ageSec}s old`
    L.push(`[${a.status.padEnd(7)}] ${a.title.padEnd(13)} ${a.headline.padEnd(16)} ${a.provenance}${age}`)
    L.push(`          ${a.plain}`)
    L.push(`          ${a.line}`)
    L.push(`          ${a.detail}`)
    if (a.waitingOn) L.push(`          WAITING ON: ${a.waitingOn}`)
    L.push('')
  }
  L.push('This desk reports state. It does not decide anything: the engine decides,')
  L.push('the risk chain vetoes, and nothing here can place, size or shape an order.')
  return L.join('\n')
}
