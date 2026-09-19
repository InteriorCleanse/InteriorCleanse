/**
 * RESEARCH OPS — one bus subscriber, one bounded timer, at most one experiment
 * per tick, digests once per period, state persisted so a restart resumes
 * without duplicating anything, and a status screen that says so.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir, syntheticKlines } from '../helpers.ts'
import type { Candle } from '../../src/types.ts'
import type { Snapshot } from '../../src/bot.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'

const tmp = tempDataDir('mrcash-ops-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const { store } = await import('../../src/store.ts')
const { bus } = await import('../../src/data/bus.ts')
const ops = await import('../../src/learning/ops.ts')
const status = await import('../../src/learning/status.ts')
const X = await import('../../src/research/experiments.ts')
const Q = await import('../../src/research/queue.ts')
const H = await import('../../src/research/hypotheses.ts')
const D = await import('../../src/learning/digest.ts')
const cs = await import('../../src/school/caseStudies.ts')
const { tradingDayKey } = await import('../../src/sessions.ts')
after(() => tmp.cleanup())

const NOW = Date.UTC(2026, 0, 20, 15, 0)
const DAY = 86_400_000
const HOUR = 3_600_000
const before = JSON.stringify({ live: config.live, shadow: config.shadow, strategies: config.strategies, fusion: config.fusion, risk: config.risk })

function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
function pos(i: number, closedAt: number, over: Partial<PaperPosition> = {}): PaperPosition {
  const openedAt = closedAt - 1_800_000
  return {
    id: `op${i}`, openedAt, dayKey: tradingDayKey(openedAt), session: 'London', setupKey: 'BTCUSDT|5m|silver-bullet|long', direction: 'long',
    intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 0.01, riskUsd: 1, quality: 85, reason: 'test', atr: 0.5, status: 'closed',
    filledAt: openedAt + 300_000, strategyId: 'silver-bullet', regime: 'trending-up', closedAt, exit: 102, exitReason: 'target', rMultiple: 1, pnlUsd: 1, feesUsd: 0.01, outcome: 'WIN', candlesHeld: 5,
    ...over,
  }
}
/** 140 closed paper trades over 70 days: London leans one way, Asia the other, so a cohort question clears the 50-trade bar and is testable. */
function population(): PaperPosition[] {
  const g = rng(11)
  return Array.from({ length: 140 }, (_, i) => { const london = i % 2 === 0; const rm = (london ? 0.5 : -0.2) + (g() - 0.5) * 1.4; return pos(i, NOW - 70 * DAY + i * 12 * HOUR, { session: london ? 'London' : 'Asia', rMultiple: rm, exit: 100 + rm, outcome: rm > 0 ? 'WIN' : 'LOSS', exitReason: rm > 0 ? 'target' : 'stop' }) })
}
const closed = population()

test('a research tick at zero data runs every step, writes no digest on the first tick, persists its state and changes nothing', async () => {
  const r = await ops.researchTick({ closed: () => [], now: NOW })
  assert.equal(r.steps.length, 10, r.steps.map((s) => `${s.name}:${s.ok}`).join(','))
  assert.ok(r.steps.every((s) => s.ok), r.steps.filter((s) => !s.ok).map((s) => `${s.name}: ${s.detail}`).join(' | '))
  assert.equal(r.experiment, null)
  assert.deepEqual(r.digests, [])
  assert.match(r.note, /Nothing in production changed/)
  const s = ops.readOps()
  assert.equal(s.lastRun, NOW); assert.equal(s.nextRun, NOW + ops.RESEARCH_TICK_MS); assert.equal(s.running, false); assert.equal(s.runs, 1)
  assert.equal(s.lastDigestDay, tradingDayKey(NOW))
  assert.equal(s.lastWeekly, D.weekKey(NOW)); assert.equal(s.lastMonthly, D.monthKey(NOW))
  assert.equal(JSON.stringify({ live: config.live, shadow: config.shadow, strategies: config.strategies, fusion: config.fusion, risk: config.risk }), before)
})

test('with a record: at most one experiment per tick, drafted into a hypothesis, run with its challenger, and never re-run', async () => {
  const t1 = NOW + HOUR
  const r1 = await ops.researchTick({ closed: () => closed, now: t1 })
  assert.ok(r1.steps.every((s) => s.ok), r1.steps.filter((s) => !s.ok).map((s) => `${s.name}: ${s.detail}`).join(' | '))
  assert.ok(r1.experiment, 'a testable cohort question runs as an experiment')
  const e1 = X.getExperiment(r1.experiment!.id)!
  assert.equal(e1.status, 'DONE')
  assert.equal(e1.kind, 'cohort', 'the scheduler never starts a parameter experiment')
  assert.ok(e1.hypothesisId && H.getHypothesis(e1.hypothesisId), 'the queue item was given a hypothesis on record')
  assert.ok(e1.challenge && (e1.challenge as { overall: string }).overall, 'the challenger ran')
  assert.ok(e1.baselineOos, 'a baseline was defined and measured')
  const q1 = Q.getQueueItem(r1.experiment!.queueItemId)!
  assert.equal(q1.status, 'TESTED')
  assert.equal(q1.hypothesisId, e1.hypothesisId)
  assert.equal(X.listExperiments({ status: 'DONE' }).length, 1)
  const r2 = await ops.researchTick({ closed: () => closed, now: t1 + HOUR })
  assert.ok(X.listExperiments({ status: 'DONE' }).length <= 2, 'one more at most')
  if (r2.experiment) assert.notEqual(r2.experiment.id, r1.experiment!.id, 'a DONE experiment is not re-run')
  assert.equal(ops.readOps().runs, 3)
  assert.equal(JSON.stringify({ live: config.live, shadow: config.shadow, strategies: config.strategies, fusion: config.fusion, risk: config.risk }), before)
})

test('restart recovery: a stranded RUNNING experiment is finished first, a stuck running flag is cleared, and a rolled day writes exactly one digest', async () => {
  // Strand an experiment as a crash would.
  const done = X.listExperiments({ status: 'DONE' })[0]
  const spec = { hypothesisId: null, kind: 'cohort' as const, strategyId: 'silver-bullet', source: 'PAPER' as const, filters: [{ dimension: 'regime' as const, values: ['trending-up'] }], direction: 'positive' as const, method: 'cohort experiment from queue item stranded-item: regime test' }
  const { paperDataset } = await import('../../src/analyst/records.ts')
  const reg = X.registerExperiment(spec, paperDataset(closed), NOW + 2 * HOUR)
  X.saveExperiment({ ...reg.experiment, status: 'RUNNING', startedAt: NOW + 2 * HOUR })
  const before = X.listExperiments({ status: 'DONE' }).length
  const r = await ops.researchTick({ closed: () => closed, now: NOW + 3 * HOUR })
  assert.equal(r.experiment?.id, reg.experiment.experimentId, 'the stranded experiment is picked up before anything new')
  assert.equal(X.getExperiment(reg.experiment.experimentId)!.status, 'DONE')
  assert.equal(X.listExperiments({ status: 'DONE' }).length, before + 1)
  assert.equal(X.getExperiment(done.experimentId)!.finishedAt, done.finishedAt, 'a finished experiment is untouched by recovery')
  // A running flag left behind by a crash: recent → skipped once; old → cleared and run.
  store().setJson('research:ops', { ...ops.readOps(), running: true, lastRun: NOW + 3 * HOUR })
  const skipped = await ops.researchTick({ closed: () => closed, now: NOW + 3 * HOUR + 60_000 })
  assert.match(skipped.note, /already running/)
  store().setJson('research:ops', { ...ops.readOps(), running: true, lastRun: NOW - DAY })
  const recovered = await ops.researchTick({ closed: () => closed, now: NOW + 4 * HOUR })
  assert.equal(recovered.steps.length, 10)
  assert.equal(ops.readOps().running, false)
  // The day rolls: the first tick of the new day writes the digest for the day that ended, once.
  const dayAfter = NOW + DAY + 2 * HOUR
  assert.notEqual(tradingDayKey(dayAfter), ops.readOps().lastDigestDay)
  const r3 = await ops.researchTick({ closed: () => closed, now: dayAfter })
  const prevKey = tradingDayKey(ops.tradingDayStart(dayAfter) - 1)
  assert.deepEqual(r3.digests, [`digest:daily:${prevKey}`])
  assert.equal(ops.readOps().lastDigestDay, tradingDayKey(dayAfter))
  const r4 = await ops.researchTick({ closed: () => closed, now: dayAfter + HOUR })
  assert.deepEqual(r4.digests, [], 'the same day is not digested twice')
  assert.equal(D.listDigests('daily').length, 1)
  const dig = D.getDigest<import('../../src/learning/digest.ts').DailyDigest>(`digest:daily:${prevKey}`)!
  assert.equal(dig.dayKey, prevKey)
  assert.ok(dig.to <= ops.tradingDayStart(dayAfter), 'the digest window ends where the day ended')
  // A month roll writes the audit once, keyed by the new month, covering what came before.
  const nextMonth = Date.UTC(2026, 1, 2, 15, 0)
  const r5 = await ops.researchTick({ closed: () => closed, now: nextMonth })
  assert.ok(r5.digests.some((d) => d.startsWith('digest:monthly:2026-02')) && r5.digests.some((d) => d.startsWith('digest:weekly:')))
  assert.equal(ops.readOps().lastMonthly, '2026-02')
})

test('the bus hook observes each cycle without throwing, and the scheduler resumes from the persisted state with one timer', async () => {
  const candles: Candle[] = syntheticKlines(3, 17, NOW).map((k) => ({ openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5], closeTime: k[6] }))
  store().upsertCandles(config.symbol, config.interval, candles, 'rest')
  const steps = cs.stepEngine(candles, 200)
  const i = steps.length - 2
  const snap: Snapshot = { candles: candles.slice(0, i + 1), analysis: steps[i].analysis, signal: steps[i].analysis.signal, news: null, plan: null, engine: null, flow: null, state: null, strategyVotes: steps[i].votes ?? [], decision: steps[i].decision ?? null }
  const cyclesBefore = ops.readOps().cycles
  bus.emit('watch:cycle', { at: candles[i].closeTime + 1, snap })
  assert.equal(ops.readOps().cycles, cyclesBefore, 'nothing listens until the scheduler starts')
  const log: string[] = []
  const sched = ops.startResearchOps({ tickMs: 60_000, settleMs: 30, deps: { closed: () => closed, now: NOW + 5 * HOUR }, log: (l) => log.push(l) })
  bus.emit('watch:cycle', { at: candles[i].closeTime + 1, snap })
  bus.emit('watch:cycle', { at: candles[i].closeTime + 1, snap })
  assert.equal(ops.readOps().cycles, cyclesBefore + 2)
  assert.ok(ops.readOps().lastCycle && ops.readOps().lastCycle!.at === candles[i].closeTime + 1)
  bus.emit('watch:cycle', { at: NOW, snap: { ...snap, analysis: null } as never })
  assert.equal(ops.readOps().cycles, cyclesBefore + 3, 'a cycle the observer cannot read is still counted, not thrown')
  await new Promise((r) => setTimeout(r, 400))
  assert.ok(log.some((l) => /research ops: first tick/.test(l)))
  assert.ok(ops.readOps().runs >= 1 && log.some((l) => /^research: /.test(l)), 'the settle timer ran one tick')
  const running = sched.runNow(); const again = sched.runNow()
  assert.equal(running, again, 'a run in flight is shared, not doubled')
  await running
  sched.stop()
  const runsAfterStop = ops.readOps().runs
  bus.emit('watch:cycle', { at: candles[i].closeTime + 1, snap })
  assert.equal(ops.readOps().cycles, cyclesBefore + 3, 'stopped: the bus is no longer observed')
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(ops.readOps().runs, runsAfterStop)
  assert.equal(JSON.stringify({ live: config.live, shadow: config.shadow, strategies: config.strategies, fusion: config.fusion, risk: config.risk }), before)
})

test('system status names every layer, the last and next research run, the counts, and no performance figure', () => {
  const s = status.systemStatus({ closed, open: 0, now: NOW + 6 * HOUR })
  assert.ok(['LIVE', 'IDLE', 'STALE', 'NEVER'].includes(s.marketData.health))
  assert.equal(s.paperEngine.liveGate, false)
  assert.equal(s.paperEngine.closed, closed.length)
  assert.equal(s.researchEngine.lastRun, ops.readOps().lastRun)
  assert.equal(s.nextResearchRun, ops.readOps().nextRun)
  assert.ok(s.researchEngine.experiments.done >= 2 && s.researchEngine.queue.total >= 1)
  assert.ok(s.learningLoop.cycles >= 3)
  assert.ok(['LIVE', 'NEVER'].includes(s.knowledgeStore.health))
  assert.match(s.summary, /live gate off/)
  assert.doesNotMatch(JSON.stringify(s), /\b(profit factor|sharpe|win rate|expectancy|edge|profitable)\b/i)
  assert.ok(s.notes.some((n) => /cannot reach the signal engine/.test(n)))
})
