/**
 * Extended paper validation. The engine must MEASURE honestly: report
 * INSUFFICIENT SAMPLE until every gate is met, never fabricate a missing number
 * (null / UNAVAILABLE), label order flow truthfully, bucket by regime/session,
 * catch redundant strategies, and refuse to call decay on a thin sample. It is
 * pure over its inputs, so no store or data dir is needed.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PaperPosition } from '../../src/paperTrader.ts'
import type { Passport } from '../../src/vault/passport.ts'
import {
  validationProfile, orderFlowLabel, perTradeJournal, noTradeJournal,
  bySession, byRegime, byOutcome, strategyCorrelations, decayByStrategy,
  dataQuality, evaluateGates, shadowReadiness, soakMetrics, aiEngineConsistency,
  buildValidationReport, renderDailyReport,
} from '../../src/paper/validation.ts'

const DAY = 86_400_000

function pos(o: Partial<PaperPosition>): PaperPosition {
  return {
    id: Math.random().toString(36).slice(2), openedAt: 0, dayKey: '2026-01-01', session: 'London', setupKey: 'BTCUSDT|5m|crossover|BUY',
    direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 1, riskUsd: 1, quality: 80, reason: 'x', atr: 1,
    status: 'closed', ...o,
  } as PaperPosition
}
function passport(o: Partial<Passport>): Passport {
  return {
    id: 'p', strategyId: 'crossover', genome: { strategyId: 'crossover', params: {} }, createdAt: 0, origin: 't', status: 'paper',
    oos: { trades: 30, avgR: 0.5, totalR: 15, sharpeR: 0.5, maxDrawdownR: 2, walkForward: null, monteCarlo: null }, oosLowerAvgR: 0.1,
    regimeFit: [], results: [], events: [], decay: { decaying: false, reason: 'ok', rollingExpectancy: null, cusumLow: 0, trades: 0 }, reason: 't',
    ...o,
  } as Passport
}

// A rich "everything passes" fixture: 40 winning trades, one strategy, spread over
// 80 days, alternating two regimes and two sessions, with a book quote each time.
function gatesMetClosed(): PaperPosition[] {
  return Array.from({ length: 40 }, (_, i) => pos({
    strategyId: 'crossover', exitReason: 'target', rMultiple: 1, pnlUsd: 1,
    closedAt: i * 2 * DAY, openedAt: i * 2 * DAY, dayKey: `2026-d${i}`,
    regime: i % 2 ? 'trending-up' : 'ranging', session: i % 2 ? 'London' : 'New York AM',
    observedBid: 99.99, observedAsk: 100.01, observedSpreadPct: 0.02,
  }))
}

test('the frozen profile reflects config and reports live trading OFF', () => {
  const p = validationProfile('9.9.9')
  assert.equal(p.version, '9.9.9')
  assert.equal(p.liveTradingEnabled, false)
  assert.equal(p.market.symbol, 'BTCUSDT')
  assert.ok(p.gates.minTradesTotal > 0)
})

test('order flow is REAL only with a live book quote, else UNAVAILABLE (never ESTIMATED)', () => {
  assert.equal(orderFlowLabel(pos({ observedBid: 99.9, observedAsk: 100.1 })), 'REAL')
  assert.equal(orderFlowLabel(pos({ observedBid: undefined, observedAsk: undefined })), 'UNAVAILABLE')
  assert.equal(orderFlowLabel(pos({ observedBid: 100, observedAsk: undefined })), 'UNAVAILABLE')
})

test('the per-trade journal carries the taken trades only, newest first, with the honesty label', () => {
  const closed = [
    pos({ id: 'a', exitReason: 'target', rMultiple: 2, closedAt: 1 * DAY, observedBid: 99.9, observedAsk: 100.1 }),
    pos({ id: 'b', exitReason: 'missed', note: 'Kill switch', closedAt: 2 * DAY }),
    pos({ id: 'c', exitReason: 'stop', rMultiple: -1, closedAt: 3 * DAY }),
  ]
  const j = perTradeJournal(closed)
  assert.equal(j.length, 2)
  assert.equal(j[0].id, 'c') // newest first
  assert.equal(j[0].orderFlow, 'UNAVAILABLE')
  assert.equal(j[1].orderFlow, 'REAL')
  assert.ok('rMultiple' in j[0] && 'observedSpreadPct' in j[0] && 'costsUsd' in j[0])
})

test('the no-trade journal categorises each refusal', () => {
  const closed = [
    pos({ exitReason: 'missed', note: 'Kill switch: no new positions', closedAt: 1 * DAY }),
    pos({ exitReason: 'missed', note: 'Fresh data: the feed is stale', closedAt: 2 * DAY }),
    pos({ exitReason: 'missed', note: 'price ran away before the fill', closedAt: 3 * DAY }),
    pos({ exitReason: 'missed', note: 'Exposure: a position is already open', closedAt: 4 * DAY }),
    pos({ exitReason: 'target', rMultiple: 1, closedAt: 5 * DAY }),
  ]
  const nt = noTradeJournal(closed)
  assert.equal(nt.length, 4)
  const cats = nt.map((r) => r.category).sort()
  assert.deepEqual(cats, ['kill-switch', 'price-ran-away', 'risk-veto', 'stale-data'])
})

test('breakdowns bucket by regime, session and outcome without ranking by return', () => {
  const closed = [
    pos({ regime: 'ranging', session: 'London', exitReason: 'target', rMultiple: 1 }),
    pos({ regime: 'ranging', session: 'London', exitReason: 'stop', rMultiple: -1 }),
    pos({ regime: 'trending-up', session: 'New York AM', exitReason: 'target', rMultiple: 2 }),
  ]
  const reg = byRegime(closed)
  assert.equal(reg.find((b) => b.key === 'ranging')?.taken, 2)
  assert.equal(reg.find((b) => b.key === 'ranging')?.winRate, 0.5)
  assert.equal(bySession(closed).find((b) => b.key === 'New York AM')?.taken, 1)
  assert.equal(byOutcome(closed).find((b) => b.key === 'win')?.taken, 2)
})

test('unlabelled regime shows as unavailable, never guessed', () => {
  const reg = byRegime([pos({ regime: undefined, exitReason: 'target', rMultiple: 1 })])
  assert.equal(reg[0].key, 'unavailable')
})

test('correlation needs enough shared days, and clusters strategies that move together', () => {
  // Two strategies trading the same four days with the same R pattern → correlated → redundant.
  const days = ['2026-01', '2026-02', '2026-03', '2026-04']
  const rs = [1, -1, 1, 2]
  const closed: PaperPosition[] = []
  for (let i = 0; i < days.length; i++) {
    closed.push(pos({ strategyId: 'A', dayKey: days[i], exitReason: 'target', rMultiple: rs[i], closedAt: i * DAY }))
    closed.push(pos({ strategyId: 'B', dayKey: days[i], exitReason: 'target', rMultiple: rs[i], closedAt: i * DAY }))
  }
  const c = strategyCorrelations(closed)
  const pair = c.pairs.find((p) => p.a === 'A' && p.b === 'B')
  assert.ok(pair && pair.correlation !== null && pair.correlation > 0.9, `corr ${pair?.correlation}`)
  assert.deepEqual(c.redundant[0], ['A', 'B'])

  // Too few shared days → correlation is null, not a guess.
  const thin = strategyCorrelations([
    pos({ strategyId: 'A', dayKey: 'x', exitReason: 'target', rMultiple: 1 }),
    pos({ strategyId: 'B', dayKey: 'x', exitReason: 'target', rMultiple: 1 }),
  ])
  assert.equal(thin.pairs[0].correlation, null)
})

test('decay refuses to judge a thin sample and reads a passport when there is one', () => {
  // No passport, under the minimum → INSUFFICIENT SAMPLE.
  const thin = decayByStrategy([pos({ strategyId: 'session-ifvg', exitReason: 'target', rMultiple: 1 })], [])
  assert.equal(thin[0].status, 'INSUFFICIENT SAMPLE')

  // Passport marked decaying → DECAYING.
  const closed = Array.from({ length: 25 }, (_, i) => pos({ strategyId: 'crossover', exitReason: 'stop', rMultiple: -1, closedAt: i * DAY }))
  const p = passport({ decay: { decaying: true, reason: 'edge has faded', rollingExpectancy: -1, cusumLow: 9, trades: 25 } })
  const d = decayByStrategy(closed, [p])
  assert.equal(d[0].status, 'DECAYING')
  assert.equal(d[0].hasPassport, true)
})

test('data quality is null with no signals and drops with stale/kill misses', () => {
  assert.equal(dataQuality([]).quality, null)
  const q = dataQuality([
    pos({ exitReason: 'target', rMultiple: 1 }),
    pos({ exitReason: 'missed', note: 'Fresh data: stale' }),
  ])
  assert.equal(q.signalsSeen, 2)
  assert.equal(q.staleOrKillMissed, 1)
  assert.equal(q.quality, 0.5)
})

test('gates report INSUFFICIENT SAMPLE on an empty run, with nothing assumed', () => {
  const g = evaluateGates({ closed: [], passports: [], curve: [], startUsd: 25, soak: soakMetrics({ uptimeSec: 0, feedOk: true, storeOk: true }), quality: dataQuality([]) })
  assert.equal(g.verdict, 'INSUFFICIENT SAMPLE')
  assert.equal(g.metCount < g.total, true)
  // A gate with no data is NOT met.
  assert.equal(g.gates.find((x) => x.id === 'dataQuality')?.met, false)
  assert.equal(g.gates.find((x) => x.id === 'weeks')?.value, 0)
})

test('gates flip to GATES MET only once every gate passes', () => {
  const closed = gatesMetClosed()
  const passports = [passport({ oos: { trades: 30, avgR: 0.5, totalR: 15, sharpeR: 0.5, maxDrawdownR: 2, walkForward: null, monteCarlo: null } })]
  const curve = closed.map((_, i) => ({ equity: 25 + i })) // monotonic up → no drawdown
  const soak = soakMetrics({ uptimeSec: 200 * 3600, feedOk: true, storeOk: true })
  const g = evaluateGates({ closed, passports, curve, startUsd: 25, soak, quality: dataQuality(closed) })
  const unmet = g.gates.filter((x) => !x.met).map((x) => x.id)
  assert.equal(g.verdict, 'GATES MET', `unmet: ${unmet.join(', ')}`)
  assert.equal(g.gates.find((x) => x.id === 'regimes')?.met, true)
  assert.equal(g.gates.find((x) => x.id === 'sessions')?.met, true)
})

test('soak is met only with enough continuous uptime and healthy subsystems', () => {
  assert.equal(soakMetrics({ uptimeSec: 200 * 3600, feedOk: true, storeOk: true }).met, true)
  assert.equal(soakMetrics({ uptimeSec: 200 * 3600, feedOk: false, storeOk: true }).met, false)
  assert.equal(soakMetrics({ uptimeSec: 1, feedOk: true, storeOk: true }).met, false)
})

test('shadow readiness stays NOT_READY until the gates are met and a read-only key is present', () => {
  const empty = evaluateGates({ closed: [], passports: [], curve: [], startUsd: 25, soak: soakMetrics({ uptimeSec: 0, feedOk: true, storeOk: true }), quality: dataQuality([]) })
  assert.equal(shadowReadiness(empty, true).status, 'NOT_READY')

  const closed = gatesMetClosed()
  const met = evaluateGates({ closed, passports: [passport({})], curve: closed.map((_, i) => ({ equity: 25 + i })), startUsd: 25, soak: soakMetrics({ uptimeSec: 200 * 3600, feedOk: true, storeOk: true }), quality: dataQuality(closed) })
  assert.equal(shadowReadiness(met, false).status, 'NOT_READY') // no key
  assert.equal(shadowReadiness(met, true).status, 'SHADOW_READY') // gates met + key
})

test('AI-vs-engine consistency flags a divergence or an invalid narration', () => {
  assert.equal(aiEngineConsistency('NO TRADE', 'NO TRADE', true).consistent, true)
  assert.equal(aiEngineConsistency('LONG', 'NO TRADE', true).consistent, false)
  assert.equal(aiEngineConsistency('NO TRADE', 'NO TRADE', false).consistent, false)
})

test('the full report and daily text hold together and keep the no-overfit reminder', () => {
  const closed = gatesMetClosed()
  const report = buildValidationReport({
    closed, passports: [passport({})], curve: closed.map((_, i) => ({ equity: 25 + i })), startUsd: 25,
    soak: soakMetrics({ uptimeSec: 200 * 3600, feedOk: true, storeOk: true }), version: '1.2.3',
    hasReadOnlyKey: true, shadowScoredOrders: 0, aiConsistency: aiEngineConsistency('NO TRADE', 'NO TRADE', true),
  })
  assert.equal(report.gates.verdict, 'GATES MET')
  assert.equal(report.orderFlow.estimated, 0)
  assert.equal(report.shadow.status, 'SHADOW_READY')
  const text = renderDailyReport(report)
  assert.match(text, /PAPER VALIDATION REPORT/)
  assert.match(text, /VERDICT: GATES MET/)
  assert.match(text, /paper is validation data/i)
})
