import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tempDataDir } from './helpers.ts'

const tmp = tempDataDir('mrcash-memory-')
process.env.MRCASH_DATA_DIR = tmp.dir
const m = await import('../src/memory.ts')
after(() => tmp.cleanup())

test('a fresh data folder means empty memory, and the files are created on first touch', () => {
  assert.equal(m.memoryIsEmpty(), true)
  assert.deepEqual(m.readLedger(), [])
  assert.match(readFileSync(m.LEDGER_PATH, 'utf8'), /^timestamp,symbol/)
  assert.match(readFileSync(m.LEARNINGS_PATH, 'utf8'), /What the bot has learned/)
})

test('ledger rows survive commas and quotes in the reason', () => {
  const reason = 'BTCUSDT|5m|ICT|london|long|asia-low|IFVG — "quoted", with commas, and more'
  m.appendLedgerRow({ timestamp: '2026-01-15T13:30:00.000Z', symbol: 'BTCUSDT', action: 'BUY', price: 100.5, quantity: 0.001, reason, mode: 'replay-raw', outcome: 'WIN', pnl: 1.2345 })
  const rows = m.readLedger()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].reason, reason)
  assert.equal(rows[0].price, 100.5)
  assert.equal(rows[0].pnl, 1.2345)
  assert.equal(rows[0].outcome, 'WIN')
})

/**
 * This used to be a `todo`, documenting a line-based CSV reader that split a row
 * whenever a reason contained a newline. That limitation is gone: since Phase 3
 * the store (SQLite) is the source of truth and `readLedger()` reads from it,
 * while `data/ledger.csv` is a write-only human mirror that nothing parses back.
 * So the behaviour is now asserted properly rather than excused — a newline
 * survives the round trip intact, content included.
 */
test('a newline inside a reason survives the round trip', () => {
  m.resetMemory()
  const reason = 'line one\nline two'
  m.appendLedgerRow({ timestamp: '2026-01-15T13:30:00.000Z', symbol: 'BTCUSDT', action: 'BUY', price: 1, quantity: 1, reason, mode: 'replay-raw', outcome: 'WIN', pnl: 0 })
  const rows = m.readLedger()
  assert.equal(rows.length, 1, 'one row in, one row out — the newline must not split it')
  assert.equal(rows[0].reason, reason, 'the newline and both lines must be preserved exactly')
  m.resetMemory()
})

test('lessons are written once per key and displayed without their hidden marker', () => {
  assert.equal(m.addLesson('K1', 'Shorts after a New York sweep keep failing. [K1]'), true)
  assert.equal(m.addLesson('K1', 'Shorts after a New York sweep keep failing. [K1]'), false, 'second write is a no-op')
  assert.equal(m.addLesson('K2', 'Another lesson.'), true)
  const lines = m.lessonLines()
  assert.equal(lines.length, 2)
  assert.ok(lines.every((l) => !l.includes('<!--')))
  assert.equal(m.memoryIsEmpty(), false)
})

test('reset wipes both files back to empty', () => {
  m.resetMemory()
  assert.equal(m.memoryIsEmpty(), true)
  assert.deepEqual(m.lessonLines(), [])
})
