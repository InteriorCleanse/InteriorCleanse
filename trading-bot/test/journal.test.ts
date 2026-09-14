import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { tempDataDir } from './helpers.ts'

const tmp = tempDataDir('mrcash-journal-')
process.env.MRCASH_DATA_DIR = tmp.dir
const j = await import('../src/journal.ts')
after(() => tmp.cleanup())

test('a new entry gets an id, computes R from entry/stop/exit and settles its outcome', () => {
  const e = j.upsertEntry({ direction: 'long', entry: 100, stop: 99, exit: 102, session: 'London', emotions: ['calm'], tags: ['followed plan'], followedPlan: true })
  assert.match(e.id, /^j/)
  assert.ok(Math.abs((e.rMultiple ?? 0) - 1.8) < 1e-9)
  assert.equal(e.outcome, 'win')
  assert.equal(existsSync(j.JOURNAL_PATH), true)
  assert.equal(j.readJournal().length, 1)
})

test('editing keeps the id and re-computes; unknown fields are ignored; strings are bounded', () => {
  const first = j.readJournal()[0]
  const e = j.upsertEntry({ id: first.id, exit: 98, notes: 'x'.repeat(5000), direction: 'sideways' as never, execution: 99 })
  assert.equal(e.id, first.id)
  assert.ok((e.rMultiple ?? 0) < 0, 'R is re-computed from the new exit')
  // Current behaviour, recorded on purpose: a settled outcome is NOT re-derived when the exit changes
  // (only an 'open' entry settles itself). Phase 3 (data integrity) decides whether that should change.
  assert.equal(e.outcome, 'win')
  assert.equal(e.direction, 'long', 'an invalid direction keeps the old one')
  assert.equal(e.execution, 5, 'execution is clamped to 1–5')
  assert.equal(e.notes.length, 4000)
  assert.equal(j.readJournal().length, 1)
})

test('stats and the review are built from what is on file', () => {
  j.upsertEntry({ direction: 'short', entry: 100, stop: 101, exit: 98, followedPlan: false, emotions: ['fomo'] })
  const s = j.computeStats(j.readJournal())
  assert.equal(s.total, 2)
  assert.equal(s.closed, 2)
  assert.equal(s.processScore, 50)
  const rv = j.buildReview(j.readJournal(), j.readGoals())
  assert.ok(rv.oneThing.length > 10)
  assert.ok(rv.goals.length >= 1)
})

test('goals persist and deleting an entry works exactly once', () => {
  j.saveGoals([{ id: 'g1', title: 'No revenge trades', kind: 'manual', done: false }])
  assert.equal(j.readGoals()[0].id, 'g1')
  const id = j.readJournal()[0].id
  assert.equal(j.deleteEntry(id), true)
  assert.equal(j.deleteEntry(id), false)
  assert.equal(j.readJournal().length, 1)
})

test('computeR handles both directions and refuses to guess without an exit', () => {
  assert.ok(Math.abs((j.computeR('long', 100, 99, 102) ?? 0) - 1.8) < 1e-9)
  assert.ok(Math.abs((j.computeR('short', 100, 101, 98) ?? 0) - 1.8) < 1e-9)
  assert.equal(j.computeR('long', 100, 99, null), null)
  assert.equal(j.computeR('none', 100, 99, 102), null)
})
