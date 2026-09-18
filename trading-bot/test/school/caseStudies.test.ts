/**
 * THE CASE-STUDY ENGINE — every case is BEFORE / DURING / DECISION / AFTER,
 * built from what the engine could know at the time and nothing later; the
 * counterexample engine pairs what went the concept's way with what did not.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir, syntheticKlines } from '../helpers.ts'
import type { Candle } from '../../src/types.ts'
import type { EvidenceRecord } from '../../src/analyst/records.ts'

const tmp = tempDataDir('mrcash-cases-')
process.env.MRCASH_DATA_DIR = tmp.dir
const cs = await import('../../src/school/caseStudies.ts')
const vault = await import('../../src/knowledge/vault.ts')
const { config } = await import('../../config.ts')
after(() => tmp.cleanup())

const NOW = Date.UTC(2026, 0, 20, 15, 0)
const candles: Candle[] = syntheticKlines(6, 7, NOW).map((k) => ({ openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5], closeTime: k[6] }))
const cases = cs.scanCandles(candles, { votesTail: 400, horizon: 12 })

test('the real engine over six synthetic days yields case studies of several kinds, each tagged with its concept', () => {
  assert.ok(cases.length >= 5, `expected several cases, got ${cases.length}`)
  const kinds = new Set(cases.map((c) => c.kind))
  assert.ok(kinds.size >= 2, `expected more than one kind, got ${[...kinds].join(', ')}`)
  for (const c of cases) {
    assert.equal(c.concept, cs.CONCEPT_OF[c.kind])
    assert.equal(c.provenance.source, 'HISTORICAL')
    assert.ok(c.provenance.engineVersion.length > 0)
    assert.ok(c.during.detail.length > 0)
    assert.ok(c.decision.note.length > 0)
  }
  // Newest first, and the ids are deterministic for the same event.
  for (let i = 1; i < cases.length; i++) assert.ok(cases[i - 1].at >= cases[i].at)
  const again = cs.scanCandles(candles, { votesTail: 400, horizon: 12 })
  assert.deepEqual(again.map((c) => c.id), cases.map((c) => c.id))
})

test('ADVERSARIAL — no case study uses anything the engine could not know at the time', () => {
  for (const c of cases) {
    assert.deepEqual(cs.hindsightFindings(c), [], `${c.id}: ${cs.hindsightFindings(c).join('; ')}`)
    assert.ok(c.before.asOf < c.at, 'BEFORE is strictly before the event')
    for (const a of c.before.annotations) assert.ok(a.knownAt <= c.before.asOf, `${a.annotationType} known at ${a.knownAt} leaked into BEFORE as of ${c.before.asOf}`)
    if (c.after.candles > 0) assert.ok(c.after.from > c.at, 'AFTER starts after the event')
    assert.ok(c.knownAt >= c.at, 'the engine does not know an event before it closes')
  }
})

test('the AFTER frame is INSUFFICIENT DATA when the horizon runs off the end of the data, never a guess', () => {
  const last = [...cases].sort((a, b) => b.at - a.at)[0]
  const tail = cases.filter((c) => c.after.candles < 12)
  for (const c of tail) {
    assert.equal(c.evidenceLevel, 'INSUFFICIENT DATA')
    assert.equal(c.after.wentExpectedWay, null)
  }
  const full = cases.filter((c) => c.after.candles === 12)
  assert.ok(full.length > 0)
  for (const c of full) {
    assert.equal(c.evidenceLevel, 'OBSERVED')
    assert.equal(typeof c.after.moveAtr, 'number')
    assert.ok(c.after.maxUpAtr! >= 0 && c.after.maxDownAtr! >= 0, 'excursions are magnitudes in ATRs')
  }
  assert.ok(last.at <= candles[candles.length - 1].closeTime)
})

test('counterexamples pair a case that went the expected way with one that did not; the tally states no share under 10', () => {
  const tally = cs.outcomeTally(cases)
  assert.ok(tally.length > 0)
  for (const t of tally) {
    if (t.n < 10) { assert.equal(t.share, null); assert.match(t.note, /no share is stated/) }
    else { assert.equal(t.share, t.wentExpected / t.n); assert.match(t.note, /not a probability/) }
  }
  const richest = tally[0]
  const pairs = cs.counterexamplesFor(cases, richest.kind)
  for (const p of pairs) {
    assert.equal(p.example.after.wentExpectedWay, true)
    assert.equal(p.counterexample.after.wentExpectedWay, false)
    assert.equal(p.example.kind, p.counterexample.kind)
    assert.equal(p.lesson, cs.COUNTEREXAMPLE_LESSON)
  }
  assert.ok(pairs.length <= 5)
  assert.deepEqual(cs.counterexamplesFor([], 'liquidity-sweep'), [])
})

const T0 = Date.UTC(2026, 0, 13, 13, 30)
function rec(i: number, over: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: `p${i}`, source: 'PAPER', strategyId: 'silver-bullet', family: 'ict', symbol: 'BTCUSDT', interval: '5m', session: 'london', regime: 'trending-up', volatility: 'normal',
    direction: 'long', decidedAt: T0 + i * 3_600_000, filledAt: T0 + i * 3_600_000 + 300_000, closedAt: T0 + i * 3_600_000 + 1_800_000, hourET: 8, weekdayET: 2,
    intendedEntry: 100, entry: 100, stop: 99, target: 102, exit: 101, exitReason: 'take-profit', rMultiple: 1, outcome: 'WIN', missed: false,
    quality: 85, fusedScore: 80, mtfAligned: null, newsMinutes: null, spreadPct: null, durationMs: 1_500_000,
    mae: { r: -0.3, status: 'OBSERVED', note: '' }, mfe: { r: 1.2, status: 'OBSERVED', note: '' },
    engineVersion: '2.3.0', featureVersion: 1, missing: [], corrupt: false, corruptReason: null, ...over,
  }
}

test('paper cases apply their stated thresholds: p90 MFE / p10 MAE only with 10+ samples, and unexpected failures need the full checklist', () => {
  const few = [rec(0, { mfe: { r: 9, status: 'OBSERVED', note: '' } }), rec(1), rec(2)]
  assert.equal(cs.paperCases(few).filter((c) => c.kind === 'exceptional-mfe').length, 0, 'three samples is under the bar')
  const many = Array.from({ length: 12 }, (_, i) => rec(i, { mfe: { r: 0.5 + i * 0.1, status: 'OBSERVED', note: '' }, mae: { r: -0.1 - i * 0.05, status: 'OBSERVED', note: '' } }))
  const out = cs.paperCases(many)
  const mfe = out.filter((c) => c.kind === 'exceptional-mfe')
  const mae = out.filter((c) => c.kind === 'exceptional-mae')
  assert.ok(mfe.length >= 1 && mfe.length <= 3)
  assert.ok(mae.length >= 1 && mae.length <= 3)
  assert.ok(mfe.every((c) => c.provenance.source === 'PAPER' && c.decision.paperTradeId !== null))

  const loss = rec(20, { rMultiple: -1, outcome: 'LOSS', exit: 99, exitReason: 'stop-loss', fusedScore: config.fusion.enterScore, quality: 80 })
  const weakLoss = rec(21, { rMultiple: -1, outcome: 'LOSS', exit: 99, exitReason: 'stop-loss', fusedScore: config.fusion.enterScore - 1, quality: 95 })
  const noSnapshot = rec(22, { rMultiple: -1, outcome: 'LOSS', exit: 99, exitReason: 'stop-loss', fusedScore: null, quality: 95 })
  const fails = cs.paperCases([loss, weakLoss, noSnapshot]).filter((c) => c.kind === 'unexpected-strategy-failure')
  assert.deepEqual(fails.map((c) => c.decision.paperTradeId), ['p20'])
  assert.match(fails[0].during.detail, /evidence, not proof/)

  const vetoes = cs.paperCases([], { missed: [{ id: 'm1', at: T0, note: 'daily loss limit reached', direction: 'long', strategyId: 'silver-bullet' }] })
  assert.equal(vetoes.length, 1)
  assert.equal(vetoes[0].kind, 'risk-veto')
  assert.equal(vetoes[0].after.wentExpectedWay, null, 'a veto has no outcome to measure')
  for (const c of [...out, ...fails, ...vetoes]) assert.deepEqual(cs.hindsightFindings(c), [])
})

test('zero data: an empty candle set or an empty record set yields no cases and no claims', () => {
  assert.deepEqual(cs.scanCandles([]), [])
  assert.deepEqual(cs.scanCandles(candles.slice(0, 1)), [])
  for (const c of cs.scanCandles(candles.slice(0, 3))) { assert.equal(c.evidenceLevel, 'INSUFFICIENT DATA'); assert.equal(c.after.wentExpectedWay, null) }
  assert.deepEqual(cs.paperCases([]), [])
  assert.deepEqual(cs.outcomeTally([]), [])
})

test('a case study goes into the vault once, with its provenance and frames as payload', () => {
  const c = cases.find((x) => x.evidenceLevel === 'OBSERVED')!
  const item = vault.addItem(cs.caseStudyItem(c))
  vault.addItem(cs.caseStudyItem(c))
  assert.equal(vault.listItems({ kind: 'case-study' }).length, 1)
  assert.equal(item.id, c.id)
  assert.equal(item.provenance.source, 'HISTORICAL')
  assert.deepEqual(item.provenance.period, c.provenance.period)
  assert.match(item.body, /BEFORE \(as of/)
  assert.match(item.body, /DECISION:/)
  assert.match(item.body, /AFTER:/)
  assert.equal((item.payload as typeof c).id, c.id)
  assert.ok(item.tags.includes(c.concept))
})
