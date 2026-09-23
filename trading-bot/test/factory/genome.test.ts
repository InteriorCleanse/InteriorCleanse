/**
 * Genomes: the quantisation, the stable id, and the neighbour set the
 * stability check depends on.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultGenome, genomeId, neighbours, normalize, paramValues, quantize } from '../../src/factory/genome.ts'
import type { ParamSpec } from '../../src/strategies/types.ts'

const schema: ParamSpec[] = [
  { name: 'stopAtr', label: 'stop', min: 0.5, max: 2.5, step: 0.5, default: 1.0 },
  { name: 'rr', label: 'rr', min: 1, max: 3, step: 1, default: 2 },
]

test('quantize snaps to the grid and clamps to the range', () => {
  const spec = schema[0]
  assert.equal(quantize(spec, 1.2), 1.0) // nearest step
  assert.equal(quantize(spec, 1.3), 1.5)
  assert.equal(quantize(spec, 9), 2.5) // clamped high
  assert.equal(quantize(spec, -9), 0.5) // clamped low
})

test('paramValues walks the whole inclusive range', () => {
  assert.deepEqual(paramValues(schema[0]), [0.5, 1.0, 1.5, 2.0, 2.5])
  assert.deepEqual(paramValues(schema[1]), [1, 2, 3])
})

test('the default genome is every knob at its default', () => {
  assert.deepEqual(defaultGenome('breakout', schema).params, { stopAtr: 1.0, rr: 2 })
})

test('genomeId is stable and independent of key order', () => {
  const a = { strategyId: 'x', params: { rr: 2, stopAtr: 1 } }
  const b = { strategyId: 'x', params: { stopAtr: 1, rr: 2 } }
  assert.equal(genomeId(a), genomeId(b))
  assert.equal(genomeId(a), 'x#rr=2,stopAtr=1')
})

test('normalize drops unknown knobs and fills missing ones with defaults', () => {
  const g = normalize({ strategyId: 'x', params: { stopAtr: 1.3, junk: 9 } }, schema)
  assert.deepEqual(g.params, { stopAtr: 1.5, rr: 2 })
})

test('neighbours are one step away on each axis, clamped and de-duplicated', () => {
  const g = { strategyId: 'x', params: { stopAtr: 1.0, rr: 2 } }
  const ns = neighbours(g, schema).map((n) => n.params)
  // stopAtr ±0.5 → 0.5, 1.5 ; rr ±1 → 1, 3
  assert.equal(ns.length, 4)
  assert.ok(ns.some((p) => p.stopAtr === 0.5 && p.rr === 2))
  assert.ok(ns.some((p) => p.stopAtr === 1.5 && p.rr === 2))
  assert.ok(ns.some((p) => p.stopAtr === 1.0 && p.rr === 1))
  assert.ok(ns.some((p) => p.stopAtr === 1.0 && p.rr === 3))
})

test('a genome at the edge has fewer neighbours (no out-of-range moves)', () => {
  const g = { strategyId: 'x', params: { stopAtr: 0.5, rr: 1 } } // both at the low edge
  const ns = neighbours(g, schema)
  // only the up-moves exist: stopAtr→1.0, rr→2
  assert.equal(ns.length, 2)
})
