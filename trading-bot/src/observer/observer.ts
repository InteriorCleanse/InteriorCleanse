/**
 * THE MARKET OBSERVER — runs after every watch cycle, off the bus, and records
 * what the engine saw on the candle that just closed and what the paper trader
 * did. It manufactures nothing: engine events come from the same step diff the
 * case-study engine uses (`detectAt`), paper events from the positions table,
 * news events from the blackout list, order-flow events from the tape report.
 *
 * Two passes:
 *
 *   observeCycle   — the live pass: events on this candle, scored, recorded
 *                    (deterministic ids: a restart cannot double-record), and
 *                    selected ones become CANDIDATES with a BEFORE summary that
 *                    contains only what was knowable at the close.
 *   resolveCandidates — the later pass: once the horizon candles are stored,
 *                    the candidate is rebuilt as a full case study by the
 *                    case-study engine (so the AFTER frame comes from stored
 *                    candles, never from memory), audited for hindsight, and
 *                    put in the vault. LIVE OBSERVATION → RESULT REVEALED.
 *
 * Read-only over the engine. The one write outside the observations table is
 * the excursion reconciliation of a closed paper record (paper/reconcile.ts).
 */

import { config } from '../../config.ts'
import { SAMPLE_BARS } from '../analyst/cohorts.ts'
import { fromPaperPosition } from '../analyst/records.ts'
import type { Snapshot } from '../bot.ts'
import { addItem, getItem } from '../knowledge/vault.ts'
import { INTERVAL_MS } from '../market.ts'
import { noTradeJournal } from '../paper/validation.ts'
import { reconcileExcursions } from '../paper/reconcile.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { readPositions } from '../paperTrader.ts'
import { caseStudyItem, casesFromSteps, detectAt, hindsightFindings, paperCases, stepEngine } from '../school/caseStudies.ts'
import type { CaseKind, CaseStudy, RawEvent, Step } from '../school/caseStudies.ts'
import { SILVER_BULLET_HOURS } from '../strategies/silverBullet.ts'
import { store } from '../store.ts'
import type { Candle } from '../types.ts'
import { listObservations, makeObservation, recordObservation, updateObservation } from './events.ts'
import type { NewObservation, Observation, ObservationType } from './events.ts'
import { scoreSignificance } from './significance.ts'
import type { SignificanceInput } from './significance.ts'

export const HORIZON = 24
const WARMUP_MS = 2 * 86_400_000

const KIND_TO_TYPE: Record<CaseKind, ObservationType> = {
  'liquidity-sweep': 'LIQUIDITY EVENT', bos: 'STRUCTURE CHANGE', choch: 'STRUCTURE CHANGE',
  'fvg-created': 'FVG CREATED', 'fvg-retest': 'FVG RETEST', 'fvg-inverted': 'FVG RETEST',
  'order-block-interaction': 'ORDER BLOCK EVENT', 'breaker-formation': 'BREAKER EVENT',
  'unicorn-setup': 'UNICORN EVENT', 'turtle-soup-setup': 'TURTLE SOUP EVENT', 'silver-bullet-setup': 'STRATEGY ACTIVATION', 'strategy-setup': 'STRATEGY ACTIVATION',
  'strategy-rejection': 'STRATEGY REJECTION', 'large-displacement': 'ANOMALY', 'regime-transition': 'REGIME CHANGE', 'session-transition': 'SESSION CHANGE', 'volatility-expansion': 'VOLATILITY CHANGE',
  'risk-veto': 'RISK VETO', 'exceptional-mfe': 'UNUSUAL MFE', 'exceptional-mae': 'UNUSUAL MAE', 'unexpected-strategy-failure': 'PAPER EXIT',
}

// ---------------------------------------------------------------
// In-process state: the previous step (for the diff) and the seen positions
// ---------------------------------------------------------------

let prevStep: Step | null = null
const SEEN_KEY = 'observer:positions'

function seenPositions(): Record<string, string> { return store().getJson<Record<string, string>>(SEEN_KEY) ?? {} }
function rememberPositions(m: Record<string, string>): void { store().setJson(SEEN_KEY, m) }

/** Tests reset the in-memory step between scenarios. */
export function resetObserver(): void { prevStep = null }

function stepOf(snap: Snapshot): Step | null {
  if (!snap.analysis || !snap.candles.length) return null
  const i = snap.candles.length - 1
  return { index: i, candle: snap.candles[i], analysis: snap.analysis, votes: snap.strategyVotes, decision: snap.decision ?? null }
}

function beforeOf(prev: Step | null, cur: Step): Observation['before'] {
  const a = prev?.analysis ?? null
  const votes = prev?.votes ?? []
  const near = votes.filter((v) => v.action === 'HOLD' && v.evidence.filter((e) => e.passed).length >= 2 && v.evidence.filter((e) => !e.passed).length === 1).length
  const sweeps = a ? [...a.sweepsToday, ...a.swingSweepsToday] : []
  const lastSweep = sweeps.length ? sweeps[sweeps.length - 1] : null
  return {
    structureTrend: a?.structureTrend ?? null,
    liquidity: lastSweep ? `${lastSweep.level.label} swept from ${lastSweep.side}` : a ? 'no sweep yet today' : null,
    regime: a?.features?.regime?.value?.state ?? null,
    session: a?.session ?? null,
    strategiesActive: votes.filter((v) => v.action === 'BUY' || v.action === 'SELL').length,
    strategiesNear: near,
    risk: prev?.decision ? (prev.decision.action === 'LONG' || prev.decision.action === 'SHORT' ? 'candidate for the risk chain' : 'no approval sought') : null,
    price: prev?.candle.close ?? (cur.candle.open ?? null),
  }
}

// ---------------------------------------------------------------
// The live pass
// ---------------------------------------------------------------

export type CycleResult = { at: number; candle: number | null; recorded: Observation[]; duplicates: number; skipped: string | null }

export function observeCycle(snap: Snapshot, at = Date.now()): CycleResult {
  const cur = stepOf(snap)
  if (!cur) return { at, candle: null, recorded: [], duplicates: 0, skipped: 'no analysis on this cycle' }
  const out: Observation[] = []
  let duplicates = 0
  const push = (n: NewObservation) => { const r = recordObservation(makeObservation(n)); if (r.isNew) out.push(r.observation); else duplicates++ }
  const a = cur.analysis
  const common = { session: a.session, regime: a.features?.regime?.value?.state ?? null, volatility: a.features?.volatility?.value?.label ?? null }
  const volRatio = a.features?.volatility?.value?.ratio ?? null
  const before = beforeOf(prevStep, cur)

  const sameCandle = prevStep !== null && prevStep.candle.openTime === cur.candle.openTime
  if (!sameCandle) {
    // Engine events from the step diff — the same detector the case-study engine uses.
    const events: RawEvent[] = detectAt(prevStep, cur)
    const buys = (cur.votes ?? []).filter((v) => v.action === 'BUY').length
    const sells = (cur.votes ?? []).filter((v) => v.action === 'SELL').length
    const near = (cur.votes ?? []).filter((v) => v.action === 'HOLD' && v.evidence.filter((e) => e.passed).length >= 2 && v.evidence.filter((e) => !e.passed).length === 1).length
    for (const ev of events) {
      const type = KIND_TO_TYPE[ev.kind]
      const sig: SignificanceInput = { type, volRatio }
      if (ev.kind === 'large-displacement') sig.rangeAtr = a.atr > 0 ? (cur.candle.high - cur.candle.low) / a.atr : null
      if (ev.kind === 'liquidity-sweep') { const s = [...a.sweepsToday, ...a.swingSweepsToday].find((x) => `${x.level.kind}:${x.time}` === ev.refId); sig.sweepDepthAtr = s?.depthAtr ?? null }
      if (ev.kind === 'fvg-created') { const f = a.fvgs.find((x) => x.id === ev.refId); sig.gapSizeAtr = f?.sizeAtr ?? null; sig.fromDisplacement = f?.fromDisplacement ?? null }
      if (type === 'STRATEGY ACTIVATION' || type === 'STRATEGY REJECTION' || type === 'UNICORN EVENT' || type === 'TURTLE SOUP EVENT') sig.votes = { buys, sells, nearMisses: near }
      if (ev.kind === 'regime-transition') { sig.regimeFrom = prevStep?.analysis.features?.regime?.value?.state ?? null; sig.regimeTo = ev.direction }
      push({
        time: cur.candle.closeTime, availableAt: Math.max(ev.knownAt, cur.candle.closeTime), ...common,
        type, source: type === 'STRATEGY ACTIVATION' || type === 'STRATEGY REJECTION' || type === 'UNICORN EVENT' || type === 'TURTLE SOUP EVENT' ? 'strategy-votes' : type === 'REGIME CHANGE' || type === 'VOLATILITY CHANGE' ? 'features' : 'engine-step',
        detail: ev.detail, direction: ev.direction,
        evidence: [{ field: 'caseKind', value: ev.kind }, { field: 'candle.closeTime', value: cur.candle.closeTime }, { field: 'refId', value: ev.refId ?? null }, { field: 'atr', value: a.atr }],
        caseKind: ev.kind, recordId: null, significance: scoreSignificance(sig), before, refId: ev.refId ?? ev.kind,
      })
    }
    // Silver-bullet window opening: the hour in New York time entered one of the three windows.
    const hour = Number(a.etClock.split(':')[0])
    const prevHour = prevStep ? Number(prevStep.analysis.etClock.split(':')[0]) : null
    if (prevStep && hour !== prevHour && SILVER_BULLET_HOURS.includes(hour)) {
      push({ time: cur.candle.closeTime, availableAt: cur.candle.closeTime, ...common, type: 'SILVER BULLET WINDOW', source: 'engine-step', detail: `The ${a.etClock} ET silver-bullet window opened.`, direction: null, evidence: [{ field: 'etClock', value: a.etClock }], caseKind: null, recordId: null, significance: scoreSignificance({ type: 'SILVER BULLET WINDOW', volRatio }), before, refId: `sb-${hour}` })
    }
    // News: a blackout that began within this candle.
    for (const b of snap.news?.blackouts ?? []) {
      if (prevStep && b.start > prevStep.candle.closeTime && b.start <= cur.candle.closeTime) {
        push({ time: b.start, availableAt: cur.candle.closeTime, ...common, type: 'NEWS EVENT', source: 'news', detail: `High-impact blackout began: ${b.title}.`, direction: null, evidence: [{ field: 'blackout.start', value: b.start }, { field: 'blackout.end', value: b.end }, { field: 'title', value: b.title }], caseKind: null, recordId: null, significance: scoreSignificance({ type: 'NEWS EVENT', newsImpact: 'High', volRatio }), before, refId: b.title })
      }
    }
    // Order flow: the tape report's own counts, when the tape is there.
    const tape = snap.flow?.tape ?? null
    if (tape && (tape.bigTrades.length >= 3 || Math.abs(tape.deltaUsd) >= config.orderflow.bigTradeUsd * 5)) {
      push({ time: cur.candle.closeTime, availableAt: cur.candle.closeTime, ...common, type: 'ORDER FLOW EVENT', source: 'order-flow', detail: `${tape.bigTrades.length} large print(s), delta ${Math.round(tape.deltaUsd / 1000)}k over ${tape.trades} trades in the window.`, direction: tape.deltaUsd >= 0 ? 'buy' : 'sell', evidence: [{ field: 'tape.bigTrades', value: tape.bigTrades.length }, { field: 'tape.deltaUsd', value: Math.round(tape.deltaUsd) }, { field: 'tape.trades', value: tape.trades }], caseKind: null, recordId: null, significance: scoreSignificance({ type: 'ORDER FLOW EVENT', volRatio, flow: { bigTrades: tape.bigTrades.length, deltaUsd: tape.deltaUsd, bigTradeUsd: config.orderflow.bigTradeUsd } }), before, refId: String(tape.to) })
    }
    // A data anomaly: a hole between the previous candle and this one.
    const stepMs = INTERVAL_MS[config.interval] ?? 300_000
    if (prevStep && cur.candle.openTime - prevStep.candle.openTime > stepMs * 1.5) {
      push({ time: cur.candle.openTime, availableAt: cur.candle.closeTime, ...common, type: 'ANOMALY', source: 'engine-step', detail: `Candle gap: ${Math.round((cur.candle.openTime - prevStep.candle.openTime) / 60_000)} minutes between consecutive closes.`, direction: null, evidence: [{ field: 'prev.openTime', value: prevStep.candle.openTime }, { field: 'cur.openTime', value: cur.candle.openTime }], caseKind: null, recordId: null, significance: scoreSignificance({ type: 'ANOMALY' }), before, refId: 'gap' })
    }
  }

  // Paper events: what the paper trader did since last time, from the positions table.
  const seen = seenPositions()
  const positions = readPositions()
  const closedAll = positions.closed
  const nextSeen: Record<string, string> = {}
  const cohortOf = (p: PaperPosition) => closedAll.filter((c) => c.strategyId === p.strategyId && c.exitReason !== 'missed' && typeof c.rMultiple === 'number')
  for (const p of [...positions.open, ...closedAll]) {
    nextSeen[p.id] = p.status
    const was = seen[p.id]
    if (was === p.status) continue
    if (p.status === 'open' && was !== 'open') {
      push({ time: p.filledAt ?? p.openedAt, availableAt: Math.max(p.filledAt ?? p.openedAt, cur.candle.closeTime), ...common, type: 'PAPER ENTRY', source: 'paper-trader', detail: `Paper ${p.direction} filled at ${p.entry.toFixed(2)} (${p.strategyId ?? 'session-ifvg'}); stop ${p.stop.toFixed(2)}, target ${p.target.toFixed(2)}.`, direction: p.direction, evidence: [{ field: 'position.id', value: p.id }, { field: 'entry', value: p.entry }, { field: 'stop', value: p.stop }, { field: 'target', value: p.target }, { field: 'snapshot.fusedScore', value: p.snapshot?.fusedScore ?? null }], caseKind: null, recordId: p.id, significance: scoreSignificance({ type: 'PAPER ENTRY', volRatio, votes: { buys: p.direction === 'long' ? 1 : 0, sells: p.direction === 'short' ? 1 : 0, nearMisses: 0 } }), before, refId: p.id })
    }
    if (p.status === 'closed' && was !== 'closed') {
      if (p.exitReason === 'missed') {
        const cat = noTradeJournal([p])[0]?.category ?? 'other'
        push({ time: p.closedAt ?? p.openedAt, availableAt: Math.max(p.closedAt ?? p.openedAt, cur.candle.closeTime), ...common, type: 'RISK VETO', source: 'paper-trader', detail: `A real ${p.direction} setup was refused before it could run (${cat}): ${p.note ?? 'refused'}`, direction: p.direction, evidence: [{ field: 'position.id', value: p.id }, { field: 'note', value: p.note ?? null }, { field: 'category', value: cat }], caseKind: 'risk-veto', recordId: p.id, significance: scoreSignificance({ type: 'RISK VETO', paper: { rMultiple: null, cohortMean: null, cohortSd: null, cohortN: 0, maeR: null, mfeR: null, maeP10: null, mfeP90: null, excursionN: 0, fusedScore: p.snapshot?.fusedScore ?? null, quality: p.quality, enterScore: config.fusion.enterScore, missedCategory: cat } }), before, refId: p.id })
      } else {
        // Reconcile the excursions first, so the record carries them from now on.
        try { reconcileExcursions(p, { now: at }) } catch { /* reconciliation is best-effort; the exit is still observed */ }
        const fresh = readPositions().closed.find((c) => c.id === p.id) ?? p
        const r = fromPaperPosition(fresh)
        const cohort = cohortOf(p).filter((c) => c.id !== p.id).map((c) => c.rMultiple as number)
        const mean = cohort.length ? cohort.reduce((x, y) => x + y, 0) / cohort.length : null
        const sd = cohort.length >= 2 && mean !== null ? Math.sqrt(cohort.reduce((x, y) => x + (y - mean) ** 2, 0) / (cohort.length - 1)) : null
        const withEx = closedAll.filter((c) => c.id !== p.id).map(fromPaperPosition).filter((x) => x.mae.status === 'OBSERVED')
        const pct = (xs: number[], q: number) => { if (!xs.length) return null; const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] }
        const paper: NonNullable<SignificanceInput['paper']> = { rMultiple: r.rMultiple, cohortMean: mean, cohortSd: sd, cohortN: cohort.length, maeR: r.mae.r, mfeR: r.mfe.r, maeP10: pct(withEx.map((x) => x.mae.r as number), 0.1), mfeP90: pct(withEx.map((x) => x.mfe.r as number), 0.9), excursionN: withEx.length, fusedScore: r.fusedScore, quality: r.quality, enterScore: config.fusion.enterScore }
        const sig = scoreSignificance({ type: 'PAPER EXIT', paper })
        const fullChecklist = r.rMultiple !== null && r.rMultiple < 0 && r.fusedScore !== null && r.fusedScore >= config.fusion.enterScore && r.quality !== null && r.quality >= 80
        push({ time: p.closedAt ?? p.openedAt, availableAt: Math.max(p.closedAt ?? p.openedAt, cur.candle.closeTime), session: r.session, regime: r.regime, volatility: r.volatility, type: 'PAPER EXIT', source: 'paper-trader', detail: `Paper ${p.direction} closed ${p.exitReason ?? '—'} at ${r.rMultiple === null ? '—' : `${r.rMultiple >= 0 ? '+' : ''}${r.rMultiple.toFixed(2)}`}R (${r.strategyId}).`, direction: p.direction, evidence: [{ field: 'position.id', value: p.id }, { field: 'rMultiple', value: r.rMultiple }, { field: 'exitReason', value: p.exitReason ?? null }, { field: 'mae.status', value: r.mae.status }, { field: 'mfe.status', value: r.mfe.status }], caseKind: fullChecklist ? 'unexpected-strategy-failure' : null, recordId: p.id, significance: sig, before, refId: p.id })
        if (paper.excursionN >= SAMPLE_BARS.insufficient && paper.maeR !== null && paper.maeP10 !== null && paper.maeR <= paper.maeP10) {
          push({ time: p.closedAt ?? p.openedAt, availableAt: Math.max(p.closedAt ?? p.openedAt, cur.candle.closeTime), session: r.session, regime: r.regime, volatility: r.volatility, type: 'UNUSUAL MAE', source: 'paper-trader', detail: `MAE ${paper.maeR.toFixed(2)}R is at or below the cohort's 10th percentile (${paper.maeP10.toFixed(2)}R over ${paper.excursionN}).`, direction: p.direction, evidence: [{ field: 'position.id', value: p.id }, { field: 'mae.r', value: paper.maeR }, { field: 'cohort.p10', value: paper.maeP10 }], caseKind: 'exceptional-mae', recordId: p.id, significance: scoreSignificance({ type: 'UNUSUAL MAE', paper }), before, refId: p.id })
        }
        if (paper.excursionN >= SAMPLE_BARS.insufficient && paper.mfeR !== null && paper.mfeP90 !== null && paper.mfeR >= paper.mfeP90) {
          push({ time: p.closedAt ?? p.openedAt, availableAt: Math.max(p.closedAt ?? p.openedAt, cur.candle.closeTime), session: r.session, regime: r.regime, volatility: r.volatility, type: 'UNUSUAL MFE', source: 'paper-trader', detail: `MFE ${paper.mfeR.toFixed(2)}R is at or above the cohort's 90th percentile (${paper.mfeP90.toFixed(2)}R over ${paper.excursionN}).`, direction: p.direction, evidence: [{ field: 'position.id', value: p.id }, { field: 'mfe.r', value: paper.mfeR }, { field: 'cohort.p90', value: paper.mfeP90 }], caseKind: 'exceptional-mfe', recordId: p.id, significance: scoreSignificance({ type: 'UNUSUAL MFE', paper }), before, refId: p.id })
        }
      }
    }
  }
  rememberPositions(nextSeen)
  prevStep = cur
  return { at, candle: cur.candle.openTime, recorded: out, duplicates, skipped: null }
}

// ---------------------------------------------------------------
// The later pass: candidates become case studies once the AFTER is stored
// ---------------------------------------------------------------

export type ResolveResult = { at: number; resolved: Array<{ id: string; caseId: string }>; unresolvable: Array<{ id: string; note: string }>; pending: number }

/** Candidates whose horizon is now covered by stored candles are rebuilt as full case studies, audited, and vaulted. Bounded per call. */
export function resolveCandidates(now = Date.now(), opts: { max?: number; candlesBetween?: (symbol: string, interval: string, from: number, to: number) => Candle[] } = {}): ResolveResult {
  const stepMs = INTERVAL_MS[config.interval] ?? 300_000
  const read = opts.candlesBetween ?? ((s, i, from, to) => store().candlesBetween(s, i, from, to))
  const max = opts.max ?? 5
  const candidates = listObservations({ status: 'CANDIDATE', limit: 500 }).sort((a, b) => a.availableAt - b.availableAt)
  const resolved: ResolveResult['resolved'] = []
  const unresolvable: ResolveResult['unresolvable'] = []
  // "Due" is judged against the STORED data, not the clock: a candidate whose horizon candles are not in
  // the store yet is simply not ready, however late it is. Nothing is resolved from candles that do not exist.
  const last = store().lastCandles(config.symbol, config.interval, 1)[0]
  const dataEnd = last ? Math.min(now, last.closeTime) : 0
  let done = 0
  for (const o of candidates) {
    if (done >= max) break
    const due = o.availableAt + (HORIZON + 1) * stepMs
    if (due > dataEnd || !o.caseKind) continue
    done++
    let found: CaseStudy | null = null
    if (o.recordId) {
      const closed = readPositions().closed
      const records = closed.map(fromPaperPosition)
      const missed = closed.filter((p) => p.exitReason === 'missed').map((p) => ({ id: p.id, at: p.closedAt ?? p.openedAt, note: p.note ?? 'refused', direction: p.direction, strategyId: p.strategyId ?? 'session-ifvg' }))
      found = paperCases(records, { missed }).find((c) => c.kind === o.caseKind && c.provenance.recordIds.includes(o.recordId!)) ?? null
    } else {
      const candles = read(o.symbol, o.timeframe, o.availableAt - WARMUP_MS, o.availableAt + (HORIZON + 1) * stepMs)
      if (candles.length > 10) {
        const steps = stepEngine(candles, 60)
        found = casesFromSteps(steps, candles, { horizon: HORIZON, kinds: [o.caseKind as CaseKind] }).find((c) => c.at === o.availableAt) ?? null
      }
    }
    if (!found) {
      unresolvable.push({ id: o.id, note: 'The engine did not reproduce the event over the stored candles, or the candles for its window are not stored. Kept as UNRESOLVABLE, not guessed.' })
      updateObservation({ ...o, status: 'UNRESOLVABLE', resolvedAt: now, resolutionNote: unresolvable[unresolvable.length - 1].note })
      continue
    }
    if (found.evidenceLevel !== 'OBSERVED') { done--; continue } // horizon not yet covered by stored candles; try again later
    const audit = hindsightFindings(found)
    if (audit.length) {
      unresolvable.push({ id: o.id, note: `No-hindsight audit failed: ${audit.join('; ')}` })
      updateObservation({ ...o, status: 'UNRESOLVABLE', resolvedAt: now, resolutionNote: unresolvable[unresolvable.length - 1].note })
      continue
    }
    const item = getItem(found.id) ?? addItem(caseStudyItem(found))
    updateObservation({ ...o, status: 'RESOLVED', caseId: item.id, resolvedAt: now, resolutionNote: `RESULT REVEALED: ${found.after.note}` })
    resolved.push({ id: o.id, caseId: item.id })
  }
  return { at: now, resolved, unresolvable, pending: listObservations({ status: 'CANDIDATE', limit: 500 }).length }
}
