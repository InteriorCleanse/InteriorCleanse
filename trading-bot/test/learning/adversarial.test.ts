/**
 * ADVERSARIAL — the research layer under attack: duplicates, restart
 * recovery, corrupted / contradictory / stale knowledge, lookahead and
 * future-data contamination, parameter leakage, selection bias, data leakage
 * and mixed-source contamination, strategy / live mutation attempts,
 * hallucinated evidence and unsupported claims. The growth stages ZERO / ONE /
 * 10 / 50 / 200 live in growth.test.ts, in a store of their own.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tempDataDir, syntheticKlines } from '../helpers.ts'
import type { Candle } from '../../src/types.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'
import type { EvidenceRecord } from '../../src/analyst/records.ts'

const tmp = tempDataDir('mrcash-adversarial-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const { store } = await import('../../src/store.ts')
const vault = await import('../../src/knowledge/vault.ts')
const decay = await import('../../src/knowledge/decayMonitor.ts')
const fail = await import('../../src/knowledge/failures.ts')
const mem = await import('../../src/knowledge/memory.ts')
const ev = await import('../../src/observer/events.ts')
const ob = await import('../../src/observer/observer.ts')
const X = await import('../../src/research/experiments.ts')
const H = await import('../../src/research/hypotheses.ts')
const L = await import('../../src/research/lab.ts')
const Q = await import('../../src/research/queue.ts')
const R = await import('../../src/research/recommend.ts')
const V = await import('../../src/research/review.ts')
const S = await import('../../src/research/sandbox.ts')
const rec = await import('../../src/analyst/records.ts')
const drift = await import('../../src/learning/drift.ts')
const ops = await import('../../src/learning/ops.ts')
const status = await import('../../src/learning/status.ts')
const D = await import('../../src/learning/digest.ts')
const lo = await import('../../src/learning/observer.ts')
const lp = await import('../../src/learning/passport.ts')
const cs = await import('../../src/school/caseStudies.ts')
const U = await import('../../src/school/updates.ts')
const { metaById } = await import('../../src/strategies/registry.ts')
const { tradingDayKey } = await import('../../src/sessions.ts')
after(() => tmp.cleanup())

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(HERE, '..', '..')
const NOW = Date.UTC(2026, 0, 20, 15, 0)
const DAY = 86_400_000
const HOUR = 3_600_000
const CONFIG_BEFORE = JSON.stringify(config)
const BANNED = /\b(proven|guaranteed|fail-?proof)\b|\bPROVEN\b|\bBEST STRATEGY\b|\bwill (rise|fall|rally|drop|reverse|continue)\b|\bforecast:/i

function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
function pos(i: number, closedAt: number, over: Partial<PaperPosition> = {}): PaperPosition {
  const openedAt = closedAt - 1_800_000
  return { id: `ad${i}`, openedAt, dayKey: tradingDayKey(openedAt), session: 'London', setupKey: 'BTCUSDT|5m|silver-bullet|long', direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 0.01, riskUsd: 1, quality: 85, reason: 'test', atr: 0.5, status: 'closed', filledAt: openedAt + 300_000, strategyId: 'silver-bullet', regime: 'trending-up', closedAt, exit: 102, exitReason: 'target', rMultiple: 1, pnlUsd: 1, feesUsd: 0.01, outcome: 'WIN', candlesHeld: 5, ...over }
}
function population(n: number, seed = 5): PaperPosition[] {
  const g = rng(seed)
  return Array.from({ length: n }, (_, i) => { const london = i % 2 === 0; const rm = (london ? 0.5 : -0.2) + (g() - 0.5) * 1.4; return pos(i, NOW - 100 * DAY + i * 12 * HOUR, { session: london ? 'London' : 'Asia', rMultiple: rm, exit: 100 + rm, outcome: rm > 0 ? 'WIN' : 'LOSS', exitReason: rm > 0 ? 'target' : 'stop' }) })
}
function r(i: number, over: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return { id: `ar${i}`, source: 'PAPER', strategyId: 'silver-bullet', family: 'session', symbol: 'BTCUSDT', interval: '5m', session: 'london', regime: 'ranging', volatility: 'normal', direction: 'long', decidedAt: NOW - 50 * DAY + i * 6 * HOUR, filledAt: NOW - 50 * DAY + i * 6 * HOUR + 300_000, closedAt: NOW - 50 * DAY + i * 6 * HOUR + 1_800_000, hourET: 8, weekdayET: 2, intendedEntry: 100, entry: 100, stop: 99, target: 102, exit: 101, exitReason: 'take-profit', rMultiple: 1, outcome: 'WIN', missed: false, quality: 85, fusedScore: 80, mtfAligned: null, newsMinutes: null, spreadPct: null, durationMs: 1_500_000, mae: { r: -0.3, status: 'OBSERVED', note: '' }, mfe: { r: 1.2, status: 'OBSERVED', note: '' }, engineVersion: '2.3.0', featureVersion: 1, missing: [], corrupt: false, corruptReason: null, ...over }
}
const obsInput = (t: number, over: Partial<Parameters<typeof ev.makeObservation>[0]> = {}): Parameters<typeof ev.makeObservation>[0] => ({ time: t, availableAt: t, session: 'london', regime: 'ranging', volatility: 'normal', type: 'LIQUIDITY EVENT', source: 'engine-step', detail: 'sweep of the Asia low', direction: 'down', evidence: [{ field: 'sweepDepthAtr', value: 1.1 }], caseKind: 'liquidity-sweep', recordId: null, significance: { score: 70, selected: true, reasons: ['deep sweep'], basis: { sweepDepthAtr: 1.1 }, note: 'n' }, before: { structureTrend: null, liquidity: null, regime: 'ranging', session: 'london', strategiesActive: 0, strategiesNear: 0, risk: null, price: 100 }, ...over })

const candles: Candle[] = syntheticKlines(4, 17, NOW).map((k) => ({ openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5], closeTime: k[6] }))
store().upsertCandles(config.symbol, config.interval, candles, 'rest')
const lastClose = candles[candles.length - 1].closeTime

test('duplicates: every write is content-addressed; a second identical write is one record', async () => {
  const o = ev.makeObservation(obsInput(NOW - 3 * DAY))
  assert.equal(ev.recordObservation(o).isNew, true)
  assert.equal(ev.recordObservation(ev.makeObservation(obsInput(NOW - 3 * DAY))).isNew, false)
  assert.equal(ev.listObservations({ type: 'LIQUIDITY EVENT' }).length, 1)
  const a = vault.addItem({ kind: 'concept', title: 'Dup', body: 'b', evidenceLabel: 'OBSERVED', provenance: { source: 'NONE' }, now: NOW })
  assert.equal(vault.addItem({ kind: 'concept', title: 'Dup', body: 'different body, same event', evidenceLabel: 'OBSERVED', provenance: { source: 'NONE' }, now: NOW }).id, a.id)
  assert.equal(vault.listItems({ kind: 'concept' }).length, 1)
  const f1 = fail.recordFailure({ kind: 'manual', ref: 'dup-1', title: 'Manual failure', what: 'w', why: 'y', lesson: 'l', strategyId: null, filters: [], refs: {}, source: 'USER', sampleSize: null, at: NOW })
  assert.equal(f1.isNew, true)
  assert.equal(fail.recordFailure({ kind: 'manual', ref: 'dup-1', title: 'Manual failure again', what: 'w', why: 'y', lesson: 'l', strategyId: null, filters: [], refs: {}, source: 'USER', sampleSize: null, at: NOW + 1 }).isNew, false)
  assert.equal(fail.listFailures({ kind: 'manual' }).length, 1)
  const d = rec.datasetOf(Array.from({ length: 60 }, (_, i) => r(i, { session: i % 2 ? 'asia' : 'london', rMultiple: i % 2 ? -0.2 : 0.6 })))
  const spec = { hypothesisId: null, kind: 'cohort' as const, strategyId: 'silver-bullet', source: 'PAPER' as const, filters: [{ dimension: 'session' as const, values: ['london'] }], direction: 'positive' as const, method: 'dup test' }
  const e1 = X.registerExperiment(spec, d, NOW)
  const e2 = X.registerExperiment(spec, d, NOW + 1)
  assert.equal(e1.isNew, true); assert.equal(e2.isNew, false); assert.equal(e1.experiment.experimentId, e2.experiment.experimentId)
  await X.runExperiment(e1.experiment.experimentId, { dataset: d, now: NOW })
  const again = await X.runExperiment(e1.experiment.experimentId, { dataset: d, now: NOW + DAY })
  assert.equal(again.finishedAt, X.getExperiment(e1.experiment.experimentId)!.finishedAt, 'a DONE experiment is not re-run into a different answer')
  const g1 = Q.generateQueue({ paper: d, now: NOW })
  const g2 = Q.generateQueue({ paper: d, now: NOW + HOUR })
  assert.equal(g2.created, 0)
  assert.equal(g1.items.length, g2.items.length)
  const dg1 = D.dailyDigest([], NOW), dg2 = D.dailyDigest([], NOW + HOUR)
  assert.equal(dg1.isNew, true); assert.equal(dg2.isNew, false); assert.equal(D.listDigests('daily').length, 1)
})

test('restart recovery: a partial ops state merges with safe defaults; nothing is lost or doubled on resume', () => {
  store().setJson('research:ops', { runs: 3, lastDigestDay: '2026-01-19' })
  const s = ops.readOps()
  assert.equal(s.runs, 3); assert.equal(s.cycles, 0); assert.equal(s.running, false); assert.equal(s.lastDigestDay, '2026-01-19')
  store().setJson('research:ops', 'garbage')
  assert.equal(ops.readOps().runs, 0, 'unreadable state falls back to fresh defaults instead of throwing')
  ops.resetOps()
})

test('corrupted knowledge is skipped, counted, and never deleted', () => {
  store().setJson('knowledge:corrupt-1', { id: 'corrupt-1' })
  store().setJson('knowledge:corrupt-2', 'not an object')
  assert.equal(vault.getItem('corrupt-1'), null)
  assert.ok(vault.listItems().every((i) => i.id !== 'corrupt-1'))
  assert.equal(vault.vaultSummary().corrupt, 2)
  assert.deepEqual(vault.corruptItems().sort(), ['corrupt-1', 'corrupt-2'])
  assert.doesNotThrow(() => mem.memorySummary())
  assert.doesNotThrow(() => decay.runDecayMonitor({ now: NOW, paper: rec.datasetOf([]), currentRegime: null, drift: [], regimeChangesSince: () => 0 }))
  assert.doesNotThrow(() => vault.sweepStale(NOW + 40 * DAY))
  assert.ok(store().keysWithPrefix('knowledge:corrupt-').length === 2, 'the rows are still there for a person to look at')
})

test('contradictory knowledge: opposite statements on one cohort receive opposite evidence from the same paper close; the contradicted one is flagged, the other is not, neither is deleted', () => {
  const A = vault.addItem({ kind: 'session-observation', title: 'London leans positive', body: 'b', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER' }, tags: ['london'], payload: { direction: 'positive', filters: [{ dimension: 'session', values: ['london'] }] }, now: NOW - HOUR })
  const B = vault.addItem({ kind: 'session-observation', title: 'London leans negative', body: 'b', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER' }, tags: ['london'], payload: { direction: 'negative', filters: [{ dimension: 'session', values: ['london'] }] }, now: NOW - HOUR })
  for (let i = 0; i < 5; i++) lo.observePaperClose(pos(900 + i, NOW - 2 * HOUR + i * 60_000, { id: `contra-${i}`, rMultiple: 1.2, outcome: 'WIN' }), NOW - HOUR + i)
  const a = vault.getItem(A.id)!, b = vault.getItem(B.id)!
  assert.equal(a.new_evidence_count, 5); assert.equal(a.contradictory_evidence_count, 0); assert.equal(a.status, 'CURRENT')
  assert.equal(b.contradictory_evidence_count, 5); assert.equal(b.status, 'REVIEW REQUIRED', 'five contradictions force a review')
  const rep = decay.runDecayMonitor({ now: NOW, paper: rec.datasetOf([]), currentRegime: null, drift: [], regimeChangesSince: () => 0 })
  assert.equal(vault.getItem(B.id)!.status, 'CONTRADICTED')
  assert.equal(vault.getItem(A.id)!.status, 'CURRENT')
  assert.ok(rep.changed.some((c) => c.itemId === B.id && c.flags.some((f) => f.code === 'contradictions' && f.severity === 'HARD')))
  assert.ok(vault.getItem(A.id) && vault.getItem(B.id), 'both statements remain on record')
})

test('stale knowledge expires into STALE, the monitor never revives it, and a hard contradiction still overrides it', () => {
  const it = vault.addItem({ kind: 'strategy-observation', title: 'An old observation', body: 'b', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER', period: { from: NOW - 200 * DAY, to: NOW - 150 * DAY } }, now: NOW - 100 * DAY })
  vault.sweepStale(NOW)
  assert.equal(vault.getItem(it.id)!.status, 'STALE')
  decay.runDecayMonitor({ now: NOW, paper: rec.datasetOf([]), currentRegime: null, drift: [], regimeChangesSince: () => 0 })
  assert.equal(vault.getItem(it.id)!.status, 'STALE', 'soft flags do not move a STALE item; it waits for a review')
  const h = H.createHypothesis({ question: 'Stale q?', observation: 'o', hypothesis: 'h', nullHypothesis: 'n', direction: 'positive', dataset: { source: 'PAPER', label: 'PAPER' }, cohortFilters: [], method: 'm', now: NOW - 90 * DAY })
  H.saveHypothesis({ ...h, status: 'NOT SUPPORTED' })
  vault.saveItem({ ...vault.getItem(it.id)!, links: [h.id] })
  decay.runDecayMonitor({ now: NOW, paper: rec.datasetOf([]), currentRegime: null, drift: [], regimeChangesSince: () => 0 })
  const after = vault.getItem(it.id)!
  assert.equal(after.status, 'CONTRADICTED')
  assert.deepEqual(after.history.slice(-2).map((x) => x.event), ['stale', 'contradicted'])
})

test('no lookahead and no future data: an event is never knowable before it happens, a leaked annotation fails the audit, BEFORE never carries AFTER, and a candidate waits for its horizon', () => {
  const early = ev.makeObservation(obsInput(NOW - DAY, { availableAt: NOW - DAY - 60_000 }))
  assert.equal(early.availableAt, NOW - DAY, 'availableAt is never earlier than the event')
  const cases = cs.casesFromSteps(cs.stepEngine(candles, 200), candles, { horizon: 12 }).filter((c) => c.after.candles > 0 && c.after.moveAtr !== null)
  assert.ok(cases.length >= 1)
  for (const c of cases) assert.deepEqual(cs.hindsightFindings(c), [], `case ${c.id} leaks`)
  const leaked = { ...cases[0], before: { ...cases[0].before, annotations: [{ ...(cases[0].before.annotations[0] ?? { annotationType: 'fvg', id: 'x' }), knownAt: cases[0].before.asOf + 1 }] } } as typeof cases[0]
  assert.ok(cs.hindsightFindings(leaked).some((f) => /BEFORE contains/.test(f)), 'an annotation known after BEFORE is caught')
  const tooLate = { ...cases[0], after: { ...cases[0].after, from: cases[0].at } } as typeof cases[0]
  assert.ok(cs.hindsightFindings(tooLate).some((f) => /AFTER begins/.test(f)))
  const ex = U.exerciseFromCase(cases[0])!
  assert.ok(ex.shown.includes('BEFORE') && !ex.shown.includes('AFTER:') && !ex.shown.includes(cases[0].after.note))
  const pending = ev.makeObservation(obsInput(lastClose, { availableAt: lastClose }))
  ev.recordObservation(pending)
  const res = ob.resolveCandidates(NOW + 30 * DAY)
  assert.equal(ev.getObservation(pending.id)!.status, 'CANDIDATE', 'the clock says the horizon has passed; the stored candles say it has not — the candles win')
  assert.ok(res.pending >= 1)
})

test('parameter leakage: a parameter sandbox experiment leaves the config, the strategy defaults and the store free of any override', async () => {
  const tunable = [...metaById().values()].find((m) => (m.parameters ?? []).length > 0)!
  const p = tunable.parameters![0]
  const defaults = JSON.stringify(tunable.parameters)
  const before = new Set(store().keysWithPrefix(''))
  const r = await S.runSandbox({ kind: 'parameter', strategyId: tunable.id, source: 'BACKTEST', params: { [p.name]: Math.min(p.max, p.default + p.step) } }, [], { backtest: async () => ({ trades: [] }), now: NOW })
  assert.equal(r.experiment.kind, 'parameter')
  assert.equal(r.experiment.parameterSnapshot[p.name], Math.min(p.max, p.default + p.step))
  assert.equal(r.experiment.result, 'INSUFFICIENT DATA')
  assert.equal(JSON.stringify(metaById().get(tunable.id)!.parameters), defaults, 'the registry defaults did not move')
  assert.equal(JSON.stringify(config), CONFIG_BEFORE)
  const added = store().keysWithPrefix('').filter((k) => !before.has(k))
  assert.ok(added.every((k) => /^(experiment:|research:trials|hypothesis:)/.test(k)), `only research stores were written: ${added.join(', ')}`)
})

test('selection bias: priority never reads a result; the challenger asks whether the sample was chosen after the results and whether it was one of many; comparisons are counted', async () => {
  const items = Q.listQueue()
  assert.ok(items.length >= 1)
  for (const q of items) {
    assert.ok(!('meanR' in q) && !('edge' in q) && !('result' in q), 'a queue item carries no result field for priority to read')
    assert.ok(q.priorityReasons.some((x) => /not a priority input/.test(x)))
  }
  const done = X.listExperiments({ status: 'DONE' })[0]
  const d = rec.datasetOf(Array.from({ length: 60 }, (_, i) => r(i, { session: i % 2 ? 'asia' : 'london', rMultiple: i % 2 ? -0.2 : 0.6 })))
  const { challenge } = await import('../../src/research/challenger.ts')
  const ch = challenge(done, { oosTreatment: d.records.filter((x) => done.oosResult?.recordIds.includes(x.id)), hypothesesOnRecord: 25, draftedFromObservation: true, now: NOW })
  const qs = ch.attacks.map((a) => a.question)
  assert.ok(qs.some((x) => /selected after seeing results/.test(x)) && qs.some((x) => /one of many/.test(x)) && qs.some((x) => /overfitting/i.test(x)))
  assert.equal(ch.attacks.find((a) => /selected after/.test(a.question))!.verdict, 'WEAKENED', 'drafted from the observation it tests → weakened')
  assert.equal(ch.attacks.find((a) => /one of many/.test(a.question))!.verdict, 'WEAKENED', '25 hypotheses on record → weakened')
  assert.ok(done.multipleTestingContext.trials >= 1 && /trial/i.test(done.multipleTestingContext.note))
})

test('data leakage and mixed-source contamination: PAPER and BACKTEST are never pooled, and a mixed dataset asks no question', () => {
  const paper = rec.datasetOf(Array.from({ length: 30 }, (_, i) => r(i)))
  const bt = rec.datasetOf(Array.from({ length: 30 }, (_, i) => r(i, { id: `bt${i}`, source: 'BACKTEST', engineVersion: null, featureVersion: null })))
  assert.throws(() => rec.datasetOf([...paper.records, ...bt.records]), /mixed sources/)
  const mixed = rec.combine([paper, bt])
  assert.equal(mixed.provenance.source, 'MIXED')
  assert.match(mixed.provenance.label, /MIXED/)
  assert.deepEqual(L.researchQuestions(mixed, { now: NOW }), [])
  assert.throws(() => drift.driftReport(mixed as never, bt), /must be a PAPER dataset/)
  assert.throws(() => drift.driftReport(paper, mixed as never), /must be a BACKTEST dataset/)
  const g = Q.generateQueue({ paper, backtest: mixed, now: NOW })
  assert.ok(g.items.every((q) => q.dataset.source === 'PAPER'), 'no queue item is drafted from a mixed dataset')
})

test('strategy and live mutation attempts: ticking, sandboxing, deciding and reviewing leave production identical; no learning route touches config or the live gate', async () => {
  const closed = population(140)
  await ops.researchTick({ closed: () => closed, now: NOW - 6 * HOUR })
  assert.throws(() => V.decideReview('no-such-proposal', 'APPROVE FOR PAPER TEST', 'tester', 'x', NOW), /no such proposal/)
  decay.runDecayMonitor({ now: NOW, paper: rec.paperDataset(closed), currentRegime: null, drift: [], regimeChangesSince: () => 0 })
  assert.equal(JSON.stringify(config), CONFIG_BEFORE)
  assert.equal(process.env.LIVE_TRADING_ENABLED, undefined)
  assert.equal(config.live.enabled, false); assert.equal(config.shadow.enabled, false)
  const server = readFileSync(join(ROOT, 'src', 'server.ts'), 'utf8')
  const block = server.slice(server.indexOf('Phase 24 — the live observer'), server.indexOf("'GET /api/school/changes'"))
  const paths = [...block.matchAll(/'(GET|POST) (\/api\/[^']+)'/g)].map((m) => m[2])
  assert.ok(paths.length >= 30)
  assert.ok(paths.every((p) => !/\/api\/live|config|arm|order|position|params/.test(p)), 'no Phase 24 route reaches the live gate, config, orders, positions or parameters')
  for (const dir of ['learning', 'research', 'knowledge', 'observer', 'school']) {
    const { readdirSync } = await import('node:fs')
    for (const f of readdirSync(join(ROOT, 'src', dir))) {
      const src = readFileSync(join(ROOT, 'src', dir, f), 'utf8')
      assert.doesNotMatch(src, /\bconfig\.[A-Za-z.]+\s*=[^=]/, `${dir}/${f} assigns into config`)
      assert.doesNotMatch(src, /process\.env\.LIVE_TRADING_ENABLED\s*=/, `${dir}/${f} touches the live env`)
    }
  }
})

test('hallucinated evidence and unsupported claims: missing refs do not crash or count, banned words are refused, and no output forecasts', () => {
  const it = vault.addItem({ kind: 'research-result', title: 'Rests on a ghost', body: 'b', evidenceLabel: 'INFERRED', provenance: { source: 'PAPER' }, links: ['hyp-does-not-exist'], now: NOW })
  const flags = decay.decayFlags(it, { now: NOW, paper: rec.datasetOf([]), currentRegime: null, drift: [], regimeChangesSince: () => 0 })
  assert.ok(!flags.some((f) => f.code === 'hypothesis-contradicted'), 'a link to nothing is not evidence of anything')
  const p = L.makeProposal({ kind: 'filter', strategyId: 'silver-bullet', title: 'Ghost evidence', rationale: 'r', change: 'c', params: null, evidence: { hypothesisIds: ['hyp-does-not-exist'], recordIds: [], campaignId: null, passportId: null }, oosRs: [], trials: 1, critique: null, now: NOW } as never)
  L.saveProposal(p)
  const card = V.reviewCard(p.id, NOW)!
  assert.ok(card.counterevidence.length >= 1 && card.counterevidence.every((c) => typeof c === 'string' && !/hyp-does-not-exist/.test(c)), 'counterevidence comes from experiments on record (or says none is recorded); the ghost contributes nothing')
  assert.ok(card.evidence.every((e) => X.getExperiment(e.experimentId)), 'every evidence row is a real experiment on record; the ghost hypothesis contributed none')
  assert.ok(!card.researchHistory.some((h) => /hyp-does-not-exist/.test(h.detail)))
  assert.equal(card.canDecide, false, 'a proposal that failed its gates cannot be approved')
  assert.throws(() => H.makeHypothesis({ question: 'Is it proven?', observation: 'o', hypothesis: 'h', nullHypothesis: 'n', direction: 'positive', dataset: { source: 'PAPER', label: 'x' }, cohortFilters: [], method: 'm', now: NOW }), /not a word/)
  const closed = population(140)
  const outputs = [
    JSON.stringify(R.recommendations({ paper: rec.paperDataset(closed), now: NOW })),
    JSON.stringify(status.systemStatus({ closed, open: 0, now: NOW })),
    JSON.stringify(D.buildDailyDigest(closed, NOW)),
    JSON.stringify(D.buildWeeklyResearchReview(closed, NOW)),
    JSON.stringify(D.buildMonthlyModelAudit(closed, NOW)),
    JSON.stringify(fail.failureSummary()),
    JSON.stringify(X.listExperiments().map((e) => X.renderExperiment(e))),
  ]
  for (const o of outputs) assert.doesNotMatch(o, BANNED)
  for (const rcm of R.recommendations({ paper: rec.paperDataset(closed), now: NOW }).items) assert.doesNotMatch(rcm.wouldAnswer, /\b(buy|sell|go long|go short|enter)\b/i)
})
