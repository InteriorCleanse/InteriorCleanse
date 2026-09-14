import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { tempDataDir } from './helpers.ts'
import { mk, STEP } from './fixtures/candles.ts'
import type { Signal, RiskDecision } from '../src/types.ts'

const tmp = tempDataDir('mrcash-paper-')
process.env.MRCASH_DATA_DIR = tmp.dir
const pt = await import('../src/paperTrader.ts')
const mem = await import('../src/memory.ts')
const jr = await import('../src/journal.ts')
const { config } = await import('../config.ts')
after(() => tmp.cleanup())

const T0 = Date.UTC(2026, 0, 15, 14, 0) // the signal candle's close
const sigAt = (t: number): Signal => ({
  action: 'BUY', reason: 'test', price: 100, time: t, setupKey: 'BTCUSDT|5m|ICT|london|long|asia-low|IFVG', evidence: [], quality: 70,
  plan: { direction: 'long', entry: 100, stop: 99, takeProfit: 102, rr: 2, entryLabel: '', stopLabel: '', targetLabel: '' },
})
const risk: RiskDecision = { approved: true, finalAction: 'BUY', reason: 'ok', quantity: 0.2, positionValueUsd: 20, riskUsd: 0.2 }
const signalCandle = (t: number) => mk(t - STEP + 1, 99.8, 100.3, 99.5, 100)
const nextCandle = (t: number, open = 100.05) => mk(t + 1, open, open + 0.55, open - 0.15, open + 0.35)
const entryCostBps = config.execution.spreadBps / 2 + config.execution.slippageBps

test('a new paper order is queued, counts toward today, and touches nothing else', () => {
  const p = pt.openPosition(sigAt(T0), risk, 'London', 1)
  assert.equal(p.status, 'pending')
  assert.equal(p.intendedEntry, 100)
  assert.equal(pt.readPositions().open.length, 1)
  assert.equal(pt.equity(), 25)
  assert.equal(mem.readLedger().length, 0, 'no ledger row until something happens')
  assert.equal(pt.todaysPaperStats(p.dayKey).trades, 1)
})

test('it stays queued until the next candle exists, then fills at that open plus costs and is re-sized from the fill', () => {
  assert.deepEqual(pt.managePositions([signalCandle(T0)]), [], 'no next candle yet')
  const changed = pt.managePositions([signalCandle(T0), nextCandle(T0)])
  assert.equal(changed.length, 1)
  const p = changed[0]
  assert.equal(p.status, 'open')
  assert.ok(Math.abs(p.entry - 100.05 * (1 + entryCostBps / 10_000)) < 1e-9)
  assert.equal(p.filledAt, T0 + 1)
  assert.ok((p.entryCostUsd ?? 0) > 0)
  assert.ok(Math.abs(p.riskUsd - Math.min(config.accountSizeUsd * config.riskPerTradePercent / 100, p.quantity * (p.entry - p.stop))) < 1e-9)
  assert.equal(pt.readPositions().open[0].status, 'open')
})

test('a candle that trades through the target closes it, records the ledger, equity, lesson check and a journal entry', () => {
  const toTarget = mk(T0 + 1 + STEP, 100.4, 102.5, 100.3, 102.1)
  const changed = pt.managePositions([signalCandle(T0), nextCandle(T0), toTarget])
  assert.equal(changed.length, 1)
  const c = changed[0]
  assert.equal(c.status, 'closed')
  assert.equal(c.exitReason, 'target')
  assert.equal(c.exit, 102)
  assert.ok((c.rMultiple ?? 0) > 1.5 && (c.rMultiple ?? 0) < 1.9, `R after costs from a slipped fill: ${c.rMultiple}`)
  assert.ok((c.feesUsd ?? 0) > 0)
  assert.equal(pt.readPositions().open.length, 0)
  assert.equal(pt.readPositions().closed.length, 1)
  const rows = mem.readLedger()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].mode, 'live-paper')
  assert.equal(rows[0].outcome, 'WIN')
  assert.ok(Math.abs(rows[0].price - c.entry) < 1e-9, 'the ledger records the FILL price')
  assert.equal(existsSync(pt.EQUITY_PATH), true)
  assert.match(readFileSync(pt.EQUITY_PATH, 'utf8'), /timestamp,equity/)
  assert.equal(jr.readJournal().length, 1)
  assert.match(jr.readJournal()[0].notes, /Intended entry \$100\.00, filled at/)
  assert.ok(pt.equity() > 25)
})

test('an order is MISSED when the next candle opens too far away; it is logged but is not a trade', () => {
  const t = T0 + 10 * STEP
  const p = pt.openPosition(sigAt(t), risk, 'London', 1)
  const changed = pt.managePositions([signalCandle(t), nextCandle(t, 100.7)])
  assert.equal(changed.length, 1)
  assert.equal(changed[0].exitReason, 'missed')
  assert.equal(changed[0].status, 'closed')
  assert.match(changed[0].note ?? '', /0\.70 ATR/)
  assert.equal(pt.readPositions().open.length, 0)
  assert.equal(pt.todaysPaperStats(p.dayKey).trades, 1, 'the missed order does not count as a trade')
  assert.equal(mem.readLedger().filter((r) => r.outcome === 'MISSED').length, 1)
})

test('a queued order can be cancelled; a filled position can be closed by hand at a price', () => {
  const t = T0 + 20 * STEP
  const queued = pt.openPosition(sigAt(t), risk, 'London', 1)
  const cancelled = pt.closeManually(queued.id, 100)
  assert.equal(cancelled?.exitReason, 'missed')
  assert.match(cancelled?.note ?? '', /cancelled by you/)
  const t2 = T0 + 30 * STEP
  const p = pt.openPosition(sigAt(t2), risk, 'London', 1)
  pt.managePositions([signalCandle(t2), nextCandle(t2)])
  const c = pt.closeManually(p.id, 99.5)
  assert.ok(c)
  assert.equal(c!.exitReason, 'manual')
  assert.ok((c!.rMultiple ?? 0) < 0)
  assert.equal(pt.closeManually('does-not-exist', 100), null)
})

test('paperStats separates trades from missed orders and reports costs', () => {
  const s = pt.paperStats(101)
  assert.equal(s.trades, 2)
  assert.equal(s.missed, 2)
  assert.equal(s.wins, 1)
  assert.equal(s.losses, 1)
  assert.equal(s.winRate, 0.5)
  assert.equal(s.curve.length, 2)
  assert.ok(s.costsUsd > 0)
  assert.equal(s.open.length, 0)
  assert.ok(Math.abs(s.equityUsd - s.curve[1].equity) < 1e-9)
})

test('a losing streak on one setup key writes a lesson, exactly once', () => {
  for (let i = 0; i < 3; i++) {
    const t = T0 + (40 + i * 5) * STEP
    const p = pt.openPosition(sigAt(t), risk, 'London', 1)
    pt.managePositions([signalCandle(t), nextCandle(t)])
    pt.closeManually(p.id, 98)
  }
  const lessons = mem.lessonLines()
  assert.equal(lessons.length, 1, 'one lesson, written the moment the rule was first met and never duplicated')
  assert.match(lessons[0], /lost 3 of 4 times/)
  assert.equal(pt.learnFromLedger(sigAt(T0).setupKey), false, 'already on file')
})
