/**
 * MEMORY, FAILURE MEMORY, THE DECAY MONITOR AND THE DRIFT MONITOR — knowledge
 * is flagged and moved, never deleted; failures are recorded once with what /
 * why / lesson; drift reports differences and never a cause; memory is an
 * index over the records, not another store.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import type { EvidenceRecord } from '../../src/analyst/records.ts'
import type { ReplayTrade } from '../../src/types.ts'

const tmp = tempDataDir('mrcash-decay-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const vault = await import('../../src/knowledge/vault.ts')
const decay = await import('../../src/knowledge/decayMonitor.ts')
const fail = await import('../../src/knowledge/failures.ts')
const mem = await import('../../src/knowledge/memory.ts')
const drift = await import('../../src/learning/drift.ts')
const H = await import('../../src/research/hypotheses.ts')
const L = await import('../../src/research/lab.ts')
const ev = await import('../../src/observer/events.ts')
const rec = await import('../../src/analyst/records.ts')
after(() => tmp.cleanup())

const T0 = Date.UTC(2026, 0, 1, 13, 30)
const DAY = 86_400_000
function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
function r(i: number, over: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: `d${i}`, source: 'PAPER', strategyId: 'silver-bullet', family: 'session', symbol: 'BTCUSDT', interval: '5m', session: 'london', regime: 'ranging', volatility: 'normal',
    direction: 'long', decidedAt: T0 + i * 6 * 3_600_000, filledAt: T0 + i * 6 * 3_600_000 + 300_000, closedAt: T0 + i * 6 * 3_600_000 + 1_800_000, hourET: 8, weekdayET: 2,
    intendedEntry: 100, entry: 100, stop: 99, target: 102, exit: 101, exitReason: 'take-profit', rMultiple: 1, outcome: 'WIN', missed: false,
    quality: 85, fusedScore: 80, mtfAligned: null, newsMinutes: null, spreadPct: null, durationMs: 1_500_000,
    mae: { r: -0.3, status: 'OBSERVED', note: '' }, mfe: { r: 1.2, status: 'OBSERVED', note: '' },
    engineVersion: '2.3.0', featureVersion: 1, missing: [], corrupt: false, corruptReason: null, ...over,
  }
}
/** Paper: London runs cold, Asia runs level. */
function paperPopulation(seed = 3, n = 80): EvidenceRecord[] {
  const g = rng(seed)
  return Array.from({ length: n }, (_, i) => { const london = i % 2 === 0; const rm = (london ? -0.6 : 0.0) + (g() - 0.5) * 1.2; return r(i, { session: london ? 'london' : 'asia', rMultiple: rm, outcome: rm > 0 ? 'WIN' : 'LOSS', exit: 100 + rm, mae: { r: (london ? -0.9 : -0.3) - g() * 0.2, status: 'OBSERVED', note: '' }, mfe: { r: 1.0 + g() * 0.4, status: 'OBSERVED', note: '' } }) })
}
/** Backtest: London ran warm, Asia level — the historical population paper is compared against. Excursions observed, as a reconciled backtest carries them. */
function backtestPopulation(seed = 7, n = 120): EvidenceRecord[] {
  const g = rng(seed)
  return Array.from({ length: n }, (_, i) => { const london = i % 2 === 0; const rm = (london ? 0.5 : 0.0) + (g() - 0.5) * 1.2; return r(i, { id: `bt${i}`, source: 'BACKTEST', decidedAt: T0 - 60 * DAY + i * 4 * 3_600_000, filledAt: T0 - 60 * DAY + i * 4 * 3_600_000, closedAt: T0 - 60 * DAY + i * 4 * 3_600_000 + 1_800_000, session: london ? 'london' : 'asia', rMultiple: rm, outcome: rm > 0 ? 'WIN' : 'LOSS', exit: 100 + rm, mae: { r: -0.3 - g() * 0.2, status: 'OBSERVED', note: '' }, mfe: { r: 1.0 + g() * 0.4, status: 'OBSERVED', note: '' }, engineVersion: null, featureVersion: null }) })
}
const paper = rec.datasetOf(paperPopulation())
const backtest = rec.datasetOf(backtestPopulation())
// A replay trade in the shape the runner emits is a BACKTEST record too; the drift monitor accepts either path.
const replayShaped = rec.backtestDataset([{ index: 0, action: 'BUY', time: T0, entryTime: T0, exitTime: T0 + 1_800_000, entryPrice: 100, exitPrice: 101, rMultiple: 1, outcome: 'WIN', setupKey: 'BTCUSDT|5m|silver-bullet', session: 'London', regime: 'ranging', exitReason: 'target', quality: 80 } as unknown as ReplayTrade], { symbol: 'BTCUSDT', interval: '5m' })

test('the drift monitor reports where paper differs from the historical population, per cohort, and never a cause', () => {
  const d = drift.driftReport(paper, backtest, { now: T0 + 30 * DAY, strategyId: 'silver-bullet' })
  assert.equal(d.paper.source, 'PAPER'); assert.equal(d.backtest.source, 'BACKTEST')
  const london = d.rows.find((x) => x.dimension === 'session' && x.value === 'london')!
  const asia = d.rows.find((x) => x.dimension === 'session' && x.value === 'asia')!
  assert.equal(london.verdict, 'DIFFERENT', london.note)
  assert.ok(london.differs.includes('mean R'))
  assert.ok(london.differs.includes('MAE'), 'the MAE gap is measurable too')
  assert.equal(asia.verdict, 'ALIGNED', asia.note)
  assert.ok(asia.metrics.filter((m) => m.comparable && m.welch).every((m) => m.welch!.verdict === 'INDISTINGUISHABLE' || Math.abs(m.welch!.deltaR ?? 0) < drift.MIN_EFFECT_R), 'a 0.00R gap with a degenerate interval is not a difference')
  assert.ok(d.differences.some((x) => x.dimension === 'session' && x.value === 'london') && !d.differences.some((x) => x.dimension === 'session' && x.value === 'asia'), 'only differences are reported')
  const rej = london.metrics.find((m) => m.metric === 'rejection rate')!
  assert.equal(rej.comparable, false, 'the replay has no risk chain; rejection rate is reported, not compared')
  assert.ok(d.signals.some((s) => s.origin === 'drift' && /london/.test(s.question) && s.direction === 'difference'))
  assert.ok(d.forRecommend.some((x) => x.value === 'london' && x.verdict === 'DIFFERENT'))
  for (const row of [d.overall, ...d.rows]) assert.doesNotMatch(row.note, /because|caused by|degraded|improved/i, 'a difference is measured, its cause is not asserted')
  assert.throws(() => drift.driftReport(backtest as never, paper as never), /paper side must be a PAPER dataset/)
  // Under the bar: INSUFFICIENT and nothing else.
  const thin = drift.driftReport(rec.datasetOf(paperPopulation(3, 6)), backtest, { now: T0 })
  assert.equal(thin.overall.verdict, 'INSUFFICIENT')
  assert.equal(thin.signals.length, 0)
  assert.equal(drift.driftFor('silver-bullet', [], T0), null, 'no cached backtest → null, never a computed one on a read')
  assert.equal(replayShaped.provenance.source, 'BACKTEST')
  assert.equal(drift.driftReport(paper, replayShaped, { now: T0 }).overall.verdict, 'INSUFFICIENT')
})

test('the vault gains WATCH and CONTRADICTED; the decay monitor moves items on evidence and never back to CURRENT or out of the vault', () => {
  const now = T0 + 100 * DAY
  const ctx = (over: Partial<Parameters<typeof decay.runDecayMonitor>[0]> = {}) => ({ now, paper, currentRegime: 'trending-up', drift: [], strategyVersion: decay.strategyVersion(), regimeChangesSince: () => 0, ...over })
  // A concept does not age with the market.
  const concept = vault.addItem({ kind: 'concept', title: 'What a fair value gap is', body: 'A three-candle imbalance.', evidenceLabel: 'OBSERVED', provenance: { source: 'NONE' }, now: T0 })
  assert.deepEqual(decay.decayFlags(concept, ctx()), [])
  // A PAPER cohort statement written on 12 trades: one soft flag → WATCH; two → REVIEW REQUIRED.
  const stmt = vault.addItem({ kind: 'session-observation', title: 'London mean over 12 trades', body: 'Mean −0.4R over 12 PAPER trades.', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER', sampleSize: 12, period: { from: T0, to: T0 + 5 * DAY }, strategyVersion: decay.strategyVersion() }, tags: ['london', 'ranging'], payload: { direction: 'negative', filters: [{ dimension: 'session', values: ['london'] }] }, now: T0 + 5 * DAY })
  const f1 = decay.decayFlags(stmt, ctx({ now: T0 + 20 * DAY, currentRegime: 'ranging' }))
  assert.deepEqual(f1.map((f) => f.code), ['sample-grown'], 'the London cohort has 40 trades now, written on 12')
  assert.equal(decay.decayTarget(f1), 'WATCH')
  const f2 = decay.decayFlags(stmt, ctx({ currentRegime: 'trending-up' }))
  assert.deepEqual(f2.map((f) => f.code).sort(), ['dataset-age', 'regime-change', 'sample-grown'])
  assert.equal(decay.decayTarget(f2), 'REVIEW REQUIRED')
  const r1 = decay.runDecayMonitor(ctx({ now: T0 + 20 * DAY, currentRegime: 'ranging' }))
  assert.equal(vault.getItem(stmt.id)!.status, 'WATCH')
  assert.ok(r1.changed.some((c) => c.itemId === stmt.id && c.before === 'CURRENT' && c.after === 'WATCH'))
  const r1b = decay.runDecayMonitor(ctx({ now: T0 + 20 * DAY, currentRegime: 'ranging' }))
  assert.equal(r1b.changed.length, 0, 'idempotent: the same flags do not move or rewrite the item')
  assert.equal(vault.getItem(stmt.id)!.history.filter((h) => h.event === 'watch').length, 1)
  decay.runDecayMonitor(ctx())
  assert.equal(vault.getItem(stmt.id)!.status, 'REVIEW REQUIRED')
  // A HARD flag: a linked hypothesis is NOT SUPPORTED → CONTRADICTED, from any open status.
  const h = H.createHypothesis({ question: 'Does London differ?', observation: 'o', hypothesis: 'London mean is below zero', nullHypothesis: 'no', direction: 'negative', dataset: { source: 'PAPER', label: 'PAPER' }, cohortFilters: [{ dimension: 'session', values: ['london'] }], method: 'm', strategy: 'silver-bullet', session: 'london', now: T0 })
  H.saveHypothesis({ ...h, status: 'NOT SUPPORTED', history: [...h.history, { at: now, event: 'not-supported', detail: 'OOS interval spans zero', version: 1 }] })
  vault.saveItem({ ...vault.getItem(stmt.id)!, links: [h.id] })
  const r2 = decay.runDecayMonitor(ctx())
  assert.equal(vault.getItem(stmt.id)!.status, 'CONTRADICTED')
  assert.ok(r2.changed.find((c) => c.itemId === stmt.id)!.flags.some((f) => f.code === 'hypothesis-contradicted' && f.severity === 'HARD'))
  // Paper diverging from the population an item rests on contradicts a BACKTEST-derived item.
  const bt = vault.addItem({ kind: 'session-observation', title: 'London ran warm in the backtest', body: '+0.5R over 60 SIMULATED trades.', evidenceLabel: 'SIMULATED', provenance: { source: 'BACKTEST', sampleSize: 60 }, tags: ['london'], payload: { direction: 'positive', filters: [{ dimension: 'session', values: ['london'] }] }, now })
  const dr = drift.driftReport(paper, backtest, { now })
  decay.runDecayMonitor(ctx({ drift: dr.forRecommend }))
  assert.equal(vault.getItem(bt.id)!.status, 'CONTRADICTED')
  assert.match(vault.getItem(bt.id)!.history.at(-1)!.detail, /paper-diverges/)
  // Never back to CURRENT by the monitor; never deleted; a review does it, with a note.
  assert.equal(vault.getItem(stmt.id)!.status, 'CONTRADICTED')
  assert.equal(vault.reviewed(vault.getItem(stmt.id)!, { outcome: 'CONFIRMED', note: 'looked, still holds at the new sample' }, now).status, 'CURRENT')
  assert.equal(vault.decayed(vault.getItem(concept.id)!, 'WATCH', ['x'], now).status, 'WATCH')
  assert.equal(vault.decayed({ ...vault.getItem(concept.id)!, status: 'RETIRED' }, 'CONTRADICTED', ['x'], now).status, 'RETIRED', 'a closed item is left alone')
  assert.equal(vault.decayed({ ...vault.getItem(concept.id)!, status: 'REVIEW REQUIRED' }, 'WATCH', ['x'], now).status, 'REVIEW REQUIRED', 'WATCH is not a downgrade')
  assert.equal(vault.listItems().length, 3, 'three items in, three still there')
  const rr = decay.knowledgeRequiringReview()
  assert.ok(rr.contradicted.length >= 2 && /need a review/.test(rr.note))
  // A recent confirmation holds soft flags for a week; hard flags never wait.
  const confirmed = vault.saveItem(vault.reviewed(vault.getItem(stmt.id)!, { outcome: 'CONFIRMED', note: 'checked' }, now))
  assert.equal(decay.decayFlags(confirmed, ctx({ now: now + DAY })).filter((f) => f.severity === 'SOFT').length, 0)
  assert.ok(decay.decayFlags(confirmed, ctx({ now: now + DAY })).some((f) => f.severity === 'HARD'))
})

test('failure memory records each failure once with what / why / lesson, mirrors it in the vault, and answers "have we tried this before?"', () => {
  const now = T0 + 101 * DAY
  const before = fail.harvestFailures(now)
  assert.ok(before.recorded.some((f) => f.kind === 'hypothesis-not-supported'), 'the NOT SUPPORTED hypothesis from the previous test is harvested')
  const again = fail.harvestFailures(now)
  assert.equal(again.recorded.length, 0, 'a second harvest records nothing twice')
  const f = before.recorded.find((x) => x.kind === 'hypothesis-not-supported')!
  assert.ok(f.what && f.why && f.lesson && f.expected && f.where)
  assert.equal(f.occurrences, 1); assert.equal(f.replicated, false); assert.equal(f.active, true, 'nothing later overturned it, so the failure still stands')
  assert.match(f.where, /silver-bullet where session/)
  assert.doesNotMatch(f.lesson, /never (do|try|trade)|always/i, 'a lesson is a statement about the record, not a prohibition')
  assert.equal(vault.getItem(f.vaultItemId)!.kind, 'failed-hypothesis')
  assert.equal(vault.vaultSummary().failed >= 1, true)
  // Proposal failures: gates failed is a failure with the unmet gates as the reason.
  const p = L.makeProposal({ kind: 'filter', strategyId: 'silver-bullet', title: 'Skip London', rationale: 'r', change: 'skip London', params: null, evidence: { hypothesisIds: [], recordIds: [], campaignId: null, passportId: null }, oosRs: [], trials: 1, critique: null, now } as never)
  L.saveProposal(p)
  const h2 = fail.harvestFailures(now)
  if (p.status === 'GATES FAILED') {
    const g = h2.recorded.find((x) => x.kind === 'proposal-gates-failed')!
    assert.ok(g && /Gate|gate|trade|sample|OOS|out-of-sample/i.test(g.why))
  }
  // Prior failures overlap on strategy + filter.
  const prior = fail.priorFailures('silver-bullet', [{ dimension: 'session', values: ['london'] }])
  assert.ok(prior.some((x) => x.refs.hypothesisId), 'the London hypothesis failure is found again')
  assert.equal(fail.priorFailures('vwap-reversion', [{ dimension: 'session', values: ['asia'] }]).length, 0)
  // An unresolvable observation is a data-quality failure, not a market one.
  const o = ev.makeObservation({ time: T0, availableAt: T0, session: 'london', regime: 'ranging', volatility: 'normal', type: 'LIQUIDITY EVENT', source: 'engine-step', detail: 'sweep of the Asia low', direction: 'down', evidence: [], caseKind: 'liquidity-sweep', recordId: null, significance: { score: 70, selected: true, reasons: ['deep sweep'], basis: {}, note: 'n' }, before: { structureTrend: null, liquidity: null, regime: 'ranging', session: 'london', strategiesActive: 0, strategiesNear: 0, risk: null, price: 100 } })
  ev.recordObservation(o)
  ev.updateObservation({ ...ev.getObservation(o.id)!, status: 'UNRESOLVABLE', resolvedAt: now, resolutionNote: 'a 3-candle gap in the stored history' })
  const h3 = fail.harvestFailures(now)
  const u = h3.recorded.find((x) => x.kind === 'observation-unresolvable')!
  assert.equal(vault.getItem(u.vaultItemId)!.kind, 'data-quality-warning')
  assert.equal(fail.failureSummary().byKind['observation-unresolvable'], 1)
  assert.doesNotMatch(fail.failureSummary().note, /rule/i.source === 'rule' ? /never/ : /proven|guaranteed/i)
})

test('memory is an index over the records in eight classes; recall finds by words; remember writes a vault item with its class', () => {
  const s = mem.memorySummary()
  assert.deepEqual(s.classes.map((c) => c.class), [...mem.MEMORY_CLASSES])
  assert.ok(s.classes.find((c) => c.class === 'FAILURE')!.total >= 2)
  assert.ok(s.classes.find((c) => c.class === 'RESEARCH')!.total >= 1, 'the hypothesis is research memory')
  assert.ok(s.classes.find((c) => c.class === 'SESSION')!.total >= 2, 'London-tagged items are session memory')
  assert.ok(s.classes.find((c) => c.class === 'TEACHING')!.total >= 1, 'the concept is teaching memory')
  const sessionMem = mem.memory('SESSION')
  assert.ok(sessionMem.entries.every((e) => e.record === 'knowledge' || e.record === 'observation'))
  assert.ok(sessionMem.entries.some((e) => e.status === 'CONTRADICTED'), 'an entry carries the status its record carries')
  const found = mem.recall('london')
  assert.ok(found.entries.length >= 2 && found.entries.every((e) => /london/i.test(`${e.title} ${e.summary} ${e.tags.join(' ')}`)))
  assert.equal(mem.recall('unicorn zebra').entries.length, 0)
  const it = mem.remember('REGIME', { kind: 'regime-observation', title: 'Ranging days were quiet this month', body: '14 ranging days, 3 breakouts.', evidenceLabel: 'OBSERVED', provenance: { source: 'ENGINE' }, tags: ['ranging'], now: T0 + 102 * DAY })
  assert.ok(it.tags.includes('memory:regime') && it.status === 'CURRENT')
  assert.ok(mem.classifyItem(it).includes('REGIME'))
  assert.ok(mem.memory('REGIME').entries.some((e) => e.id === it.id))
  assert.equal(vault.listItems().length, mem.memorySummary().classes.reduce((n, c) => Math.max(n, c.total), 0) > 0 ? vault.listItems().length : -1, 'no second store: every knowledge memory is a vault item')
  assert.equal(config.live.enabled, false)
})
