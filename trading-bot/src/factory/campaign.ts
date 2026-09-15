/**
 * A campaign is one bounded, seeded, resumable run of the factory: propose a
 * population of genomes, backtest each, probe the neighbours of the promising
 * ones so stability can be judged, then select survivors. Everything is keyed
 * off the seed, so the same campaign always produces the same result and can
 * be stopped and resumed without repeating work.
 *
 * A campaign enables nothing. It produces a ranked, fully-reasoned survivor
 * list; whether any of them ever trades is a later, separate decision (a
 * passport, Phase 15).
 */

import { config } from '../../config.ts'
import { store } from '../store.ts'
import { metaById } from '../strategies/registry.ts'
import type { ParamSpec } from '../strategies/types.ts'
import { genomeId, neighbours } from './genome.ts'
import type { Genome } from './genome.ts'
import { evolve, gridGenomes, makeRng, randomGenomes, dedupe } from './generate.ts'
import { evaluateGenome, realBacktest } from './evaluate.ts'
import type { BacktestFn, GenomeEvaluation } from './evaluate.ts'
import { defaultCriteria, select } from './select.ts'
import type { SelectionCriteria, SelectionResult } from './select.ts'

export type CampaignMethod = 'grid' | 'random' | 'evolve'

export type CampaignOptions = {
  strategyId: string
  seed?: number
  method?: CampaignMethod
  maxGenomes?: number
  criteria?: SelectionCriteria
}

export type StoredEvaluation = { id: string; genome: Genome; report: GenomeEvaluation['report'] }

export type CampaignRecord = {
  id: string
  strategyId: string
  seed: number
  method: CampaignMethod
  maxGenomes: number
  createdAt: number
  updatedAt: number
  done: boolean
  /** Every genome scored so far — the resume point and the multiple-testing count. */
  evaluated: StoredEvaluation[]
  selection: SelectionResult | null
}

/** Where campaigns are persisted so a run can be stopped and resumed. */
export type CampaignPersist = {
  load(id: string): CampaignRecord | null
  save(rec: CampaignRecord): void
}

export type CampaignDeps = {
  backtest?: BacktestFn
  persist?: CampaignPersist | null
}

/** A stable id from the inputs, so re-running the same campaign resumes it. */
export function campaignId(strategyId: string, seed: number, method: CampaignMethod, maxGenomes: number): string {
  return `${strategyId}.${method}.${maxGenomes}.seed${seed}`
}

function schemaFor(strategyId: string): ParamSpec[] {
  const meta = metaById().get(strategyId)
  return meta?.parameters ?? []
}

/**
 * Run (or resume) a campaign. Deterministic for a given seed. Persists after
 * every genome so an interrupted run picks up where it left off.
 */
export async function runCampaign(opts: CampaignOptions, deps: CampaignDeps = {}): Promise<CampaignRecord> {
  const strategyId = opts.strategyId
  const meta = metaById().get(strategyId)
  if (!meta) throw new Error(`Unknown strategy "${strategyId}".`)
  const schema = schemaFor(strategyId)
  if (!schema.length) throw new Error(`Strategy "${strategyId}" has no tunable parameters — nothing to breed.${meta.needsTape ? ' (Order-flow strategies are not backtestable on candles.)' : ''}`)

  const seed = opts.seed ?? 12345
  const method = opts.method ?? 'grid'
  const maxGenomes = Math.max(1, opts.maxGenomes ?? config.factory.maxGenomes)
  const criteria = opts.criteria ?? defaultCriteria()
  const backtest = deps.backtest ?? realBacktest
  const persist = deps.persist === undefined ? defaultPersist() : deps.persist
  const id = campaignId(strategyId, seed, method, maxGenomes)

  const rec: CampaignRecord = persist?.load(id) ?? { id, strategyId, seed, method, maxGenomes, createdAt: Date.now(), updatedAt: Date.now(), done: false, evaluated: [], selection: null }
  const done = new Map<string, StoredEvaluation>(rec.evaluated.map((e) => [e.id, e]))
  const evalOne = async (g: Genome): Promise<GenomeEvaluation> => {
    const gid = genomeId(g)
    const cached = done.get(gid)
    if (cached) return { id: gid, genome: cached.genome, report: cached.report }
    const ev = await evaluateGenome(g, backtest)
    done.set(gid, { id: ev.id, genome: ev.genome, report: ev.report })
    rec.evaluated = [...done.values()]
    rec.updatedAt = Date.now()
    persist?.save(rec)
    return ev
  }

  // 1) The population to test, deterministically from method + seed.
  const rng = makeRng(seed)
  const population = planPopulation(method, strategyId, schema, rng, maxGenomes)
  for (const g of population) await evalOne(g)

  // 2) Evolve a second generation from the best of the first (if asked).
  if (method === 'evolve') {
    const parents = [...done.values()]
      .filter((e) => (e.report.outOfSample.trades ?? 0) > 0)
      .sort((a, b) => (b.report.outOfSample.avgR ?? -Infinity) - (a.report.outOfSample.avgR ?? -Infinity))
      .slice(0, Math.max(2, Math.round(maxGenomes / 4)))
      .map((e) => e.genome)
    const children = evolve(parents, schema, maxGenomes, rng)
    for (const g of children) { if (done.size >= maxGenomes * 2) break; await evalOne(g) }
  }

  // 3) Probe the neighbours of every candidate that clears the basic gates, so
  //    parameter stability can actually be judged rather than left "unproven".
  const candidates = [...done.values()].filter((e) => (e.report.outOfSample.trades ?? 0) >= criteria.minOosTrades && (e.report.outOfSample.avgR ?? -Infinity) >= criteria.minOosAvgR)
  const probes = dedupe(candidates.flatMap((c) => neighbours(c.genome, schema)))
  for (const g of probes) await evalOne(g)

  // 4) Judge everything. Trials = every distinct genome tried.
  const evaluations: GenomeEvaluation[] = [...done.values()].map((e) => ({ id: e.id, genome: e.genome, report: e.report }))
  rec.selection = select(evaluations, schema, criteria, evaluations.length)
  rec.done = true
  rec.updatedAt = Date.now()
  persist?.save(rec)
  return rec
}

/** The initial population for each method. */
function planPopulation(method: CampaignMethod, strategyId: string, schema: ParamSpec[], rng: () => number, maxGenomes: number): Genome[] {
  if (method === 'grid') return gridGenomes(strategyId, schema).slice(0, maxGenomes)
  if (method === 'random') return randomGenomes(strategyId, schema, maxGenomes, rng)
  // evolve: seed with a random half, breed the rest in step 2.
  return randomGenomes(strategyId, schema, Math.max(2, Math.round(maxGenomes / 2)), rng)
}

// ---------- persistence via the store ----------

const INDEX_KEY = 'factory:index'

function defaultPersist(): CampaignPersist {
  return {
    load(id) {
      try { return store().getJson<CampaignRecord>(`factory:campaign:${id}`) } catch { return null }
    },
    save(rec) {
      try {
        store().setJson(`factory:campaign:${rec.id}`, rec)
        const index = store().getJson<string[]>(INDEX_KEY) ?? []
        if (!index.includes(rec.id)) store().setJson(INDEX_KEY, [...index, rec.id])
      } catch { /* persistence is best-effort; a campaign still returns its result in-memory */ }
    },
  }
}

/** List persisted campaigns, newest first. */
export function listCampaigns(): CampaignRecord[] {
  try {
    const index = store().getJson<string[]>(INDEX_KEY) ?? []
    const out: CampaignRecord[] = []
    for (const id of index) { const r = store().getJson<CampaignRecord>(`factory:campaign:${id}`); if (r) out.push(r) }
    return out.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch { return [] }
}

export function getCampaign(id: string): CampaignRecord | null {
  try { return store().getJson<CampaignRecord>(`factory:campaign:${id}`) } catch { return null }
}
