/**
 * PHASE 25 RECORDS — trade reconciliation, the daily integrity report, the
 * paper data checkpoints and the soak counters, over a real paper trade run
 * through the engine's own fill model on a throwaway data directory.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import { mk, STEP } from '../fixtures/candles.ts'
import type { Signal, RiskDecision } from '../../src/types.ts'

const tmp = tempDataDir('mrcash-ops25r-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const { store } = await import('../../src/store.ts')
const pt = await import('../../src/paperTrader.ts')
const PR = await import('../../src/paper/reconcile.ts')
const R = await import('../../src/ops/reconcile.ts')
const I = await import('../../src/ops/integrity.ts')
const C = await import('../../src/ops/checkpoints.ts')
const S = await import('../../src/ops/soak.ts')
const V = await import('../../src/knowledge/vault.ts')
const O = await import('../../src/observer/events.ts')
const { resetOpsLog } = await import('../../src/ops/log.ts')
after(() => tmp.cleanup())

resetOpsLog({ logger: { debug() {}, info() {}, warn() {}, error() {}, path: 'fake' } })

const T0 = Date.UTC(2026, 0, 15, 14, 0)
const sigAt = (t: number): Signal => ({
  action: 'BUY', reason: 'test', price: 100, time: t, setupKey: 'BTCUSDT|5m|ICT|london|long|asia-low|IFVG', evidence: [], quality: 70,
  plan: { direction: 'long', entry: 100, stop: 99, takeProfit: 102, rr: 2, entryLabel: '', stopLabel: '', targetLabel: '' },
})
const risk: RiskDecision = { approved: true, finalAction: 'BUY', reason: 'ok', quantity: 0.2, positionValueUsd: 20, riskUsd: 0.2 }
const signalCandle = (t: number) => mk(t - STEP + 1, 99.8, 100.3, 99.5, 100)
const nextCandle = (t: number, open = 100.05) => mk(t + 1, open, open + 0.55, open - 0.15, open + 0.35)
const snapshot = (t: number) => ({ signalId: `${sigAt(t).setupKey}@${t}`, symbol: config.symbol, interval: config.interval, engineVersion: 'test', featureVersion: 1, volatility: 'normal' as const, fusedScore: 0.5, fusedAction: 'BUY', confirms: [], invalidates: [], contributors: [], evidence: [], riskChecks: [], riskVetoedBy: null, newsMinutes: null, inBlackout: false })

/** Run one long through the real fill model: queued → filled at next open + costs → closed at target. Candles are stored so MAE/MFE can be walked. */
function tradeAt(t: number) {
  const cs = [signalCandle(t), nextCandle(t), mk(t + 1 + STEP, 100.4, 102.5, 100.3, 102.1)]
  store().upsertCandles(config.symbol, config.interval, cs, 'test')
  pt.openPosition(sigAt(t), risk, 'London', 1, { strategyId: 'silver-bullet', regime: 'trending-up', snapshot: snapshot(t) })
  pt.managePositions(cs.slice(0, 2))
  const closed = pt.managePositions(cs)[0]
  assert.equal(closed.status, 'closed')
  PR.reconcileExcursions(closed)
  return pt.readPositions().closed.find((p) => p.id === closed.id)!
}

test('a real paper trade reconciles CONSISTENT on every check: one open/close, exit at target, R/PnL/fees/outcome recomputed, MAE/MFE re-walked, snapshot/session/regime/day preserved, one ledger row', () => {
  const p = tradeAt(T0)
  const r = R.reconcileTrade(p)
  assert.deepEqual(r.checks.filter((c) => !c.ok), [], JSON.stringify(r.checks.filter((c) => !c.ok)))
  assert.equal(r.verdict, 'CONSISTENT', r.incomplete.join('; '))
  const names = r.checks.map((c) => c.name)
  for (const n of ['one open, one close', 'exit matches the fill model', 'R recomputed', 'PnL recomputed', 'fees recomputed', 'outcome matches the canonical rule', 'MAE/MFE recomputed from stored candles', 'decision snapshot preserved', 'snapshot carries no outcome', 'session preserved', 'regime preserved', 'trading day matches the decision time', 'strategy preserved', 'one ledger row for the close']) assert.ok(names.includes(n), `check present: ${n}`)
  const mae = r.checks.find((c) => c.name === 'MAE/MFE recomputed from stored candles')!
  assert.match(mae.expected, /OBSERVED/)
})

test('a tampered copy of the record is a MISMATCH that names the check, the expected and the actual value; a record without a snapshot is INCOMPLETE, not faulted', () => {
  const p = pt.readPositions().closed[0]
  const tampered = { ...p, rMultiple: (p.rMultiple ?? 0) + 0.5, exit: 101.5 }
  const r = R.reconcileTrade(tampered)
  assert.equal(r.verdict, 'MISMATCH')
  const failed = r.checks.filter((c) => !c.ok).map((c) => c.name)
  assert.ok(failed.includes('R recomputed'))
  assert.ok(failed.includes('exit matches the fill model'))
  const rc = r.checks.find((c) => c.name === 'R recomputed')!
  assert.notEqual(rc.expected, rc.actual)
  const bare = { ...p, snapshot: undefined, regime: undefined, outcome: undefined }
  const b = R.reconcileTrade(bare)
  assert.equal(b.verdict, 'INCOMPLETE')
  assert.ok(b.incomplete.some((s) => s.startsWith('decision snapshot preserved')))
  assert.ok(b.incomplete.some((s) => s.startsWith('regime preserved')))
  assert.deepEqual(b.checks.filter((c) => !c.ok), [])
})

test('a duplicate ledger row is caught; the report counts by check and stores itself', () => {
  const p = pt.readPositions().closed[0]
  const rows = store().readLedger()
  const dup = [...rows, rows[0]]
  const r = R.reconcileTrade(p, { ledger: dup })
  const l = r.checks.find((c) => c.name === 'one ledger row for the close')!
  assert.equal(l.ok, false)
  assert.equal(l.actual, '2')
  const report = R.reconciliationReport({ now: T0 + 86_400_000 })
  assert.equal(report.total, 1)
  assert.equal(report.consistent, 1)
  assert.equal(report.mismatched, 0)
  assert.equal(report.byCheck['R recomputed'].ok, 1)
  assert.equal(report.ledger.rowsForCloses, 1)
  assert.deepEqual(R.lastReconciliation()?.at, report.at)
})

test('the integrity report is OK on a clean record and names a planted corrupt knowledge row, a dangling link and an observation pointing at a missing record', () => {
  const clean = I.dataIntegrityReport(T0 + 2 * STEP)
  // The fixture stores three candles offset by a millisecond, so the candle section is expected to complain — about exactly that.
  assert.ok(clean.issues.every((s) => s.startsWith('candles:')), clean.issues.join('; '))
  assert.equal(clean.candles.counts.misaligned, 3)
  assert.ok(clean.candles.counts.missing_24h > 0)
  for (const s of [clean.observations, clean.paper, clean.research, clean.knowledge, clean.store]) assert.equal(s.ok, true, s.issues.join('; '))
  assert.equal(clean.paper.counts.closed, 1)
  assert.equal(clean.paper.counts.ledgerCloseRows, 1)
  assert.equal(clean.candles.counts.total, 3)
  assert.equal(clean.store.quickCheck, 'ok')
  // Plant problems.
  store().setJson('knowledge:corrupt:row', { not: 'an item' })
  const item = V.addItem({ kind: 'strategy-observation', title: 'dangling test', body: 'x', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER', recordIds: ['no-such-record'] } })
  V.saveItem({ ...item, links: ['nowhere:missing:0'] })
  const o = O.makeObservation({ type: 'SESSION CHANGE', time: T0, availableAt: T0, session: 'London', regime: null, volatility: null, source: 'engine-step', detail: 'test', direction: null, evidence: [], caseKind: null, recordId: 'no-such-record', significance: { score: 0, selected: false, reasons: [], basis: {}, note: 'test' }, before: { structureTrend: null, liquidity: null, regime: null, session: null, strategiesActive: 0, strategiesNear: 0, risk: null, price: null } })
  O.recordObservation(o)
  const dirty = I.dataIntegrityReport(T0 + 2 * STEP)
  assert.equal(dirty.verdict, 'ISSUES')
  assert.equal(dirty.knowledge.counts.corrupt, 1)
  assert.equal(dirty.knowledge.counts.danglingLinks, 1)
  assert.equal(dirty.knowledge.counts.missingPaperRecords, 1)
  assert.equal(dirty.observations.counts.missingRecord, 1)
  assert.ok(dirty.issues.some((s) => /corrupt/.test(s)))
  assert.ok(dirty.issues.some((s) => /link/.test(s)))
  assert.ok(dirty.issues.some((s) => /observation\(s\) point at a paper record/.test(s)))
  // Nothing was repaired or deleted.
  assert.equal(V.corruptItems().length, 1)
  assert.equal(store().observationCount(), 1)
})

test('the daily integrity report is stored once per trading day and returned unchanged on a second call', () => {
  const now = T0 + 3 * STEP
  const a = I.dailyIntegrity(now)
  assert.equal(a.fresh, true)
  const b = I.dailyIntegrity(now + 60_000)
  assert.equal(b.fresh, false)
  assert.equal(b.report.at, a.report.at)
  const forced = I.dailyIntegrity(now + 120_000, { force: true })
  assert.equal(forced.fresh, true)
  assert.equal(I.listIntegrityReports().length, 1, 'one report per day key')
  assert.equal(I.listIntegrityReports()[0].dayKey, a.report.dayKey)
})

test('checkpoints: the first fill fires once with the review chain; the 10-trade checkpoint fires when reached and never again; the next target is reported', () => {
  const first = C.checkCheckpoints(T0 + 4 * STEP)
  assert.deepEqual(first.reached.map((c) => c.id), ['first-fill'])
  assert.match(first.reached[0].review.join(' '), /next candle open plus half-spread plus slippage/)
  assert.match(first.reached[0].review.join(' '), /SIMULATED EXECUTION/)
  assert.equal(first.reached[0].summary.closed, 1)
  assert.equal(first.next?.count, 10)
  assert.equal(first.next?.remaining, 9)
  assert.deepEqual(C.checkCheckpoints(T0 + 5 * STEP).reached, [], 'idempotent')
  for (let i = 1; i < 10; i++) tradeAt(T0 + i * 10 * STEP)
  const ten = C.checkCheckpoints(T0 + 200 * STEP)
  assert.deepEqual(ten.reached.map((c) => c.id), ['10'])
  assert.equal(ten.reached[0].summary.closed, 10)
  assert.equal(ten.reached[0].sampleStatus, 'EARLY SAMPLE')
  assert.match(ten.reached[0].review.join(' '), /Do not touch a parameter/)
  assert.equal(ten.next?.count, 25)
  assert.equal(C.listCheckpoints().length, 2)
  assert.equal(C.markCheckpointReviewed('10')?.reviewed, true)
  assert.equal(C.listCheckpoints()[1].summary.closed, 10, 'the frozen summary is unchanged by review')
  assert.deepEqual(C.checkCheckpoints(T0 + 201 * STEP).reached, [])
})

test('soak: counters derive from the record, accrue feed deltas, and survive a simulated restart without resetting', () => {
  const t = T0 + 300 * STEP
  const s0 = S.startSoak(t)
  assert.equal(s0.runs, 1)
  const feed = { closes: 5, duplicateCloses: 0, timestampAnomalies: 0, gapEvents: 1, streamUps: 1, streamDowns: 2, lastDownReason: 'x', lastDownAt: t, lastUpAt: t, reconnectsSeen: 2, recentReconnects: [t] }
  const s1 = S.soakTick({ now: t + 60_000, feed, verdict: 'OK', errors: { total: 3, lastHour: 1, byComponent: { feed: 3 }, lastError: null, lastCritical: null } })
  assert.equal(s1.derived.closes, 10)
  assert.equal(s1.derived.decisions, 10)
  assert.equal(s1.derived.fills, 10)
  assert.equal(s1.derived.observations, 1)
  assert.equal(s1.derived.errors, 3)
  assert.equal(s1.accrued.candlesClosed, 5)
  assert.equal(s1.accrued.reconnects, 2)
  assert.equal(s1.uptime.totalSec, 60)
  const s2 = S.soakTick({ now: t + 120_000, feed: { ...feed, closes: 8, reconnectsSeen: 3 }, verdict: 'STALE' })
  assert.equal(s2.accrued.candlesClosed, 8)
  assert.equal(s2.accrued.reconnects, 3)
  assert.equal(s2.accrued.staleFeedSec, 60)
  assert.equal(s2.uptime.totalSec, 120)
  // Restart: the process counters begin again at zero; the totals do not.
  const s3 = S.startSoak(t + 600_000)
  assert.equal(s3.runs, 2)
  assert.equal(s3.accrued.candlesClosed, 8)
  assert.equal(s3.uptime.totalSec, 120)
  const s4 = S.soakTick({ now: t + 660_000, feed: { ...feed, closes: 2, reconnectsSeen: 0 }, verdict: 'OK' })
  assert.equal(s4.accrued.candlesClosed, 10, 'the new process adds its own two')
  assert.equal(s4.accrued.reconnects, 3)
  assert.equal(s4.uptime.totalSec, 180, 'the ten minutes of downtime between runs are not uptime')
  assert.equal(s4.uptime.longestRunSec, 120)
  const rep = S.soakReport(t + 660_000)
  assert.equal(rep.restarts, 1)
  assert.equal(rep.counters.closes, 10)
  assert.equal(rep.uptime.wallClockSec, 660)
  assert.match(rep.uptime.note, /27\.3% of the wall clock/)
})
