/**
 * The structured logger: JSON lines, level filtering, and size-based rotation
 * so a 24/7 process never fills the disk.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '../src/log.ts'

const dir = mkdtempSync(join(tmpdir(), 'mrcash-log-'))
after(() => { try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ } })

test('every line is one JSON object with a timestamp, level, message and fields', () => {
  const log = createLogger({ dir, file: 'a.log', level: 'debug', console: false })
  log.info('hello', { setup: 'BTCUSDT', r: 1.5 })
  const line = readFileSync(join(dir, 'a.log'), 'utf8').trim().split('\n')[0]
  const rec = JSON.parse(line)
  assert.equal(rec.level, 'info')
  assert.equal(rec.msg, 'hello')
  assert.equal(rec.setup, 'BTCUSDT')
  assert.equal(rec.r, 1.5)
  assert.ok(typeof rec.t === 'string' && rec.t.includes('T'))
})

test('level filtering drops messages below the threshold', () => {
  const log = createLogger({ dir, file: 'b.log', level: 'warn', console: false })
  log.debug('nope'); log.info('nope'); log.warn('yes'); log.error('yes2')
  const lines = readFileSync(join(dir, 'b.log'), 'utf8').trim().split('\n')
  assert.equal(lines.length, 2)
  assert.deepEqual(lines.map((l) => JSON.parse(l).msg), ['yes', 'yes2'])
})

test('the file rotates when it passes the size cap, keeping recent files', () => {
  const log = createLogger({ dir, file: 'c.log', level: 'info', maxBytes: 400, maxFiles: 3, console: false })
  for (let i = 0; i < 50; i++) log.info('a fairly long message to grow the file quickly', { i })
  assert.ok(existsSync(join(dir, 'c.log')), 'current file exists')
  assert.ok(existsSync(join(dir, 'c.log.1')), 'a rotated file exists')
  // The current file is small (recently rotated), not the whole 50 lines.
  const current = readFileSync(join(dir, 'c.log'), 'utf8').trim().split('\n')
  assert.ok(current.length < 50)
})

test('a logging failure never throws (bad directory is swallowed)', () => {
  const log = createLogger({ dir: '/', file: 'root-cannot-write-here/x.log', console: false })
  assert.doesNotThrow(() => log.error('should not throw even if it cannot write'))
})
