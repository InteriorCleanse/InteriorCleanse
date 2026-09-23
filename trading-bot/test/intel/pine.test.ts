/**
 * TradingView export (Phase 22J) and its security boundary (22S).
 *
 * Two things matter here. First, the generated Pine must be a faithful, stable
 * snapshot of the SAME canonical annotations the native chart draws — so the
 * two cannot silently diverge. Second, nothing sensitive may ever leave the
 * process inside an exported file: the export is text a user will paste into a
 * third-party website.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generatePine, sanitisePineText } from '../../src/intel/pine.ts'
import { makeAnnotation } from '../../src/intel/types.ts'
import type { ChartAnnotation, AnnotationType, AnnotationLayer, AnnotationSource } from '../../src/intel/types.ts'

const NOW = 1_700_000_000_000
const OPTS = { symbol: 'BTCUSDT', timeframe: '5m', engineVersion: '2.3.0', generatedAt: NOW }

function ann(type: AnnotationType, layer: AnnotationLayer, o: Partial<ChartAnnotation> = {}): ChartAnnotation {
  return makeAnnotation({
    symbol: 'BTCUSDT', timeframe: '5m', engineVersion: '2.3.0',
    annotationType: type, layer, source: 'liquidity' as AnnotationSource,
    eventTime: NOW, knownAt: NOW, dataQuality: 'REAL', lifecycleStatus: 'ACTIVE',
    rationale: 'because the engine said so', ...o,
  }, NOW)
}

test('a level becomes a Pine line, a zone becomes a box, an event becomes a label', () => {
  const out = generatePine([
    ann('previous-day-high', 'liquidity', { price: 100 }),
    ann('fvg-bullish', 'imbalance', { priceHigh: 105, priceLow: 103, startTime: NOW, endTime: NOW + 3_600_000 }),
    ann('bos', 'structure', { price: 101, direction: 'bullish' }),
  ], OPTS)
  assert.equal(out.drawn, 3)
  assert.match(out.source, /line\.new\(/)
  assert.match(out.source, /box\.new\(/)
  assert.match(out.source, /label\.new\(/)
  assert.match(out.source, /^\/\/@version=5/)
  assert.match(out.source, /indicator\(/)
  assert.equal(out.filename, 'mrcash-btcusdt-5m-2023-11-14.pine')
})

test('the header states the limitation honestly, and never claims a live feed', () => {
  const out = generatePine([ann('previous-day-high', 'liquidity', { price: 100 })], OPTS)
  assert.match(out.source, /POINT-IN-TIME SNAPSHOT, NOT A LIVE FEED/)
  assert.match(out.source, /no supported way/i)
  assert.match(out.source, /Pine cannot fetch a URL/)
  assert.ok(out.limitations.some((l) => /snapshot/i.test(l)))
  assert.ok(out.limitations.some((l) => /no supported API/i.test(l)))
})

test('generation is deterministic — the same annotations give byte-identical Pine', () => {
  const list = [ann('previous-day-high', 'liquidity', { price: 100 }), ann('fvg-bearish', 'imbalance', { priceHigh: 9, priceLow: 8 })]
  assert.equal(generatePine(list, OPTS).source, generatePine(list, OPTS).source)
})

test('an annotation that cannot be drawn is REPORTED, never silently dropped', () => {
  const out = generatePine([
    ann('fvg-bullish', 'imbalance', { priceHigh: null, priceLow: null }),   // a box with no bounds
    ann('previous-day-high', 'liquidity', { price: null }),                  // a line with no price
    ann('order-flow-state', 'context', { price: 100 }),                      // no Pine shape defined
  ], OPTS)
  assert.equal(out.drawn, 0)
  assert.equal(out.skipped.length, 3)
  assert.ok(out.skipped.some((s) => /box needs both/.test(s.reason)))
  assert.ok(out.skipped.some((s) => /No usable price/.test(s.reason)))
  assert.ok(out.skipped.some((s) => /No Pine shape/.test(s.reason)))
  assert.match(out.source, /nothing to draw/)
})

test('the drawing cap is enforced and the overflow is reported', () => {
  const many = Array.from({ length: 10 }, (_, i) => ann('previous-day-high', 'liquidity', { price: 100 + i, eventTime: NOW + i }))
  const out = generatePine(many, { ...OPTS, maxDrawings: 4 })
  assert.equal(out.drawn, 4)
  assert.equal(out.skipped.length, 6)
  assert.ok(out.skipped.every((s) => /cap of 4/.test(s.reason)))
})

test('layer toggles are emitted so the user can switch groups off inside TradingView', () => {
  const out = generatePine([ann('previous-day-high', 'liquidity', { price: 100 }), ann('bos', 'structure', { price: 99 })], OPTS)
  assert.match(out.source, /show_liquidity = input\.bool\(true/)
  assert.match(out.source, /show_structure = input\.bool\(true/)
  assert.match(out.source, /if show_liquidity/)
})

test('data quality travels into the label, so an approximation is visible in TradingView too', () => {
  const out = generatePine([ann('previous-day-high', 'liquidity', { price: 100, dataQuality: 'APPROXIMATE' })], OPTS)
  assert.match(out.source, /\[APPROXIMATE\]/)
})

// ---------------------------------------------------------------
// Security: nothing sensitive may leave the process
// ---------------------------------------------------------------

test('the sanitiser strips secrets, keys, tokens, paths and env vars', () => {
  const cases: Array<[string, RegExp]> = [
    ['api_key=abcdef123456', /\[redacted\]/],
    ['EXCHANGE_API_SECRET=supersecretvalue', /\[redacted\]/],
    ['Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', /\[redacted\]/],
    ['deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', /\[redacted\]/],
    ['$ANTHROPIC_API_KEY', /\[redacted\]/],
    ['process.env.MRCASH_PIN', /\[redacted\]/],
    ['/home/user/secrets/keys.json', /\[redacted\]/],
    ['https://user:pass@example.com/x', /\[redacted\]/],
    ['pin: 1234', /\[redacted\]/],
  ]
  for (const [input, expected] of cases) {
    const out = sanitisePineText(input)
    assert.match(out, expected, `not sanitised: ${input}`)
  }
})

test('a poisoned rationale cannot leak into the exported file', () => {
  const poisoned = ann('previous-day-high', 'liquidity', {
    price: 100,
    rationale: 'level from EXCHANGE_API_KEY=AKIAIOSFODNN7EXAMPLE and /home/user/.env and token=abcdef0123456789abcdef0123456789',
  })
  const out = generatePine([poisoned], OPTS)
  assert.equal(/AKIAIOSFODNN7EXAMPLE/.test(out.source), false, 'a key leaked into the export')
  assert.equal(/\.env/.test(out.source), false, 'a path leaked into the export')
  assert.equal(/abcdef0123456789abcdef0123456789/.test(out.source), false, 'a token leaked into the export')
})

test('quotes and newlines cannot break out of a Pine string literal', () => {
  const nasty = ann('bos', 'structure', { price: 100, rationale: 'he said "buy"\nand then\r\nbroke out' })
  const out = generatePine([nasty], OPTS)
  // Every emitted label line must have balanced double quotes.
  for (const line of out.source.split('\n')) {
    const quotes = (line.match(/"/g) ?? []).length
    assert.equal(quotes % 2, 0, `unbalanced quotes in: ${line}`)
  }
  assert.equal(out.source.includes('he said "buy"'), false, 'raw double quotes must not survive')
})

test('the symbol and timeframe are sanitised into the filename', () => {
  const out = generatePine([], { ...OPTS, symbol: 'BTC/USDT' })
  assert.equal(out.filename.includes('/'), false, 'a slash must not reach the filename')
})
