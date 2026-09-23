/**
 * Extended paper validation. The engine must MEASURE honestly: report
 * INSUFFICIENT SAMPLE until every gate is met, never fabricate a missing number
 * (null / UNAVAILABLE), label order flow truthfully, bucket by regime/session,
 * catch redundant strategies, and refuse to call decay on a thin sample. It is
 * pure over its inputs, so no store or data dir is needed.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../helpers.ts'
import { tradingDayKey } from '../../src/sessions.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'
import type { Passport } from '../../src/vault/passport.ts'
import {
  validationProfile, orderFlowLabel, perTradeJournal, noTradeJournal,
  bySession, byRegime, byOutcome, strategyCorrelations, decayByStrategy,
  dataQuality, evaluateGates, shadowReadiness, soakMetrics, aiEngineConsistency,
  buildValidationReport, renderDailyReport,
} from '../../src/paper/validation.ts'

const DAY = 86_400_000

/**
 * A realistic closed position. `finalize()` always records rMultiple, pnlUsd and
 * the engine's outcome together, so a fixture that sets only rMultiple describes
 * a shape the system never actually produces. Here pnlUsd is derived from R at
 * the fixture's $1 risk (R × riskUsd), which is what the real maths does.
 */
function pos(o: Partial<PaperPosition>): PaperPosition {
  const base = {
    id: Math.random().toString(36).slice(2), openedAt: 0, dayKey: '2026-01-01', session: 'London', setupKey: 'BTCUSDT|5m|crossover|BUY',
    direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 1, riskUsd: 1, quality: 80, reason: 'x', atr: 1,
    status: 'closed', ...o,
  } as PaperPosition
  if (base.pnlUsd === undefined && base.exitReason !== 'missed' && typeof base.rMultiple === 'number') {
    base.pnlUsd = base.rMultiple * base.riskUsd
  }
  return base
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

/**
 * A DEAD END THAT READS LIKE A QUEUE.
 *
 * The stability gate compares paper expectancy against an out-of-sample number,
 * and it gets that number from a vault passport. Passports are minted ONLY from
 * factory campaign survivors. So a run whose trades come from a built-in
 * strategy — which is what the frozen PAPER_VALIDATION profile actually does —
 * can reach a flawless 8/9 and stay there for ever, while the gate reports a
 * soft "no strategy has both numbers YET".
 *
 * Found by running the gates over the best sample a frozen-profile run could
 * ever produce: 40 winning trades, 80 days, two regimes, two sessions, 100% data
 * quality, 200 hours of soak, a monotonically rising curve. Verdict:
 * INSUFFICIENT SAMPLE, 8/9, permanently.
 *
 * The gate is NOT loosened here — passing it on absent evidence is exactly the
 * pretending this module exists to refuse. What changes is that it now states
 * that waiting will not help and names what has to exist instead.
 */
test('a flawless run with no passport is stuck at 8/9, and the gate says so instead of saying "yet"', () => {
  const closed = gatesMetClosed()
  const g = evaluateGates({
    closed, passports: [], curve: closed.map((_, i) => ({ equity: 25 + i })), startUsd: 25,
    soak: soakMetrics({ uptimeSec: 200 * 3600, feedOk: true, storeOk: true }), quality: dataQuality(closed),
  })
  const stability = g.gates.find((x) => x.id === 'stability')!
  assert.equal(stability.met, false)
  assert.equal(g.metCount, g.total - 1, `only the stability gate should be short; unmet: ${g.gates.filter((x) => !x.met).map((x) => x.id).join(', ')}`)
  assert.equal(g.verdict, 'INSUFFICIENT SAMPLE')
  // The wording has to distinguish "not yet" from "not ever on this path".
  assert.match(stability.detail, /CANNOT PASS until one exists; waiting will not resolve it/)
  assert.match(stability.detail, /crossover/, 'the blocked strategy must be named')
  assert.equal(/\byet\b/.test(stability.detail), false, 'a permanent blocker must not be described as a wait')
})

test('with nothing traded at all, the same gate correctly reads as simply not started', () => {
  const g = evaluateGates({ closed: [], passports: [], curve: [], startUsd: 25, soak: soakMetrics({ uptimeSec: 0, feedOk: true, storeOk: true }), quality: dataQuality([]) })
  const stability = g.gates.find((x) => x.id === 'stability')!
  assert.equal(stability.met, false)
  assert.match(stability.detail, /No strategy has traded yet/)
  assert.equal(/CANNOT PASS/.test(stability.detail), false, 'an empty run is a wait, not a dead end')
})

/**
 * THE DRAWDOWN GATE MEASURES CLOSED TRADES, AND MUST SAY SO.
 *
 * The equity curve has one point per CLOSE, so a position sitting underwater is
 * invisible to it: the true low-water mark can be deeper than this figure by the
 * unrealised loss on whatever is open. On a gate whose job is to cap risk, that
 * understates in the permissive direction. Nothing tracks per-trade excursion,
 * so the fix is to name which drawdown this is rather than imply the other one.
 */
test('the drawdown gate names itself as a closed-trade measure', () => {
  const closed = gatesMetClosed()
  const g = evaluateGates({
    closed, passports: [passport({})], curve: closed.map((_, i) => ({ equity: 25 + i })), startUsd: 25,
    soak: soakMetrics({ uptimeSec: 200 * 3600, feedOk: true, storeOk: true }), quality: dataQuality(closed),
  })
  const dd = g.gates.find((x) => x.id === 'drawdown')!
  assert.match(dd.label, /closed trades/i)
  assert.match(dd.detail, /open position's unrealised loss is not in this figure/)
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

/**
 * THE REPORT'S DATE IS THE TRADING DAY, NOT UTC.
 *
 * The header used to read `new Date(generatedAt).toISOString().slice(0, 10)`
 * while every trade inside it is bucketed by `tradingDayKey`, which rolls at
 * 18:00 ET. The two disagree for 18:00–19:59 ET in summer and 18:00–18:59 ET in
 * winter — exactly the "end of the day, run the report" window for a system
 * whose day rolls at 18:00. A report run then carried the PREVIOUS day's date
 * over the current trading day's trades. Same defect shape as the two
 * previous-day calculations that sat $279.56 apart.
 */
test('the daily report is headed with the trading day, not the UTC day', () => {
  const closed = gatesMetClosed()
  const base = {
    closed, passports: [passport({})], curve: closed.map((_, i) => ({ equity: 25 + i })), startUsd: 25,
    soak: soakMetrics({ uptimeSec: 200 * 3600, feedOk: true, storeOk: true }), version: '1.2.3',
    hasReadOnlyKey: true, shadowScoredOrders: 0, aiConsistency: aiEngineConsistency('NO TRADE', 'NO TRADE', true),
  }
  // 18:30 ET on a summer evening: the trading day has rolled, UTC has not.
  for (const at of [Date.UTC(2026, 6, 15, 22, 30), Date.UTC(2026, 0, 15, 23, 30)]) {
    const report = { ...buildValidationReport(base), generatedAt: at }
    const utcDay = new Date(at).toISOString().slice(0, 10)
    const tradingDay = tradingDayKey(at)
    assert.notEqual(tradingDay, utcDay, 'the fixture must sit in the window where the two calendars disagree')
    const text = renderDailyReport(report)
    assert.match(text, new RegExp(`PAPER VALIDATION REPORT — trading day ${tradingDay}`))
    assert.equal(text.includes(`— trading day ${utcDay}`), false, 'the report is still headed with the UTC day')
  }
})

/**
 * A class guard. `toISOString().slice(0, 10)` is a UTC calendar day, and this
 * system's day is the ICT trading day. Every place that needed one had reached
 * for the other: the report header, and the MCP plan fallback — where `planFor`
 * matches by exact string equality, so a UTC key silently armed a plan that
 * could never apply.
 */
test('no source file buckets a day by UTC instead of the trading day', () => {
  const offenders: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.ts') && /toISOString\(\)\.slice\(0,\s*10\)/.test(readFileSync(full, 'utf8'))) offenders.push(full)
    }
  }
  walk(join(ROOT, 'src'))
  assert.deepEqual(offenders, [], `these files cut a day on UTC midnight; the trading day rolls at 18:00 ET — use tradingDayKey()`)
})

/**
 * THE GATE IS REACHABLE AGAIN — on its own terms.
 *
 * Same flawless sample as the "stuck at 8/9" test above, no passport, but now
 * with a stored out-of-sample reference for the strategy that traded. The
 * gate compares against it like it would a passport, and the run can complete.
 * Nothing about the threshold changed.
 */
test('with an out-of-sample backtest reference and no passport, a flawless run reaches GATES MET', () => {
  const closed = gatesMetClosed()
  const g = evaluateGates({
    closed, passports: [], curve: closed.map((_, i) => ({ equity: 25 + i })), startUsd: 25,
    soak: soakMetrics({ uptimeSec: 200 * 3600, feedOk: true, storeOk: true }), quality: dataQuality(closed),
    oosReference: (id) => (id === 'crossover' ? 0.9 : null),
  })
  assert.equal(g.verdict, 'GATES MET', `unmet: ${g.gates.filter((x) => !x.met).map((x) => x.id).join(', ')}`)
  const stability = g.gates.find((x) => x.id === 'stability')!
  assert.equal(stability.met, true)
  assert.match(stability.detail, /Worst shortfall below the out-of-sample floor/)

  // And a reference that says paper is far below the floor still fails it — the bar did not move.
  const worse = evaluateGates({
    closed, passports: [], curve: closed.map((_, i) => ({ equity: 25 + i })), startUsd: 25,
    soak: soakMetrics({ uptimeSec: 200 * 3600, feedOk: true, storeOk: true }), quality: dataQuality(closed),
    oosReference: () => 5,
  })
  assert.equal(worse.gates.find((x) => x.id === 'stability')!.met, false)
})
