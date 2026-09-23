/**
 * OWNER NOTES — you tell him something; he remembers it as an untested
 * hypothesis with its source on it, brings it back on the day you name, and
 * never trades on it.
 *
 * TEST FIXTURE: every note below is synthetic and lives in a temporary data
 * directory.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tempDataDir } from '../helpers.ts'

const tmp = tempDataDir('mrcash-note-')
process.env.MRCASH_DATA_DIR = tmp.dir
const api = await import('../../src/learning/api.ts')
const v = await import('../../src/knowledge/vault.ts')
after(() => tmp.cleanup())

const NOW = Date.UTC(2026, 8, 23, 12, 0)
const WATCH = Date.UTC(2026, 11, 18, 14, 30)

test('a note is stored as an untested USER hypothesis with its source and market on it', () => {
  const it = api.knowledgeNote({ title: 'TEST FIXTURE: a film opens Dec 18', body: 'A big release; maybe volatility around it.', market: 'dis', source: 'https://example.com/reel', watchAt: WATCH }, NOW)
  assert.equal(it.kind, 'hypothesis')
  assert.equal(it.evidenceLabel, 'HYPOTHESIS')
  assert.equal(it.status, 'CURRENT')
  assert.equal(it.provenance.source, 'USER')
  assert.equal(it.provenance.symbol, 'DIS')
  assert.equal(it.provenance.sampleSize, 0)
  assert.ok(it.tags.includes('owner-note') && it.tags.includes('dis'))
  assert.match(it.body, /https:\/\/example\.com\/reel \(not verified by Mr\. Cash\)/)
  assert.match(it.body, /UNTESTED/)
  assert.match(it.body, /does not move a trade/)
  assert.equal(it.review_due, WATCH)
  assert.deepEqual(v.getItem(it.id)?.id, it.id, 'it is saved to the vault')
})

test('the watch date is when it comes back: CURRENT before, due for review on the day', () => {
  const it = api.knowledgeNote({ title: 'TEST FIXTURE: watch-date note', body: 'Bring me back on the day.', watchAt: WATCH }, NOW)
  assert.equal(v.staleness(it, WATCH - 60_000).status, 'CURRENT')
  assert.equal(v.staleness(it, WATCH).status, 'STALE')
})

test('without a watch date it takes the ordinary review cadence', () => {
  const it = api.knowledgeNote({ title: 'TEST FIXTURE: no date', body: 'Just remember this.' }, NOW)
  assert.equal(it.review_due, NOW + v.REVIEW.afterMs)
  assert.match(it.body, /Source: the owner/)
})

test('a note refuses certainty words, a non-link source, and a bad watch date', () => {
  assert.throws(() => api.knowledgeNote({ title: 'TEST FIXTURE', body: 'This is guaranteed to pump.' }, NOW), /not a word a note may use/)
  assert.throws(() => api.knowledgeNote({ title: 'TEST FIXTURE', body: 'x', source: 'javascript:alert(1)' }, NOW), /must be a link/)
  assert.throws(() => api.knowledgeNote({ title: 'TEST FIXTURE', body: 'x', watchAt: NOW - 1 }, NOW), /future date/)
  assert.throws(() => api.knowledgeNote({ title: 'TEST FIXTURE', body: 'x', watchAt: NOW + 3 * 365 * 86_400_000 }, NOW), /within two years/)
  assert.throws(() => api.knowledgeNote({ title: '', body: 'x' }, NOW), /needs a title/)
})

test('the engine cannot read a note: no decision-making module imports the vault', () => {
  const root = join(process.cwd(), 'src')
  const engine = ['fusion.ts', 'riskEngine.ts', 'watch.ts', 'paperTrader.ts', 'bot.ts', ...readdirSync(join(root, 'strategies')).map((f) => `strategies/${f}`)]
  for (const f of engine.filter((x) => x.endsWith('.ts'))) {
    let src = ''
    try { src = readFileSync(join(root, f), 'utf8') } catch { continue }
    assert.equal(/knowledge\/vault|learning\/api/.test(src), false, `${f} must not read the knowledge vault`)
  }
})
