/**
 * FILE MIRRORS — a CSV copy that cannot be written never interrupts the record.
 * Every row written here is a SYNTHETIC TEST FIXTURE in the test's temp data directory.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { mirrorAppend, mirrorWrite, mirrorHealth, mirrorCheck, diskCheck, resetMirrorHealth, DISK_WARN_BYTES } from '../../src/ops/mirror.ts'
import { DATA_DIR, store } from '../../src/store.ts'
import { appendLedgerRow } from '../../src/memory.ts'

const dir = join(DATA_DIR, 'mirror-test')

test('a mirror gets its header once, then appends', () => {
  const p = join(dir, 'a.csv')
  assert.equal(mirrorAppend(p, '1\n', { header: 'h\n' }), true)
  assert.equal(mirrorAppend(p, '2\n', { header: 'h\n' }), true)
  assert.equal(readFileSync(p, 'utf8'), 'h\n1\n2\n')
})

test('a busy log mirror rolls to one previous generation at its size cap', () => {
  resetMirrorHealth()
  const p = join(dir, 'b.log')
  for (let i = 0; i < 30; i++) mirrorAppend(p, 'x'.repeat(9) + '\n', { header: 'h\n', maxBytes: 100 })
  assert.ok(existsSync(`${p}.1`))
  assert.ok(readFileSync(p, 'utf8').length <= 110, 'the live file stays near its cap')
  assert.ok(readFileSync(p, 'utf8').startsWith('h\n'), 'a rolled file starts with its header again')
  assert.ok(mirrorHealth().rolled >= 2)
})

test('a failed write returns false, is counted, and never throws', () => {
  resetMirrorHealth()
  const blocked = join(dir, 'blocked')
  mkdirSync(blocked, { recursive: true }) // a directory where a file should be: EISDIR, like a locked file
  assert.equal(mirrorAppend(blocked, 'row\n'), false)
  assert.equal(mirrorWrite(blocked, '{}'), false)
  const h = mirrorHealth()
  assert.equal(h.failures, 2)
  assert.equal(h.last?.file, 'blocked')
  assert.equal(mirrorCheck(h).ok, false)
  assert.equal(mirrorCheck(h, Date.now() + 2 * 3_600_000).ok, true, 'the soft check clears after an hour')
})

test('the ledger row reaches the store even when ledger.csv cannot be written', () => {
  const csv = join(DATA_DIR, 'ledger.csv')
  rmSync(csv, { force: true })
  mkdirSync(csv) // SYNTHETIC: stands in for a file locked by a spreadsheet
  try {
    const before = store().readLedger().length
    assert.doesNotThrow(() => appendLedgerRow({ timestamp: new Date(0).toISOString(), symbol: 'TESTUSDT', action: 'SKIP', price: 1, quantity: 0, reason: 'TEST FIXTURE', mode: 'live-paper', outcome: 'MISSED', pnl: 0 }))
    assert.equal(store().readLedger().length, before + 1)
  } finally {
    rmSync(csv, { recursive: true, force: true })
  }
})

test('disk check warns under 1 GB and says unknown when it cannot read', () => {
  assert.equal(diskCheck('/', () => ({ bavail: 10, bsize: 4096 })).ok, false)
  assert.equal(diskCheck('/', () => ({ bavail: BigInt(DISK_WARN_BYTES / 4096) + 1n, bsize: 4096n })).ok, true)
  const unknown = diskCheck('/', () => { throw new Error('ENOSYS') })
  assert.equal(unknown.ok, true)
  assert.match(unknown.detail, /unknown/)
  assert.equal(typeof diskCheck(DATA_DIR).ok, 'boolean', 'the real call works here')
})

test('order-flow history older than the retention is pruned from the store', () => {
  const now = Date.now()
  const row = (time: number) => ({ time, price: 1, bidUsd: 1, askUsd: 1, imbalance: 0, walls: '', trades: 1, tpm: 1, buyShare: 0.5, deltaUsd: 0, bigBuys: 0, bigSells: 0 }) // SYNTHETIC
  store().appendFlow(row(now - 200 * 86_400_000))
  store().appendFlow(row(now))
  const removed = store().pruneFlow(now - 90 * 86_400_000)
  assert.ok(removed >= 1)
  assert.ok(store().flowLog(10).some((r) => r.time === now))
})
