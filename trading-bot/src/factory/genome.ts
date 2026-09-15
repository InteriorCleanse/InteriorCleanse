/**
 * A genome is one thing to test: a strategy plus a specific setting for each
 * of its tunable knobs. The factory generates genomes, the backtester scores
 * them, and selection keeps the few that hold up out-of-sample.
 *
 * Everything here is pure and deterministic. A genome's id is a stable string
 * built from its strategy and its (sorted) parameters, so the same genome
 * always has the same id — that is what makes a campaign resumable and lets
 * the stability check find a genome's neighbours in the evaluated set.
 */

import type { ParamSpec } from '../strategies/types.ts'

export type Genome = {
  strategyId: string
  params: Record<string, number>
}

/** Snap a value to the schema: quantised to `step`, clamped to [min, max]. */
export function quantize(spec: ParamSpec, value: number): number {
  const clamped = Math.min(spec.max, Math.max(spec.min, value))
  const steps = Math.round((clamped - spec.min) / spec.step)
  const snapped = spec.min + steps * spec.step
  // Guard against float dust so ids stay stable (e.g. 1.0000000002 → 1).
  return Math.round(snapped * 1e6) / 1e6
}

/** Every discrete value a knob can take, low to high. */
export function paramValues(spec: ParamSpec): number[] {
  const out: number[] = []
  for (let v = spec.min; v <= spec.max + 1e-9; v += spec.step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

/** The genome that reproduces today's behaviour: every knob at its default. */
export function defaultGenome(strategyId: string, schema: ParamSpec[]): Genome {
  const params: Record<string, number> = {}
  for (const spec of schema) params[spec.name] = quantize(spec, spec.default)
  return { strategyId, params }
}

/** Force a genome's params onto the schema grid (quantised, clamped, only known knobs). */
export function normalize(genome: Genome, schema: ParamSpec[]): Genome {
  const params: Record<string, number> = {}
  for (const spec of schema) params[spec.name] = quantize(spec, genome.params[spec.name] ?? spec.default)
  return { strategyId: genome.strategyId, params }
}

/** A stable id: strategy plus each knob in name order. Same genome → same id. */
export function genomeId(genome: Genome): string {
  const parts = Object.keys(genome.params)
    .sort()
    .map((k) => `${k}=${genome.params[k]}`)
  return `${genome.strategyId}#${parts.join(',')}`
}

/**
 * The genomes one step away on the grid: each knob nudged up and down by a
 * single step (clamped, de-duplicated, excluding the genome itself). Selection
 * uses these to reject a lone spike — a setting that only wins because its
 * immediate neighbours do not.
 */
export function neighbours(genome: Genome, schema: ParamSpec[]): Genome[] {
  const base = normalize(genome, schema)
  const seen = new Set<string>([genomeId(base)])
  const out: Genome[] = []
  for (const spec of schema) {
    for (const delta of [-spec.step, spec.step]) {
      const value = quantize(spec, base.params[spec.name] + delta)
      if (value === base.params[spec.name]) continue // at the edge, no move
      const g: Genome = { strategyId: base.strategyId, params: { ...base.params, [spec.name]: value } }
      const id = genomeId(g)
      if (seen.has(id)) continue
      seen.add(id)
      out.push(g)
    }
  }
  return out
}
