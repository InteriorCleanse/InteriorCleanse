/**
 * FIRST PAPER FILL — the acceptance contract over a throwaway store.
 *
 * TEST FIXTURE / SYNTHETIC: every position, candle and observation here is
 * a labelled fixture in a temporary data directory. Nothing in this file
 * touches a real paper record, and the fixture trade is run through the real
 * fill model so the "valid chain" case is the engine's own arithmetic, not a
 * hand-written record.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import { mk, STEP } from '../fixtures/candles.ts'
import type { Signal, RiskDecision } from '../../src/types.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'

const tmp = tempDataDir('mrcash-firstfill-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const { store } = await import('../../src/store.ts')
const pt = await import('../../src/paperTrader.ts')
const FF = await import('../../src/ops/firstFill.ts')
const C = await import('../../src/ops/checkpoints.ts')
const I = await import('../../src/ops/integrity.ts')
const O = await import('../../src/observer/events.ts')
const PR = await import('../../src/paper/reconcile.ts')
const DR = await import('../../src/ops/dayReport.ts')
const { resetOpsLog } = await import('../../src/ops/log.ts')
after(() => tmp.cleanup())
resetOpsLog({ logger: { debug() {}, info() {}, warn() {}, error() {}, path: 'fake' } })

// Aligned to the exchange clock: the signal candle opens on a 5-minute boundary and the decision is its close.
const OPEN0 = Date.UTC(2026, 0, 15, 14, 0)
const T0 = OPEN0 + STEP - 1
const sigAt = (t: number): Signal => ({ action: 'BUY', reason: 'TEST FIXTURE', price: 100, time: t, setupKey: 'BTCUSDT|5m|silver-bullet|long|fixture', evidence: [{ step: 'fixture', passed: true, detail: 'synthetic' }], quality: 70, plan: { direction: 'long', entry: 100, stop: 99, takeProfit: 102, rr: 2, entryLabel: '', stopLabel: '', targetLabel: '' } })
const risk: RiskDecision = { approved: true, finalAction: 'BUY', reason: 'ok', quantity: 0.2, positionValueUsd: 20, riskUsd: 0.2 }
const snapshotFor = (t: number) => ({ signalId: `${sigAt(t).setupKey}@${t}`, symbol: config.symbol, interval: config.interval, engineVersion: 'fixture-engine', featureVersion: 1, volatility: 'normal' as const, fusedScore: 0.61, fusedAction: 'BUY', confirms: ['fixture confirm'], invalidates: [], contributors: [{ id: 'silver-bullet', action: 'BUY', confidence: 0.7 }], evidence: [{ step: 'sweep', passed: true, detail: 'fixture' }], riskChecks: [{ rule: 'Kill switch', passed: true, detail: 'clear' }, { rule: 'Fresh data', passed: true, detail: 'candle 3s old' }, { rule: 'Exposure', passed: true, detail: 'none open' }], riskVetoedBy: null, newsMinutes: null, inBlackout: false })
const signalCandle = mk(OPEN0, 99.8, 100.3, 99.5, 100)
const fillCandle = mk(OPEN0 + STEP, 100.05, 100.6, 99.9, 100.4)
const NOW = OPEN0 + 3 * STEP

test('zero trades: WAITING, every stage NOT YET OBSERVED, nothing passed, and the note says NOT ENOUGH REAL PAPER DATA', () => {
  const f = FF.evaluateFirstFill({ now: NOW })
  assert.equal(f.status, 'WAITING')
  assert.equal(f.position, null)
  assert.equal(f.checks.length, 0)
  assert.ok(f.chain.every((s) => s.status === 'NOT YET OBSERVED'))
  assert.match(f.note, /NOT ENOUGH REAL PAPER DATA/)
  assert.equal(f.execution, 'SIMULATED EXECUTION')
  assert.equal(f.durable.acceptedAt, null)
  assert.equal(FF.readFirstFillState()?.status, 'WAITING')
})

test('a valid chain: the fixture trade through the real fill model, with the observer, checkpoint, integrity and day report in place, is ACCEPTED', () => {
  store().upsertCandles(config.symbol, config.interval, [signalCandle, fillCandle], 'test')
  pt.openPosition(sigAt(T0), risk, 'London', 1, { strategyId: 'silver-bullet', regime: 'trending-up', snapshot: snapshotFor(T0), bid: 99.99, ask: 100.01 })
  const filled = pt.managePositions([signalCandle, fillCandle])
  assert.equal(filled.length, 1)
  assert.equal(filled[0].status, 'open')
  const id = filled[0].id
  // Before the observer, checkpoint and integrity have run: NOT ACCEPTED, with the missing evidence named — never a false PASS.
  const early = FF.evaluateFirstFill({ now: NOW })
  assert.equal(early.status, 'NOT ACCEPTED')
  assert.ok(early.summary.missing >= 3, JSON.stringify(early.checks.filter((c) => c.status !== 'PASS')))
  assert.ok(early.checks.some((c) => c.id === 'E1' && c.status === 'MISSING'))
  assert.ok(early.checks.some((c) => c.id === 'F1' && c.status === 'MISSING'))
  assert.equal(early.checks.filter((c) => c.status === 'FAIL').length, 0, JSON.stringify(early.checks.filter((c) => c.status === 'FAIL')))
  assert.equal(early.chain.find((s) => s.name === 'Durable Record')?.status, 'WAITING')
  // The rest of the chain runs (as the monitor and the observer would on the next cycle).
  O.recordObservation(O.makeObservation({ type: 'PAPER ENTRY', time: filled[0].filledAt!, availableAt: filled[0].filledAt!, session: 'London', regime: 'trending-up', volatility: 'normal', source: 'paper-trader', detail: 'TEST FIXTURE', direction: 'long', evidence: [{ field: 'position.id', value: id }], caseKind: null, recordId: id, significance: { score: 40, selected: false, reasons: ['fixture'], basis: {}, note: '' }, before: { structureTrend: null, liquidity: null, regime: 'trending-up', session: 'London', strategiesActive: 1, strategiesNear: 0, risk: null, price: 100 }, refId: id }))
  assert.deepEqual(C.checkCheckpoints(NOW).reached.map((c) => c.id), ['first-fill'])
  I.dailyIntegrity(NOW)
  const f = FF.evaluateFirstFill({ now: NOW })
  assert.equal(f.status, 'ACCEPTED', JSON.stringify(f.checks.filter((c) => c.status === 'FAIL' || c.status === 'MISSING')))
  assert.equal(f.summary.failed, 0)
  assert.equal(f.summary.missing, 0)
  assert.equal(f.hindsight.status, 'PASS')
  for (const id2 of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'D1', 'D3', 'D5', 'E1', 'E2', 'E3', 'F1', 'F2', 'G1', 'G2', 'G3']) assert.equal(f.checks.find((c) => c.id === id2)?.status, 'PASS', id2)
  for (const id2 of ['D2', 'D4']) assert.equal(f.checks.find((c) => c.id === id2)?.status, 'NOT_APPLICABLE', `${id2} waits for the close`)
  assert.equal(f.chain.find((s) => s.name === 'Reconciliation')?.status, 'WAITING', 'reconciliation of the closed trade is still to come')
  assert.ok(f.chain.filter((s) => s.name !== 'Reconciliation').every((s) => s.status === 'PASS'), JSON.stringify(f.chain))
  // BEFORE holds only decision-time knowledge; AFTER holds the fill and what followed.
  assert.equal(f.before?.label, 'BEFORE / DECISION-TIME KNOWLEDGE')
  assert.equal(f.before?.decidedAt, T0)
  assert.equal(f.before?.signalCandle?.close, 100)
  assert.equal(f.before?.riskVetoedBy, null)
  assert.equal(f.before?.book.bid, 99.99)
  assert.ok(!('entry' in (f.before as object)) && !('exit' in (f.before as object)), 'no fill or outcome field in BEFORE')
  assert.equal(f.after?.label, 'AFTER / EXECUTION AND OUTCOME')
  assert.equal(f.after?.entry, filled[0].entry)
  assert.equal(f.after?.fillCandle?.open, 100.05)
  assert.equal(f.after?.exit, null)
  assert.equal(f.after?.checkpoint?.reviewed, false)
  assert.equal(f.after?.dayReport?.fills, 1)
  assert.match(f.note, /establishes nothing about profitability/)
  // Durable: the acceptance time is written once and read back.
  const st = FF.readFirstFillState()!
  assert.equal(st.status, 'ACCEPTED')
  assert.equal(st.acceptedAt, NOW)
  assert.equal(FF.evaluateFirstFill({ now: NOW + 60_000 }).durable.acceptedAt, NOW, 'a later evaluation keeps the first acceptance time')
  // The permanent day report carries the verdict as it stood, read from the same durable state.
  const day = DR.paperDayReport({ now: NOW + 60_000, dataSource: 'PAPER' })
  assert.equal(day.firstFill.status, 'ACCEPTED')
  assert.equal(day.firstFill.positionId, id)
  assert.equal(day.firstFill.acceptedAt, NOW)
  assert.match(day.text, new RegExp(`first paper fill: ACCEPTED \\(position ${id}\\)`))
})

test('wrong execution mode: the live flag, a recorded feed, or shadow orders on the store each make the contract fail', () => {
  process.env.LIVE_TRADING_ENABLED = '1'
  try {
    const f = FF.evaluateFirstFill({ now: NOW, persist: false })
    assert.equal(f.status, 'NOT ACCEPTED')
    assert.equal(f.dataSource, 'LIVE')
    assert.equal(f.checks.find((c) => c.id === 'A1')?.status, 'FAIL')
    assert.equal(f.checks.find((c) => c.id === 'C2')?.status, 'FAIL')
    assert.equal(f.checks.find((c) => c.id === 'B7')?.status, 'FAIL')
  } finally { delete process.env.LIVE_TRADING_ENABLED }
  process.env.MRCASH_MARKET_URL = 'http://127.0.0.1:1'
  try {
    const f = FF.evaluateFirstFill({ now: NOW, persist: false })
    assert.equal(f.dataSource, 'MOCK')
    assert.equal(f.checks.find((c) => c.id === 'A1')?.status, 'FAIL')
    assert.match(f.checks.find((c) => c.id === 'A1')?.reason ?? '', /not market evidence/)
  } finally { delete process.env.MRCASH_MARKET_URL }
  store().setJson('shadow:orders', [{ at: NOW, side: 'BUY', mode: 'shadow' }])
  try {
    const f = FF.evaluateFirstFill({ now: NOW, persist: false })
    assert.equal(f.checks.find((c) => c.id === 'C3')?.status, 'FAIL')
    assert.equal(f.status, 'NOT ACCEPTED')
  } finally { store().deleteJson('shadow:orders') }
  assert.equal(FF.evaluateFirstFill({ now: NOW, persist: false }).status, 'ACCEPTED', 'clean again once the fixtures are removed')
})

test('a fill the model would not have produced is a FAIL with model and record both named; a later disagreement keeps the earlier acceptance and flags it', () => {
  const p = pt.readPositions().open[0]
  const original = p.entry
  const tampered: PaperPosition = { ...p, entry: original + 1 } // an open position is still writable; a closed one is immutable
  store().savePosition(tampered)
  try {
    const f = FF.evaluateFirstFill({ now: NOW + 120_000 })
    assert.equal(f.status, 'NOT ACCEPTED')
    const c4 = f.checks.find((c) => c.id === 'C4')!
    assert.equal(c4.status, 'FAIL')
    assert.match(c4.evidence ?? '', /model .* record/)
    assert.equal(f.chain.find((s) => s.name === 'Fill')?.status, 'FAIL')
    assert.equal(f.durable.regressed, true)
    assert.equal(f.durable.acceptedAt, NOW, 'the earlier acceptance is kept, not erased')
    assert.match(f.durable.regressionNote ?? '', /later evaluation disagrees/)
  } finally { const restored: PaperPosition = { ...p, entry: original }; store().savePosition(restored) }
  const back = FF.evaluateFirstFill({ now: NOW + 180_000 })
  assert.equal(back.status, 'ACCEPTED')
  assert.equal(back.durable.regressed, false)
})

test('duplicate fill: a second record for the same signal fails D5 and the Position stage', () => {
  const p = pt.readPositions().open[0]
  const dup = { ...p, id: `${p.id}-dup` }
  store().savePosition(dup)
  try {
    const f = FF.evaluateFirstFill({ now: NOW, persist: false })
    assert.equal(f.checks.find((c) => c.id === 'D5')?.status, 'FAIL')
    assert.equal(f.chain.find((s) => s.name === 'Position')?.status, 'FAIL')
    assert.equal(f.status, 'NOT ACCEPTED')
  } finally { store().db.prepare('DELETE FROM positions WHERE id = ?').run(dup.id) }
})

test('missing evidence is MISSING, never PASS: without the decision snapshot the decision, risk and hindsight cannot be established', () => {
  const p = pt.readPositions().open[0]
  const { snapshot, ...bare } = p
  store().savePosition(bare)
  try {
    const f = FF.evaluateFirstFill({ now: NOW, persist: false })
    assert.equal(f.status, 'NOT ACCEPTED')
    for (const id of ['B3', 'B4', 'B5', 'B6', 'A6']) assert.equal(f.checks.find((c) => c.id === id)?.status, 'MISSING', id)
    assert.equal(f.hindsight.status, 'MISSING')
    assert.equal(f.chain.find((s) => s.name === 'Decision')?.status, 'WAITING')
    assert.equal(f.checks.filter((c) => c.status === 'PASS').some((c) => c.id === 'B3'), false)
  } finally { const restored: PaperPosition = { ...bare, snapshot }; store().savePosition(restored) }
})

test('hindsight: an observer record that was "available" before it happened fails the audit and blocks acceptance', () => {
  const p = pt.readPositions().open[0]
  const obs = O.listObservations({ limit: 100 }).find((o) => o.recordId === p.id)!
  store().upsertObservation({ id: obs.id, time: obs.time, kind: obs.type, significance: obs.significance.score, status: obs.status }, { ...obs, availableAt: obs.time - 60_000 })
  try {
    const f = FF.evaluateFirstFill({ now: NOW, persist: false })
    assert.equal(f.hindsight.status, 'FAIL')
    assert.ok(f.hindsight.findings.some((x) => /before it happened/.test(x)))
    assert.equal(f.status, 'NOT ACCEPTED')
  } finally { store().upsertObservation({ id: obs.id, time: obs.time, kind: obs.type, significance: obs.significance.score, status: obs.status }, obs) }
})

test('after the close: reconciliation joins the contract, the ledger row is checked, and the chain is complete', () => {
  const toTarget = mk(OPEN0 + 2 * STEP, 100.4, 102.5, 100.3, 102.1)
  store().upsertCandles(config.symbol, config.interval, [toTarget], 'test')
  const closed = pt.managePositions([signalCandle, fillCandle, toTarget])
  assert.equal(closed[0].exitReason, 'target')
  PR.reconcileExcursions(pt.readPositions().closed[0])
  const f = FF.evaluateFirstFill({ now: OPEN0 + 4 * STEP })
  assert.equal(f.checks.find((c) => c.id === 'D2')?.status, 'PASS')
  assert.equal(f.checks.find((c) => c.id === 'D4')?.status, 'PASS', f.checks.find((c) => c.id === 'D4')?.reason ?? '')
  assert.equal(f.checks.find((c) => c.id === 'D3')?.status, 'NOT_APPLICABLE')
  assert.equal(f.chain.find((s) => s.name === 'Reconciliation')?.status, 'PASS')
  assert.equal(f.status, 'ACCEPTED', JSON.stringify(f.checks.filter((c) => c.status === 'FAIL' || c.status === 'MISSING')))
  assert.equal(f.after?.exit?.reason, 'target')
  assert.equal(f.after?.reconciliation?.verdict, 'CONSISTENT')
  assert.equal(f.before?.decidedAt, T0, 'BEFORE is unchanged by the outcome')
})
