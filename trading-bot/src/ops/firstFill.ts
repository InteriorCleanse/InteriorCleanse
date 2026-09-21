/**
 * FIRST PAPER FILL — the acceptance contract, machine-checked over the
 * durable record and nothing else.
 *
 * The first fill is the earliest simulated fill on record (a position that
 * has a fill time and was not missed). For it, seven groups of checks say
 * whether the whole chain held:
 *
 *   A  market data     the signal and fill candles are stored, aligned,
 *                      contiguous, and were fresh at the decision
 *   B  decision        the decision-time snapshot, its provenance, the risk
 *                      verdict, the frozen profile, PAPER mode stated
 *   C  execution       the paper path and only the paper path; the fill
 *                      price, costs and latency reproduce from the fill model
 *                      over the stored candles
 *   D  state           position, ledger, exposure, reconciliation, no
 *                      duplicate
 *   E  durability      the observer's PAPER ENTRY record, the evidence
 *                      layer's record, the store and its mirror
 *   F  checkpoint      the first-fill checkpoint exists and agrees
 *   G  day report      the permanent day report counts the fill and agrees
 *
 * Every check is PASS, FAIL, MISSING or NOT_APPLICABLE and names the record
 * it read. Missing evidence is never a pass. The verdict is ACCEPTED only
 * when nothing failed and nothing required is missing; WAITING when there is
 * no fill yet. BEFORE (decision-time knowledge) and AFTER (execution and
 * outcome) are built as two separate views, and the existing no-hindsight
 * audit is reused for any case study linked to the record.
 *
 * Nothing here writes to the paper record. The only write is the durable
 * acceptance state under one kv key, so the verdict survives a restart and
 * a later disagreement is surfaced rather than silently replacing an
 * earlier acceptance.
 */

import { existsSync, readFileSync } from 'node:fs'
import { config, LIVE_TRADING_ENABLED } from '../../config.ts'
import { fromPaperPosition } from '../analyst/records.ts'
import { INTERVAL_MS } from '../market.ts'
import { runtimeMode } from '../mode.ts'
import { listObservations } from '../observer/events.ts'
import { FEATURE_VERSION } from '../features/types.ts'
import { getItem } from '../knowledge/vault.ts'
import { tradingDayStart } from '../learning/ops.ts'
import { validationProfile } from '../paper/validation.ts'
import { POSITIONS_PATH, openNotionalUsd, readPositions } from '../paperTrader.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { hindsightFindings } from '../school/caseStudies.ts'
import type { CaseStudy } from '../school/caseStudies.ts'
import { tradingDayKey } from '../sessions.ts'
import { defaultAssumptions, simulateEntry } from '../sim/fills.ts'
import { store } from '../store.ts'
import { VERSION } from '../version.ts'
import { liveFlagSet } from './alerts.ts'
import { listCheckpoints } from './checkpoints.ts'
import { getDayReport, paperDayReport } from './dayReport.ts'
import { reconcileTrade } from './reconcile.ts'

export type CheckStatus = 'PASS' | 'FAIL' | 'MISSING' | 'NOT_APPLICABLE'
export type AcceptanceGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
export type AcceptanceCheck = { id: string; group: AcceptanceGroup; description: string; status: CheckStatus; recordId: string | null; evidence: string | null; reason: string | null }
export type StageStatus = 'PASS' | 'FAIL' | 'WAITING' | 'NOT YET OBSERVED'
export type ChainStage = { name: string; status: StageStatus; checks: string[]; note: string }
export type AcceptanceStatus = 'ACCEPTED' | 'NOT ACCEPTED' | 'WAITING'

export type BeforeView = {
  label: 'BEFORE / DECISION-TIME KNOWLEDGE'
  decidedAt: number
  signalId: string | null
  symbol: string
  interval: string
  session: string
  regime: string | 'unavailable'
  volatility: string | null
  strategyId: string | null
  direction: 'long' | 'short'
  intendedEntry: number
  stop: number
  target: number
  atr: number
  quality: number
  reason: string
  signalCandle: { openTime: number; open: number; high: number; low: number; close: number } | null
  fused: { score: number | null; action: string | null; confirms: string[]; invalidates: string[]; contributors: Array<{ id: string; action: string; confidence: number }> } | null
  evidence: Array<{ step: string; passed: boolean; detail: string }>
  riskChecks: Array<{ rule: string; passed: boolean; detail: string }>
  riskVetoedBy: string | null
  news: { minutesToBlackout: number | null; inBlackout: boolean | null }
  book: { bid: number | null; ask: number | null; spreadPct: number | null; assumedSlippageBps: number | null }
  executionAssumptions: ReturnType<typeof defaultAssumptions>
  versions: { engine: string | null; features: number | null }
}

export type AfterView = {
  label: 'AFTER / EXECUTION AND OUTCOME'
  filledAt: number
  entry: number
  quantity: number
  riskUsd: number
  entryCostUsd: number | null
  latencyMs: number | null
  fillCandle: { openTime: number; open: number; high: number; low: number; close: number } | null
  path: { candles: number; high: number | null; low: number | null; last: number | null; asOf: number }
  status: PaperPosition['status']
  exit: { closedAt: number; exit: number; reason: string; rMultiple: number | null; pnlUsd: number | null; feesUsd: number | null; outcome: string | null; candlesHeld: number | null } | null
  excursions: { mae: number | null; mfe: number | null; reconciledAt: number | null }
  reconciliation: { verdict: string; failed: string[]; incomplete: string[] } | null
  observationIds: string[]
  caseIds: string[]
  postMortemIds: string[]
  checkpoint: { reachedAt: number; reviewed: boolean } | null
  dayReport: { dayKey: string; fills: number; closed: number; signals: number } | null
}

export type FirstFillAcceptance = {
  kind: 'FIRST PAPER FILL ACCEPTANCE'
  at: number
  status: AcceptanceStatus
  dataSource: 'PAPER' | 'MOCK' | 'LIVE'
  execution: 'SIMULATED EXECUTION'
  position: { id: string; signalId: string | null; openedAt: number; filledAt: number; direction: string; strategyId: string | null; status: PaperPosition['status']; closedAt: number | null } | null
  checks: AcceptanceCheck[]
  chain: ChainStage[]
  before: BeforeView | null
  after: AfterView | null
  hindsight: { status: CheckStatus; findings: string[]; note: string }
  summary: { passed: number; failed: number; missing: number; notApplicable: number }
  durable: { acceptedAt: number | null; firstEvaluatedAt: number | null; lastEvaluatedAt: number | null; regressed: boolean; regressionNote: string | null; humanReviewed: boolean }
  note: string
}

type DurableState = { positionId: string | null; status: AcceptanceStatus; acceptedAt: number | null; firstEvaluatedAt: number; lastEvaluatedAt: number; failed: string[]; missing: string[]; regressed: boolean; regressionNote: string | null; history: Array<{ at: number; status: AcceptanceStatus }> }

const KEY = 'ops:first-fill'
const STAGES: Array<{ name: string; checks: string[] }> = [
  { name: 'Market Data', checks: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'] },
  { name: 'Decision', checks: ['B1', 'B2', 'B3', 'B4', 'B6'] },
  { name: 'Risk', checks: ['B5', 'B7'] },
  { name: 'Paper Execution', checks: ['C1', 'C2', 'C3'] },
  { name: 'Fill', checks: ['C4', 'C5', 'C6', 'C7'] },
  { name: 'Position', checks: ['D1', 'D3', 'D5'] },
  { name: 'Reconciliation', checks: ['D2', 'D4'] },
  { name: 'Durable Record', checks: ['E1', 'E2', 'E3'] },
  { name: 'Checkpoint', checks: ['F1', 'F2'] },
  { name: 'Day Report', checks: ['G1', 'G2', 'G3'] },
]

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b))

export function dataSourceLabel(): 'PAPER' | 'MOCK' | 'LIVE' {
  const live = liveFlagSet()
  if (live.config || live.env) return 'LIVE'
  return process.env.MRCASH_MARKET_URL ? 'MOCK' : 'PAPER'
}

/** The earliest simulated fill on record, or null. Missed orders are not fills. */
export function firstFilledPosition(): PaperPosition | null {
  const p = readPositions()
  const all = [...p.open, ...p.closed].filter((x) => x.filledAt !== undefined && x.exitReason !== 'missed')
  if (!all.length) return null
  return all.sort((a, b) => (a.filledAt! - b.filledAt!) || a.openedAt - b.openedAt)[0]
}

export function readFirstFillState(): DurableState | null { return store().getJson<DurableState>(KEY) }

/** A stable fingerprint of the frozen profile as it stands now (what the record was measured under). */
function profileFingerprint(): string {
  const p = validationProfile(VERSION)
  let h = 2166136261
  for (const ch of JSON.stringify({ ...p, version: undefined })) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return `${p.profile}@${h.toString(36)}`
}

export function evaluateFirstFill(opts: { now?: number; persist?: boolean } = {}): FirstFillAcceptance {
  const now = opts.now ?? Date.now()
  const step = INTERVAL_MS[config.interval] ?? 300_000
  const checks: AcceptanceCheck[] = []
  const add = (id: string, group: AcceptanceGroup, description: string, status: CheckStatus, recordId: string | null, evidence: string | null, reason: string | null = null) => { checks.push({ id, group, description, status, recordId, evidence, reason }) }
  const source = dataSourceLabel()
  const p = firstFilledPosition()

  if (!p) {
    const chain: ChainStage[] = STAGES.map((s) => ({ name: s.name, status: 'NOT YET OBSERVED', checks: s.checks, note: 'No paper fill has occurred.' }))
    const durable = persistState(null, 'WAITING', [], [], now, opts.persist !== false)
    return {
      kind: 'FIRST PAPER FILL ACCEPTANCE', at: now, status: 'WAITING', dataSource: source, execution: 'SIMULATED EXECUTION', position: null, checks: [], chain, before: null, after: null,
      hindsight: { status: 'NOT_APPLICABLE', findings: [], note: 'No record to audit.' }, summary: { passed: 0, failed: 0, missing: 0, notApplicable: 0 },
      durable: { acceptedAt: null, firstEvaluatedAt: durable.firstEvaluatedAt, lastEvaluatedAt: durable.lastEvaluatedAt, regressed: false, regressionNote: null, humanReviewed: false },
      note: 'WAITING FOR FIRST REAL PAPER FILL — NOT ENOUGH REAL PAPER DATA. A lack of trades is data; nothing is manufactured to fill this screen.',
    }
  }

  const id = p.id
  const filledAt = p.filledAt!
  const snap = p.snapshot
  const signalId = snap?.signalId ?? null
  const all = [...readPositions().open, ...readPositions().closed]
  const candles = store().candlesBetween(config.symbol, config.interval, p.openedAt - 3 * step, Math.max(filledAt, p.closedAt ?? filledAt) + step)
  const signalCandle = candles.find((c) => c.openTime <= p.openedAt && c.closeTime >= p.openedAt) ?? null
  const fillCandle = candles.find((c) => c.openTime === filledAt) ?? null

  // ---- A. market data --------------------------------------------------
  add('A1', 'A', 'The process is on live exchange data in PAPER mode (not a recorded or synthetic feed, not LIVE)', source === 'PAPER' ? 'PASS' : 'FAIL', id, `data source ${source}`, source === 'PAPER' ? null : source === 'MOCK' ? 'MRCASH_MARKET_URL is set: a recorded feed is not market evidence' : 'the live flag is set')
  add('A2', 'A', 'The signal candle (the close the decision was made on) is stored', signalCandle ? 'PASS' : 'MISSING', id, signalCandle ? `candle ${new Date(signalCandle.openTime).toISOString()} (${signalCandle.source})` : null, signalCandle ? null : `no stored candle covers ${new Date(p.openedAt).toISOString()}`)
  add('A3', 'A', 'The fill candle (whose open the fill used) is stored', fillCandle ? 'PASS' : 'MISSING', id, fillCandle ? `candle ${new Date(fillCandle.openTime).toISOString()} open ${fillCandle.open}` : null, fillCandle ? null : `no stored candle opens at ${new Date(filledAt).toISOString()}`)
  if (signalCandle && fillCandle) {
    const expectedGap = Math.max(1, defaultAssumptions().latencyCandles) * step
    const gap = fillCandle.openTime - signalCandle.openTime
    add('A4', 'A', 'Signal and fill candles are contiguous (no unresolved gap between them)', gap === expectedGap ? 'PASS' : 'FAIL', id, `${gap / step} interval(s) apart, ${expectedGap / step} expected`, gap === expectedGap ? null : 'a candle is missing between the decision and the fill')
  } else add('A4', 'A', 'Signal and fill candles are contiguous', 'MISSING', id, null, 'one of the candles is not stored')
  add('A5', 'A', 'Timestamps sit on the exchange clock (candle opens aligned to the interval)', (signalCandle ? signalCandle.openTime % step === 0 : true) && filledAt % step === 0 ? 'PASS' : 'FAIL', id, `fill at ${new Date(filledAt).toISOString()}`, filledAt % step === 0 ? null : 'the fill time is not a candle open')
  const fresh = snap?.riskChecks.find((c) => /fresh|stale|candle age/i.test(c.rule)) ?? null
  add('A6', 'A', 'The data was fresh at the decision (the risk engine\'s freshness check passed at decision time)', fresh ? (fresh.passed ? 'PASS' : 'FAIL') : 'MISSING', id, fresh ? `${fresh.rule}: ${fresh.detail}` : null, fresh ? (fresh.passed ? null : fresh.detail) : 'no freshness check on the decision snapshot')
  const knownGaps = store().getJson<Array<{ from: number; to: number }>>(`candles:known-gaps:${config.symbol}:${config.interval}`) ?? []
  const overlapping = knownGaps.filter((g) => g.to >= p.openedAt - step && g.from <= filledAt)
  add('A7', 'A', 'No exchange gap the store could not fill touches the decision window', overlapping.length ? 'FAIL' : 'PASS', id, `${knownGaps.length} known gap(s) on record`, overlapping.length ? `${overlapping.length} known gap(s) overlap the window` : null)

  // ---- B. decision -------------------------------------------------------
  add('B1', 'B', 'A strategy decision exists on the immutable record', 'PASS', id, `position ${id}, ${p.direction} ${p.setupKey}`)
  add('B2', 'B', 'The decision carries its timestamp and trading day', Number.isFinite(p.openedAt) && p.dayKey === tradingDayKey(p.openedAt) ? 'PASS' : 'FAIL', id, `decided ${new Date(p.openedAt).toISOString()} · day ${p.dayKey}`, p.dayKey === tradingDayKey(p.openedAt) ? null : `dayKey ${p.dayKey} ≠ ${tradingDayKey(p.openedAt)}`)
  add('B3', 'B', 'Decision provenance is recorded (signal id, symbol, interval, engine and feature versions)', snap && snap.signalId && snap.engineVersion && typeof snap.featureVersion === 'number' ? 'PASS' : 'MISSING', id, snap ? `${snap.signalId} · ${snap.symbol} ${snap.interval} · engine ${snap.engineVersion} · features ${snap.featureVersion}` : null, snap ? null : 'no decision-time snapshot on the record')
  add('B4', 'B', 'Decision-time inputs are recorded (the strategy\'s evidence steps and the fused votes)', snap ? (snap.evidence.length ? 'PASS' : 'MISSING') : 'MISSING', id, snap ? `${snap.evidence.length} evidence step(s), ${snap.contributors.length} contributor(s), fused ${snap.fusedAction ?? '—'} ${snap.fusedScore ?? '—'}` : null, snap?.evidence.length ? null : 'no evidence steps on the snapshot')
  add('B5', 'B', 'A risk verdict exists and approved the order', snap ? (snap.riskChecks.length ? (snap.riskVetoedBy === null ? 'PASS' : 'FAIL') : 'MISSING') : 'MISSING', id, snap ? `${snap.riskChecks.length} check(s), ${snap.riskChecks.filter((c) => c.passed).length} passed, vetoed by ${snap.riskVetoedBy ?? 'nothing'}` : null, snap?.riskVetoedBy ? `vetoed by ${snap.riskVetoedBy} yet filled` : snap?.riskChecks.length ? null : 'no risk checks on the snapshot')
  const fp = profileFingerprint()
  add('B6', 'B', 'The frozen configuration identity is recorded (engine and feature versions on the snapshot; the profile it is measured under)', snap && snap.engineVersion ? 'PASS' : 'MISSING', id, snap ? `recorded engine ${snap.engineVersion} / features ${snap.featureVersion}; running engine ${VERSION} / features ${FEATURE_VERSION}; profile ${fp}${snap.engineVersion !== VERSION ? ' (the record was written by a different build)' : ''}` : null, snap?.engineVersion ? null : 'no engine version on the snapshot')
  const ledgerRows = store().readLedger().filter((r) => r.mode === 'live-paper' && r.reason.includes(p.setupKey))
  add('B7', 'B', 'PAPER mode is explicit (runtime mode, live flag unset, ledger rows in paper mode)', runtimeMode() === 'paper' && !LIVE_TRADING_ENABLED && !liveFlagSet().env && ledgerRows.every((r) => r.mode === 'live-paper') ? 'PASS' : 'FAIL', id, `mode ${runtimeMode()}, live flag ${LIVE_TRADING_ENABLED || liveFlagSet().env ? 'SET' : 'unset'}`, runtimeMode() === 'paper' ? null : `runtime mode is ${runtimeMode()}`)

  // ---- C. execution ------------------------------------------------------
  add('C1', 'C', 'The paper execution path produced the fill (a filled, not missed, position)', p.exitReason !== 'missed' && (p.status === 'open' || p.status === 'closed') ? 'PASS' : 'FAIL', id, `status ${p.status}`, null)
  add('C2', 'C', 'No LIVE execution path was invoked', !config.live.enabled && !LIVE_TRADING_ENABLED && !liveFlagSet().env ? 'PASS' : 'FAIL', id, 'live gate closed in config and environment; this build has no live order store', null)
  const shadow = store().getJson<Array<{ at?: number; time?: number }>>('shadow:orders') ?? []
  add('C3', 'C', 'No SHADOW execution path was invoked', !config.shadow.enabled && shadow.length === 0 ? 'PASS' : 'FAIL', id, `shadow ${config.shadow.enabled ? 'enabled' : 'off'}, ${shadow.length} shadow order(s) on record`, shadow.length ? 'shadow orders exist on this store' : null)
  const a = defaultAssumptions()
  if (signalCandle && fillCandle) {
    const sIdx = candles.indexOf(signalCandle)
    const r = simulateEntry({ direction: p.direction, intendedEntry: p.intendedEntry, stop: p.stop, target: p.target, atr: p.atr }, candles, sIdx, a)
    if (r.filled) {
      add('C4', 'C', 'The fill price reproduces from the fill model over the stored candles (next open plus spread and slippage)', near(r.fill.price, p.entry) && r.fill.time === filledAt ? 'PASS' : 'FAIL', id, `model ${r.fill.price} at ${new Date(r.fill.time).toISOString()} · record ${p.entry} at ${new Date(filledAt).toISOString()}`, near(r.fill.price, p.entry) ? null : 'the recorded entry is not what the model gives for these candles')
      const cost = r.fill.costPerUnit * p.quantity
      add('C5', 'C', 'Spread and slippage were charged as modelled', p.entryCostUsd === undefined ? 'MISSING' : near(cost, p.entryCostUsd, 1e-6) ? 'PASS' : 'FAIL', id, `model ${cost.toFixed(6)} · record ${p.entryCostUsd ?? '—'}`, p.entryCostUsd === undefined ? 'no entry cost on the record' : near(cost, p.entryCostUsd, 1e-6) ? null : 'entry cost differs from the model')
    } else {
      add('C4', 'C', 'The fill price reproduces from the fill model', 'FAIL', id, `model says ${r.reason}: ${r.detail}`, 'the model would not have filled on these candles')
      add('C5', 'C', 'Spread and slippage were charged as modelled', 'NOT_APPLICABLE', id, null, 'no model fill to compare')
    }
  } else {
    add('C4', 'C', 'The fill price reproduces from the fill model', 'MISSING', id, null, 'candles missing')
    add('C5', 'C', 'Spread and slippage were charged as modelled', 'MISSING', id, null, 'candles missing')
  }
  add('C6', 'C', 'Latency is recorded and equals the time from decision to fill', p.latencyMs === undefined ? 'MISSING' : p.latencyMs === Math.max(0, filledAt - p.openedAt) ? 'PASS' : 'FAIL', id, `${p.latencyMs ?? '—'} ms`, p.latencyMs === undefined ? 'no latency on the record' : null)
  add('C7', 'C', 'The fill has a timestamp and an identifier', Number.isFinite(filledAt) && typeof id === 'string' && id.length > 0 ? 'PASS' : 'FAIL', id, `${id} @ ${new Date(filledAt).toISOString()}`)

  // ---- D. state ----------------------------------------------------------
  add('D1', 'D', 'Position state reflects the fill (size and risk on the record; open positions are listed as open)', p.quantity > 0 && p.riskUsd > 0 && (p.status !== 'open' || readPositions().open.some((x) => x.id === id)) ? 'PASS' : 'FAIL', id, `${p.quantity} @ ${p.entry}, risk ${p.riskUsd.toFixed(4)}, status ${p.status}`)
  const closeRows = store().readLedger().filter((r) => r.mode === 'live-paper' && r.action !== 'SKIP' && p.closedAt !== undefined && r.timestamp === new Date(p.closedAt).toISOString() && near(r.price, p.entry) && near(r.quantity, p.quantity))
  const skipRows = store().readLedger().filter((r) => r.mode === 'live-paper' && r.action === 'SKIP' && r.reason.startsWith(p.setupKey) && r.timestamp === new Date(p.openedAt).toISOString())
  if (p.status === 'closed') add('D2', 'D', 'The paper ledger holds exactly one row for the close and none marking this signal missed', closeRows.length === 1 && skipRows.length === 0 ? 'PASS' : 'FAIL', id, `${closeRows.length} close row(s), ${skipRows.length} missed row(s)`, closeRows.length === 1 && skipRows.length === 0 ? null : 'ledger disagrees with the record')
  else add('D2', 'D', 'The paper ledger reflects the trade', skipRows.length ? 'FAIL' : 'NOT_APPLICABLE', id, 'the ledger is written at the close', skipRows.length ? 'a missed row exists for a signal that filled' : 'position still open')
  add('D3', 'D', 'Exposure reflects the fill', p.status === 'open' ? (openNotionalUsd() + 1e-9 >= p.entry * p.quantity ? 'PASS' : 'FAIL') : 'NOT_APPLICABLE', id, p.status === 'open' ? `open notional ${openNotionalUsd().toFixed(2)} ≥ ${(p.entry * p.quantity).toFixed(2)}` : 'closed: no exposure')
  if (p.status === 'closed') {
    const rec = reconcileTrade(p)
    add('D4', 'D', 'Reconciliation of the closed trade against the fill model and the candles', rec.verdict === 'CONSISTENT' ? 'PASS' : rec.verdict === 'INCOMPLETE' ? 'MISSING' : 'FAIL', id, `${rec.verdict}: ${rec.checks.filter((c) => c.ok).length}/${rec.checks.length} checks`, rec.verdict === 'CONSISTENT' ? null : rec.verdict === 'MISMATCH' ? rec.checks.filter((c) => !c.ok).map((c) => `${c.name}: expected ${c.expected}, actual ${c.actual}`).join('; ') : rec.incomplete.join('; '))
  } else add('D4', 'D', 'Reconciliation of the closed trade', 'NOT_APPLICABLE', id, 'runs at the close; the fill itself is reconciled by C4–C6', 'position still open')
  const dupes = all.filter((x) => x.id !== id && ((signalId && x.snapshot?.signalId === signalId) || (x.setupKey === p.setupKey && x.openedAt === p.openedAt)))
  const dupIds = all.filter((x) => x.id === id).length
  add('D5', 'D', 'No duplicate fill or record for this signal', dupes.length === 0 && dupIds === 1 ? 'PASS' : 'FAIL', id, `${dupes.length} other record(s) for ${signalId ?? `${p.setupKey}@${p.openedAt}`}; ${dupIds} record(s) with this id`, dupes.length || dupIds !== 1 ? 'the same signal produced more than one record' : null)

  // ---- E. durability -----------------------------------------------------
  const obs = listObservations({ limit: 100_000 }).filter((o) => o.recordId === id)
  const entryObs = obs.find((o) => o.type === 'PAPER ENTRY') ?? null
  add('E1', 'E', 'The observer recorded the PAPER ENTRY event for this record', entryObs ? 'PASS' : 'MISSING', entryObs?.id ?? id, entryObs ? `${entryObs.id} available at ${new Date(entryObs.availableAt).toISOString()}` : null, entryObs ? null : 'no PAPER ENTRY observation yet (the observer records on the next engine cycle)')
  const ev = fromPaperPosition(p)
  add('E2', 'E', 'The evidence layer reads the record as a valid PAPER record', ev.corrupt ? 'FAIL' : 'PASS', id, `evidence record ${ev.id}, missed ${ev.missed}`, ev.corrupt ? ev.corruptReason : null)
  let mirrored = false
  try { mirrored = existsSync(POSITIONS_PATH) && readFileSync(POSITIONS_PATH, 'utf8').includes(`"${id}"`) } catch { mirrored = false }
  add('E3', 'E', 'The record is durable: present in the store and in the readable mirror', mirrored ? 'PASS' : 'MISSING', id, mirrored ? 'positions table and positions.json' : 'positions table only', mirrored ? null : 'positions.json does not carry this id')

  // ---- F. checkpoint -----------------------------------------------------
  const cp = listCheckpoints().find((c) => c.id === 'first-fill') ?? null
  add('F1', 'F', 'The first-fill checkpoint exists', cp ? 'PASS' : 'MISSING', cp?.id ?? null, cp ? `reached ${new Date(cp.reachedAt).toISOString()}, reviewed ${cp.reviewed}` : null, cp ? null : 'the checkpoint is written by the monitor on the next engine cycle')
  add('F2', 'F', 'The checkpoint\'s frozen summary names this fill', cp ? (cp.summary.firstFillAt === filledAt ? 'PASS' : 'FAIL') : 'NOT_APPLICABLE', cp?.id ?? null, cp ? `summary.firstFillAt ${cp.summary.firstFillAt ? new Date(cp.summary.firstFillAt).toISOString() : '—'}` : null, cp && cp.summary.firstFillAt !== filledAt ? 'the checkpoint was reached on a different fill' : null)

  // ---- G. day report -----------------------------------------------------
  const dayKey = tradingDayKey(filledAt)
  const stored = getDayReport(dayKey)
  const dayFrom = tradingDayStart(filledAt)
  const dayTo = dayFrom + 86_400_000 - 1
  const report = stored ?? paperDayReport({ now: Math.min(now, dayTo), dataSource: source })
  const fillsInWindow = all.filter((x) => x.filledAt !== undefined && x.exitReason !== 'missed' && x.filledAt >= dayFrom && x.filledAt <= dayTo).length
  add('G1', 'G', 'The paper day report for the fill\'s day counts the fill', report.paper.fills >= 1 ? 'PASS' : 'FAIL', report.dayKey, `${stored ? 'stored' : 'in progress'} report ${report.dayKey}: ${report.paper.fills} fill(s)`, report.paper.fills >= 1 ? null : 'the day report shows no fill')
  add('G2', 'G', 'Day-report counts agree with the durable trade record', report.paper.fills === fillsInWindow ? 'PASS' : 'FAIL', report.dayKey, `report ${report.paper.fills} · record ${fillsInWindow}`, report.paper.fills === fillsInWindow ? null : 'counts disagree')
  add('G3', 'G', 'The day\'s integrity status is represented in the report', report.dataQuality.verdict !== 'not run' ? 'PASS' : 'MISSING', report.dayKey, `data quality ${report.dataQuality.verdict}${report.dataQuality.issues.length ? `: ${report.dataQuality.issues.join('; ')}` : ''}`, report.dataQuality.verdict !== 'not run' ? null : 'the daily integrity check has not run for this day')

  // ---- no-hindsight ------------------------------------------------------
  const findings: string[] = []
  if (!snap) findings.push('no decision-time snapshot: what the engine knew cannot be reconstructed')
  else for (const k of ['outcome', 'rMultiple', 'exit', 'pnlUsd', 'closedAt', 'exitReason']) if (k in (snap as unknown as Record<string, unknown>)) findings.push(`the decision-time snapshot carries "${k}", an outcome field`)
  if (entryObs && entryObs.availableAt < entryObs.time) findings.push(`PAPER ENTRY observation available (${entryObs.availableAt}) before it happened (${entryObs.time})`)
  const caseIds = obs.map((o) => o.caseId).filter((c): c is string => Boolean(c))
  for (const cid of caseIds) { const item = getItem(cid); const cs = item?.payload as CaseStudy | undefined; if (cs && cs.before) findings.push(...hindsightFindings(cs).map((f) => `${cid}: ${f}`)) }
  const hindsight = { status: (!snap ? 'MISSING' : findings.length ? 'FAIL' : 'PASS') as CheckStatus, findings, note: !snap ? 'Cannot establish what the engine knew: no snapshot.' : findings.length ? 'The record does not pass the no-hindsight audit.' : `The decision-time record contains no outcome; ${caseIds.length} linked case stud${caseIds.length === 1 ? 'y' : 'ies'} audited with the existing hindsight check.` }

  // ---- verdict -------------------------------------------------------------
  const failed = checks.filter((c) => c.status === 'FAIL').map((c) => c.id)
  const missing = checks.filter((c) => c.status === 'MISSING').map((c) => c.id)
  if (hindsight.status === 'FAIL') failed.push('HINDSIGHT')
  if (hindsight.status === 'MISSING') missing.push('HINDSIGHT')
  const status: AcceptanceStatus = failed.length === 0 && missing.length === 0 ? 'ACCEPTED' : 'NOT ACCEPTED'
  const chain: ChainStage[] = STAGES.map((s) => {
    const cs = checks.filter((c) => s.checks.includes(c.id))
    const st: StageStatus = cs.some((c) => c.status === 'FAIL') ? 'FAIL' : cs.some((c) => c.status === 'MISSING') ? 'WAITING' : cs.every((c) => c.status === 'NOT_APPLICABLE') ? 'WAITING' : 'PASS'
    const note = st === 'FAIL' ? cs.filter((c) => c.status === 'FAIL').map((c) => `${c.id} ${c.reason ?? c.description}`).join('; ') : st === 'WAITING' ? cs.filter((c) => c.status !== 'PASS').map((c) => `${c.id} ${c.reason ?? 'not applicable yet'}`).join('; ') : `${cs.length} check(s) passed`
    return { name: s.name, status: st, checks: s.checks, note }
  })
  const durable = persistState(id, status, failed, missing, now, opts.persist !== false)
  const before = buildBefore(p, signalCandle, a)
  const after = buildAfter(p, fillCandle, candles, now, obs.map((o) => o.id), caseIds, cp, report)
  const summary = { passed: checks.filter((c) => c.status === 'PASS').length, failed: failed.length, missing: missing.length, notApplicable: checks.filter((c) => c.status === 'NOT_APPLICABLE').length }
  return {
    kind: 'FIRST PAPER FILL ACCEPTANCE', at: now, status, dataSource: source, execution: 'SIMULATED EXECUTION',
    position: { id, signalId, openedAt: p.openedAt, filledAt, direction: p.direction, strategyId: p.strategyId ?? null, status: p.status, closedAt: p.closedAt ?? null },
    checks, chain, before, after, hindsight, summary,
    durable: { acceptedAt: durable.acceptedAt, firstEvaluatedAt: durable.firstEvaluatedAt, lastEvaluatedAt: durable.lastEvaluatedAt, regressed: durable.regressed, regressionNote: durable.regressionNote, humanReviewed: cp?.reviewed ?? false },
    note: status === 'ACCEPTED' ? `ACCEPTED: every check on the chain passed for ${id}. This establishes that the pipeline produced one simulated paper fill and recorded it whole. It establishes nothing about profitability.${cp?.reviewed ? ' Human review recorded on the checkpoint.' : ' Human review of the first-fill checkpoint is still open.'}` : `NOT ACCEPTED: ${failed.length} failed (${failed.join(', ') || '—'}), ${missing.length} missing (${missing.join(', ') || '—'}). Missing evidence is not a pass; failed checks are named with what was expected.`,
  }
}

function persistState(positionId: string | null, status: AcceptanceStatus, failed: string[], missing: string[], now: number, persist: boolean): DurableState {
  const prior = readFirstFillState()
  const samePosition = prior && prior.positionId === positionId
  const acceptedAt = samePosition && prior.acceptedAt !== null ? prior.acceptedAt : status === 'ACCEPTED' ? now : null
  const regressed = Boolean(samePosition && prior.acceptedAt !== null && status !== 'ACCEPTED')
  const next: DurableState = {
    positionId, status, acceptedAt, firstEvaluatedAt: samePosition ? prior.firstEvaluatedAt : now, lastEvaluatedAt: now, failed, missing, regressed,
    regressionNote: regressed ? `Accepted ${new Date(prior!.acceptedAt!).toISOString()}; a later evaluation disagrees (${[...failed, ...missing].join(', ')}). The earlier acceptance is kept and the discrepancy is shown, not corrected.` : null,
    history: [...(samePosition ? prior.history : []), ...(!samePosition || prior.status !== status ? [{ at: now, status }] : [])].slice(-50),
  }
  if (persist) { try { store().setJson(KEY, next) } catch { /* the verdict is recomputed on the next read */ } }
  return next
}

function buildBefore(p: PaperPosition, signalCandle: BeforeView['signalCandle'] & { closeTime?: number } | null, a: ReturnType<typeof defaultAssumptions>): BeforeView {
  const s = p.snapshot
  return {
    label: 'BEFORE / DECISION-TIME KNOWLEDGE', decidedAt: p.openedAt, signalId: s?.signalId ?? null, symbol: s?.symbol ?? config.symbol, interval: s?.interval ?? config.interval,
    session: p.session, regime: p.regime ?? 'unavailable', volatility: s?.volatility ?? null, strategyId: p.strategyId ?? null, direction: p.direction,
    intendedEntry: p.intendedEntry, stop: p.stop, target: p.target, atr: p.atr, quality: p.quality, reason: p.reason,
    signalCandle: signalCandle ? { openTime: signalCandle.openTime, open: signalCandle.open, high: signalCandle.high, low: signalCandle.low, close: signalCandle.close } : null,
    fused: s ? { score: s.fusedScore, action: s.fusedAction, confirms: s.confirms, invalidates: s.invalidates, contributors: s.contributors } : null,
    evidence: s?.evidence ?? [], riskChecks: s?.riskChecks ?? [], riskVetoedBy: s?.riskVetoedBy ?? null,
    news: { minutesToBlackout: s?.newsMinutes ?? null, inBlackout: s?.inBlackout ?? null },
    book: { bid: p.observedBid ?? null, ask: p.observedAsk ?? null, spreadPct: p.observedSpreadPct ?? null, assumedSlippageBps: p.assumedSlippageBps ?? null },
    executionAssumptions: a, versions: { engine: s?.engineVersion ?? null, features: s?.featureVersion ?? null },
  }
}

function buildAfter(p: PaperPosition, fillCandle: AfterView['fillCandle'], candles: Array<{ openTime: number; high: number; low: number; close: number }>, now: number, observationIds: string[], caseIds: string[], cp: { reachedAt: number; reviewed: boolean } | null, report: { dayKey: string; paper: { fills: number; closed: number; signals: number } }): AfterView {
  const filledAt = p.filledAt!
  const since = store().candlesBetween(config.symbol, config.interval, filledAt, p.closedAt ?? now)
  const pm = store().keysWithPrefix('knowledge:').filter((k) => { const it = store().getJson<{ provenance?: { recordIds?: string[] } }>(k); return Boolean(it?.provenance?.recordIds?.includes(p.id)) }).map((k) => k.slice('knowledge:'.length))
  const rec = p.status === 'closed' ? reconcileTrade(p) : null
  void candles
  return {
    label: 'AFTER / EXECUTION AND OUTCOME', filledAt, entry: p.entry, quantity: p.quantity, riskUsd: p.riskUsd, entryCostUsd: p.entryCostUsd ?? null, latencyMs: p.latencyMs ?? null,
    fillCandle: fillCandle ? { openTime: fillCandle.openTime, open: fillCandle.open, high: fillCandle.high, low: fillCandle.low, close: fillCandle.close } : null,
    path: { candles: since.length, high: since.length ? Math.max(...since.map((c) => c.high)) : null, low: since.length ? Math.min(...since.map((c) => c.low)) : null, last: since.length ? since[since.length - 1].close : null, asOf: p.closedAt ?? now },
    status: p.status,
    exit: p.status === 'closed' && p.closedAt !== undefined ? { closedAt: p.closedAt, exit: p.exit ?? 0, reason: p.exitReason ?? 'unknown', rMultiple: p.rMultiple ?? null, pnlUsd: p.pnlUsd ?? null, feesUsd: p.feesUsd ?? null, outcome: p.outcome ?? null, candlesHeld: p.candlesHeld ?? null } : null,
    excursions: { mae: p.mae ?? null, mfe: p.mfe ?? null, reconciledAt: p.reconciledAt ?? null },
    reconciliation: rec ? { verdict: rec.verdict, failed: rec.checks.filter((c) => !c.ok).map((c) => `${c.name}: expected ${c.expected}, actual ${c.actual}`), incomplete: rec.incomplete } : null,
    observationIds, caseIds, postMortemIds: pm,
    checkpoint: cp ? { reachedAt: cp.reachedAt, reviewed: cp.reviewed } : null,
    dayReport: { dayKey: report.dayKey, fills: report.paper.fills, closed: report.paper.closed, signals: report.paper.signals },
  }
}
