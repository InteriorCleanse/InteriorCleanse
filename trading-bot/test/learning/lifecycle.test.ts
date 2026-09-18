/**
 * THE FINAL DEMONSTRATION — one lifecycle, end to end, in 22 steps:
 * a market event is observed, recorded, classified, explained, turned into
 * a case study only after its horizon is stored, taught, researched,
 * tested against a baseline, challenged, remembered, decayed, reviewed by a
 * human — and nothing in production changed at any step.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tempDataDir, syntheticKlines } from '../helpers.ts'
import type { Candle } from '../../src/types.ts'
import type { Snapshot } from '../../src/bot.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'
import type { EvidenceRecord } from '../../src/analyst/records.ts'

const tmp = tempDataDir('mrcash-lifecycle-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const { store } = await import('../../src/store.ts')
const ev = await import('../../src/observer/events.ts')
const ob = await import('../../src/observer/observer.ts')
const live = await import('../../src/observer/live.ts')
const ops = await import('../../src/learning/ops.ts')
const status = await import('../../src/learning/status.ts')
const D = await import('../../src/learning/digest.ts')
const drift = await import('../../src/learning/drift.ts')
const lo = await import('../../src/learning/observer.ts')
const X = await import('../../src/research/experiments.ts')
const H = await import('../../src/research/hypotheses.ts')
const L = await import('../../src/research/lab.ts')
const Q = await import('../../src/research/queue.ts')
const V = await import('../../src/research/review.ts')
const fail = await import('../../src/knowledge/failures.ts')
const decay = await import('../../src/knowledge/decayMonitor.ts')
const vault = await import('../../src/knowledge/vault.ts')
const mem = await import('../../src/knowledge/memory.ts')
const cs = await import('../../src/school/caseStudies.ts')
const rec = await import('../../src/analyst/records.ts')
const { tradingDayKey } = await import('../../src/sessions.ts')
after(() => tmp.cleanup())

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(HERE, '..', '..')
const NOW = Date.UTC(2026, 0, 20, 15, 0)
const DAY = 86_400_000
const HOUR = 3_600_000
const CONFIG_BEFORE = JSON.stringify(config)
const FORECAST = /\b(will (rise|fall|rally|drop|reverse|continue)|expect a|forecast:|guaranteed|proven|fail-?proof)\b/i

function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
function pos(i: number, closedAt: number, over: Partial<PaperPosition> = {}): PaperPosition {
  const openedAt = closedAt - 1_800_000
  return { id: `lc${i}`, openedAt, dayKey: tradingDayKey(openedAt), session: 'London', setupKey: 'BTCUSDT|5m|silver-bullet|long', direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 0.01, riskUsd: 1, quality: 85, reason: 'test', atr: 0.5, status: 'closed', filledAt: openedAt + 300_000, strategyId: 'silver-bullet', regime: 'trending-up', closedAt, exit: 102, exitReason: 'target', rMultiple: 1, pnlUsd: 1, feesUsd: 0.01, outcome: 'WIN', candlesHeld: 5, ...over }
}
const g = rng(21)
const closed: PaperPosition[] = Array.from({ length: 140 }, (_, i) => { const london = i % 2 === 0; const rm = (london ? 0.5 : -0.2) + (g() - 0.5) * 1.4; return pos(i, NOW - 70 * DAY + i * 12 * HOUR, { session: london ? 'London' : 'Asia', rMultiple: rm, exit: 100 + rm, outcome: rm > 0 ? 'WIN' : 'LOSS', exitReason: rm > 0 ? 'target' : 'stop' }) })

// The market: five days of stored candles, stepped by the engine exactly as the watch loop would see them.
const candles: Candle[] = syntheticKlines(5, 17, NOW).map((k) => ({ openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5], closeTime: k[6] }))
store().upsertCandles(config.symbol, config.interval, candles, 'rest')
const steps = cs.stepEngine(candles, 200)
const snapAt = (i: number): Snapshot => ({ candles: candles.slice(0, i + 1), analysis: steps[i].analysis, signal: steps[i].analysis.signal, news: null, plan: null, engine: null, flow: null, state: null, strategyVotes: steps[i].votes ?? [], decision: steps[i].decision ?? null })
const FROM = Math.max(1, steps.length - 500)
let firstCandidate: ReturnType<typeof ev.listObservations>[number] | null = null
let experimentId = ''

test('01 — an engine cycle is observed: events are recorded with time, availability, session, regime, engine and feature version, source and evidence', () => {
  ob.resetObserver()
  for (let i = FROM; i < steps.length; i++) ops.onWatchCycle({ at: candles[i].closeTime + 1, snap: snapAt(i) })
  const all = ev.listObservations({ limit: 5000 })
  assert.ok(all.length > 0, 'the engine saw events on five days of candles')
  for (const o of all) {
    assert.ok(o.time > 0 && o.availableAt >= o.time && o.symbol && o.timeframe && o.engineVersion && typeof o.featureVersion === 'number' && o.type && o.source && Array.isArray(o.evidence))
    assert.ok(o.significance.reasons.length >= 1, 'every significance states why')
  }
  assert.equal(ops.readOps().cycles, steps.length - FROM)
})

test('02 — nothing is manufactured: observing the same cycles again records zero new events', () => {
  const before = ev.observationCounts().total
  ob.resetObserver()
  for (let i = FROM; i < steps.length; i++) ops.onWatchCycle({ at: candles[i].closeTime + 1, snap: snapAt(i) })
  assert.equal(ev.observationCounts().total, before)
})

test('03 — significance selects with a stated reason; selected events with a case kind become candidates', () => {
  const selected = ev.listObservations({ minSignificance: 50, limit: 5000 }).filter((o) => o.significance.selected)
  assert.ok(selected.length >= 1, 'the fixture yields selected events')
  for (const o of selected) assert.ok(o.significance.reasons.length >= 1 && !FORECAST.test(o.significance.note))
  const candidatesOrResolved = ev.listObservations({ limit: 5000 }).filter((o) => o.status === 'CANDIDATE' || o.status === 'RESOLVED')
  assert.ok(candidatesOrResolved.length >= 1)
  firstCandidate = candidatesOrResolved.sort((a, b) => b.significance.score - a.significance.score)[0]
})

test('04 — the live school explains an observed event from what was knowable and shows no result before the horizon', () => {
  const v = live.liveView(NOW)
  for (const o of v.observing) { assert.equal(o.result, null); assert.ok(o.before && typeof o.before.strategiesActive === 'number') }
  assert.ok(v.notes.some((n) => /explained with what was knowable|Nothing is being observed/.test(n)))
  assert.doesNotMatch(JSON.stringify(v.observing), FORECAST)
})

test('05 — a candidate is not resolved before its horizon is stored, whatever the clock says', () => {
  const lastClose = candles[candles.length - 1].closeTime
  const late = ev.makeObservation({ time: lastClose, availableAt: lastClose, session: 'london', regime: 'ranging', volatility: 'normal', type: 'LIQUIDITY EVENT', source: 'engine-step', detail: 'late sweep', direction: 'down', evidence: [], caseKind: 'liquidity-sweep', recordId: null, significance: { score: 80, selected: true, reasons: ['deep sweep'], basis: {}, note: 'n' }, before: { structureTrend: null, liquidity: null, regime: 'ranging', session: 'london', strategiesActive: 0, strategiesNear: 0, risk: null, price: 100 } })
  ev.recordObservation(late)
  ob.resolveCandidates(NOW + 365 * DAY, { max: 50 })
  assert.equal(ev.getObservation(late.id)!.status, 'CANDIDATE')
})

test('06 — when the horizon is stored, candidates resolve into case studies that pass the no-lookahead audit and are vaulted', () => {
  let resolved = 0
  for (let k = 0; k < 40; k++) { const r = ob.resolveCandidates(NOW, { max: 20 }); resolved += r.resolved.length; if (!r.resolved.length && !r.unresolvable.length) break }
  const done = ev.listObservations({ status: 'RESOLVED', limit: 5000 })
  assert.ok(done.length >= 1, `resolved ${resolved}`)
  for (const o of done) {
    const item = vault.getItem(o.caseId!)!
    assert.equal(item.kind, 'case-study')
    const c = item.payload as ReturnType<typeof cs.casesFromSteps>[number]
    assert.deepEqual(cs.hindsightFindings(c), [])
    assert.ok(c.after.candles > 0 && c.after.from > c.at)
  }
})

test('07 — RESULT REVEALED only after resolution; the replay of a completed event stops before the outcome', () => {
  const v = live.liveView(NOW)
  assert.ok(v.revealed.length >= 1)
  for (const o of v.revealed) assert.ok(o.result && o.caseId)
  const r = live.replayForObservation(v.revealed[0].id)
  if (r) {
    const stop = r.bundle.lesson.stops[0]
    assert.ok(stop)
    assert.ok(!JSON.stringify(stop).includes('"after"'), 'the stop carries no AFTER frame')
  }
})

test('08 — the lesson of the day is the most significant resolved case: BEFORE, DECISION, AFTER, what it teaches and what it does not', () => {
  const resolved = ev.listObservations({ status: 'RESOLVED', limit: 5000 })
  const at = Math.max(...resolved.map((o) => o.resolvedAt ?? 0)) + 1
  const d = D.buildDailyDigest([], at)
  assert.ok(d.lessonOfTheDay, 'a case resolved in the window')
  const l = d.lessonOfTheDay!
  assert.ok(l.before && l.decision && l.after && l.teaches && l.doesNotTeach.length >= 2)
  assert.doesNotMatch(l.before, /max up|max down|Over \d+ candle/)
})

test('09 — paper trades are the live dataset: a close flows into the record, the post-mortem, the evidence counts', () => {
  const p = pos(999, NOW - 2 * HOUR, { id: 'lifecycle-close', rMultiple: -1, exit: 99, outcome: 'LOSS', exitReason: 'stop' })
  const pm = lo.observePaperClose(p, NOW - HOUR)
  assert.equal(pm.kind, 'loss', 'no decision snapshot was recorded, so it is a loss and not a loss on a full checklist')
  assert.equal(pm.atDecision.recorded, false)
  assert.ok(vault.getItem(pm.vaultItemId))
  const r = rec.fromPaperPosition(p)
  assert.equal(r.source, 'PAPER'); assert.equal(r.session, 'london'); assert.equal(r.rMultiple, -1)
  assert.equal(lo.observePaperClose(p, NOW - HOUR).itemsTouched.length, 0, 'observed twice counts once')
})

test('10 — research questions are generated from the record and the observations; the queue prioritises with reasons and never with a result', async () => {
  const tick = await ops.researchTick({ closed: () => closed, now: NOW })
  assert.ok(tick.steps.every((s) => s.ok), tick.steps.filter((s) => !s.ok).map((s) => `${s.name}: ${s.detail}`).join(' | '))
  const q = Q.listQueue()
  assert.ok(q.length >= 1)
  for (const it of q) { assert.ok(it.priorityReasons.some((x) => /not a priority input/.test(x))); assert.ok(!('meanR' in it)) }
  assert.ok(tick.experiment, 'a London cohort of 70 trades was testable')
  experimentId = tick.experiment!.id
})

test('11 — the hypothesis states question, observation, hypothesis, null, direction, dataset and method; banned words are refused', () => {
  const e = X.getExperiment(experimentId)!
  const h = H.getHypothesis(e.hypothesisId!)!
  for (const k of ['question', 'observation', 'hypothesis', 'nullHypothesis', 'direction', 'dataset', 'method'] as const) assert.ok(h[k], k)
  assert.throws(() => H.makeHypothesis({ question: 'q', observation: 'o', hypothesis: 'a guaranteed edge', nullHypothesis: 'n', direction: 'positive', dataset: { source: 'PAPER', label: 'x' }, cohortFilters: [], method: 'm', now: NOW }), /not a word/)
})

test('12 — the experiment froze its dataset, strategy version and parameters before it ran', () => {
  const e = X.getExperiment(experimentId)!
  assert.ok(e.datasetHash && e.datasetLabel && e.strategyVersion && e.parameterSnapshot && e.dateRange)
  assert.ok(e.startedAt! >= e.createdAt)
  assert.match(X.renderExperiment(e), /dataset .* · strategy .* · params/)
})

test('13 — in-sample, out-of-sample and a defined baseline were measured; the comparison is a Welch interval, not a bare difference', () => {
  const e = X.getExperiment(experimentId)!
  assert.ok(e.inSampleResult && e.oosResult && e.baselineInSample && e.baselineOos)
  assert.ok(e.baseline.kind === 'complement' && e.baseline.label)
  assert.ok(e.comparison.oos && ['TOO FEW', 'INDISTINGUISHABLE', 'TREATMENT AHEAD', 'BASELINE AHEAD'].includes(e.comparison.oos.verdict))
  if (e.comparison.oos!.verdict !== 'TOO FEW') assert.ok(e.comparison.oos!.ci95)
})

test('14 — robustness: walk-forward and Monte Carlo ran, or the record says UNTESTED and why', () => {
  const e = X.getExperiment(experimentId)!
  assert.ok(e.robustnessResult && ['ROBUST', 'FRAGILE', 'UNTESTED'].includes(e.robustnessResult.verdict))
  assert.ok(e.robustnessResult!.notes.length >= 1)
})

test('15 — the challenger attacked from every angle and gave an overall verdict', () => {
  const e = X.getExperiment(experimentId)!
  const ch = e.challenge as { overall: string; attacks: Array<{ question: string; verdict: string; detail: string }> }
  assert.ok(ch && ch.attacks.length >= 10, `attacks: ${ch?.attacks?.length} (the deflation and baseline attacks appear only when their inputs exist)`)
  for (const stem of ['selected after seeing results', 'one of many', 'out of sample', 'walk-forward', 'costs and slippage', 'different market periods', 'different symbols', 'counterexamples', 'regime-specific', 'more data']) assert.ok(ch.attacks.some((a) => a.question.includes(stem)), stem)
  assert.ok(['SURVIVES', 'WEAKENED', 'DISPROVED', 'UNTESTABLE'].includes(ch.overall))
  for (const a of ch.attacks) assert.ok(a.question && a.verdict && a.detail)
  assert.ok(ch.attacks.some((a) => /overfitting/i.test(a.question)) && ch.attacks.some((a) => /costs and slippage/.test(a.question)) && ch.attacks.some((a) => /counterexamples/.test(a.question)))
})

test('16 — the hypothesis status followed the result; nothing is OOS SUPPORTED without an out-of-sample stage', () => {
  const e = X.getExperiment(experimentId)!
  const h = H.getHypothesis(e.hypothesisId!)!
  assert.ok(H.HYPOTHESIS_STATUSES.includes(h.status))
  if (h.status === 'OOS SUPPORTED') assert.ok(h.outOfSample && h.outOfSample.trades >= 10)
  assert.ok(h.history.length >= 2)
})

test('17 — a reassessment date was scheduled; the queue item carries a derived maturity', () => {
  const e = X.getExperiment(experimentId)!
  assert.equal(e.nextTest, e.finishedAt! + X.REASSESS_MS)
  Q.generateQueue({ paper: rec.paperDataset(closed), now: NOW + 1 })
  const q = Q.listQueue().find((x) => x.experimentIds.includes(experimentId) || x.hypothesisId === e.hypothesisId)!
  assert.ok(q && Q.MATURITY.includes(q.maturity))
  assert.ok(['TESTED', 'UNDER TEST', 'QUEUED'].includes(q.status))
})

test('18 — what did not work is remembered in failure memory and mirrored in the vault', () => {
  const h = H.createHypothesis({ question: 'Does Asia hold?', observation: 'o', hypothesis: 'Asia mean is above zero', nullHypothesis: 'n', direction: 'positive', dataset: { source: 'PAPER', label: 'PAPER' }, cohortFilters: [{ dimension: 'session', values: ['asia'] }], method: 'm', strategy: 'silver-bullet', session: 'asia', now: NOW })
  H.saveHypothesis({ ...h, status: 'NOT SUPPORTED', history: [...h.history, { at: NOW, event: 'not-supported', detail: 'OOS spans zero', version: 1 }] })
  const hv = fail.harvestFailures(NOW + 2)
  const f = fail.listFailures({ kind: 'hypothesis-not-supported' }).find((x) => x.refs.hypothesisId === h.id)!
  assert.ok(f, hv.note)
  assert.ok(f.what && f.why && f.lesson && vault.getItem(f.vaultItemId))
  assert.ok(fail.priorFailures('silver-bullet', [{ dimension: 'session', values: ['asia'] }]).some((x) => x.id === f.id), 'the next Asia idea is told it is a retest')
  assert.ok(mem.memory('FAILURE').entries.some((e) => e.id === f.vaultItemId || e.id === f.id))
})

test('19 — knowledge decays: the monitor flags and moves, never deletes; a human review restores', () => {
  const it = vault.addItem({ kind: 'session-observation', title: 'Asia leans positive (lifecycle)', body: 'b', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER', sampleSize: 12 }, tags: ['asia'], links: [H.listHypotheses({ status: 'NOT SUPPORTED' })[0].id], payload: { direction: 'positive', filters: [{ dimension: 'session', values: ['asia'] }] }, now: NOW })
  const total = vault.listItems().length
  decay.runDecayMonitor({ now: NOW + 3, paper: rec.paperDataset(closed), currentRegime: null, drift: [], regimeChangesSince: () => 0 })
  assert.equal(vault.getItem(it.id)!.status, 'CONTRADICTED')
  assert.equal(vault.listItems().length, total)
  const reviewed = vault.reviewItem(it.id, { outcome: 'CONFIRMED', note: 'looked; the linked hypothesis was about a different window' }, NOW + 4)!
  assert.equal(reviewed.status, 'CURRENT')
  assert.ok(reviewed.history.some((x) => x.event === 'contradicted') && reviewed.history.some((x) => x.event === 'review'))
})

test('20 — historical → paper drift is reported as a difference, never a cause, and becomes a research question', () => {
  const gb = rng(7)
  const bt = rec.datasetOf(Array.from({ length: 120 }, (_, i) => { const london = i % 2 === 0; const rm = (london ? -0.5 : -0.2) + (gb() - 0.5) * 1.2; const base: EvidenceRecord = { ...rec.paperDataset([closed[0]]).records[0], id: `bt${i}`, source: 'BACKTEST', session: london ? 'london' : 'asia', decidedAt: NOW - 150 * DAY + i * 4 * HOUR, rMultiple: rm, outcome: rm > 0 ? 'WIN' : 'LOSS', engineVersion: null, featureVersion: null, corrupt: false, missed: false }; return base }))
  const d = drift.driftReport(rec.paperDataset(closed), bt, { now: NOW, strategyId: 'silver-bullet' })
  assert.ok(d.differences.length >= 1, d.note)
  for (const row of d.differences) assert.doesNotMatch(row.note, /because|caused by|degraded|improved/i)
  const g2 = Q.generateQueue({ paper: rec.paperDataset(closed), signals: d.signals, now: NOW + 5 })
  assert.ok(g2.items.some((q) => q.origin === 'drift'))
})

test('21 — a proposal waits for a human; approving it for a paper test records a decision and changes nothing', () => {
  const gp = rng(5)
  const strong = Array.from({ length: 200 }, () => 0.6 + (gp() - 0.5) * 1.5)
  const paper = rec.paperDataset(closed)
  const critique = L.critiqueCohort({ name: 'x', filters: [], provenance: paper.provenance, stats: { n: 250 } as never, recordIds: [], composition: { regime: { 'trending-up': 100, ranging: 100, breakout: 50 } } } as never, { source: 'PAPER' })
  const e = X.getExperiment(experimentId)!
  const p = L.saveProposal(L.makeProposal({ kind: 'parameter-variant', strategyId: 'silver-bullet', title: 'RR 2.5 (lifecycle)', rationale: 'holds OOS', change: 'rr 2.0 → 2.5', params: { rr: 2.5 }, evidence: { hypothesisIds: [e.hypothesisId!] }, oosRs: strong, paperTrades: 30, walkForwardPositiveShare: 0.8, hypothesisStatuses: ['OOS SUPPORTED'], critique, trials: 20, now: NOW }))
  assert.equal(p.status, 'PROPOSED')
  assert.equal(V.reviewQueue(NOW + 1).awaiting.length, 1)
  const card = V.reviewCard(p.id, NOW + 1)!
  assert.ok(card.evidence.some((x) => x.experimentId === experimentId), 'the experiment is the evidence')
  const decided = V.decideReview(p.id, 'APPROVE FOR PAPER TEST', 'gt', 'run it on paper', NOW + 2)
  assert.equal(decided.stage, 'APPROVED FOR PAPER TEST')
  assert.equal(JSON.stringify(config), CONFIG_BEFORE)
})

test('22 — the digest, the weekly review (WHAT SHOULD NOT BE TOUCHED), the monthly audit and the status describe it all; the engine read none of it; the gates are off', () => {
  const d = D.buildDailyDigest(closed, NOW + 10)
  assert.equal(d.sections.length, 12)
  const w = D.buildWeeklyResearchReview(closed, NOW + 10)
  const dnt = w.sections.find((s) => s.heading === 'WHAT SHOULD NOT BE TOUCHED')!
  assert.ok(dnt.lines.some((l) => /Live execution gate: disabled/.test(l)), dnt.lines.join(' | '))
  assert.ok(dnt.lines.some((l) => /await a human|No proposal awaits/.test(l)), dnt.lines.join(' | '))
  const m = D.buildMonthlyModelAudit(closed, NOW + 10)
  assert.ok(m.strategies.find((s) => s.strategyId === 'silver-bullet')!.experiments.total >= 1, JSON.stringify(m.strategies.find((s) => s.strategyId === 'silver-bullet')))
  const st = status.systemStatus({ closed, open: 0, now: NOW + 10 })
  assert.ok(st.researchEngine.experiments.done >= 1, 'experiments done')
  assert.ok(st.learningLoop.observations.resolved >= 1, `resolved: ${JSON.stringify(st.learningLoop.observations)}`)
  assert.ok(st.knowledgeStore.failures >= 1, 'failures on record')
  for (const text of [JSON.stringify(d), JSON.stringify(w), JSON.stringify(m), JSON.stringify(st)]) assert.doesNotMatch(text, FORECAST)
  assert.equal(JSON.stringify(config), CONFIG_BEFORE)
  assert.equal(config.live.enabled, false); assert.equal(config.shadow.enabled, false); assert.equal(process.env.LIVE_TRADING_ENABLED, undefined)
  const watch = readFileSync(join(ROOT, 'src', 'watch.ts'), 'utf8')
  assert.deepEqual(watch.match(/from '\.\/(?:school|research|knowledge|learning|observer)\/[^']+'/g), ["from './learning/observer.ts'"], 'the engine imports one learning entry point')
  assert.match(watch, /bus\.emit\('watch:cycle'/)
})
