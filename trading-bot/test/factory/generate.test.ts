/**
 * Generation: the grid is exhaustive, random is reproducible, and breeding
 * always produces a distinct candidate.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crossover, dedupe, evolve, gridGenomes, gridSize, makeRng, mutate, randomGenomes } from '../../src/factory/generate.ts'
import { genomeId } from '../../src/factory/genome.ts'
import type { ParamSpec } from '../../src/strategies/types.ts'

const schema: ParamSpec[] = [
  { name: 'a', label: 'a', min: 0.5, max: 2.5, step: 0.5, default: 1 }, // 5 values
  { name: 'b', label: 'b', min: 1, max: 3, step: 1, default: 2 }, // 3 values
]

test('the grid is the full cartesian product', () => {
  assert.equal(gridSize(schema), 15)
  const grid = gridGenomes('x', schema)
  assert.equal(grid.length, 15)
  // every combination is unique
  assert.equal(new Set(grid.map(genomeId)).size, 15)
})

test('random sampling is deterministic for a seed and varies with it', () => {
  const a = randomGenomes('x', schema, 8, makeRng(1)).map(genomeId)
  const b = randomGenomes('x', schema, 8, makeRng(1)).map(genomeId)
  const c = randomGenomes('x', schema, 8, makeRng(2)).map(genomeId)
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, c)
})

test('mutate always moves at least one knob onto the grid', () => {
  const rng = makeRng(5)
  const start = { strategyId: 'x', params: { a: 1, b: 2 } }
  for (let i = 0; i < 20; i++) {
    const m = mutate(start, schema, rng)
    assert.notEqual(genomeId(m), genomeId(start), 'a mutant must differ from its parent')
    // still on the grid
    assert.ok([0.5, 1, 1.5, 2, 2.5].includes(m.params.a))
    assert.ok([1, 2, 3].includes(m.params.b))
  }
})

test('crossover takes each knob from one parent or the other', () => {
  const a = { strategyId: 'x', params: { a: 0.5, b: 1 } }
  const b = { strategyId: 'x', params: { a: 2.5, b: 3 } }
  const child = crossover(a, b, schema, makeRng(3))
  assert.ok([0.5, 2.5].includes(child.params.a))
  assert.ok([1, 3].includes(child.params.b))
})

test('evolve breeds distinct offspring from parents, deterministically', () => {
  const parents = [
    { strategyId: 'x', params: { a: 1, b: 2 } },
    { strategyId: 'x', params: { a: 2, b: 3 } },
  ]
  const one = evolve(parents, schema, 6, makeRng(9)).map(genomeId)
  const two = evolve(parents, schema, 6, makeRng(9)).map(genomeId)
  assert.deepEqual(one, two)
  assert.equal(new Set(one).size, one.length, 'offspring are de-duplicated')
})

test('dedupe collapses identical genomes', () => {
  const g = { strategyId: 'x', params: { a: 1, b: 2 } }
  assert.equal(dedupe([g, { ...g }, g]).length, 1)
})
