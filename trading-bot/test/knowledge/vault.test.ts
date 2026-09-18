/**
 * THE KNOWLEDGE VAULT — remembers what appeared to work AND what did not, and
 * never assumes yesterday's conclusion still holds.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'

const tmp = tempDataDir('mrcash-vault-')
process.env.MRCASH_DATA_DIR = tmp.dir
const v = await import('../../src/knowledge/vault.ts')
after(() => tmp.cleanup())

const T0 = Date.UTC(2026, 0, 13, 13, 30)
const base = () => v.makeItem({ kind: 'strategy-observation', title: 'Silver Bullet in London', body: 'Observed mean +0.30R over 18 PAPER trades.', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER', sampleSize: 18, recordIds: ['p1', 'p2'], method: 'cohort mean with t-interval' }, tags: ['silver-bullet', 'london'], now: T0 })

test('an item is created CURRENT, versioned, with provenance, a review date, and its history started', () => {
  const it = base()
  assert.equal(it.status, 'CURRENT')
  assert.equal(it.version, 1)
  assert.equal(it.review_due, T0 + v.REVIEW.afterMs)
  assert.equal(it.provenance.source, 'PAPER')
  assert.equal(it.provenance.engineVersion.length > 0, true)
  assert.deepEqual(it.provenance.recordIds, ['p1', 'p2'])
  assert.equal(it.history[0].event, 'created')
  assert.match(it.id, /^strategy-observation:silver-bullet-in-london:/)
  assert.throws(() => v.makeItem({ ...base(), title: '  ', now: T0 } as never), /needs a title/)
})

test('the same event recorded twice is one record — ids are deterministic', () => {
  const a = v.makeItem({ kind: 'case-study', title: 'Sweep of the London low', body: 'x', evidenceLabel: 'OBSERVED', provenance: { source: 'HISTORICAL' }, now: T0 })
  const b = v.makeItem({ kind: 'case-study', title: 'Sweep of the London low', body: 'x', evidenceLabel: 'OBSERVED', provenance: { source: 'HISTORICAL' }, now: T0 })
  assert.equal(a.id, b.id)
  v.addItem({ kind: 'case-study', title: 'Sweep of the London low', body: 'x', evidenceLabel: 'OBSERVED', provenance: { source: 'HISTORICAL' }, now: T0 })
  v.addItem({ kind: 'case-study', title: 'Sweep of the London low', body: 'x', evidenceLabel: 'OBSERVED', provenance: { source: 'HISTORICAL' }, now: T0 })
  assert.equal(v.listItems({ kind: 'case-study' }).length, 1)
})

test('supporting and contradicting evidence are counted apart; contradictions force review far sooner', () => {
  let it = base()
  for (let i = 0; i < v.REVIEW.afterContradictions - 1; i++) it = v.withEvidence(it, { contradictory: true, detail: `loss ${i}`, now: T0 + i })
  assert.equal(it.status, 'CURRENT')
  assert.equal(it.contradictory_evidence_count, v.REVIEW.afterContradictions - 1)
  it = v.withEvidence(it, { contradictory: true, detail: 'one more', now: T0 + 100 })
  assert.equal(it.status, 'REVIEW REQUIRED', `${v.REVIEW.afterContradictions} contradictions must force a review`)
  assert.equal(it.history.filter((h) => h.event === 'contradiction').length, v.REVIEW.afterContradictions)

  let ok = base()
  for (let i = 0; i < v.REVIEW.afterNewEvidence; i++) ok = v.withEvidence(ok, { contradictory: false, detail: `win ${i}`, now: T0 + i })
  assert.equal(ok.status, 'REVIEW REQUIRED', `${v.REVIEW.afterNewEvidence} new observations also force a review`)
  assert.ok(v.REVIEW.afterContradictions < v.REVIEW.afterNewEvidence, 'a contradiction must weigh more than a confirmation')
})

test('a review resets the counters; a revision bumps the version and keeps the old body in history', () => {
  let it = v.withEvidence(base(), { contradictory: true, detail: 'c', now: T0 })
  const confirmed = v.reviewed(it, { outcome: 'CONFIRMED', note: 'still holds' }, T0 + 1000)
  assert.equal(confirmed.status, 'CURRENT')
  assert.equal(confirmed.contradictory_evidence_count, 0)
  assert.equal(confirmed.version, 1)
  assert.equal(confirmed.review_due, T0 + 1000 + v.REVIEW.afterMs)

  const revised = v.reviewed(it, { outcome: 'REVISED', note: 'weaker than it looked', body: 'Observed mean +0.05R over 40 PAPER trades; interval includes zero.', evidenceLabel: 'INSUFFICIENT DATA' }, T0 + 2000)
  assert.equal(revised.version, 2)
  assert.equal(revised.evidenceLabel, 'INSUFFICIENT DATA')
  assert.match(revised.body, /\+0\.05R/)
  const rev = revised.history.find((h) => h.event === 'revised')!
  assert.match(rev.detail, /previous body/)
  assert.match(rev.detail, /\+0\.30R/, 'the old body is kept, not erased')

  const retired = v.reviewed(it, { outcome: 'RETIRED', note: 'strategy withdrawn' }, T0 + 3000)
  assert.equal(retired.status, 'RETIRED')
  assert.equal(v.withEvidence(retired, { contradictory: true, detail: 'x', now: T0 + 4000 }).status, 'RETIRED', 'a retired item does not come back to review')
})

test('an unreviewed item expires into STALE, with the fact recorded', () => {
  const it = base()
  assert.equal(v.staleness(it, T0 + v.REVIEW.afterMs - 1).status, 'CURRENT')
  const stale = v.staleness(it, T0 + v.REVIEW.afterMs)
  assert.equal(stale.status, 'STALE')
  assert.match(stale.history[stale.history.length - 1].detail, /not assumed to still hold/)
  assert.equal(v.staleness(v.reviewed(it, { outcome: 'RETIRED', note: 'x' }, T0), T0 + 10 * v.REVIEW.afterMs).status, 'RETIRED')
})

test('the store keeps the record across a sweep, and the summary counts what did not work too', () => {
  const a = v.addItem({ kind: 'failed-hypothesis', title: 'Turtle Soup after equal highs', body: 'Not supported OOS.', evidenceLabel: 'SIMULATED', provenance: { source: 'BACKTEST' }, now: T0 - 40 * 86_400_000 })
  const b = v.addItem({ kind: 'counterexample', title: 'A sweep that did not reverse', body: 'x', evidenceLabel: 'OBSERVED', provenance: { source: 'HISTORICAL' }, now: T0 })
  v.recordEvidence(b.id, { contradictory: false, detail: 'another', now: T0 })
  assert.equal(v.getItem(b.id)!.new_evidence_count, 1)
  const changed = v.sweepStale(T0)
  assert.ok(changed.some((c) => c.id === a.id && c.status === 'STALE'), 'the 40-day-old item expired')
  const s = v.vaultSummary()
  assert.ok(s.failed >= 2, 'failed hypotheses and counterexamples are counted, not hidden')
  assert.ok(s.dueForReview >= 1)
  assert.equal(v.superseded(b, 'new-id', T0).status, 'SUPERSEDED')
})
