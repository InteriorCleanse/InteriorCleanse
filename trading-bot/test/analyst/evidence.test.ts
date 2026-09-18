/**
 * THE EVIDENCE ASSEMBLER — zero trades is NOT ENOUGH DATA everywhere, sources
 * never merge, and a trade's WHY comes only from what the engine wrote.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'
import type { Candle, ReplayTrade } from '../../src/types.ts'

const tmp = tempDataDir('mrcash-evidence-')
process.env.MRCASH_DATA_DIR = tmp.dir
const ev = await import('../../src/analyst/evidence.ts')
after(() => tmp.cleanup())

const STEP = 300_000
const T0 = Date.UTC(2026, 0, 13, 13, 30)
const candles = (from: number, count: number): Candle[] => Array.from({ length: count }, (_, i) => ({ openTime: from + i * STEP, closeTime: from + i * STEP + STEP - 1, open: 100, high: 101, low: 99.5, close: 100, volume: 1 }))
const reader = (_s: string, _i: string, from: number, to: number) => candles(from, Math.max(0, Math.round((to - from) / STEP) + 1))

let n = 0
function pos(r: number, over: Partial<PaperPosition> = {}): PaperPosition {
  n++
  return {
    id: `p${n}`, openedAt: T0 + n * 3_600_000, filledAt: T0 + n * 3_600_000 + STEP, closedAt: T0 + n * 3_600_000 + 6 * STEP, dayKey: 'D', session: 'London',
    setupKey: 'BTCUSDT|5m|silver-bullet|BUY', direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 1, riskUsd: 1,
    quality: 70, reason: 'sweep then gap', atr: 1, status: 'closed', exitReason: r > 0 ? 'target' : 'stop', exit: 100 + r, rMultiple: r, pnlUsd: r, feesUsd: 0,
    outcome: r > 0 ? 'WIN' : 'LOSS', strategyId: 'silver-bullet', regime: 'ranging', observedSpreadPct: 0.01, ...over,
  } as PaperPosition
}
const rt = (i: number, r = 2): ReplayTrade => ({
  index: i, time: T0 + i * 3_600_000, action: 'BUY', intendedEntry: 100, entryPrice: 100, entryTime: T0 + i * 3_600_000 + STEP, exitPrice: 100 + r, exitTime: T0 + i * 3_600_000 + 6 * STEP,
  exitReason: 'target', costsUsd: 0, pnlPercent: r, pnlUsd: r, rMultiple: r, outcome: 'WIN', setupKey: 'BTCUSDT|5m|silver-bullet|BUY', session: 'london', regime: 'ranging',
} as ReplayTrade)
const bt = (trades: ReplayTrade[]): ev.BacktestCache => ({
  strategyId: 'silver-bullet', symbol: 'BTCUSDT', interval: '5m', source: 'BACKTEST', dataType: 'SIMULATED', computedAt: T0, engineVersion: 'x',
  window: { from: T0, to: T0 + 40 * 3_600_000 }, fillModel: 'realistic', assumptions: { spreadBps: 5, slippageBps: 3, takerFeePercent: 0.1 }, trades, notes: [],
})
const inputs = (closed: PaperPosition[], backtest: ev.BacktestCache | null): ev.EvidenceInputs => ({ closed, backtest, candlesBetween: reader, stepMs: STEP, feed: { ageSec: 30, maxAgeSec: 900 }, now: T0 + 50 * 3_600_000 })

test('zero paper trades and no backtest: NOT ENOUGH DATA on both sides, INSUFFICIENT SAMPLE comparison, nothing estimated', () => {
  const o = ev.overview(inputs([], null))
  assert.equal(o.paper.trades, 0)
  assert.equal(o.paper.status, 'NOT ENOUGH DATA')
  assert.equal(o.paper.narration.notEnoughData, true)
  assert.equal(o.backtest.status, 'NOT ENOUGH DATA')
  assert.equal(o.backtest.cachedAt, null)
  assert.equal(o.comparison.verdict, 'INSUFFICIENT SAMPLE')
  assert.equal(o.comparison.rows.find((r) => r.metric === 'Mean R')!.paper, '—')
  assert.equal(o.paper.quality.verdict, 'OK', 'an empty run is not DEGRADED for being empty')
  assert.deepEqual(o.bars, { insufficient: 10, early: 50, developing: 200 })
})

test('a cached backtest populates the SIMULATED side while paper still says NOT ENOUGH DATA', () => {
  const o = ev.overview(inputs([], bt(Array.from({ length: 30 }, (_, i) => rt(i, i % 3 === 2 ? -1 : 2)))))
  assert.equal(o.paper.status, 'NOT ENOUGH DATA')
  assert.equal(o.backtest.trades, 30)
  assert.equal(o.backtest.status, 'EARLY SAMPLE')
  assert.equal(o.backtest.provenance.source, 'BACKTEST')
  assert.equal(o.backtest.provenance.dataType, 'SIMULATED')
  assert.match(o.comparison.rows.find((r) => r.metric === 'Execution assumptions')!.backtest, /spread 5bp/)
  assert.equal(o.comparison.verdict, 'INSUFFICIENT SAMPLE', 'no paper side yet')
})

test('every view carries its own source and the two never share a table', () => {
  const inp = inputs(Array.from({ length: 12 }, (_, i) => pos(i % 3 === 2 ? -1 : 2)), bt(Array.from({ length: 30 }, (_, i) => rt(i))))
  const p = ev.dimensionView(inp, 'paper', 'session')
  const b = ev.dimensionView(inp, 'backtest', 'session')
  assert.equal(p.table.provenance.source, 'PAPER')
  assert.equal(b.table.provenance.source, 'BACKTEST')
  assert.equal(p.table.rows[0].stats.n, 12)
  assert.equal(b.table.rows[0].stats.n, 30)
  assert.equal(p.theses.length, p.table.rows.length)
  const x = ev.crossView(inp, 'paper', 'session', 'strategyId')
  assert.equal(x.cross.provenance.source, 'PAPER')
  assert.equal(x.heat.cells[0].n, 12)
  const c = ev.cohortView(inp, 'backtest', { name: 'sb', filters: [{ dimension: 'strategyId', values: ['silver-bullet'] }] })
  assert.equal(c.cohort.provenance.source, 'BACKTEST')
  assert.equal(c.cohort.stats.n, 30)
  assert.equal(c.thesis.source, 'BACKTEST')
})

test('MAE and MFE are resolved from the candle reader for every view', () => {
  const inp = inputs(Array.from({ length: 12 }, () => pos(2)), null)
  const t = ev.tradesView(inp, 'paper')
  assert.equal(t.trades.length, 12)
  assert.equal(t.trades[0].mae.status, 'OBSERVED')
  assert.ok(Math.abs(t.trades[0].mae.r! - -0.5) < 1e-9, 'a dip to 99.5 on a 1.0 stop is −0.5R')
  assert.ok(Math.abs(t.trades[0].mfe.r! - 1) < 1e-9)
  const o = ev.overview(inp)
  assert.equal(o.paper.fields.find((f) => f.field === 'mae')!.recorded, 12)
})

test('the journal view lists taken, missed and corrupt separately, newest first', () => {
  const inp = inputs([pos(2), pos(-1, { exitReason: 'missed', filledAt: undefined, rMultiple: 0, pnlUsd: 0 }), pos(1, { id: '' })], null)
  const t = ev.tradesView(inp, 'paper')
  assert.equal(t.trades.length, 1)
  assert.equal(t.missed.length, 1)
  assert.equal(t.corrupt.length, 1)
  assert.equal(t.trades[0].hasSnapshot, false)
})

/**
 * WHY comes only from the snapshot the engine wrote. A record without one gets
 * no reconstruction — reconstructing from a later feature engine is hindsight.
 */
test('a trade without a snapshot has no WHY and says so; a trade with one replays the engine\'s own reasons', () => {
  const snapshot = {
    signalId: 'k@1', symbol: 'BTCUSDT', interval: '5m', engineVersion: '2.3.0', featureVersion: 1, volatility: 'normal' as const,
    fusedScore: 71, fusedAction: 'LONG', confirms: ['Structure agrees.'], invalidates: [], contributors: [{ id: 'silver-bullet', action: 'BUY', confidence: 80 }],
    evidence: [{ step: 'Sweep of the session low', passed: true, detail: 'took 99.4' }, { step: 'Gap inverted', passed: true, detail: 'held' }],
    riskChecks: [{ rule: 'Kill switch', passed: true, detail: 'off' }, { rule: 'Spread', passed: true, detail: '1bp' }], riskVetoedBy: null, newsMinutes: 120, inBlackout: false,
  }
  const a = pos(2), b = pos(2, { snapshot })
  const inp = inputs([a, b], null)
  const bare = ev.tradeDetail(inp, a.id)!
  assert.equal(bare.why, null)
  assert.match(bare.whyNote, /predates the decision-time snapshot/)
  assert.match(bare.whyNote, /would be hindsight/)
  assert.equal(bare.stages.length, 7)

  const withSnap = ev.tradeDetail(inp, b.id)!
  assert.ok(withSnap.why)
  assert.equal(withSnap.why!.exists, true)
  const labels = withSnap.why!.reasons.map((r) => r.label)
  assert.ok(labels.includes('Sweep of the session low'))
  assert.ok(labels.includes('Fusion confirms'))
  assert.ok(labels.includes('Kill switch'))
  assert.equal(withSnap.why!.reasons.find((r) => r.label === 'Sweep of the session low')!.source, 'strategy:silver-bullet')
  assert.match(withSnap.whyNote, /Nothing has been recomputed from later candles/)
  assert.equal(withSnap.exit.reason, 'target')
  assert.equal(ev.tradeDetail(inp, 'nope'), null)
})

test('the backtest cache reads back null until refreshed, and the trading strategy id follows config', async () => {
  assert.equal(ev.cachedBacktest('silver-bullet'), null)
  assert.equal(typeof ev.tradingStrategyId(), 'string')
})
