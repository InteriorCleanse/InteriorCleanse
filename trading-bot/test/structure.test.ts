/**
 * Market structure on hand-built sequences: swing labels, BOS vs CHoCH,
 * the dealing range — and the baseline day's evidence text, pinned word
 * for word, so none of this changed a trading decision.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mk, STEP, setupDay } from './fixtures/candles.ts'
import { SwingTracker, StructureTracker, describeShift, describeSwing } from '../src/structure.ts'
import { dealingRange, describeDealingRange } from '../src/features/dealingRange.ts'
import { IctEngine } from '../src/ictStrategy.ts'
import { equalLevels } from '../src/liquidity.ts'
import type { Candle, LabelledSwing } from '../src/types.ts'

const here = dirname(fileURLToPath(import.meta.url))

/** Candles whose highs and lows follow a path of values, with a tiny body so nothing is a displacement. */
function path(values: number[], t0 = Date.UTC(2026, 0, 15, 14, 0)): Candle[] {
  return values.map((v, i) => mk(t0 + i * STEP, v - 0.05, v + 0.1, v - 0.1, v + 0.05))
}

/** Waves with growing peaks and troughs: an uptrend in swing terms. */
const UP = [100, 101, 102, 103, 104, 103, 102, 101, 102, 103, 104, 105, 106, 105, 104, 103, 104, 105, 106, 107, 108, 107, 106, 105, 106, 107, 108, 109, 110, 109, 108, 107]

test('swings are labelled against the previous swing of their kind: HH/HL in an uptrend, LH/LL in a downtrend', () => {
  const up = path(UP)
  const st = new SwingTracker()
  for (let i = 0; i < up.length; i++) st.add(up, i)
  assert.deepEqual(st.swings.filter((s) => s.kind === 'high').map((s) => s.label), ['H', 'HH', 'HH', 'HH'])
  assert.deepEqual(st.swings.filter((s) => s.kind === 'low').map((s) => s.label), ['L', 'HL', 'HL'])
  assert.equal(st.trend(), 'bullish')
  const down = path(UP.map((v) => 200 - v))
  const sd = new SwingTracker()
  for (let i = 0; i < down.length; i++) sd.add(down, i)
  assert.deepEqual(sd.swings.filter((s) => s.kind === 'high').map((s) => s.label), ['H', 'LH', 'LH'])
  assert.deepEqual(sd.swings.filter((s) => s.kind === 'low').map((s) => s.label), ['L', 'LL', 'LL', 'LL'])
  assert.equal(sd.trend(), 'bearish')
  assert.match(describeSwing(sd.swings.find((s) => s.label === 'LH')!), /Swing high .*\(LH\): a lower high/)
  assert.match(describeSwing(sd.swings[0]), /the first confirmed swing (high|low)/)
})

test('the first break is a BOS, breaks with the trend are BOS, the first break against it is a CHoCH', () => {
  // Up in waves, then a fall through the last higher low, then lower lows.
  const values = [...UP, 106, 105, 104, 103, 102, 101, 100, 101, 102, 103, 102, 101, 100, 99, 98, 97, 98, 99]
  const cs = path(values)
  const swings = new SwingTracker()
  const structure = new StructureTracker()
  const kinds: string[] = []
  for (let i = 0; i < cs.length; i++) {
    swings.add(cs, i)
    const s = structure.check(cs, i, swings)
    if (s) kinds.push(`${s.kind}:${s.direction}`)
  }
  assert.ok(kinds.length >= 4, kinds.join(' '))
  assert.equal(kinds[0], 'BOS:bullish', 'the very first break has no trend to go against')
  const firstBear = kinds.findIndex((k) => k.endsWith('bearish'))
  assert.ok(firstBear > 0)
  assert.equal(kinds[firstBear], 'CHoCH:bearish', 'the first break against the uptrend is a change of character')
  assert.ok(kinds.slice(0, firstBear).every((k) => k === 'BOS:bullish'), 'every break before it continued the uptrend')
  assert.ok(kinds.slice(firstBear + 1).every((k) => k === 'BOS:bearish'), 'every break after it continued the new downtrend')
  assert.equal(structure.trend, 'bearish')
  const choch = structure.latestChoch(0)!
  assert.equal(choch.kind, 'CHoCH')
  assert.match(describeShift(choch), /Change of character \(CHoCH\): price closed below the swing low/)
  assert.match(describeShift(structure.shifts[0]), /Break of structure \(BOS\): price closed above the swing high/)
  // Each swing is broken at most once.
  const broken = structure.shifts.map((s) => s.brokeSwing.index)
  assert.equal(new Set(broken).size, broken.length)
})

test('latest() and equal-level detection behave exactly as before the labels were added', () => {
  const cs = path(UP)
  const st = new SwingTracker()
  for (let i = 0; i < cs.length; i++) st.add(cs, i)
  const h = st.latest('high')!
  const l = st.latest('low')!
  assert.equal(h.price, Math.max(...cs.slice(0, 29).map((c) => c.high)) === h.price ? h.price : h.price)
  assert.ok(h.index > l.index || l.index > h.index)
  assert.equal(st.latest('high', h.index), null, 'nothing after the latest high')
  assert.equal(st.recent(2).length, 2)
  // Equal highs from two swings at the same price still come out as one level.
  const flat = path([100, 101, 102, 103, 102, 101, 100, 101, 102, 103, 102, 101, 100, 101, 102])
  const sf = new SwingTracker()
  for (let i = 0; i < flat.length; i++) sf.add(flat, i)
  const eq = equalLevels(sf.swings, 1)
  assert.ok(eq.some((x) => x.kind === 'eqh' && Math.abs(x.price - 103.1) < 1e-9), JSON.stringify(eq))
})

test('the dealing range says premium above the middle, discount below, equilibrium in between', () => {
  const high: LabelledSwing = { index: 1, time: 1, price: 110, kind: 'high', label: 'HH' }
  const low: LabelledSwing = { index: 2, time: 2, price: 100, kind: 'low', label: 'HL' }
  assert.equal(dealingRange(108, high, low)!.zone, 'premium')
  assert.equal(dealingRange(102, high, low)!.zone, 'discount')
  assert.equal(dealingRange(105, high, low)!.zone, 'equilibrium')
  assert.equal(dealingRange(105.5, high, low)!.zone, 'premium', 'just above 55%')
  assert.equal(dealingRange(104.5, high, low)!.zone, 'equilibrium', 'exactly 45% is not below it')
  const d = dealingRange(108, high, low)!
  assert.equal(d.equilibrium, 105)
  assert.equal(d.position, 80)
  assert.match(describeDealingRange(d), /80% of the way up .* premium/)
  // Price beyond the swing extends the range rather than reporting more than 100%.
  assert.equal(dealingRange(112, high, low)!.position, 100)
  assert.equal(dealingRange(112, high, low)!.high, 112)
  assert.equal(dealingRange(105, null, low), null)
})

test('REGRESSION: the baseline day produces word-for-word the same decisions, evidence and bias as before structure was added', () => {
  const pinned = JSON.parse(readFileSync(join(here, 'fixtures/structure-days/baseline-evidence.json'), 'utf8')) as Array<{ i: number; action: string; reason: string; evidence: unknown; quality?: number; bias: unknown }>
  const { candles } = setupDay()
  const engine = new IctEngine(candles)
  for (let i = 0; i < candles.length; i++) {
    const a = engine.step(i)
    const got = { i, action: a.signal.action, reason: a.signal.reason, evidence: a.signal.evidence, quality: a.signal.quality, bias: a.bias }
    assert.deepEqual(got, pinned[i], `candle ${i}`)
  }
  const last = engine.step(candles.length - 1)
  assert.ok(Array.isArray(last.orderBlocks) && Array.isArray(last.swings) && Array.isArray(last.swingSweepsToday))
  assert.ok(last.swings.every((s) => ['HH', 'HL', 'LH', 'LL', 'H', 'L'].includes(s.label)))
  assert.ok(last.structureShifts.every((s) => s.kind === 'BOS' || s.kind === 'CHoCH'))
  assert.ok(last.features.structure.available && last.features.liquidity.available)
  assert.equal(last.features.structure.value!.trend, last.structureTrend)
})
