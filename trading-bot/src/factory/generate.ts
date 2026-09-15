/**
 * Where genomes come from. Three ways, all deterministic given a seed:
 *
 *  - grid:   every combination on the schema grid — exhaustive, bounded.
 *  - random: sample the grid uniformly — cheaper coverage of a big space.
 *  - evolve: breed the survivors — crossover two good genomes, then mutate.
 *
 * Generation never scores anything; it only proposes. The backtester judges,
 * and selection keeps. Keeping proposal and judgement apart is what makes the
 * factory honest: it cannot prefer a genome before it has been tested.
 */

import type { ParamSpec } from '../strategies/types.ts'
import { genomeId, normalize, paramValues, quantize } from './genome.ts'
import type { Genome } from './genome.ts'

/** A small seeded LCG — reproducible, no dependency, good enough for sampling. */
export function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

/** How many genomes a full grid would be — check before you build it. */
export function gridSize(schema: ParamSpec[]): number {
  return schema.reduce((n, spec) => n * paramValues(spec).length, 1)
}

/** Every combination on the grid. De-duplicated by id (schemas with one value collapse cleanly). */
export function gridGenomes(strategyId: string, schema: ParamSpec[]): Genome[] {
  let combos: Record<string, number>[] = [{}]
  for (const spec of schema) {
    const next: Record<string, number>[] = []
    for (const combo of combos) for (const v of paramValues(spec)) next.push({ ...combo, [spec.name]: v })
    combos = next
  }
  return dedupe(combos.map((params) => ({ strategyId, params })))
}

/** `n` uniform samples from the grid. Deterministic for a given rng. */
export function randomGenomes(strategyId: string, schema: ParamSpec[], n: number, rng: () => number): Genome[] {
  const out: Genome[] = []
  for (let i = 0; i < n; i++) {
    const params: Record<string, number> = {}
    for (const spec of schema) {
      const values = paramValues(spec)
      params[spec.name] = values[Math.floor(rng() * values.length)] ?? spec.default
    }
    out.push({ strategyId, params })
  }
  return dedupe(out)
}

/** Nudge a random subset of a genome's knobs by ±one step. At least one knob moves. */
export function mutate(genome: Genome, schema: ParamSpec[], rng: () => number): Genome {
  const base = normalize(genome, schema)
  const params = { ...base.params }
  let moved = false
  for (const spec of schema) {
    if (rng() < 0.5) continue
    const delta = rng() < 0.5 ? -spec.step : spec.step
    const v = quantize(spec, params[spec.name] + delta)
    if (v !== params[spec.name]) { params[spec.name] = v; moved = true }
  }
  if (!moved && schema.length) {
    // Force one move so mutation always produces a candidate.
    const spec = schema[Math.floor(rng() * schema.length)]
    const delta = rng() < 0.5 ? -spec.step : spec.step
    params[spec.name] = quantize(spec, params[spec.name] + (delta || spec.step))
  }
  return { strategyId: base.strategyId, params }
}

/** Uniform crossover of two parents: each knob is taken from one parent at random. */
export function crossover(a: Genome, b: Genome, schema: ParamSpec[], rng: () => number): Genome {
  const params: Record<string, number> = {}
  for (const spec of schema) params[spec.name] = (rng() < 0.5 ? a.params : b.params)[spec.name] ?? spec.default
  return normalize({ strategyId: a.strategyId, params }, schema)
}

/**
 * Breed the next generation from the current survivors: pair them, cross, then
 * mutate, until `count` fresh genomes are produced. Falls back to plain
 * mutation when there is only one parent.
 */
export function evolve(parents: Genome[], schema: ParamSpec[], count: number, rng: () => number): Genome[] {
  if (!parents.length) return []
  const out: Genome[] = []
  let guard = 0
  while (out.length < count && guard++ < count * 20) {
    const a = parents[Math.floor(rng() * parents.length)]
    const b = parents[Math.floor(rng() * parents.length)]
    const child = mutate(a === b ? a : crossover(a, b, schema, rng), schema, rng)
    out.push(child)
  }
  return dedupe(out)
}

/** Drop genomes that share an id (same strategy and params). */
export function dedupe(genomes: Genome[]): Genome[] {
  const seen = new Set<string>()
  const out: Genome[] = []
  for (const g of genomes) {
    const id = genomeId(g)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(g)
  }
  return out
}
