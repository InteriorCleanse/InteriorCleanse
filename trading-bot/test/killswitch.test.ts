import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The data folder is chosen when memory.ts is first imported, so set it before the dynamic import.
const dir = mkdtempSync(join(tmpdir(), 'mrcash-kill-'))
process.env.MRCASH_DATA_DIR = dir
const ks = await import('../src/killswitch.ts')
const mode = await import('../src/mode.ts')

before(() => { ks.resume() })
after(() => { rmSync(dir, { recursive: true, force: true }) })

test('fresh install: nothing is stopped and entries are allowed', () => {
  assert.equal(ks.isStopped(), false)
  assert.equal(ks.entriesAllowed().ok, true)
})

test('stop() writes the STOP file and blocks entries with a readable reason', () => {
  const s = ks.stop('testing the brake')
  assert.equal(s.stopped, true)
  assert.equal(existsSync(ks.STOP_PATH), true)
  const gate = ks.entriesAllowed()
  assert.equal(gate.ok, false)
  if (!gate.ok) assert.match(gate.reason, /testing the brake/)
})

test('resume() removes the file and allows entries again; both are idempotent', () => {
  ks.resume()
  ks.resume()
  assert.equal(existsSync(ks.STOP_PATH), false)
  assert.equal(ks.entriesAllowed().ok, true)
  ks.stop(); ks.stop()
  assert.equal(ks.isStopped(), true)
  ks.resume()
})

test('the mode ladder starts at paper and only paper is reachable', () => {
  assert.equal(mode.runtimeMode(), 'paper')
  assert.equal(mode.isPaperOnly(), true)
  assert.equal(mode.MODE_LADDER[0], 'paper')
  assert.match(mode.describeMode(), /PAPER/)
})
