/**
 * The intelligence layer's BOUNDARIES (Phase 22K/22M/22Q/22S).
 *
 * This file exists to prove the layer is what it claims to be: an observer. It
 * pins the structural isolation (no engine module may import it), the feature
 * flags, the alert centre's inability to trade, and the explanation validator
 * that stops an AI answer inventing a signal or contradicting the engine.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { intelEnabled, intelFlags, disabledPayload, intelLimits } from '../../src/intel/flags.ts'
import { alertsFromDelta, riskVetoAlert, signalRejectedAlert, regimeChangeAlert, dataQualityAlert, validationGateAlert, recentAlerts } from '../../src/intel/alerts.ts'
import { validateExplanation, deterministicExplanation, explain, extractCitations, EXPLAINER_SYSTEM } from '../../src/intel/explain.ts'
import type { ExplainContext } from '../../src/intel/explain.ts'
import { diffFrames } from '../../src/intel/delta.ts'
import { makeAnnotation } from '../../src/intel/types.ts'
import { config } from '../../config.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const SRC = join(HERE, '..', '..', 'src')
const NOW = 1_700_000_000_000

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

// ---------------------------------------------------------------
// Structural isolation — the arrow only points one way
// ---------------------------------------------------------------

test('NO engine module imports the intelligence layer', () => {
  const offenders: string[] = []
  for (const path of walk(SRC)) {
    const file = path.replace(/\\/g, '/') // Windows walks with backslashes; the checks below are written with '/'
    if (file.includes(`${'/'}intel${'/'}`)) continue // the layer may import itself
    const body = readFileSync(path, 'utf8')
    if (/from '\.{1,2}\/(?:\.\.\/)*intel\//.test(body) || /from '\.\/intel\//.test(body)) {
      // Permitted consumers: the server (it serves the read-only routes) and
      // the observation layers — analyst (reuses whyTrade and tradeStages to
      // explain a stored record), school / research / knowledge / learning
      // (Phase 23: case studies and the replay school read the annotation
      // layer). The arrow still points one way: the test below pins that
      // nothing in src/analyst/ can reach the engine, and
      // test/learning/observer.test.ts pins the same for the learning layers.
      if (file.endsWith('server.ts') || ['analyst', 'school', 'research', 'knowledge', 'learning', 'observer'].some((d) => file.includes(`${'/'}${d}${'/'}`))) continue
      offenders.push(file.replace(SRC.replace(/\\/g, '/'), 'src'))
    }
  }
  assert.deepEqual(offenders, [], `these engine modules import src/intel/, which would let observation influence decisions:\n${offenders.join('\n')}`)
})

/**
 * THE ANALYST LAYER IS OBSERVATION TOO. Its exemption above is only honest if
 * it cannot, in turn, reach anything that decides or acts.
 */
test('the analyst layer imports nothing that decides, sizes, places or manages an order', () => {
  // A value import of a deciding module is the violation. A type-only import
  // is erased at runtime and cannot act, and the analyst layer uses several to
  // rebuild the engine's own shapes from a stored snapshot.
  const banned = /^import (?!type\b)[^\n]*from '.*\/(exchange\/binanceTrade|live\/trader|live\/orders|live\/reconcile|execution|riskEngine|fusion|watch|shadow\/[a-z]+)\.ts'/m
  const writers = /\b(openPosition|closeManually|recordMissedSignal|savePosition|appendLedgerRow|managePositions|engageStop|releaseStop)\(/
  for (const file of walk(join(SRC, 'analyst'))) {
    const body = readFileSync(file, 'utf8')
    assert.equal(banned.test(body), false, `${file.replace(SRC, 'src')} imports a deciding or acting module`)
    assert.equal(writers.test(body), false, `${file.replace(SRC, 'src')} calls something that writes a position or an order`)
    assert.equal(/EXCHANGE_API_KEY|EXCHANGE_API_SECRET/.test(body), false, `${file.replace(SRC, 'src')} references exchange credentials`)
  }
})

test('the intelligence layer imports no exchange, live-trading or order-placing module', () => {
  const banned = /from '.*\/(exchange\/binanceTrade|live\/trader|live\/orders)\.ts'/
  for (const file of walk(join(SRC, 'intel'))) {
    const body = readFileSync(file, 'utf8')
    assert.equal(banned.test(body), false, `${file} imports an order-placing module`)
    assert.equal(/EXCHANGE_API_KEY|EXCHANGE_API_SECRET/.test(body), false, `${file} references exchange credentials`)
  }
})

test('the intelligence layer contains no order-placing verbs at all', () => {
  const banned = /\b(marketBuy|marketSell|ocoSell|cancelAll|openLive|placeOrder)\b/
  for (const file of walk(join(SRC, 'intel'))) {
    assert.equal(banned.test(readFileSync(file, 'utf8')), false, `${file} mentions an order-placing function`)
  }
})

// ---------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------

test('flags report the configured state, and every capability is independent', () => {
  const flags = intelFlags()
  for (const k of ['enabled', 'chartMarkup', 'mtfMarkup', 'replayIntelligence', 'tradingViewExport', 'alertCenter', 'aiExplanation']) {
    assert.equal(typeof flags[k as keyof typeof flags], 'boolean', `${k} must be a boolean`)
  }
  assert.equal(flags.enabled, config.intelligence.enabled)
})

test('the master switch gates every capability', () => {
  const original = config.intelligence.enabled
  try {
    config.intelligence.enabled = false
    assert.equal(intelEnabled('enabled'), false)
    for (const f of ['chartMarkup', 'mtfMarkup', 'replayIntelligence', 'tradingViewExport', 'alertCenter', 'aiExplanation'] as const) {
      assert.equal(intelEnabled(f), false, `${f} must be off when the master switch is off`)
    }
  } finally { config.intelligence.enabled = original }
})

test('an individual capability can be turned off without touching the others', () => {
  const original = config.intelligence.tradingViewExport
  try {
    config.intelligence.tradingViewExport = false
    assert.equal(intelEnabled('tradingViewExport'), false)
    assert.equal(intelEnabled('chartMarkup'), true, 'other capabilities must be unaffected')
  } finally { config.intelligence.tradingViewExport = original }
})

test('the disabled payload explains itself and produces no data', () => {
  const p = disabledPayload('alertCenter')
  assert.equal(p.ok, false)
  assert.match(p.error, /turned off in config\.intelligence/)
  assert.equal(p.flag, 'alertCenter')
  assert.ok(intelLimits().maxAnnotations > 0)
})

test('NO intelligence flag is a trading-execution flag', () => {
  // The execution gates must be untouched by this phase, whatever the intel flags say.
  assert.equal(config.live.enabled, false)
  assert.equal(config.shadow.enabled, false)
  const keys = Object.keys(config.intelligence)
  for (const k of keys) assert.equal(/live|shadow|execute|order|trade(?!Map)/i.test(k), false, `intelligence flag "${k}" reads like an execution flag`)
})

// ---------------------------------------------------------------
// Alerts: informative, never executable
// ---------------------------------------------------------------

test('alerts carry the real reason, and are derived from real state changes', () => {
  const base = { symbol: 'B', timeframe: '5m', engineVersion: 'v', source: 'fvg-tracker' as const, layer: 'imbalance' as const, dataQuality: 'REAL' as const }
  const before = makeAnnotation({ ...base, annotationType: 'fvg-bullish', eventTime: 1000, knownAt: 1000, priceHigh: 10, priceLow: 9, rationale: 'a gap formed', lifecycleStatus: 'ACTIVE' }, NOW)
  const after = makeAnnotation({ ...base, annotationType: 'fvg-bullish', eventTime: 1000, knownAt: 1000, priceHigh: 10, priceLow: 9, rationale: 'a gap formed', lifecycleStatus: 'MITIGATED' }, NOW)

  const appeared = alertsFromDelta(diffFrames([], [before], 1000), { symbol: 'B', timeframe: '5m' })
  assert.equal(appeared[0].event, 'fvg-created')
  assert.equal(appeared[0].reason, 'a gap formed', 'the reason must be the engine\'s own text')

  const moved = alertsFromDelta(diffFrames([before], [after], 2000), { symbol: 'B', timeframe: '5m' })
  assert.equal(moved[0].event, 'fvg-mitigated')
})

test('an unchanged frame raises no alerts', () => {
  const a = makeAnnotation({ symbol: 'B', timeframe: '5m', engineVersion: 'v', annotationType: 'bos', layer: 'structure', source: 'structure-tracker', eventTime: 1, knownAt: 1, price: 5, dataQuality: 'REAL', rationale: 'r', lifecycleStatus: 'TRIGGERED' }, NOW)
  assert.deepEqual(alertsFromDelta(diffFrames([a], [a], 2), { symbol: 'B', timeframe: '5m' }), [])
})

test('engine-sourced alerts name their rule and never imply an action', () => {
  const veto = riskVetoAlert({ at: 1, symbol: 'B', timeframe: '5m', vetoedBy: 'Kill switch', reason: 'entries stopped' })
  assert.equal(veto.event, 'risk-veto')
  assert.equal(veto.reason, 'entries stopped')

  const rejected = signalRejectedAlert({ at: 1, symbol: 'B', timeframe: '5m', category: 'regime-mismatch', detail: 'ranging, not a breakout', strategyIds: ['breakout'] })
  assert.equal(rejected.event, 'signal-rejected')

  assert.equal(regimeChangeAlert({ at: 1, symbol: 'B', timeframe: '5m', from: 'ranging', to: 'ranging', reason: 'x' }), null, 'an unchanged regime is not an event')
  assert.ok(regimeChangeAlert({ at: 1, symbol: 'B', timeframe: '5m', from: 'ranging', to: 'breakout', reason: 'x' }))
  assert.equal(dataQualityAlert({ at: 1, symbol: 'B', timeframe: '5m', detail: 'tape down' }).dataQuality, 'UNAVAILABLE')
  assert.equal(validationGateAlert({ at: 1, symbol: 'B', timeframe: '5m', from: 'X', to: 'X', detail: '' }), null)

  // No alert may carry anything resembling an order instruction.
  for (const a of [veto, rejected]) {
    assert.equal(/\b(buy now|sell now|place|submit|execute)\b/i.test(a.title + a.reason), false)
  }
})

test('the alert list is newest-first and bounded', () => {
  const many = Array.from({ length: 200 }, (_, i) => riskVetoAlert({ at: i, symbol: 'B', timeframe: '5m', vetoedBy: 'R', reason: 'r' }))
  const recent = recentAlerts(many, 10)
  assert.equal(recent.length, 10)
  assert.equal(recent[0].timestamp, 199)
})

// ---------------------------------------------------------------
// AI explanation: bounded by construction
// ---------------------------------------------------------------

function ctx(): ExplainContext {
  const a = makeAnnotation({ symbol: 'B', timeframe: '5m', engineVersion: 'v', annotationType: 'fvg-bullish', layer: 'imbalance', source: 'fvg-tracker', eventTime: 1000, knownAt: 1000, priceHigh: 10, priceLow: 9, dataQuality: 'REAL', rationale: 'a bullish gap', lifecycleStatus: 'ACTIVE' }, NOW)
  return {
    topic: 'why-this-trade', symbol: 'BTCUSDT', timeframe: '5m',
    engineDecision: 'NO TRADE',
    annotations: [{ id: a.id, annotationType: a.annotationType, timeframe: a.timeframe, price: a.price, priceHigh: a.priceHigh, priceLow: a.priceLow, lifecycleStatus: a.lifecycleStatus, dataQuality: a.dataQuality, rationale: a.rationale, strategyIds: a.strategyIds, eventTime: a.eventTime }],
    facts: ['Price is $100.'],
  }
}

test('an answer citing an annotation that does not exist is REJECTED as invention', () => {
  const c = ctx()
  const bad = validateExplanation('The gap at [[made-up.9999999]] supports this.', c)
  assert.equal(bad.valid, false)
  assert.match(bad.problems[0], /not in the context/)
})

test('an answer asserting a decision different from the engine\'s is REJECTED', () => {
  const c = ctx() // engine says NO TRADE
  const bad = validateExplanation('My recommendation is LONG here.', c)
  assert.equal(bad.valid, false)
  assert.ok(bad.problems.some((p) => /differs from the engine/.test(p)))
})

test('an answer that restates the engine decision and cites real ids is accepted', () => {
  const c = ctx()
  const good = validateExplanation(`The engine's decision is NO TRADE. The gap [[${c.annotations[0].id}]] is still active.`, c)
  assert.equal(good.valid, true, good.problems.join('; '))
  assert.deepEqual(good.citations, [c.annotations[0].id])
})

test('the deterministic explanation is always valid, and is the fallback', async () => {
  const c = ctx()
  const text = deterministicExplanation(c)
  assert.equal(validateExplanation(text, c).valid, true)
  assert.match(text, /NO TRADE/)

  // With no AI available at all.
  const offline = await explain(c)
  assert.equal(offline.source, 'deterministic')
  assert.equal(offline.valid, true)

  // An AI that invents a signal must be discarded, not shown.
  const lying = await explain(c, async () => 'You should BUY right now. See [[fabricated.123]].')
  assert.equal(lying.source, 'deterministic', 'an inventing answer must not be surfaced')
  assert.ok(lying.problems.length > 0)

  // An AI that throws must not break the panel.
  const broken = await explain(c, async () => { throw new Error('model down') })
  assert.equal(broken.source, 'deterministic')
  assert.equal(broken.valid, true)
})

test('the system prompt states the boundaries the validator enforces', () => {
  assert.match(EXPLAINER_SYSTEM, /do NOT make trading decisions/i)
  assert.match(EXPLAINER_SYSTEM, /Never state a decision different from the engine/i)
  assert.match(EXPLAINER_SYSTEM, /Never fill a gap with a guess/i)
  assert.deepEqual(extractCitations('see [[a.1]] and [[b.2]] and [[a.1]]'), ['a.1', 'b.2'])
})
