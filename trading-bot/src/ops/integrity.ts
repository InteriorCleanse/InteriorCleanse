/**
 * DAILY DATA INTEGRITY REPORT — is the record whole?
 *
 * One read over every durable table and prefix, once per trading day (or on
 * demand), answering the same questions each time:
 *
 *   candles      continuity in the last 24 h and 7 days, misaligned or
 *                malformed timestamps, known gaps
 *   observations content-addressed ids that do not match their content,
 *                references to case studies or records that do not exist
 *   paper        closed records missing a field the record must carry,
 *                duplicate signal ids (one signal → two trades), ledger rows
 *                against closes
 *   research     experiments and queue items whose hypothesis is missing,
 *                queue items pointing at experiments that do not exist,
 *                the research scheduler's last error
 *   knowledge    rows under the knowledge prefix that are not readable as
 *                items (counted, never deleted), dangling links, provenance
 *                that names paper records the store does not hold
 *   store        SQLite quick_check, file size, row counts
 *
 * The report says ISSUES with a list when anything is off and OK otherwise.
 * It repairs nothing. A corrupt row is counted and named; deleting it is a
 * human decision.
 */

import { config } from '../../config.ts'
import { findGaps, lastClosedOpenTime } from '../data/candleStore.ts'
import { readOps } from '../learning/ops.ts'
import { INTERVAL_MS } from '../market.ts'
import { observationId } from '../observer/events.ts'
import type { Observation } from '../observer/events.ts'
import type { PaperPosition } from '../paperTrader.ts'
import type { Experiment } from '../research/experiments.ts'
import type { QueueItem } from '../research/queue.ts'
import { corruptItems, isKnowledgeItem } from '../knowledge/vault.ts'
import type { KnowledgeItem } from '../knowledge/vault.ts'
import { toET } from '../sessions.ts'
import { store } from '../store.ts'

export type IntegritySection = { ok: boolean; issues: string[]; counts: Record<string, number>; note: string }

export type IntegrityReport = {
  at: number
  dayKey: string
  verdict: 'OK' | 'ISSUES'
  issues: string[]
  candles: IntegritySection
  observations: IntegritySection
  paper: IntegritySection
  research: IntegritySection
  knowledge: IntegritySection
  store: IntegritySection & { quickCheck: string; sizeBytes: number }
  durationMs: number
}

const PREFIX = 'integrity:'

function section(counts: Record<string, number>, issues: string[], note: string): IntegritySection { return { ok: issues.length === 0, issues, counts, note } }

function candleSection(now: number): IntegritySection {
  const step = INTERVAL_MS[config.interval] ?? 300_000
  const expected = lastClosedOpenTime(config.interval, now)
  const windows = { '24h': 24 * 3_600_000, '7d': 7 * 86_400_000 }
  const counts: Record<string, number> = {}
  const issues: string[] = []
  for (const [label, span] of Object.entries(windows)) {
    const from = expected - Math.floor(span / step) * step
    const rows = store().candlesBetween(config.symbol, config.interval, from, expected)
    const gaps = findGaps(rows.map((c) => c.openTime), step, from, expected)
    const missing = gaps.reduce((n, g) => n + Math.floor((g.to - g.from) / step) + 1, 0)
    counts[`present_${label}`] = rows.length
    counts[`expected_${label}`] = Math.floor((expected - from) / step) + 1
    counts[`missing_${label}`] = missing
    counts[`gaps_${label}`] = gaps.length
    if (label === '24h' && missing > 0) issues.push(`${missing} candle(s) missing in the last 24 h across ${gaps.length} gap(s)`)
  }
  const all = store().candlesBetween(config.symbol, config.interval, 0, Number.MAX_SAFE_INTEGER)
  let misaligned = 0, malformed = 0, future = 0, dupes = 0
  let prev = -1
  for (const c of all) {
    if (c.openTime % step !== 0) misaligned++
    if (!(c.closeTime > c.openTime) || c.closeTime - c.openTime > step || !(c.high >= c.low) || !(c.high >= c.open) || !(c.high >= c.close) || !(c.low <= c.open) || !(c.low <= c.close) || c.volume < 0) malformed++
    if (c.openTime > now + step) future++
    if (c.openTime === prev) dupes++
    prev = c.openTime
  }
  counts.total = all.length
  counts.misaligned = misaligned
  counts.malformed = malformed
  counts.future = future
  counts.duplicates = dupes
  counts.knownGaps = (store().getJson<unknown[]>(`candles:known-gaps:${config.symbol}:${config.interval}`) ?? []).length
  if (misaligned) issues.push(`${misaligned} candle(s) with an open time not aligned to ${config.interval}`)
  if (malformed) issues.push(`${malformed} candle(s) with an impossible OHLCV or close time`)
  if (future) issues.push(`${future} candle(s) opening in the future`)
  if (dupes) issues.push(`${dupes} duplicate open time(s) (the primary key should make this impossible)`)
  return section(counts, issues, all.length ? `${all.length} candle(s) stored for ${config.symbol} ${config.interval}; ${counts.missing_24h} missing in the last 24 h, ${counts.missing_7d} in 7 days${counts.knownGaps ? `, ${counts.knownGaps} gap(s) the exchange could not fill` : ''}.` : 'No candle stored.')
}

function observationSection(positions: Map<string, PaperPosition>, knowledgeIds: Set<string>): IntegritySection {
  const obs = store().observations<Observation>({})
  const issues: string[] = []
  let badId = 0, missingCase = 0, missingRecord = 0, timeOrder = 0
  for (const o of obs) {
    if (!o || typeof o.id !== 'string') { badId++; continue }
    const want = observationId({ type: o.type, symbol: o.symbol, timeframe: o.timeframe, availableAt: o.availableAt, refId: o.recordId })
    if (want !== o.id) badId++
    if (o.availableAt < o.time) timeOrder++
    if (o.caseId && !knowledgeIds.has(o.caseId)) missingCase++
    if (o.recordId && !positions.has(o.recordId)) missingRecord++
  }
  const counts = { total: obs.length, candidates: store().observationCount('CANDIDATE'), resolved: store().observationCount('RESOLVED'), unresolvable: store().observationCount('UNRESOLVABLE'), idMismatch: badId, availableBeforeTime: timeOrder, missingCaseStudy: missingCase, missingRecord }
  if (badId) issues.push(`${badId} observation(s) whose id does not match their content`)
  if (timeOrder) issues.push(`${timeOrder} observation(s) available before they happened (look-ahead)`)
  if (missingCase) issues.push(`${missingCase} resolved observation(s) point at a case study the vault does not hold`)
  if (missingRecord) issues.push(`${missingRecord} observation(s) point at a paper record the store does not hold`)
  return section(counts, issues, obs.length ? `${obs.length} observation(s): ${counts.candidates} candidate, ${counts.resolved} resolved, ${counts.unresolvable} unresolvable.` : 'No observation recorded yet.')
}

function paperSection(all: PaperPosition[]): IntegritySection {
  const closed = all.filter((p) => p.status === 'closed' && p.exitReason !== 'missed')
  const missed = all.filter((p) => p.status === 'closed' && p.exitReason === 'missed')
  const open = all.filter((p) => p.status !== 'closed')
  const issues: string[] = []
  const required: Array<keyof PaperPosition> = ['closedAt', 'exit', 'exitReason', 'rMultiple', 'pnlUsd', 'filledAt']
  let incomplete = 0
  for (const p of closed) if (required.some((k) => p[k] === undefined || p[k] === null)) incomplete++
  const bySignal = new Map<string, number>()
  for (const p of all) { const k = p.snapshot?.signalId ?? `${p.setupKey}@${p.openedAt}`; bySignal.set(k, (bySignal.get(k) ?? 0) + 1) }
  const duplicateSignals = [...bySignal.values()].filter((n) => n > 1).length
  const ids = new Set(all.map((p) => p.id))
  const ledger = store().readLedger().filter((r) => r.mode === 'live-paper')
  const closeRows = ledger.filter((r) => r.action !== 'SKIP').length
  const counts = { closed: closed.length, missed: missed.length, openOrPending: open.length, incompleteClosed: incomplete, duplicateSignals, duplicateIds: all.length - ids.size, ledgerCloseRows: closeRows, ledgerMissedRows: ledger.length - closeRows }
  if (incomplete) issues.push(`${incomplete} closed record(s) missing a field a closed trade must carry`)
  if (duplicateSignals) issues.push(`${duplicateSignals} signal(s) produced more than one paper order`)
  if (all.length !== ids.size) issues.push(`${all.length - ids.size} duplicate position id(s)`)
  if (closeRows > closed.length) issues.push(`the ledger holds ${closeRows} close rows for ${closed.length} closed trade(s)`)
  return section(counts, issues, `${closed.length} closed paper trade(s), ${missed.length} missed order(s), ${open.length} open or pending; ${closeRows} ledger close row(s).`)
}

function researchSection(): IntegritySection {
  const exps = store().keysWithPrefix('experiment:').map((k) => store().getJson<Experiment>(k)).filter((x): x is Experiment => Boolean(x))
  const queue = store().keysWithPrefix('queue:').map((k) => store().getJson<QueueItem>(k)).filter((x): x is QueueItem => Boolean(x))
  const hyps = new Set(store().keysWithPrefix('hypothesis:').map((k) => k.slice('hypothesis:'.length)))
  const expIds = new Set(exps.map((e) => e.experimentId))
  const issues: string[] = []
  let expMissingHyp = 0, queueMissingHyp = 0, queueMissingExp = 0, expBadId = 0, stranded = 0
  for (const e of exps) {
    if (e.hypothesisId && !hyps.has(e.hypothesisId)) expMissingHyp++
    if (typeof e.experimentId !== 'string' || !e.experimentId.startsWith('exp-')) expBadId++
    if (e.status === 'RUNNING') stranded++
  }
  for (const q of queue) {
    if (q.hypothesisId && !hyps.has(q.hypothesisId)) queueMissingHyp++
    for (const id of q.experimentIds ?? []) if (!expIds.has(id)) queueMissingExp++
  }
  const ops = readOps()
  const counts = { experiments: exps.length, queue: queue.length, hypotheses: hyps.size, experimentMissingHypothesis: expMissingHyp, queueMissingHypothesis: queueMissingHyp, queueMissingExperiment: queueMissingExp, experimentBadId: expBadId, running: stranded, researchRuns: ops.runs, researchCycles: ops.cycles }
  if (expMissingHyp) issues.push(`${expMissingHyp} experiment(s) name a hypothesis that does not exist`)
  if (queueMissingHyp) issues.push(`${queueMissingHyp} queue item(s) name a hypothesis that does not exist`)
  if (queueMissingExp) issues.push(`${queueMissingExp} queue link(s) to an experiment that does not exist`)
  if (expBadId) issues.push(`${expBadId} experiment(s) with a malformed id`)
  if (ops.lastError) issues.push(`the research scheduler's last error: ${ops.lastError.message} (${new Date(ops.lastError.at).toISOString()})`)
  return section(counts, issues, `${exps.length} experiment(s), ${queue.length} queue item(s), ${hyps.size} hypothesis(es); ${ops.runs} research run(s)${stranded ? `; ${stranded} experiment(s) marked RUNNING (finished first on the next tick)` : ''}.`)
}

function knowledgeSection(positions: Map<string, PaperPosition>): { section: IntegritySection; ids: Set<string> } {
  const keys = store().keysWithPrefix('knowledge:')
  const items: KnowledgeItem[] = []
  for (const k of keys) { const raw = store().getJson<unknown>(k); if (isKnowledgeItem(raw)) items.push(raw) }
  const corrupt = corruptItems()
  const ids = new Set(items.map((i) => i.id))
  const issues: string[] = []
  let dangling = 0, missingRecords = 0, keyMismatch = 0, badVersion = 0
  for (const it of items) {
    for (const l of it.links) if (!ids.has(l)) dangling++
    if (it.provenance?.source === 'PAPER') for (const r of it.provenance.recordIds ?? []) if (!positions.has(r)) missingRecords++
    if (!keys.includes('knowledge:' + it.id)) keyMismatch++
    if (!(it.version >= 1) || it.history.length === 0) badVersion++
  }
  const counts = { items: items.length, corrupt: corrupt.length, danglingLinks: dangling, missingPaperRecords: missingRecords, keyMismatch, badVersion }
  if (corrupt.length) issues.push(`${corrupt.length} row(s) under the knowledge prefix are not readable as items: ${corrupt.slice(0, 5).join(', ')}${corrupt.length > 5 ? ', …' : ''}`)
  if (dangling) issues.push(`${dangling} link(s) to a knowledge item that does not exist`)
  if (missingRecords) issues.push(`${missingRecords} provenance reference(s) to paper records the store does not hold`)
  if (keyMismatch) issues.push(`${keyMismatch} item(s) stored under a key that is not their id`)
  if (badVersion) issues.push(`${badVersion} item(s) without a version or a history`)
  return { section: section(counts, issues, `${items.length} knowledge item(s)${corrupt.length ? `, ${corrupt.length} corrupt row(s) kept and listed` : ''}.`), ids }
}

/** Run the full integrity read now. Never writes. */
export function dataIntegrityReport(now = Date.now()): IntegrityReport {
  const t0 = performance.now()
  const all = [...store().positions<PaperPosition>('pending'), ...store().positions<PaperPosition>('open'), ...store().positions<PaperPosition>('closed')]
  const positions = new Map(all.map((p) => [p.id, p]))
  const candles = candleSection(now)
  const knowledge = knowledgeSection(positions)
  const observations = observationSection(positions, knowledge.ids)
  const paper = paperSection(all)
  const research = researchSection()
  let quickCheck = 'not run'
  const storeIssues: string[] = []
  try { quickCheck = store().integrity() } catch (err) { quickCheck = `failed: ${String((err as Error)?.message ?? err)}` }
  if (quickCheck !== 'ok') storeIssues.push(`SQLite quick_check: ${quickCheck}`)
  const c = store().counts()
  const sizeBytes = store().sizeBytes()
  const st = { ...section({ ledger: c.ledger, positionsOpen: c.positionsOpen, positionsClosed: c.positionsClosed, events: c.events, journal: c.journal, sizeMB: Math.round(sizeBytes / 1048576 * 100) / 100 }, storeIssues, `quick_check ${quickCheck}; ${(sizeBytes / 1048576).toFixed(1)} MB on disk.`), quickCheck, sizeBytes }
  const issues = [...candles.issues.map((s) => `candles: ${s}`), ...observations.issues.map((s) => `observations: ${s}`), ...paper.issues.map((s) => `paper: ${s}`), ...research.issues.map((s) => `research: ${s}`), ...knowledge.section.issues.map((s) => `knowledge: ${s}`), ...storeIssues.map((s) => `store: ${s}`)]
  return { at: now, dayKey: toET(now).dateKey, verdict: issues.length ? 'ISSUES' : 'OK', issues, candles, observations, paper, research, knowledge: knowledge.section, store: st, durationMs: Math.round(performance.now() - t0) }
}

/** Store today's report once. A second call on the same trading day returns the stored one unless `force`. */
export function dailyIntegrity(now = Date.now(), opts: { force?: boolean } = {}): { report: IntegrityReport; fresh: boolean } {
  const key = PREFIX + toET(now).dateKey
  const existing = opts.force ? null : store().getJson<IntegrityReport>(key)
  if (existing) return { report: existing, fresh: false }
  const report = dataIntegrityReport(now)
  store().setJson(key, report)
  return { report, fresh: true }
}

export function listIntegrityReports(limit = 30): IntegrityReport[] {
  return store().keysWithPrefix(PREFIX).sort().slice(-limit).map((k) => store().getJson<IntegrityReport>(k)).filter((r): r is IntegrityReport => Boolean(r))
}
