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
after(() => tmp.cleanup())

const T0 = Date.UTC(2026, 0, 15, 14, 0)
const signal: Signal = {
  action: 'BUY', reason: 'test', price: 100, time: T0, setupKey: 'BTCUSDT|5m|ICT|london|long|asia-low|IFVG', evidence: [], quality: 70,
  plan: { direction: 'long', entry: 100, stop: 99, takeProfit: 102, rr: 2, entryLabel: '', stopLabel: '', targetLabel: '' },
}
const risk: RiskDecision = { approved: true, finalAction: 'BUY', reason: 'ok', quantity: 0.2, positionValueUsd: 20, riskUsd: 0.2 }

test('opening a paper position records it and nothing else', () => {
  const p = pt.openPosition(signal, risk, 'London')
  assert.equal(p.status, 'open')
  assert.equal(pt.readPositions().open.length, 1)
  assert.equal(pt.equity(), 25)
  assert.equal(mem.readLedger().length, 0, 'no ledger row until it closes')
  assert.equal(pt.todaysPaperStats(p.dayKey).trades, 1)
})

test('managing with candles that reach the target closes it, records the ledger, equity, lesson check and a journal entry', () => {
  const quiet = mk(T0 + STEP, 100, 100.5, 99.6, 100.2)
  const toTarget = mk(T0 + 2 * STEP, 100.2, 102.4, 100.1, 102.1)
  assert.deepEqual(pt.managePositions([quiet]), [], 'nothing closes on a quiet candle')
  const closed = pt.managePositions([quiet, toTarget])
  assert.equal(closed.length, 1)
  assert.equal(closed[0].exitReason, 'target')
  assert.equal(closed[0].exit, 102)
  assert.ok(Math.abs((closed[0].rMultiple ?? 0) - 1.8) < 1e-9)
  assert.equal(pt.readPositions().open.length, 0)
  assert.equal(pt.readPositions().closed.length, 1)
  const rows = mem.readLedger()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].mode, 'live-paper')
  assert.equal(rows[0].outcome, 'WIN')
  assert.equal(existsSync(pt.EQUITY_PATH), true)
  assert.match(readFileSync(pt.EQUITY_PATH, 'utf8'), /timestamp,equity/)
  assert.equal(jr.readJournal().length, 1)
  assert.ok(jr.readJournal()[0].tags.includes('bot paper trade'))
  assert.ok(pt.equity() > 25)
})

test('a manual close records the exit at the given price', () => {
  const p = pt.openPosition({ ...signal, time: T0 + 10 * STEP }, risk, 'London')
  const c = pt.closeManually(p.id, 99.5)
  assert.ok(c)
  assert.equal(c!.exitReason, 'manual')
  assert.ok((c!.rMultiple ?? 0) < 0)
  assert.equal(pt.closeManually('does-not-exist', 100), null)
})

test('paperStats summarises the record and builds the equity curve', () => {
  const s = pt.paperStats(101)
  assert.equal(s.trades, 2)
  assert.equal(s.wins, 1)
  assert.equal(s.losses, 1)
  assert.equal(s.winRate, 0.5)
  assert.equal(s.curve.length, 2)
  assert.equal(s.open.length, 0)
  assert.ok(Math.abs(s.equityUsd - s.curve[1].equity) < 1e-9)
})

test('a losing streak on one setup key writes a lesson, exactly once', () => {
  for (let i = 0; i < 3; i++) {
    const p = pt.openPosition({ ...signal, time: T0 + (20 + i) * STEP }, risk, 'London')
    pt.closeManually(p.id, 98)
  }
  const lessons = mem.lessonLines()
  assert.equal(lessons.length, 1, 'one lesson, written the moment the rule was first met (3 losses of 4) and never duplicated')
  assert.match(lessons[0], /lost 3 of 4 times/)
  assert.equal(pt.learnFromLedger(signal.setupKey), false, 'already on file')
})
